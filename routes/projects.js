const express = require('express');
const router = express.Router();
const { authenticate, authorize, getCurrentPermission } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const KpiConfig = require('../models/KpiConfig');
const Customer = require('../models/Customer');
const User = require('../models/User');
const { exportProjectQuotation } = require('../services/excelService');
const { createNotification, createNotificationsForUsers, NotificationTypes } = require('../services/notificationService');
const { getUserProjectIds } = require('../utils/projectUtils');
const { generateProjectContract } = require('../services/contractService');
const { createProjectValidation, handleValidationErrors } = require('../validators/projectValidator');
const { checkProjectAccess, canModifyProject, canAddMember, canRemoveMember } = require('../utils/projectAccess');
const projectService = require('../services/projectService');
const { 
  isDeliveryOnlyUser, 
  canModifyProject: canModifyProjectCheck, 
  canDeleteProject 
} = require('../utils/permissionChecker');

// 对项目数据脱敏客户信息（用于限制查看客户名称/联系方式）
// 仅保留 customerId/_id，其余姓名、简称等用占位符替代
function scrubCustomerInfo(project) {
  if (!project) return project;
  const obj = project.toObject ? project.toObject() : { ...project };
  if (obj.customerId) {
    const cid = obj.customerId;
    const id = cid && cid._id ? cid._id : cid;
    // 保留ID，其他敏感信息置为*****
    obj.customerId = { _id: id, name: '*****', shortName: '*****' };
  }
  // 统一占位显示（给前端列表/详情用）
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

// 项目编号生成已移至 projectService

// 创建项目（销售角色和兼职销售）
router.post('/create', 
  authorize('sales', 'admin', 'part_time_sales'),
  createProjectValidation,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    // 使用服务层创建项目
    const project = await projectService.createProject(req.body, req.user);

    res.status(201).json({
      success: true,
      message: '项目创建成功',
      data: project
    });
}));

// 更新项目（管理员、销售、兼职销售；含PM身份的销售也不可编辑）
router.put('/:id', authorize('admin', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  // 权限检查：管理员或纯销售可修改
  if (!canModifyProjectCheck(req)) {
    throw new AppError('仅管理员或纯销售可修改项目', 403, 'PERMISSION_DENIED');
  }

  // 使用服务层更新项目
  const project = await projectService.updateProject(req.params.id, req.body, req.user);

  res.json({
    success: true,
    message: '项目已更新',
    data: project
  });
}));

// 取消/删除项目（管理员、销售、兼职销售；含PM身份的销售也不可删除）
router.delete('/:id', authorize('admin', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  // 权限检查：管理员或纯销售可删除
  if (!canDeleteProject(req)) {
    throw new AppError('仅管理员或纯销售可删除项目', 403, 'PERMISSION_DENIED');
  }

  // 使用服务层取消项目
  const project = await projectService.cancelProject(req.params.id, req.user);

  res.json({
    success: true,
    message: '项目已取消',
    data: project
  });
}));

