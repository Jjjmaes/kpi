const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Customer = require('../models/Customer');
const KpiConfig = require('../models/KpiConfig');
const User = require('../models/User');
const { createNotification, createNotificationsForUsers, NotificationTypes } = require('./notificationService');
const { AppError } = require('../middleware/errorHandler');

/**
 * 项目服务层
 * 负责项目相关的业务逻辑处理
 */
class ProjectService {
  /**
   * 生成项目编号
   */
  async generateProjectNumber() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    
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

  /**
   * 验证并处理项目数据
   */
  async validateAndPrepareProjectData(data, creator) {
    const {
      projectName,
      customerId,
      contactId,
      contactInfo,
      businessType,
      projectType,
      sourceLanguage,
      targetLanguages,
      wordCount,
      unitPrice,
      projectAmount,
      deadline,
      expectedAt,
      projectNumber,
      isTaxIncluded,
      needInvoice,
      specialRequirements,
      partTimeSales,
      partTimeLayout
    } = data;

    // 去重并验证每个语言项
    const uniqueTargetLanguages = [...new Set(
      targetLanguages.map(lang => String(lang).trim()).filter(lang => lang)
    )];

    // 计算总金额
    let finalAmount = projectAmount;
    if (businessType === 'translation' && wordCount && unitPrice) {
      finalAmount = (wordCount / 1000) * unitPrice;
    } else if (!projectAmount || projectAmount <= 0) {
      throw new AppError('请提供项目金额或字数和单价', 400, 'INVALID_AMOUNT');
    }

    // 验证最终金额范围
    const MAX_PROJECT_AMOUNT = 100000000;
    if (isNaN(finalAmount) || finalAmount < 0 || finalAmount > MAX_PROJECT_AMOUNT) {
      throw new AppError(
        `项目金额必须在0-${MAX_PROJECT_AMOUNT.toLocaleString()}之间`,
        400,
        'INVALID_AMOUNT'
      );
    }

    // 日期校验：允许当天交付，只比较日期部分（不包含时间）
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0); // 设置为当天的00:00:00
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 设置为当天的00:00:00
    if (deadlineDate < today) {
      throw new AppError('交付时间不能早于今天', 400, 'INVALID_DEADLINE');
    }

    // 兼职销售字段校验
    if (partTimeSales && partTimeSales.isPartTime) {
      const companyReceivable = parseFloat(partTimeSales.companyReceivable || 0);
      if (!companyReceivable || companyReceivable <= 0) {
        throw new AppError(
          '兼职销售创建项目时，公司应收金额必须大于0',
          400,
          'INVALID_PART_TIME_SALES'
        );
      }
      if (companyReceivable > finalAmount) {
        throw new AppError(
          '公司应收金额不能大于项目总金额',
          400,
          'INVALID_PART_TIME_SALES'
        );
      }
    }

    // 兼职排版字段校验
    if (partTimeLayout && partTimeLayout.isPartTime) {
      const layoutCost = parseFloat(partTimeLayout.layoutCost || 0);
      if (layoutCost > finalAmount * 0.05) {
        throw new AppError(
          '排版费用不能超过项目总金额的5%',
          400,
          'INVALID_LAYOUT_COST'
        );
      }
    }

    // 验证客户是否存在
    const customer = await Customer.findById(customerId);
    if (!customer || !customer.isActive) {
      throw new AppError('客户不存在或已被禁用', 400, 'CUSTOMER_NOT_FOUND');
    }

    // 处理联系人信息
    let finalContactId = null;
    let finalContactInfo = null;
    
    if (contactId !== null && contactId !== undefined && !isNaN(contactId)) {
      // 验证联系人索引是否有效
      const contacts = customer.contacts && customer.contacts.length > 0 
        ? customer.contacts 
        : (customer.contactPerson ? [{
            name: customer.contactPerson || '',
            phone: customer.phone || '',
            email: customer.email || '',
            position: '',
            isPrimary: true
          }] : []);
      
      if (contacts[contactId]) {
        finalContactId = contactId;
        finalContactInfo = contactInfo || {
          name: contacts[contactId].name || '',
          phone: contacts[contactId].phone || '',
          email: contacts[contactId].email || '',
          position: contacts[contactId].position || ''
        };
      }
    }

    // 协议付款日，默认创建日起 3 个月
    let hasExpectedInput = !!expectedAt;
    let expectedPaymentDate = hasExpectedInput ? new Date(expectedAt) : null;
    if (!expectedPaymentDate || isNaN(expectedPaymentDate)) {
      expectedPaymentDate = new Date();
      hasExpectedInput = false;
    }
    expectedPaymentDate.setMonth(expectedPaymentDate.getMonth() + (hasExpectedInput ? 0 : 3));

