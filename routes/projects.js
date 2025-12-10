const express = require('express');
const router = express.Router();
const { authenticate, authorize, getCurrentPermission } = require('../middleware/auth');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const KpiConfig = require('../models/KpiConfig');
const Customer = require('../models/Customer');
const { exportProjectQuotation } = require('../services/excelService');

// 判断是否为仅交付角色（翻译/审校/排版），无查看客户信息权限
function isDeliveryOnlyUser(user, currentRole) {
  if (currentRole) {
    // 基于当前角色判断
    const restricted = ['translator', 'reviewer', 'layout'];
    return restricted.includes(currentRole);
  }
  // 向后兼容：基于所有角色判断
  const roles = user?.roles || [];
  const restricted = ['translator', 'reviewer', 'layout'];
  const privileged = ['admin', 'finance', 'pm', 'sales', 'part_time_sales', 'admin_staff'];
  const hasRestricted = roles.some(r => restricted.includes(r));
  const hasPrivileged = roles.some(r => privileged.includes(r));
  return hasRestricted && !hasPrivileged;
}

// 对项目数据脱敏客户信息
function scrubCustomerInfo(project) {
  if (!project) return project;
  const obj = project.toObject ? project.toObject() : { ...project };
  if (obj.customerId) {
    const cid = obj.customerId;
    const id = cid && cid._id ? cid._id : cid;
    // 保留ID，其他敏感信息置为*****
    obj.customerId = { _id: id, name: '*****', shortName: '*****' };
  }
  // 统一占位显示
  obj.clientName = '*****';
  obj.customerName = '*****';
  return obj;
}

// 可更新的项目字段白名单
const editableFields = [
  'projectName',
  'customerId',
  'businessType',
  'projectType',
  'sourceLanguage',
  'targetLanguages',
  'wordCount',
  'unitPrice',
  'projectAmount',
  'deadline',
  'payment.expectedAt',
  'isTaxIncluded',
  'needInvoice',
  'specialRequirements',
  'projectNumber',
  'partTimeSales',
  'partTimeLayout'
];

// 所有项目路由需要认证
router.use(authenticate);