// 获取项目列表
router.get('/', asyncHandler(async (req, res) => {
    const { month, status, businessType, role, customerId, paymentStatus } = req.query;
    let query = {};
    
    // 基于当前角色的权限进行数据过滤
    const rawViewPermission = getCurrentPermission(req, 'project.view');
    const currentRole = req.currentRole || (req.user.roles[0] || null);
    // 业务规则：项目经理只能看到“分配给自己”的项目，即使权限配置里是 all 也强制按 assigned 处理
    const viewPermission = currentRole === 'pm' ? 'assigned' : rawViewPermission;
    
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
        // 使用优化后的工具函数，避免重复查询
        const allProjectIds = await getUserProjectIds(req.user._id);
        
        if (allProjectIds.length > 0) {
          query._id = { $in: allProjectIds };
        } else {
          query._id = { $in: [] };
        }
      }
    }

    // 应用筛选条件（与 dashboard 保持一致）
    if (status) {
      query.status = status;
    } else {
      // 默认排除已取消项目
      query.status = { $ne: 'cancelled' };
    }
    if (businessType) query.businessType = businessType;
    if (customerId) query.customerId = customerId;
    if (paymentStatus) query['payment.paymentStatus'] = paymentStatus;

    // 角色筛选：如果指定了 role，按该角色进一步限定项目范围
    if (role) {
      let roleProjectIds = [];
      if (role === 'sales') {
        // 销售：本人创建的项目 + 作为销售成员的项目
        const salesMemberProjects = await ProjectMember.find({ userId: req.user._id, role: 'sales' }).distinct('projectId');
        const createdProjects = await Project.find({ createdBy: req.user._id }).distinct('_id');
        roleProjectIds = [...new Set([...salesMemberProjects.map(String), ...createdProjects.map(String)])];
      } else {
        // 其他角色：仅本人作为该角色成员参与的项目（排除拒绝的成员）
        // 注意：拒绝的成员不应该显示在项目列表中，因为已经被重新安排
        const memberProjects = await ProjectMember.find({ 
          userId: req.user._id, 
          role,
          acceptanceStatus: { $ne: 'rejected' } // 排除拒绝的成员
        }).distinct('projectId');
        roleProjectIds = memberProjects.map(String);
      }

      // 将角色过滤与现有可见性过滤求交集
      if (query._id && query._id.$in) {
        const allowedSet = new Set(roleProjectIds);
        const intersected = query._id.$in.map(String).filter(id => allowedSet.has(id));
        query._id = { $in: intersected };
      } else if (roleProjectIds.length > 0) {
        query._id = { $in: roleProjectIds };
      } else {
        // 没有符合角色的项目，确保查询结果为空
        query._id = { $in: [] };
      }
    }

    // 月份筛选：统一使用 createdAt 判断当月项目数（与 dashboard 保持一致）
    if (month) {
      const target = new Date(`${month}-01`);
      const startDate = new Date(target.getFullYear(), target.getMonth(), 1);
      const endDate = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    let projects = await Project.find(query)
      .populate('createdBy', 'name username')
      .populate('customerId', 'name shortName contactPerson phone email')
      .sort({ createdAt: -1 });

    // 再次基于 role 对项目进行用户侧过滤（防止查询条件未生效或遗漏）
    if (role) {
      let allowedIds = [];
      if (role === 'sales') {
        const salesMemberProjects = await ProjectMember.find({ userId: req.user._id, role: 'sales' }).distinct('projectId');
        const createdProjects = await Project.find({ createdBy: req.user._id }).distinct('_id');
        allowedIds = [...new Set([...salesMemberProjects.map(String), ...createdProjects.map(String)])];
      } else {
        // 排除拒绝的成员
        const memberProjects = await ProjectMember.find({ 
          userId: req.user._id, 
          role,
          acceptanceStatus: { $ne: 'rejected' } // 排除拒绝的成员
        }).distinct('projectId');
        allowedIds = memberProjects.map(String);
      }
      if (allowedIds.length > 0) {
        const allowedSet = new Set(allowedIds.map(String));
        projects = projects.filter(p => allowedSet.has(p._id.toString()));
      } else {
        projects = [];
      }
    }

    // 基于当前角色判断是否需要脱敏客户信息
    const isDeliveryOnly = isDeliveryOnlyUser(req);
    const data = isDeliveryOnly ? projects.map(scrubCustomerInfo) : projects;

    res.json({
      success: true,
      data
    });
}));