    // 生成项目编号
    let projectNum = projectNumber;
    if (!projectNum) {
      projectNum = await this.generateProjectNumber();
    } else {
      const existing = await Project.findOne({ projectNumber: projectNum });
      if (existing) {
        throw new AppError('项目编号已存在', 400, 'DUPLICATE_PROJECT_NUMBER');
      }
    }

    // 获取当前KPI配置并锁定
    const config = await KpiConfig.getActiveConfig();
    const lockedRatios = config.getLockedRatios();

    // 检查：销售创建项目时不能设置兼职排版
    const isSales = creator.roles.includes('sales') || creator.roles.includes('part_time_sales');
    const isAdmin = creator.roles.includes('admin');
    
    if (isSales && !isAdmin && partTimeLayout?.isPartTime) {
      throw new AppError(
        '销售创建项目时不能设置兼职排版，兼职排版应由项目经理在项目详情中添加',
        400,
        'INVALID_PERMISSION'
      );
    }

    // 处理兼职排版费用校验
    if (partTimeLayout?.isPartTime && partTimeLayout?.layoutCost) {
      const tempProject = new Project({ projectAmount: finalAmount });
      const validation = tempProject.validateLayoutCost(partTimeLayout.layoutCost);
      if (!validation.valid) {
        throw new AppError(validation.message, 400, 'INVALID_LAYOUT_COST');
      }
    }

    // 安全处理嵌套字段
    const processedSpecialRequirements = specialRequirements && typeof specialRequirements === 'object'
      ? {
          terminology: specialRequirements.terminology === true || specialRequirements.terminology === 'true',
          nda: specialRequirements.nda === true || specialRequirements.nda === 'true',
          referenceFiles: specialRequirements.referenceFiles === true || specialRequirements.referenceFiles === 'true',
          pureTranslationDelivery: specialRequirements.pureTranslationDelivery === true || specialRequirements.pureTranslationDelivery === 'true',
          bilingualDelivery: specialRequirements.bilingualDelivery === true || specialRequirements.bilingualDelivery === 'true',
          notes: typeof specialRequirements.notes === 'string' ? specialRequirements.notes.trim().substring(0, 500) : undefined
        }
      : {};