// 生成项目编号
async function generateProjectNumber() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  
  // 查找当月最大编号
  const prefix = `PRJ${year}${month}`;
  const lastProject = await Project.findOne({
    projectNumber: { $regex: `^${prefix}` }
  }).sort({ projectNumber: -1 });

  let sequence = 1;
  if (lastProject && lastProject.projectNumber) {
    const lastSeq = parseInt(lastProject.projectNumber.slice(-4)) || 0;
    sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

// 创建项目（销售角色和兼职销售）
router.post('/create', authorize('sales', 'admin', 'part_time_sales'), async (req, res) => {
  try {
    const { 
      projectName, 
      customerId, 
      businessType,
      projectType, // MTPE/深度编辑/审校项目
      sourceLanguage, // 源语种
      targetLanguages, // 目标语言列表
      wordCount, 
      unitPrice, 
      projectAmount, 
      deadline,
      expectedAt,
      projectNumber,
      isTaxIncluded, // 是否含税
      needInvoice, // 是否需要发票
      specialRequirements, // 特殊要求
      members,  // 项目成员数组
      // 兼职销售相关
      partTimeSales, // { isPartTime, companyReceivable, taxRate }
      // 兼职排版相关
      partTimeLayout // { isPartTime, layoutCost, layoutAssignedTo }
    } = req.body;

    if (!projectName || !customerId || !deadline || !sourceLanguage || !targetLanguages || targetLanguages.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: '请填写所有必填字段（项目名称、客户、源语种、目标语言、交付时间）' 
      });
    }

    // 验证客户是否存在
    const customer = await Customer.findById(customerId);
    if (!customer || !customer.isActive) {
      return res.status(400).json({
        success: false,
        message: '客户不存在或已被禁用'
      });
    }

    // 计算总金额（如果提供了字数和单价）
    let finalAmount = projectAmount;
    if (businessType === 'translation' && wordCount && unitPrice) {
      // 笔译：字数 × 单价（每千字）
      finalAmount = (wordCount / 1000) * unitPrice;
    } else if (!projectAmount || projectAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: '请提供项目金额或字数和单价'
      });
    }

    // 协议付款日，默认创建日起 3 个月
    let hasExpectedInput = !!expectedAt;
    let expectedPaymentDate = hasExpectedInput ? new Date(expectedAt) : null;
    if (!expectedPaymentDate || isNaN(expectedPaymentDate)) {
      expectedPaymentDate = new Date();
      hasExpectedInput = false;
    }
    expectedPaymentDate.setMonth(expectedPaymentDate.getMonth() + (hasExpectedInput ? 0 : 3));

    // 生成项目编号（如果未提供）
    let projectNum = projectNumber;
    if (!projectNum) {
      projectNum = await generateProjectNumber();
    } else {
      // 检查编号是否已存在
      const existing = await Project.findOne({ projectNumber: projectNum });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: '项目编号已存在'
        });
      }
    }

    // 获取当前KPI配置并锁定
    const config = await KpiConfig.getActiveConfig();
    const lockedRatios = config.getLockedRatios();

    // 检查：销售创建项目时不能设置兼职排版，应由项目经理添加
    const isSales = req.user.roles.includes('sales') || req.user.roles.includes('part_time_sales');
    const isAdmin = req.user.roles.includes('admin');
    
    if (isSales && !isAdmin && partTimeLayout?.isPartTime) {
      return res.status(400).json({
        success: false,
        message: '销售创建项目时不能设置兼职排版，兼职排版应由项目经理在项目详情中添加'
      });
    }

    // 处理兼职排版费用校验
    if (partTimeLayout?.isPartTime && partTimeLayout?.layoutCost) {
      const tempProject = new Project({ projectAmount: finalAmount });
      const validation = tempProject.validateLayoutCost(partTimeLayout.layoutCost);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }
    }

    const project = await Project.create({
      projectNumber: projectNum,
      projectName,
      customerId,
      clientName: customer.name,
      businessType: businessType || 'translation',
      projectType: projectType || 'mtpe',
      sourceLanguage: sourceLanguage,
      targetLanguages: Array.isArray(targetLanguages) ? targetLanguages : [targetLanguages],
      wordCount: wordCount || 0,
      unitPrice: unitPrice || 0,
      projectAmount: finalAmount,
      deadline: new Date(deadline),
      isTaxIncluded: isTaxIncluded || false,
      needInvoice: needInvoice || false,
      specialRequirements: specialRequirements || {},
      createdBy: req.user._id,
      locked_ratios: lockedRatios,
      status: 'pending',
      completionChecks: {
        hasAmount: true // 创建时已有金额
      },
      // 兼职销售字段
      partTimeSales: partTimeSales || {
        isPartTime: false,
        companyReceivable: 0,
        taxRate: 0,
        partTimeSalesCommission: 0
      },
      // 兼职排版字段
      partTimeLayout: partTimeLayout || {
        isPartTime: false,
        layoutCost: 0,
        layoutAssignedTo: null,
        layoutCostPercentage: 0
      },
      payment: {
        expectedAt: expectedPaymentDate,
        remainingAmount: finalAmount || 0,
        receivedAmount: 0,
        isFullyPaid: false,
        paymentStatus: 'unpaid'
      }
    });

    // 如果提供了成员信息，创建项目成员
    if (members && Array.isArray(members) && members.length > 0) {
      // 检查：销售创建项目时只能添加项目经理
      const isSales = req.user.roles.includes('sales') || req.user.roles.includes('part_time_sales');
      const isAdmin = req.user.roles.includes('admin');
      
      if (isSales && !isAdmin) {
        // 销售只能添加项目经理
        const invalidRoles = members.filter(m => m.role && m.role !== 'pm');
        if (invalidRoles.length > 0) {
          return res.status(400).json({
            success: false,
            message: '销售创建项目时只能添加项目经理，其他成员（翻译、审校、排版等）应由项目经理在项目详情中添加'
          });
        }
      }
      
      const memberPromises = members.map(async (member) => {
        const { userId, role, translatorType, wordRatio } = member;
        
        const isSelfAssignment = userId.toString() === req.user._id.toString();
        
        // 校验1：如果当前用户是PM，并且同时有翻译或审校角色，则不能将翻译或审校分配给自己
        const isPM = req.user.roles.includes('pm');
        const isTranslator = req.user.roles.includes('translator');
        const isReviewer = req.user.roles.includes('reviewer');
        
        if (isPM && isSelfAssignment) {
          if ((role === 'translator' && isTranslator) || (role === 'reviewer' && isReviewer)) {
            throw new Error('作为项目经理，不能将翻译或审校任务分配给自己');
          }
        }
        
        // 校验2：如果当前用户是销售（或兼职销售），并且同时有PM角色，则不能将PM角色分配给自己
        const isSales = req.user.roles.includes('sales') || req.user.roles.includes('part_time_sales');
        const hasPMRole = req.user.roles.includes('pm');
        
        if (isSales && hasPMRole && isSelfAssignment && role === 'pm') {
          throw new Error('作为销售，不能将项目经理角色分配给自己');
        }
        
        // 确定使用的系数
        let ratio = 0;
        if (role === 'translator') {
          ratio = translatorType === 'deepedit' 
            ? lockedRatios.translator_deepedit 
            : lockedRatios.translator_mtpe;
        } else if (role === 'reviewer') {
          ratio = lockedRatios.reviewer;
        } else if (role === 'pm') {
          ratio = lockedRatios.pm;
        } else if (role === 'sales') {
          ratio = lockedRatios.sales_bonus;
        } else if (role === 'admin_staff') {
          ratio = lockedRatios.admin;
        } else if (role === 'part_time_sales') {
          // 兼职销售：系数为0，KPI值由佣金计算决定
          ratio = 0;
        } else if (role === 'layout') {
          // 兼职排版：系数为0，KPI值由排版费用决定
          ratio = 0;
        }

        return ProjectMember.create({
          projectId: project._id,
          userId,
          role,
          translatorType: role === 'translator' ? (translatorType || 'mtpe') : undefined,
          wordRatio: role === 'translator' ? (wordRatio || 1.0) : 1.0,
          ratio_locked: ratio
        });
      });

      await Promise.all(memberPromises);
      
      // 如果创建时添加了成员，更新完成检查
      project.completionChecks.hasMembers = true;
      await project.save();
    }

    res.status(201).json({
      success: true,
      message: '项目创建成功',
      data: project
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 更新项目（管理员、PM、项目创建人）
router.put('/:id', authorize('admin', 'pm', 'sales'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      });
    }

    // 权限：管理员/PM或创建人
    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAllowedRole = req.user.roles.includes('admin') || req.user.roles.includes('pm');
    if (!isCreator && !isAllowedRole) {
      return res.status(403).json({
        success: false,
        message: '仅管理员、PM或项目创建人可修改项目'
      });
    }

    // 已完成项目不允许修改
    if (project.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: '已完成的项目不可修改'
      });
    }

    // 过滤可修改字段
    editableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        project[field] = req.body[field];
      }
    });

    // 字段修正
    if (project.businessType !== 'translation') {
      project.wordCount = project.wordCount || 0;
      project.unitPrice = project.unitPrice || 0;
    }

    if (!project.projectAmount || project.projectAmount < 0) {
      return res.status(400).json({
        success: false,
        message: '项目金额不能为空'
      });
    }

    // 检查：销售编辑项目时不能设置兼职排版，应由项目经理添加
    const isSales = req.user.roles.includes('sales') || req.user.roles.includes('part_time_sales');
    const isAdmin = req.user.roles.includes('admin');
    const isPM = req.user.roles.includes('pm');
    
    if (isSales && !isAdmin && !isPM && req.body.partTimeLayout?.isPartTime) {
      return res.status(400).json({
        success: false,
        message: '销售编辑项目时不能设置兼职排版，兼职排版应由项目经理在项目详情中添加'
      });
    }

    // 校验兼职排版费用
    if (project.partTimeLayout?.isPartTime && project.partTimeLayout?.layoutCost) {
      const validation = project.validateLayoutCost(project.partTimeLayout.layoutCost);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }
    }

    await project.save();

    res.json({
      success: true,
      message: '项目已更新',
      data: project
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 取消/删除项目（管理员、PM、项目创建人）
router.delete('/:id', authorize('admin', 'pm', 'sales'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      });
    }

    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAllowedRole = req.user.roles.includes('admin') || req.user.roles.includes('pm');
    if (!isCreator && !isAllowedRole) {
      return res.status(403).json({
        success: false,
        message: '仅管理员、PM或项目创建人可删除项目'
      });
    }

    if (project.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: '已完成的项目不可删除'
      });
    }

    project.status = 'cancelled';
    await project.save();

    res.json({
      success: true,
      message: '项目已取消'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 获取项目列表
router.get('/', async (req, res) => {
  try {
    let query = {};
    
    // 基于当前角色的权限进行数据过滤
    const viewPermission = getCurrentPermission(req, 'project.view');
    
    if (viewPermission === 'all') {
      // 查看所有项目：管理员、财务、PM、综合岗
      // 不需要额外过滤
    } else if (viewPermission === 'sales') {
      // 只看自己创建的项目：销售、兼职销售
      query.createdBy = req.user._id;
    } else if (viewPermission === 'assigned') {
      // 只看分配给我的项目：翻译、审校、排版
      const memberProjects = await ProjectMember.find({ userId: req.user._id })
        .distinct('projectId');
      
      if (memberProjects.length > 0) {
        query._id = { $in: memberProjects };
      } else {
        // 如果没有分配的项目，返回空结果
        query._id = { $in: [] };
      }
    } else {
      // 向后兼容：如果没有提供 X-Role，使用旧逻辑
      if (!req.user.roles.includes('admin') && !req.user.roles.includes('finance')) {
        // 获取作为成员参与的项目
        const memberProjects = await ProjectMember.find({ userId: req.user._id })
          .distinct('projectId');
        
        // 获取自己创建的项目
        const createdProjects = await Project.find({ createdBy: req.user._id })
          .distinct('_id');
        
        // 合并两个列表
        const allProjectIds = [...new Set([...memberProjects.map(id => id.toString()), ...createdProjects.map(id => id.toString())])];
        
        if (allProjectIds.length > 0) {
          query._id = { $in: allProjectIds };
        } else {
          query._id = { $in: [] };
        }
      }
    }

    const projects = await Project.find(query)
      .populate('createdBy', 'name username')
      .populate('customerId', 'name shortName contactPerson phone email')
      .sort({ createdAt: -1 });

    // 基于当前角色判断是否需要脱敏客户信息
    const isDeliveryOnly = isDeliveryOnlyUser(req.user, req.currentRole);
    const data = isDeliveryOnly ? projects.map(scrubCustomerInfo) : projects;

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 获取单个项目详情
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('createdBy', 'name username')
      .populate('customerId', 'name shortName contactPerson phone email address')
      .populate('partTimeLayout.layoutAssignedTo', 'name username');

    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    // 检查权限
    const isMember = await ProjectMember.findOne({ 
      projectId: project._id, 
      userId: req.user._id 
    });
    const canView = req.user.roles.includes('admin') || 
                    req.user.roles.includes('finance') || 
                    project.createdBy._id.toString() === req.user._id.toString() ||
                    isMember;

    if (!canView) {
      return res.status(403).json({ 
        success: false, 
        message: '无权查看此项目' 
      });
    }

    // 获取项目成员
    const members = await ProjectMember.find({ projectId: project._id })
      .populate('userId', 'name username email roles');

    const isDeliveryOnly = isDeliveryOnlyUser(req.user, req.currentRole);
    const projectData = isDeliveryOnly ? scrubCustomerInfo(project) : project.toObject();

    res.json({
      success: true,
      data: {
        ...projectData,
        members
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 添加项目成员
router.post('/:id/add-member', async (req, res) => {
  try {
    const { userId, role, translatorType, wordRatio, layoutCost } = req.body;
    const projectId = req.params.id;

    if (!userId || !role) {
      return res.status(400).json({ 
        success: false, 
        message: '用户ID和角色不能为空' 
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    // 权限检查：创建者、PM或管理员可以添加成员
    const canAdd = project.createdBy.toString() === req.user._id.toString() ||
                   req.user.roles.includes('admin') ||
                   req.user.roles.includes('pm');

    if (!canAdd) {
      return res.status(403).json({ 
        success: false, 
        message: '无权添加成员' 
      });
    }

    // 校验1：如果当前用户是PM，并且同时有翻译或审校角色，则不能将翻译或审校分配给自己
    const isPM = req.user.roles.includes('pm');
    const isTranslator = req.user.roles.includes('translator');
    const isReviewer = req.user.roles.includes('reviewer');
    const isSelfAssignment = userId.toString() === req.user._id.toString();
    
    if (isPM && isSelfAssignment) {
      if ((role === 'translator' && isTranslator) || (role === 'reviewer' && isReviewer)) {
        return res.status(400).json({
          success: false,
          message: '作为项目经理，不能将翻译或审校任务分配给自己'
        });
      }
    }
    
    // 校验2：如果当前用户是销售（或兼职销售），并且同时有PM角色，则不能将PM角色分配给自己
    const isSales = req.user.roles.includes('sales') || req.user.roles.includes('part_time_sales');
    const hasPMRole = req.user.roles.includes('pm');
    
    if (isSales && hasPMRole && isSelfAssignment && role === 'pm') {
      return res.status(400).json({
        success: false,
        message: '作为销售，不能将项目经理角色分配给自己'
      });
    }

    // 如果是兼职排版且提供了排版费用，验证并更新项目信息
    if (role === 'layout' && layoutCost && layoutCost > 0) {
      // 验证排版费用是否超过项目总金额的5%
      const validation = project.validateLayoutCost(layoutCost);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message
        });
      }

      // 更新项目的兼职排版信息
      project.partTimeLayout = {
        isPartTime: true,
        layoutCost: layoutCost,
        layoutAssignedTo: userId,
        layoutCostPercentage: validation.percentage || 0
      };
      await project.save();
    } else if (role === 'layout') {
      // 如果添加了兼职排版成员但没有填写费用，只更新排版员信息，不更新费用
      if (!project.partTimeLayout) {
        project.partTimeLayout = {
          isPartTime: true,
          layoutCost: 0,
          layoutAssignedTo: userId,
          layoutCostPercentage: 0
        };
      } else {
        project.partTimeLayout.layoutAssignedTo = userId;
        project.partTimeLayout.isPartTime = true;
      }
      await project.save();
    }

    // 确定使用的系数
    let ratio = 0;
    if (role === 'translator') {
      ratio = translatorType === 'deepedit' 
        ? project.locked_ratios.translator_deepedit 
        : project.locked_ratios.translator_mtpe;
    } else if (role === 'reviewer') {
      ratio = project.locked_ratios.reviewer;
    } else if (role === 'pm') {
      ratio = project.locked_ratios.pm;
    } else if (role === 'sales') {
      ratio = project.locked_ratios.sales_bonus;
    } else if (role === 'admin_staff') {
      ratio = project.locked_ratios.admin;
    } else if (role === 'part_time_sales') {
      // 兼职销售：系数为0，KPI值由佣金计算决定
      ratio = 0;
    } else if (role === 'layout') {
      // 兼职排版：系数为0，KPI值由排版费用决定
      ratio = 0;
    }

    const member = await ProjectMember.create({
      projectId,
      userId,
      role,
      translatorType: role === 'translator' ? (translatorType || 'mtpe') : undefined,
      wordRatio: role === 'translator' ? (wordRatio || 1.0) : 1.0,
      ratio_locked: ratio
    });

    // 如果项目状态是pending，添加成员后自动变为in_progress
    if (project.status === 'pending') {
      project.status = 'in_progress';
      project.startedAt = new Date();
      project.completionChecks.hasMembers = true;
      await project.save();
    }

    res.status(201).json({
      success: true,
      message: '成员添加成功',
      data: member
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: '该用户在此项目中已存在相同角色' 
      });
    }
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 项目开始执行（PM或项目创建人确认进入执行状态）
router.post('/:id/start', authorize('pm', 'admin', 'sales'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    if (project.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: '项目状态不是待开始，无法开始执行' 
      });
    }

    // 仅允许PM、管理员或项目创建人操作
    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAllowedRole = req.user.roles.includes('pm') || req.user.roles.includes('admin');
    if (!isCreator && !isAllowedRole) {
      return res.status(403).json({
        success: false,
        message: '仅PM、管理员或项目创建人可开始项目'
      });
    }

    // 检查是否有成员
    const members = await ProjectMember.find({ projectId: project._id });
    if (members.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: '请先添加项目成员' 
      });
    }

    project.status = 'in_progress';
    project.startedAt = new Date();
    project.completionChecks.hasMembers = true;
    await project.save();

    res.json({
      success: true,
      message: '项目已开始执行',
      data: project
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 标记返修（PM、管理员或项目创建人）
router.post('/:id/set-revision', authorize('pm', 'admin', 'sales'), async (req, res) => {
  try {
    const { count } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    // 权限：PM、管理员、或项目创建人
    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAllowedRole = req.user.roles.includes('pm') || req.user.roles.includes('admin');
    if (!isCreator && !isAllowedRole) {
      return res.status(403).json({
        success: false,
        message: '仅PM、管理员或项目创建人可标记返修'
      });
    }

    project.revisionCount = count || project.revisionCount + 1;
    project.completionChecks.hasQualityInfo = true; // 标记已填写质量信息
    await project.save();

    res.json({
      success: true,
      message: '返修次数已更新',
      data: project
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 标记延期（PM、管理员或项目创建人）
router.post('/:id/set-delay', authorize('pm', 'admin', 'sales'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAllowedRole = req.user.roles.includes('pm') || req.user.roles.includes('admin');
    if (!isCreator && !isAllowedRole) {
      return res.status(403).json({
        success: false,
        message: '仅PM、管理员或项目创建人可标记延期'
      });
    }

    project.isDelayed = true;
    project.completionChecks.hasQualityInfo = true; // 标记已填写质量信息
    await project.save();

    res.json({
      success: true,
      message: '延期标记已更新',
      data: project
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 标记客户投诉（PM、管理员或项目创建人）
router.post('/:id/set-complaint', authorize('pm', 'admin', 'sales'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAllowedRole = req.user.roles.includes('pm') || req.user.roles.includes('admin');
    if (!isCreator && !isAllowedRole) {
      return res.status(403).json({
        success: false,
        message: '仅PM、管理员或项目创建人可标记客诉'
      });
    }

    project.hasComplaint = true;
    project.completionChecks.hasQualityInfo = true; // 标记已填写质量信息
    await project.save();

    res.json({
      success: true,
      message: '客户投诉标记已更新',
      data: project
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 标记项目完成
router.post('/:id/finish', authorize('pm', 'admin'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    // 检查完成条件（按workflow要求）
    const checks = project.completionChecks || {};
    const members = await ProjectMember.find({ projectId: project._id });
    
    // 验证必要信息
    if (members.length === 0) {
      return res.status(400).json({
        success: false,
        message: '项目尚未分配成员，无法完成'
      });
    }

    if (!project.projectAmount || project.projectAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: '项目金额未填写或无效'
      });
    }

    // 更新完成检查
    checks.hasMembers = true;
    checks.hasAmount = true;
    // 质量信息可能未填写，但不强制要求（返修/延期/客诉可能都是0）

    project.status = 'completed';
    project.completedAt = new Date();
    project.completionChecks = checks;
    
    // 检查是否延期
    if (project.completedAt > project.deadline) {
      project.isDelayed = true;
      project.completionChecks.hasQualityInfo = true;
    }

    await project.save();

    // 实时计算并生成KPI记录
    try {
      const { generateProjectKPI } = require('../services/kpiService');
      const kpiResult = await generateProjectKPI(project._id);
      
      res.json({
        success: true,
        message: `项目已完成，已生成 ${kpiResult.count} 条KPI记录`,
        data: project,
        kpiResult
      });
    } catch (kpiError) {
      // KPI计算失败不影响项目完成
      console.error('KPI计算失败:', kpiError);
      res.json({
        success: true,
        message: '项目已完成，但KPI计算失败: ' + kpiError.message,
        data: project
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 删除项目成员
router.delete('/:id/member/:memberId', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    // 权限检查
    const canModify = project.createdBy.toString() === req.user._id.toString() ||
                     req.user.roles.includes('admin') ||
                     req.user.roles.includes('pm');

    if (!canModify) {
      return res.status(403).json({ 
        success: false, 
        message: '无权删除成员' 
      });
    }

    await ProjectMember.findByIdAndDelete(req.params.memberId);

    res.json({
      success: true,
      message: '成员已删除'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 更新回款信息（财务、管理员或项目创建人）
router.post('/:id/payment', authorize('finance', 'admin', 'sales'), async (req, res) => {
  try {
    const { receivedAmount, receivedAt, expectedAt, isFullyPaid } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    // 仅允许项目创建人或有权限角色更新
    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isAllowedRole = req.user.roles.includes('finance') || req.user.roles.includes('admin');
    if (!isCreator && !isAllowedRole) {
      return res.status(403).json({
        success: false,
        message: '仅财务、管理员或项目创建人可更新回款信息'
      });
    }

    if (receivedAmount !== undefined) {
      project.payment.receivedAmount = receivedAmount;
      // 自动计算剩余金额和回款状态（通过 pre-save 钩子）
    }
    if (receivedAt) project.payment.receivedAt = new Date(receivedAt);
    if (expectedAt) project.payment.expectedAt = new Date(expectedAt);
    if (typeof isFullyPaid === 'boolean') project.payment.isFullyPaid = isFullyPaid;

    // 保存时会自动通过 pre-save 钩子计算 paymentStatus 和 remainingAmount
    await project.save();

    res.json({
      success: true,
      message: '回款信息已更新',
      data: project
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 导出项目报价单
router.get('/:id/quotation', authenticate, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('customerId', 'name shortName contactPerson phone email address')
      .populate('createdBy', 'name username email');
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      });
    }
    
    // 检查权限：创建者、管理员、PM可以导出
    const isCreator = project.createdBy._id.toString() === req.user._id.toString();
    const canView = req.user.roles.includes('admin') || 
                    req.user.roles.includes('pm') ||
                    req.user.roles.includes('finance') ||
                    isCreator;
    
    if (!canView) {
      return res.status(403).json({
        success: false,
        message: '无权导出此项目的报价单'
      });
    }
    
    const buffer = await exportProjectQuotation(req.params.id);
    
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('生成的文件数据无效');
    }
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // 使用encodeURIComponent确保中文文件名正确编码
    const filename = encodeURIComponent(`报价单-${project.projectNumber || project.projectName}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(buffer);
  } catch (error) {
    console.error('导出报价单失败:', error);
    res.status(500).json({
      success: false,
      message: '导出报价单失败: ' + error.message
    });
  }
});

// 导出项目报价单（基于表单数据，用于创建项目时）
router.post('/quotation/preview', authenticate, async (req, res) => {
  try {
    const projectData = req.body;
    
    // 验证必填字段
    if (!projectData.projectName || !projectData.customerId) {
      return res.status(400).json({
        success: false,
        message: '项目名称和客户不能为空'
      });
    }
    
    // 获取客户信息
    const customer = await Customer.findById(projectData.customerId);
    if (!customer) {
      return res.status(400).json({
        success: false,
        message: '客户不存在'
      });
    }
    
    // 获取当前用户信息（项目创建者）
    const User = require('../models/User');
    const creator = await User.findById(req.user._id).select('name username email phone');
    
    // 构建项目数据对象
    const projectObj = {
      projectNumber: projectData.projectNumber || '待生成',
      projectName: projectData.projectName,
      customerId: customer,
      createdBy: creator, // 添加创建者信息
      businessType: projectData.businessType || 'translation',
      projectType: projectData.projectType,
      sourceLanguage: projectData.sourceLanguage,
      targetLanguages: Array.isArray(projectData.targetLanguages) 
        ? projectData.targetLanguages 
        : [projectData.targetLanguages],
      wordCount: projectData.wordCount || 0,
      unitPrice: projectData.unitPrice || 0,
      projectAmount: projectData.projectAmount || 0,
      isTaxIncluded: projectData.isTaxIncluded || false,
      needInvoice: projectData.needInvoice || false,
      deadline: projectData.deadline ? new Date(projectData.deadline) : new Date(),
      specialRequirements: projectData.specialRequirements || {},
      payment: {
        expectedAt: projectData.expectedAt ? new Date(projectData.expectedAt) : null
      }
    };
    
    const buffer = await exportProjectQuotation(null, projectObj);
    
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('生成的文件数据无效');
    }
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // 使用encodeURIComponent确保中文文件名正确编码
    const filename = encodeURIComponent(`报价单-${projectObj.projectName}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(buffer);
  } catch (error) {
    console.error('导出报价单失败:', error);
    res.status(500).json({
      success: false,
      message: '导出报价单失败: ' + error.message
    });
  }
});

module.exports = router;