// 获取单个项目详情
router.get('/:id', asyncHandler(async (req, res) => {
  // 使用公共函数检查项目访问权限
  const project = await checkProjectAccess(
    req.params.id,
    req.user,
    req.user.roles
  );
  
  // 填充关联数据
  await project.populate('createdBy', 'name username');
  await project.populate('customerId', 'name shortName contactPerson phone email address');
  await project.populate('partTimeLayout.layoutAssignedTo', 'name username');

  // 获取项目成员
  const members = await ProjectMember.find({ projectId: project._id })
    .populate('userId', 'name username email roles employmentType');

  const rawProject = project.toObject();

  // 1) 原有逻辑：对执行类角色（PM/翻译/审校/排版等）整体脱敏客户名称
  const isDeliveryOnly = isDeliveryOnlyUser(req.user, req.currentRole);
  const baseProjectData = isDeliveryOnly ? scrubCustomerInfo(project) : rawProject;

  // 2) 新逻辑：客户联系人信息更严格——仅管理员或“当前以销售/兼职销售角色访问且为创建人”可见
  const isAdmin = req.user.roles.includes('admin');
  const currentRole = req.currentRole || (req.user.roles[0] || null);
  const isSalesRole = currentRole === 'sales' || currentRole === 'part_time_sales';
  const isCreator = project.createdBy && project.createdBy._id && project.createdBy._id.toString() === req.user._id.toString();
  const canViewContact = isAdmin || (isCreator && isSalesRole);

  const projectData = { ...baseProjectData };
  if (!canViewContact) {
    // 脱敏项目层面的联系人信息
    if (projectData.contactInfo) {
      projectData.contactInfo = {
        name: '*****',
        phone: '*****',
        email: '*****',
        position: ''
      };
    }
    // 脱敏客户对象中的联系人/联系方式（名称可按业务需要一并脱敏）
    if (projectData.customerId) {
      projectData.customerId = {
        ...projectData.customerId,
        contactPerson: '*****',
        phone: '*****',
        email: '*****'
      };
    }
  }

  res.json({
    success: true,
    data: {
      ...projectData,
      members
    }
  });
}));

// 接受项目分配（必须在所有 /:id 路由之前，确保正确匹配）
router.post('/:id/members/:memberId/accept', 
  authenticate,
  asyncHandler(async (req, res) => {
    const { id: projectId, memberId } = req.params;
    const userId = req.user._id;
    
    // 验证成员是否属于当前用户
    const member = await ProjectMember.findOne({
      _id: memberId,
      projectId: projectId,
      userId: userId,
      acceptanceStatus: 'pending'
    });
    
    if (!member) {
      throw new AppError('成员记录不存在或已处理', 404, 'MEMBER_NOT_FOUND');
    }
    
    // 获取项目信息
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }
    
    // 更新成员状态
    member.acceptanceStatus = 'accepted';
    member.acceptanceAt = new Date();
    await member.save();
    
    // 更新项目确认状态
    if (!project.memberAcceptance) {
      project.memberAcceptance = {
        requiresConfirmation: true,
        pendingCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        allConfirmed: false
      };
    }
    
    project.memberAcceptance.pendingCount = Math.max(0, project.memberAcceptance.pendingCount - 1);
    project.memberAcceptance.acceptedCount += 1;
    
    // 检查是否所有生产人员都已接受
    const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
    const productionMembers = await ProjectMember.find({
      projectId: projectId,
      role: { $in: productionRoles }
    });
    
    // 按角色分组，检查每个角色是否都有有效的（非拒绝的）成员
    const membersByRole = {};
    productionMembers.forEach(m => {
      if (!membersByRole[m.role]) {
        membersByRole[m.role] = [];
      }
      membersByRole[m.role].push(m);
    });
    
    // 检查每个角色是否都有有效的成员且都已接受
    let allRolesHaveValidMembers = true;
    let allValidMembersAccepted = true;
    
    for (const role of productionRoles) {
      const roleMembers = membersByRole[role] || [];
      // 只检查有效的成员（排除已拒绝的成员）
      const validMembers = roleMembers.filter(m => m.acceptanceStatus !== 'rejected');
      
      if (validMembers.length === 0) {
        // 如果该角色没有任何有效成员（可能都被拒绝了，且没有重新安排），需要等待
        // 但如果该角色本来就不需要成员（比如某些项目可能不需要审校），则跳过
        // 这里假设如果曾经分配过该角色，就需要有有效成员
        if (roleMembers.length > 0) {
          // 曾经分配过该角色，但现在没有有效成员，说明需要重新安排
          allRolesHaveValidMembers = false;
          break;
        }
        // 如果从未分配过该角色，跳过检查
        continue;
      }
      
      // 检查该角色的所有有效成员是否都已接受
      const allAccepted = validMembers.every(m => m.acceptanceStatus === 'accepted');
      if (!allAccepted) {
        allValidMembersAccepted = false;
        break;
      }
    }
    
    // 如果所有角色都有有效成员且都已接受，且没有待确认的成员，项目可以开始
    if (allRolesHaveValidMembers && allValidMembersAccepted && project.memberAcceptance.pendingCount === 0) {
      project.status = 'in_progress';
      project.startedAt = project.startedAt || new Date();
      project.memberAcceptance.allConfirmed = true;
    } else {
      // 还有成员未确认或需要重新安排，保持 scheduled
      project.status = 'scheduled';
    }
    
    await project.save();
    
    // 通知项目经理（包括项目创建者和所有PM）
    const roleNames = {
      'translator': '翻译',
      'reviewer': '审校',
      'layout': '排版',
      'part_time_translator': '兼职翻译'
    };
    const roleName = roleNames[member.role] || member.role;
    
    // 获取所有PM成员
    const pmMembers = await ProjectMember.find({ 
      projectId: projectId, 
      role: 'pm' 
    }).distinct('userId');
    
    // 通知项目创建者和所有PM
    const notificationRecipients = [
      project.createdBy.toString(),
      ...pmMembers.map(String)
    ].filter((id, index, arr) => arr.indexOf(id) === index); // 去重
    
    await createNotificationsForUsers(
      notificationRecipients,
      NotificationTypes.MEMBER_ACCEPTED,
      `${req.user.name}已接受项目"${project.projectName}"的${roleName}任务`,
      `#projects/${projectId}`
    );
    
    res.json({
      success: true,
      message: '已接受项目分配',
      data: { member, project }
    });
  })
);