    return {
      projectData: {
        projectNumber: projectNum,
        projectName,
        customerId,
        clientName: customer.name,
        contactId: finalContactId,
        contactInfo: finalContactInfo,
        businessType: businessType || 'translation',
        projectType: projectType || 'mtpe',
        sourceLanguage: sourceLanguage.trim(),
        targetLanguages: uniqueTargetLanguages,
        wordCount: wordCount || 0,
        unitPrice: unitPrice || 0,
        projectAmount: finalAmount,
        deadline: new Date(deadline),
        isTaxIncluded: isTaxIncluded || false,
        needInvoice: needInvoice || false,
        specialRequirements: processedSpecialRequirements,
        createdBy: creator._id,
        locked_ratios: lockedRatios,
        status: 'pending',
        completionChecks: {
          hasAmount: true
        },
        partTimeSales: partTimeSales || {
          isPartTime: false,
          companyReceivable: 0,
          taxRate: 0,
          partTimeSalesCommission: 0
        },
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
      },
      lockedRatios
    };
  }

  /**
   * 验证成员数据
   */
  validateMembers(members, creator, lockedRatios) {
    if (!members || !Array.isArray(members) || members.length === 0) {
      return [];
    }

    const isSales = creator.roles.includes('sales') || creator.roles.includes('part_time_sales');
    const isAdmin = creator.roles.includes('admin');
    
    // 检查：销售创建项目时只能添加项目经理
    if (isSales && !isAdmin) {
      const invalidRoles = members.filter(m => m.role && m.role !== 'pm');
      if (invalidRoles.length > 0) {
        throw new AppError(
          '销售创建项目时只能添加项目经理，其他成员（翻译、审校、排版等）应由项目经理在项目详情中添加',
          400,
          'INVALID_MEMBER_ROLE'
        );
      }
    }

    return members.map(member => {
      const { userId, role, translatorType, wordRatio } = member;
      const isSelfAssignment = userId.toString() === creator._id.toString();
      
      // 校验1：PM不能将翻译或审校分配给自己
      const isPM = creator.roles.includes('pm');
      const isTranslator = creator.roles.includes('translator');
      const isReviewer = creator.roles.includes('reviewer');
      
      if (isPM && isSelfAssignment) {
        if ((role === 'translator' && isTranslator) || (role === 'reviewer' && isReviewer)) {
          throw new AppError('作为项目经理，不能将翻译或审校任务分配给自己', 400, 'INVALID_SELF_ASSIGNMENT');
        }
      }
      
      // 校验2：销售不能将PM角色分配给自己
      const hasPMRole = creator.roles.includes('pm');
      if (isSales && hasPMRole && isSelfAssignment && role === 'pm') {
        throw new AppError('作为销售，不能将项目经理角色分配给自己', 400, 'INVALID_SELF_ASSIGNMENT');
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
        ratio = 0;
      } else if (role === 'layout') {
        ratio = 0;
      }

      return {
        userId,
        role,
        translatorType: role === 'translator' ? (translatorType || 'mtpe') : undefined,
        wordRatio: role === 'translator' ? (wordRatio || 1.0) : 1.0,
        ratio_locked: ratio
      };
    });
  }

  /**
   * 创建项目成员
   */
  async createProjectMembers(projectId, members, lockedRatios) {
    if (!members || members.length === 0) {
      return [];
    }

    const memberPromises = members.map(memberData => {
      return ProjectMember.create({
        projectId,
        ...memberData
      });
    });

    return await Promise.all(memberPromises);
  }

  /**
   * 发送成员分配通知
   */
  async sendMemberAssignmentNotifications(project, members, excludeUserId) {
    if (!members || members.length === 0) {
      return;
    }

    try {
      const roleNames = {
        'pm': '项目经理',
        'translator': '翻译',
        'reviewer': '审校',
        'layout': '排版'
      };
      
      const notificationPromises = members
        .filter(member => {
          const memberUserId = member.userId?._id 
            ? member.userId._id.toString() 
            : (member.userId ? member.userId.toString() : null);
          return memberUserId && memberUserId !== excludeUserId?.toString();
        })
        .map(member => {
          const userId = member.userId?._id 
            ? member.userId._id.toString() 
            : (member.userId ? member.userId.toString() : null);
          const role = member.role;
          const roleName = roleNames[role] || role;
          
          return createNotification({
            userId: userId,
            type: NotificationTypes.PROJECT_ASSIGNED,
            message: `您已被分配到新项目"${project.projectName}"，角色：${roleName}`,
            link: `#projects`
          });
        });
      
      if (notificationPromises.length > 0) {
        await Promise.all(notificationPromises);
      }
    } catch (error) {
      console.error('[ProjectService] 创建通知失败:', error);
      // 通知创建失败不影响项目创建
    }
  }

  /**
   * 创建项目
   */
  async createProject(data, creator) {
    // 验证并准备项目数据
    const { projectData, lockedRatios } = await this.validateAndPrepareProjectData(data, creator);

    // 创建项目
    const project = await Project.create(projectData);

    // 处理成员
    const members = data.members || [];
    const validatedMembers = this.validateMembers(members, creator, lockedRatios);
    
    if (validatedMembers.length > 0) {
      await this.createProjectMembers(project._id, validatedMembers, lockedRatios);
      project.completionChecks.hasMembers = true;
      await project.save();

      // 发送通知
      await this.sendMemberAssignmentNotifications(
        project,
        validatedMembers.map(m => ({ userId: m.userId, role: m.role })),
        creator._id
      );
    }

    return project;
  }

  /**
   * 添加项目成员
   */
  async addProjectMember(projectId, memberData, user) {
    const { userId, role, translatorType, wordRatio, layoutCost } = memberData;

    if (!userId || !role) {
      throw new AppError('用户ID和角色不能为空', 400, 'INVALID_INPUT');
    }

    const memberUser = await User.findById(userId).select('employmentType roles name');
    if (!memberUser) {
      throw new AppError('指定的用户不存在', 404, 'USER_NOT_FOUND');
    }
    const employmentType = memberUser.employmentType || 'full_time';

    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    // 校验自分配规则
    const isSelfAssignment = userId.toString() === user._id.toString();
    const isPM = user.roles.includes('pm');
    const isTranslator = user.roles.includes('translator');
    const isReviewer = user.roles.includes('reviewer');
    
    // 校验1：PM不能将翻译或审校分配给自己
    if (isPM && isSelfAssignment) {
      if ((role === 'translator' && isTranslator) || (role === 'reviewer' && isReviewer)) {
        throw new AppError('作为项目经理，不能将翻译或审校任务分配给自己', 400, 'INVALID_SELF_ASSIGNMENT');
      }
    }
    
    // 校验2：销售不能将PM角色分配给自己
    const isSales = user.roles.includes('sales') || user.roles.includes('part_time_sales');
    const hasPMRole = user.roles.includes('pm');
    if (isSales && hasPMRole && isSelfAssignment && role === 'pm') {
      throw new AppError('作为销售，不能将项目经理角色分配给自己', 400, 'INVALID_SELF_ASSIGNMENT');
    }

    // 获取项目的锁定系数（使用项目创建时的配置）
    const lockedRatios = project.locked_ratios;

    // 如果是兼职排版且提供了排版费用，验证并更新项目信息
    if (role === 'layout' && layoutCost && layoutCost > 0) {
      const validation = project.validateLayoutCost(layoutCost);
      if (!validation.valid) {
        throw new AppError(validation.message, 400, 'INVALID_LAYOUT_COST');
      }

      project.partTimeLayout = {
        isPartTime: true,
        layoutCost: layoutCost,
        layoutAssignedTo: userId,
        layoutCostPercentage: validation.percentage || 0
      };
      await project.save();
    } else if (role === 'layout') {
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
      ratio = 0;
    } else if (role === 'layout') {
      ratio = 0;
    }

    const member = await ProjectMember.create({
      projectId,
      userId,
      role,
      employmentType,
      translatorType: role === 'translator' ? (translatorType || 'mtpe') : undefined,
      wordRatio: role === 'translator' ? (wordRatio || 1.0) : 1.0,
      ratio_locked: ratio
    });

    // 如果项目状态是pending，添加成员后自动变为scheduled
    if (project.status === 'pending') {
      project.status = 'scheduled';
      project.startedAt = new Date();
      project.completionChecks.hasMembers = true;
      await project.save();
    }

    // 发送通知
    try {
      const roleNames = {
        'pm': '项目经理',
        'translator': '翻译',
        'reviewer': '审校',
        'layout': '排版'
      };
      const roleName = roleNames[role] || role;
      await createNotification({
        userId: userId,
        type: NotificationTypes.PROJECT_ASSIGNED,
        message: `您已被分配到项目"${project.projectName}"，角色：${roleName}`,
        link: `#projects`
      });
    } catch (notifError) {
      console.error('[ProjectService] 创建通知失败:', notifError);
    }

    return member;
  }

  /**
   * 删除项目成员
   */
  async removeProjectMember(projectId, memberId, user) {
    const member = await ProjectMember.findById(memberId)
      .populate('userId', '_id name');
    
    if (!member) {
      throw new AppError('成员不存在', 404, 'MEMBER_NOT_FOUND');
    }

    await ProjectMember.findByIdAndDelete(memberId);

    // 发送通知
    try {
      const roleNames = {
        'pm': '项目经理',
        'translator': '翻译',
        'reviewer': '审校',
        'layout': '排版',
        'sales': '销售',
        'admin_staff': '综合岗',
        'part_time_sales': '兼职销售'
      };
      const roleName = roleNames[member.role] || member.role;
      
      const project = await Project.findById(projectId);
      if (member.userId._id.toString() !== user._id.toString() && project) {
        await createNotification({
          userId: member.userId._id.toString(),
          type: NotificationTypes.PROJECT_MEMBER_REMOVED,
          message: `您已从项目"${project.projectName}"中移除，角色：${roleName}`,
          link: `#projects`
        });
      }
    } catch (notifError) {
      console.error('[ProjectService] 创建通知失败:', notifError);
    }

    return member;
  }

  /**
   * 更新项目
   */
  async updateProject(projectId, updateData, user) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    // 已完成项目不允许修改
    if (project.status === 'completed') {
      throw new AppError('已完成的项目不可修改', 400, 'PROJECT_COMPLETED');
    }

    // 可更新的字段白名单
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

    // 过滤可修改字段
    editableFields.forEach(field => {
      if (updateData[field] !== undefined) {
        if (field.includes('.')) {
          // 处理嵌套字段
          const [parent, child] = field.split('.');
          if (!project[parent]) project[parent] = {};
          project[parent][child] = updateData[field];
        } else {
          project[field] = updateData[field];
        }
      }
    });

    // 规范化特殊要求
    if (updateData.specialRequirements && typeof updateData.specialRequirements === 'object') {
      const sr = updateData.specialRequirements;
      project.specialRequirements = {
        terminology: sr.terminology === true || sr.terminology === 'true',
        nda: sr.nda === true || sr.nda === 'true',
        referenceFiles: sr.referenceFiles === true || sr.referenceFiles === 'true',
        pureTranslationDelivery: sr.pureTranslationDelivery === true || sr.pureTranslationDelivery === 'true',
        bilingualDelivery: sr.bilingualDelivery === true || sr.bilingualDelivery === 'true',
        notes: typeof sr.notes === 'string' ? sr.notes.trim().substring(0, 500) : undefined
      };
    }

    // 字段修正
    if (project.businessType !== 'translation') {
      project.wordCount = project.wordCount || 0;
      project.unitPrice = project.unitPrice || 0;
    }

    if (!project.projectAmount || project.projectAmount < 0) {
      throw new AppError('项目金额不能为空', 400, 'INVALID_AMOUNT');
    }

    // 检查：销售编辑项目时不能设置兼职排版
    const isSales = user.roles.includes('sales') || user.roles.includes('part_time_sales');
    const isAdmin = user.roles.includes('admin');
    const isPM = user.roles.includes('pm');
    
    if (isSales && !isAdmin && !isPM && updateData.partTimeLayout?.isPartTime) {
      throw new AppError(
        '销售编辑项目时不能设置兼职排版，兼职排版应由项目经理在项目详情中添加',
        400,
        'INVALID_PERMISSION'
      );
    }

    // 校验兼职排版费用
    if (project.partTimeLayout?.isPartTime && project.partTimeLayout?.layoutCost) {
      const validation = project.validateLayoutCost(project.partTimeLayout.layoutCost);
      if (!validation.valid) {
        throw new AppError(validation.message, 400, 'INVALID_LAYOUT_COST');
      }
    }

    await project.save();
    return project;
  }

  /**
   * 删除/取消项目
   */
  async cancelProject(projectId, user) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    if (project.status === 'completed') {
      throw new AppError('已完成的项目不可删除', 400, 'PROJECT_COMPLETED');
    }

    project.status = 'cancelled';
    await project.save();
    return project;
  }

  /**
   * 开始项目
   */
  async startProject(projectId, user) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    if (project.status !== 'pending') {
      throw new AppError('项目状态不是待开始，无法开始执行', 400, 'INVALID_STATUS');
    }

    // 仅允许项目创建人（销售）或管理员操作
    const isCreator = project.createdBy.toString() === user._id.toString();
    const isAdmin = user.roles.includes('admin');
    if (!isCreator && !isAdmin) {
      throw new AppError('仅项目创建人或管理员可开始项目', 403, 'PERMISSION_DENIED');
    }

    // 检查是否有成员（至少需要项目经理）
    const members = await ProjectMember.find({ projectId: project._id });
    const hasPM = members.some(m => m.role === 'pm');
    if (!hasPM) {
      throw new AppError('请先指定项目经理', 400, 'NO_PM');
    }

    // 销售点击"开始项目"后，项目进入"待安排"状态，等待PM安排人员
    project.status = 'scheduled';
    project.startedAt = new Date();
    project.completionChecks.hasMembers = true;
    await project.save();

    return project;
  }

  /**
   * 更新项目状态
   */
  async updateProjectStatus(projectId, status, user) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    if (!status) {
      throw new AppError('缺少状态参数', 400, 'MISSING_STATUS');
    }

    if (['completed', 'cancelled'].includes(project.status)) {
      throw new AppError('项目已结束，不能更新状态', 400, 'PROJECT_ENDED');
    }

    const allowedStatuses = ['scheduled', 'in_progress', 'translation_done', 'review_done', 'layout_done'];
    if (!allowedStatuses.includes(status)) {
      throw new AppError('不支持的状态', 400, 'INVALID_STATUS');
    }

    const isAdmin = user.roles.includes('admin');
    const isPM = user.roles.includes('pm');

    // 查询当前用户的项目成员角色
    const member = await ProjectMember.findOne({ projectId: project._id, userId: user._id });
    const memberRole = member?.role;

    const roleAllowed = {
      scheduled: isAdmin || isPM,
      in_progress: isAdmin || isPM,
      translation_done: isAdmin || isPM || memberRole === 'translator',
      review_done: isAdmin || isPM || memberRole === 'reviewer',
      layout_done: isAdmin || isPM || memberRole === 'layout'
    };

    if (!roleAllowed[status]) {
      throw new AppError('当前角色无权执行此状态更新', 403, 'PERMISSION_DENIED');
    }

    // 仅允许向前推进
    const order = ['pending', 'scheduled', 'in_progress', 'translation_done', 'review_done', 'layout_done', 'completed'];
    const currentIdx = order.indexOf(project.status);
    const targetIdx = order.indexOf(status);
    if (targetIdx === -1 || currentIdx === -1) {
      throw new AppError('状态无效', 400, 'INVALID_STATUS');
    }
    if (targetIdx < currentIdx) {
      throw new AppError('状态不可回退', 400, 'STATUS_CANNOT_ROLLBACK');
    }

    project.status = status;
    await project.save();

    // 发送状态变更通知
    await this.sendStatusChangeNotification(project, status, user);

    return project;
  }

  /**
   * 发送项目状态变更通知
   */
  async sendStatusChangeNotification(project, status, user) {
    try {
      const statusNames = {
        'scheduled': '待安排',
        'in_progress': '进行中',
        'translation_done': '翻译完成',
        'review_done': '审校完成',
        'layout_done': '排版完成'
      };
      const statusName = statusNames[status] || status;
      
      // 获取项目所有成员（除了当前操作者）
      const members = await ProjectMember.find({ projectId: project._id })
        .populate('userId', '_id');
      const memberUserIds = members
        .filter(m => m.userId._id.toString() !== user._id.toString())
        .map(m => m.userId._id.toString());
      
      // 也通知项目创建者（如果不是当前操作者）
      const creatorId = project.createdBy.toString();
      if (creatorId !== user._id.toString() && !memberUserIds.includes(creatorId)) {
        memberUserIds.push(creatorId);
      }
      
      if (memberUserIds.length > 0) {
        await createNotificationsForUsers(
          memberUserIds,
          NotificationTypes.PROJECT_STATUS_CHANGED,
          `项目"${project.projectName}"状态已更新为：${statusName}`,
          `#projects`
        );
      }
    } catch (notifError) {
      console.error('[ProjectService] 创建通知失败:', notifError);
      // 通知创建失败不影响状态更新
    }
  }

  /**
   * 标记返修
   */
  async setRevision(projectId, count, user) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    project.revisionCount = count || project.revisionCount + 1;
    project.completionChecks.hasQualityInfo = true;
    await project.save();
    return project;
  }

  /**
   * 标记延期
   */
  async setDelay(projectId, user) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    project.isDelayed = true;
    project.completionChecks.hasQualityInfo = true;
    await project.save();
    return project;
  }

  /**
   * 标记客户投诉
   */
  async setComplaint(projectId, user) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    project.hasComplaint = true;
    project.completionChecks.hasQualityInfo = true;
    await project.save();
    return project;
  }

  /**
   * 完成项目
   */
  async finishProject(projectId, user) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    // 检查完成条件
    const members = await ProjectMember.find({ projectId: project._id });
    
    if (members.length === 0) {
      throw new AppError('项目尚未分配成员，无法完成', 400, 'NO_MEMBERS');
    }

    if (!project.projectAmount || project.projectAmount <= 0) {
      throw new AppError('项目金额未填写或无效', 400, 'INVALID_AMOUNT');
    }

    // 更新完成检查
    const checks = project.completionChecks || {};
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

    // 发送完成通知
    try {
      const members = await ProjectMember.find({ projectId: project._id })
        .populate('userId', '_id');
      const memberUserIds = members
        .filter(m => m.userId._id.toString() !== user._id.toString())
        .map(m => m.userId._id.toString());
      
      // 也通知项目创建者（如果不是当前操作者）
      const creatorId = project.createdBy.toString();
      if (creatorId !== user._id.toString() && !memberUserIds.includes(creatorId)) {
        memberUserIds.push(creatorId);
      }
      
      if (memberUserIds.length > 0) {
        await createNotificationsForUsers(
          memberUserIds,
          NotificationTypes.PROJECT_COMPLETED,
          `项目"${project.projectName}"已完成，KPI已生成`,
          `#kpi`
        );
      }
    } catch (notifError) {
      console.error('[ProjectService] 创建通知失败:', notifError);
    }

    // 实时计算并生成KPI记录
    let kpiResult = null;
    try {
      const { generateProjectKPI } = require('./kpiService');
      kpiResult = await generateProjectKPI(project._id);
    } catch (kpiError) {
      console.error('[ProjectService] KPI计算失败:', kpiError);
      // KPI计算失败不影响项目完成
    }

    return { project, kpiResult };
  }
}

module.exports = new ProjectService();