// 拒绝项目分配
router.post('/:id/members/:memberId/reject',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id: projectId, memberId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;
    
    // 验证成员是否属于当前用户
    const member = await ProjectMember.findOne({
      _id: memberId,
      projectId: projectId,
      userId: userId,
      acceptanceStatus: 'pending'
    });
    
    if (!member) {
      throw new AppError('成员记录不存在或已处理', 404, 'MEMBER_NOT_FOUND');
    }
    
    // 获取项目信息
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }
    
    // 更新成员状态
    member.acceptanceStatus = 'rejected';
    member.acceptanceAt = new Date();
    member.rejectionReason = reason ? reason.trim().substring(0, 500) : null;
    await member.save();
    
    // 更新项目确认状态
    if (!project.memberAcceptance) {
      project.memberAcceptance = {
        requiresConfirmation: true,
        pendingCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        allConfirmed: false
      };
    }
    
    project.memberAcceptance.pendingCount = Math.max(0, project.memberAcceptance.pendingCount - 1);
    project.memberAcceptance.rejectedCount += 1;
    project.memberAcceptance.allConfirmed = false;
    
    // 项目保持 scheduled，等待重新安排
    project.status = 'scheduled';
    
    await project.save();
    
    // 通知项目经理（包括项目创建者和所有PM）
    const roleNames = {
      'translator': '翻译',
      'reviewer': '审校',
      'layout': '排版',
      'part_time_translator': '兼职翻译'
    };
    const roleName = roleNames[member.role] || member.role;
    const reasonText = reason ? `，原因：${reason.trim().substring(0, 200)}` : '';
    
    // 获取所有PM成员
    const pmMembers = await ProjectMember.find({ 
      projectId: projectId, 
      role: 'pm' 
    }).distinct('userId');
    
    // 通知项目创建者和所有PM
    const notificationRecipients = [
      project.createdBy.toString(),
      ...pmMembers.map(String)
    ].filter((id, index, arr) => arr.indexOf(id) === index); // 去重
    
    await createNotificationsForUsers(
      notificationRecipients,
      NotificationTypes.MEMBER_REJECTED,
      `${req.user.name}拒绝了项目"${project.projectName}"的${roleName}任务${reasonText}`,
      `#projects/${projectId}`
    );
    
    res.json({
      success: true,
      message: '已拒绝项目分配',
      data: { member, project }
    });
  })
);

// 添加项目成员
router.post('/:id/add-member', asyncHandler(async (req, res) => {
  const { userId, role, translatorType, wordRatio, layoutCost, partTimeFee } = req.body;
  const projectId = req.params.id;

  // 使用公共函数检查项目访问权限
  await checkProjectAccess(projectId, req.user, req.user.roles);

  // 使用公共函数检查添加成员权限
  const project = await Project.findById(projectId);
  if (!canAddMember(project, req.user, req.user.roles)) {
    throw new AppError('无权添加成员', 403, 'PERMISSION_DENIED');
  }

  // 使用服务层添加成员
  try {
    const member = await projectService.addProjectMember(
      projectId,
      { userId, role, translatorType, wordRatio, layoutCost, partTimeFee },
      req.user
    );

    res.status(201).json({
      success: true,
      message: '成员添加成功',
      data: member
    });
  } catch (error) {
    // 处理唯一约束冲突（MongoDB duplicate key error）
    if (error.code === 11000) {
      throw new AppError('该用户在此项目中已存在相同角色', 400, 'DUPLICATE_MEMBER');
    }
    throw error; // 其他错误继续向上抛出
  }
}));

// 项目开始执行（管理员、销售、兼职销售）
router.post('/:id/start', authorize('admin', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  // 使用服务层开始项目
  const project = await projectService.startProject(req.params.id, req.user);

  res.json({
    success: true,
    message: '项目已通知项目经理，等待安排',
    data: project
  });
}));

// 更新项目状态（中间节点）
router.post('/:id/status', authorize('admin', 'pm', 'translator', 'reviewer', 'layout'), asyncHandler(async (req, res) => {
  const { status } = req.body;

  // 使用服务层更新项目状态
  const project = await projectService.updateProjectStatus(req.params.id, status, req.user);

  res.json({
    success: true,
    message: '项目状态已更新',
    data: project
  });
}));

// 标记返修（PM、管理员、销售、兼职销售）
router.post('/:id/set-revision', authorize('pm', 'admin', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  const { count } = req.body;
  
  // 使用服务层标记返修
  const project = await projectService.setRevision(req.params.id, count, req.user);

  res.json({
    success: true,
    message: '返修次数已更新',
    data: project
  });
}));

// 标记延期（PM、管理员、销售、兼职销售）
router.post('/:id/set-delay', authorize('pm', 'admin', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  // 使用服务层标记延期
  const project = await projectService.setDelay(req.params.id, req.user);

  res.json({
    success: true,
    message: '延期标记已更新',
    data: project
  });
}));

// 标记客户投诉（PM、管理员、销售、兼职销售）
router.post('/:id/set-complaint', authorize('pm', 'admin', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  // 使用服务层标记客户投诉
  const project = await projectService.setComplaint(req.params.id, req.user);

  res.json({
    success: true,
    message: '客户投诉标记已更新',
    data: project
  });
}));

// 标记项目交付（仅管理员、销售、兼职销售）
router.post('/:id/finish', authorize('admin', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  // 额外权限校验：含PM身份的销售不允许交付，管理员始终允许
  const isAdmin = req.user.roles.includes('admin');
  const isSales = req.user.roles.includes('sales');
  const isPartTimeSales = req.user.roles.includes('part_time_sales');
  const isPM = req.user.roles.includes('pm');
  const canDeliver = isAdmin || ((isSales || isPartTimeSales) && !isPM);
  
  if (!canDeliver) {
    throw new AppError('仅管理员或纯销售可交付项目', 403, 'PERMISSION_DENIED');
  }

  // 使用服务层完成项目
  const { project, kpiResult } = await projectService.finishProject(req.params.id, req.user);

  // 根据KPI生成结果返回不同的消息
  if (kpiResult && kpiResult.count > 0) {
    res.json({
      success: true,
      message: `项目已完成，已生成 ${kpiResult.count} 条KPI记录`,
      data: project,
      kpiResult
    });
  } else {
    res.json({
      success: true,
      message: '项目已完成',
      data: project,
      ...(kpiResult === null ? { warning: 'KPI计算失败，请稍后手动生成' } : {})
    });
  }
}));

// 删除项目成员
router.delete('/:id/member/:memberId', asyncHandler(async (req, res) => {
  // 使用公共函数检查项目访问权限
  await checkProjectAccess(req.params.id, req.user, req.user.roles);

  // 使用公共函数检查删除成员权限
  const project = await Project.findById(req.params.id);
  if (!canRemoveMember(project, req.user, req.user.roles)) {
    throw new AppError('无权删除成员', 403, 'PERMISSION_DENIED');
  }

  // 使用服务层删除成员
  await projectService.removeProjectMember(req.params.id, req.params.memberId, req.user);

  res.json({
    success: true,
    message: '成员已删除'
  });
}));

// 更新回款信息（财务、管理员或项目创建人）
router.post('/:id/payment', authorize('finance', 'admin', 'sales'), asyncHandler(async (req, res) => {
  const { receivedAmount, receivedAt, expectedAt, isFullyPaid } = req.body;
  const project = await Project.findById(req.params.id);

  if (!project) {
    throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
  }

  // 仅允许项目创建人或有权限角色更新
  const isCreator = project.createdBy.toString() === req.user._id.toString();
  const isAllowedRole = req.user.roles.includes('finance') || req.user.roles.includes('admin');
  if (!isCreator && !isAllowedRole) {
    throw new AppError('仅财务、管理员或项目创建人可更新回款信息', 403, 'PERMISSION_DENIED');
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
}));

// 导出项目报价单
router.get('/:id/quotation', authenticate, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id)
    .populate('customerId', 'name shortName contactPerson phone email address')
    .populate('createdBy', 'name username email');
  
  if (!project) {
    throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
  }
  
  // 检查权限：创建者、管理员、销售、兼职销售、财务可以导出
  // 业务调整：即使用户同时拥有 PM 角色，只要是项目创建人也允许导出报价单
  const isCreator = project.createdBy._id.toString() === req.user._id.toString();
  const isAdmin = req.user.roles.includes('admin');
  const isFinance = req.user.roles.includes('finance');
  const isSales = req.user.roles.includes('sales');
  const isPartTimeSales = req.user.roles.includes('part_time_sales');
  const isPM = req.user.roles.includes('pm');

  // 角色维度的导出权限：管理员 / 财务 / 销售 / 兼职销售（非创建者时，如果同时是 PM，则不允许）
  const canViewByRole = (isAdmin || isFinance || isSales || isPartTimeSales) && !isPM;
  // 创建者始终可以导出，与是否同时是 PM 无关
  const canView = isCreator || canViewByRole;
  
  if (!canView) {
    throw new AppError('无权导出此项目的报价单', 403, 'PERMISSION_DENIED');
  }
  
  const buffer = await exportProjectQuotation(req.params.id);
  
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new AppError('生成的文件数据无效', 500, 'EXPORT_ERROR');
  }
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // 使用encodeURIComponent确保中文文件名正确编码
  const filename = encodeURIComponent(`报价单-${project.projectNumber || project.projectName}.xlsx`);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  res.send(buffer);
}));

// 导出项目报价单（基于表单数据，用于创建项目时）
router.post('/quotation/preview', authenticate, asyncHandler(async (req, res) => {
  const projectData = req.body;
  
  // 验证必填字段
  if (!projectData.projectName || !projectData.customerId) {
    throw new AppError('项目名称和客户不能为空', 400, 'VALIDATION_ERROR');
  }
  
  // 获取客户信息
  const customer = await Customer.findById(projectData.customerId);
  if (!customer) {
    throw new AppError('客户不存在', 404, 'CUSTOMER_NOT_FOUND');
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
    throw new AppError('生成的文件数据无效', 500, 'EXPORT_ERROR');
  }
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // 使用encodeURIComponent确保中文文件名正确编码
  const filename = encodeURIComponent(`报价单-${projectObj.projectName}.xlsx`);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  res.send(buffer);
}));

module.exports = router;

