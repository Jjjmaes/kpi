const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Customer = require('../models/Customer');
const KpiConfig = require('../models/KpiConfig');
const User = require('../models/User');
const Role = require('../models/Role');
const { createNotification, createNotificationsForUsers, NotificationTypes } = require('./notificationService');
const emailService = require('./emailService');
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
    
    // 从配置中获取项目编号前缀，默认为 'PRJ'
    const config = await KpiConfig.getActiveConfig();
    const prefixCode = (config.projectNumberPrefix || 'PRJ').trim().toUpperCase();
    
    const prefix = `${prefixCode}${year}${month}`;
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
      partTimeLayout,
      quotationDetails
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

    // 客户经理字段校验 + 税率注入（统一从系统配置读取，前端不再填写税率）
    let normalizedPartTimeSales = partTimeSales;
    if (partTimeSales && partTimeSales.isPartTime) {
      const companyReceivable = parseFloat(partTimeSales.companyReceivable || 0);
      if (!companyReceivable || companyReceivable <= 0) {
        throw new AppError(
          '客户经理创建项目时，公司应收金额必须大于0',
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

      // 使用 KPI 配置中的客户经理税率，忽略前端传入的 taxRate
      const config = await KpiConfig.getActiveConfig();
      const taxRateFromConfig = typeof config.part_time_sales_tax_rate === 'number'
        ? config.part_time_sales_tax_rate
        : 0;

      normalizedPartTimeSales = {
        ...partTimeSales,
        taxRate: taxRateFromConfig
      };
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
        partTimeSales: normalizedPartTimeSales || {
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
        },
        quotationDetails: quotationDetails && Array.isArray(quotationDetails) && quotationDetails.length > 0 ? quotationDetails : undefined
      },
      lockedRatios
    };
  }

  /**
   * 验证成员数据
   */
  async validateMembers(members, creator, lockedRatios) {
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

    // 获取配置：是否允许自己分配给自己
    const config = await KpiConfig.getActiveConfig();
    const allowSelfAssignment = config.allow_self_assignment || false;

    return members.map(member => {
      const { userId, role, translatorType, wordRatio } = member;
      const isSelfAssignment = userId.toString() === creator._id.toString();
      
      // 如果允许自己分配给自己，跳过验证
      if (!allowSelfAssignment) {
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
        // 翻译、审校、排版都支持占比；其他角色默认占比为1
        wordRatio: ['translator', 'reviewer', 'layout'].includes(role)
          ? (typeof wordRatio === 'number' ? (wordRatio || 1.0) : 1.0)
          : 1.0,
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
    const validatedMembers = await this.validateMembers(members, creator, lockedRatios);
    
    if (validatedMembers.length > 0) {
      await this.createProjectMembers(project._id, validatedMembers, lockedRatios);
      project.completionChecks.hasMembers = true;
      await project.save();

      // 发送站内通知
      await this.sendMemberAssignmentNotifications(
        project,
        validatedMembers.map(m => ({ userId: m.userId, role: m.role })),
        creator._id
      );

      // 发送邮件通知（异步，不阻塞主流程）
      try {
        // 需要查询用户信息以获取邮箱
        const membersWithUsers = await Promise.all(
          validatedMembers.map(async (m) => {
            const user = await User.findById(m.userId).select('name email username');
            return { user, role: m.role };
          })
        );
        // 处理附件：将 base64 转换为 Buffer
        const attachments = data.attachments && Array.isArray(data.attachments) && data.attachments.length > 0
          ? data.attachments.map(att => ({
              filename: att.filename,
              content: Buffer.from(att.content, 'base64')
            }))
          : null;
        await emailService.sendBulkProjectAssignmentEmails(membersWithUsers, project, creator, attachments);
      } catch (emailError) {
        console.error('[ProjectService] 发送邮件通知失败:', emailError);
        // 邮件发送失败不影响项目创建
      }
    }

    return project;
  }

  /**
   * 添加项目成员
   */
  async addProjectMember(projectId, memberData, user) {
    const { userId, role, translatorType, wordRatio, layoutCost, partTimeFee, attachments } = memberData;

    if (!userId || !role) {
      throw new AppError('用户ID和角色不能为空', 400, 'INVALID_INPUT');
    }

    const memberUser = await User.findById(userId).select('employmentType roles name');
    if (!memberUser) {
      throw new AppError('指定的用户不存在', 404, 'USER_NOT_FOUND');
    }
    const employmentType = memberUser.employmentType || 'full_time';

    // 校验角色是否允许用于项目成员
    const roleDoc = await Role.findOne({ code: role, isActive: true, canBeProjectMember: true });
    if (!roleDoc) {
      // 检查角色是否存在但不符合条件
      const roleExists = await Role.findOne({ code: role });
      if (!roleExists) {
        throw new AppError(`角色 '${role}' 不存在`, 400, 'ROLE_NOT_FOUND');
      } else if (!roleExists.isActive) {
        throw new AppError(`角色 '${role}' 已禁用`, 400, 'ROLE_DISABLED');
      } else if (!roleExists.canBeProjectMember) {
        throw new AppError(`角色 '${role}' 不允许用于项目成员`, 400, 'ROLE_NOT_FOR_PROJECT_MEMBER');
      } else {
        throw new AppError(`角色 '${role}' 不可用于项目成员`, 400, 'INVALID_ROLE');
      }
    }

    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    // 获取配置：是否允许自己分配给自己
    const config = await KpiConfig.getActiveConfig();
    const allowSelfAssignment = config.allow_self_assignment || false;
    
    // 校验自分配规则（如果允许自己分配给自己，跳过验证）
    if (!allowSelfAssignment) {
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
    }

    // 获取项目的锁定系数（使用项目创建时的配置）
    const lockedRatios = project.locked_ratios;

    // 兼职角色费用校验（除客户经理外，所有兼职角色都需要输入费用）
    // 客户经理通过项目配置计算，不需要在这里输入费用
    const isPartTime = employmentType === 'part_time';
    const isPartTimeSales = role === 'part_time_sales' || (role === 'sales' && isPartTime);
    
    if (isPartTime && !isPartTimeSales) {
      // 所有兼职角色（除客户经理外）都需要输入费用
      const fee = parseFloat(partTimeFee || 0);
      const roleName = roleDoc.name || role;
      if (!fee || fee <= 0) {
        throw new AppError(`请填写${roleName}费用，且必须大于0`, 400, 'INVALID_PART_TIME_FEE');
      }
      if (project.projectAmount && fee > project.projectAmount) {
        throw new AppError(`${roleName}费用不能大于项目总金额`, 400, 'INVALID_PART_TIME_FEE');
      }
      
      // 如果是兼职排版，还需要验证费用不超过项目总金额的5%
      if (role === 'layout') {
        const validation = project.validateLayoutCost(fee);
        if (!validation.valid) {
          throw new AppError(validation.message, 400, 'INVALID_LAYOUT_COST');
        }
        
        // 更新项目信息（仅标记为兼职排版，费用统一存储在ProjectMember.partTimeFee中）
        project.partTimeLayout = {
          isPartTime: true,
          layoutCost: 0, // 不再使用，保留用于向后兼容
          layoutAssignedTo: userId,
          layoutCostPercentage: validation.percentage || 0
        };
        await project.save();
      }
    } else if (role === 'layout' && !isPartTime) {
      // 专职排版：专职排版走KPI计算，不存储费用
      // 仅更新项目信息中的layoutAssignedTo和isPartTime标记
      if (!project.partTimeLayout) {
        project.partTimeLayout = {
          isPartTime: false,
          layoutCost: 0, // 不再使用，保留用于向后兼容
          layoutAssignedTo: userId,
          layoutCostPercentage: 0
        };
        await project.save();
      } else {
        project.partTimeLayout.layoutAssignedTo = userId;
        project.partTimeLayout.isPartTime = false;
        await project.save();
      }
    }

    // 确定使用的系数
    // 优先从固定字段读取（向后兼容），如果没有则从动态配置读取
    let ratio = 0;
    if (role === 'translator') {
      ratio = translatorType === 'deepedit' 
        ? (project.locked_ratios.translator_deepedit ?? project.locked_ratios[`translator_deepedit`] ?? 0)
        : (project.locked_ratios.translator_mtpe ?? project.locked_ratios[`translator_mtpe`] ?? 0);
    } else if (role === 'reviewer') {
      ratio = project.locked_ratios.reviewer ?? project.locked_ratios[role] ?? 0;
    } else if (role === 'pm') {
      ratio = project.locked_ratios.pm ?? project.locked_ratios[role] ?? 0;
    } else if (role === 'sales') {
      ratio = project.locked_ratios.sales_bonus ?? project.locked_ratios[`${role}_bonus`] ?? 0;
    } else if (role === 'admin_staff') {
      ratio = project.locked_ratios.admin ?? project.locked_ratios[role] ?? 0;
    } else if (role === 'part_time_sales' || role === 'layout' || role === 'part_time_translator') {
      // 这些角色不使用系数计算，直接使用费用
      ratio = 0;
    } else {
      // 新角色：从动态配置读取
      ratio = project.locked_ratios[role] ?? 0;
    }

    // 判断是否为生产人员（需要确认的角色）
    // 使用Role模型的isManagementRole字段动态判断
    // 生产角色：非管理角色且canBeProjectMember为true
    // 管理角色（isManagementRole为true）不需要确认
    const isManagementRole = roleDoc.isManagementRole === true;
    const isProductionRole = !isManagementRole && roleDoc.canBeProjectMember === true;

    // 设置接受状态：生产人员需要确认，管理人员自动接受
    const acceptanceStatus = isProductionRole ? 'pending' : 'accepted';

    // 初始化 memberAcceptance（如果不存在）
    if (!project.memberAcceptance) {
      project.memberAcceptance = {
        requiresConfirmation: false,
        pendingCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        allConfirmed: false
      };
    }

    const member = await ProjectMember.create({
      projectId,
      userId,
      role,
      employmentType,
      translatorType: role === 'translator' ? (translatorType || 'mtpe') : undefined,
      // 翻译、审校、排版都支持占比；其他角色默认占比为1
      wordRatio: ['translator', 'reviewer', 'layout'].includes(role)
        ? (typeof wordRatio === 'number' ? (wordRatio || 1.0) : 1.0)
        : 1.0,
      ratio_locked: ratio,
      // 兼职角色（除客户经理外）都使用partTimeFee字段
      partTimeFee: (isPartTime && !isPartTimeSales)
        ? (parseFloat(partTimeFee || 0) || 0)
        : (role === 'part_time_translator' ? (parseFloat(partTimeFee || 0) || 0) : 0),
      acceptanceStatus: acceptanceStatus
    });

    // 更新项目确认状态和项目状态
    if (isProductionRole) {
      // 生产人员需要确认
      project.memberAcceptance.pendingCount += 1;
      project.memberAcceptance.requiresConfirmation = true;
      
      // 状态变更：如果项目是 pending，变为 scheduled
      if (project.status === 'pending') {
        project.status = 'scheduled';
        project.startedAt = new Date();
        project.completionChecks.hasMembers = true;
      }
      // 如果已经是 scheduled，保持 scheduled（通过 pendingCount > 0 表示待确认）
    } else {
      // 非生产人员自动接受
      project.memberAcceptance.acceptedCount += 1;
      
      // 如果项目是 pending，变为 scheduled
      if (project.status === 'pending') {
        project.status = 'scheduled';
        project.startedAt = new Date();
        project.completionChecks.hasMembers = true;
      }
    }

    await project.save();

    // 发送站内通知
    try {
      const roleNames = {
        'pm': '项目经理',
        'translator': '翻译',
        'reviewer': '审校',
        'layout': '排版',
        'part_time_translator': '兼职翻译'
      };
      const roleName = roleNames[role] || role;
      const message = isProductionRole
        ? `您已被分配到项目"${project.projectName}"，角色：${roleName}，请确认是否接受`
        : `您已被分配到项目"${project.projectName}"，角色：${roleName}`;
      await createNotification({
        userId: userId,
        type: NotificationTypes.PROJECT_ASSIGNED,
        message: message,
        link: `#projects`
      });
    } catch (notifError) {
      console.error('[ProjectService] 创建通知失败:', notifError);
    }

    // 发送邮件通知（异步，不阻塞主流程），支持多个附件
    try {
      let emailAttachments = null;
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        emailAttachments = attachments.map(att => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content)
            ? att.content
            : Buffer.from(att.content, 'base64')
        }));
      }
      await emailService.sendProjectAssignmentEmail(memberUser, project, role, user, emailAttachments);
    } catch (emailError) {
      console.error('[ProjectService] 发送邮件通知失败:', emailError);
      // 邮件发送失败不影响成员分配
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
        'part_time_sales': '客户经理'
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
      'partTimeLayout',
      'quotationDetails'
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
  async updateProjectStatus(projectId, status, user, extra = {}) {
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

    // 如果是翻译/审校/排版完成且有交付附件，则给项目经理发送交付邮件
    const { deliveryNote, deliveryAttachments } = extra || {};
    if (deliveryAttachments && Array.isArray(deliveryAttachments) && deliveryAttachments.length > 0 &&
        ['translation_done', 'review_done', 'layout_done'].includes(status)) {
      try {
        await this.sendDeliveryEmail(project, status, user, deliveryNote, deliveryAttachments);
      } catch (err) {
        console.error('[ProjectService] 发送阶段性交付邮件失败:', err);
      }
    }
    
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
   * 阶段性交付：给项目经理发送交付邮件（翻译/审校/排版完成）
   */
  async sendDeliveryEmail(project, status, sender, deliveryNote, deliveryAttachments) {
    // 查找 PM 成员
    const pmMembers = await ProjectMember.find({ projectId: project._id, role: 'pm' })
      .populate('userId', 'name email username');
    const recipients = pmMembers
      .map(m => m.userId)
      .filter(u => u && u.email);
    if (!recipients || recipients.length === 0) {
      console.warn('[ProjectService] 阶段性交付：未找到PM邮箱，跳过发送');
      return;
    }

    // Base64 转 Buffer
    const attachments = deliveryAttachments.map(att => ({
      filename: att.filename,
      content: Buffer.from(att.content, 'base64')
    }));

    const emailService = require('./emailService');
    await emailService.sendProjectDeliveryEmail(recipients, project, status, sender, deliveryNote, attachments);
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
  async finishProject(projectId, user, extra = {}) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    // 检查完成条件
    const members = await ProjectMember.find({ projectId: project._id });
    
    if (members.length === 0) {
      throw new AppError('项目尚未分配成员，无法完成', 400, 'NO_MEMBERS');
    }

    // 检查生产人员是否都已接受（如果有生产人员）
    // 使用Role模型的isManagementRole字段动态判断生产角色
    const Role = require('../models/Role');
    const allRoles = await Role.find({ isActive: true });
    const roleMap = new Map(allRoles.map(r => [r.code, r]));
    const productionMembers = members.filter(m => {
      const memberRole = roleMap.get(m.role);
      return memberRole && !memberRole.isManagementRole && memberRole.canBeProjectMember;
    });
    
    if (productionMembers.length > 0) {
      const allAccepted = productionMembers.every(m => 
        m.acceptanceStatus === 'accepted'
      );
      if (!allAccepted) {
        const pendingMembers = productionMembers.filter(m => m.acceptanceStatus === 'pending');
        const rejectedMembers = productionMembers.filter(m => m.acceptanceStatus === 'rejected');
        let errorMsg = '请确保所有生产人员都已接受项目分配';
        if (pendingMembers.length > 0) {
          errorMsg += `，还有 ${pendingMembers.length} 人待确认`;
        }
        if (rejectedMembers.length > 0) {
          errorMsg += `，还有 ${rejectedMembers.length} 人已拒绝`;
        }
        throw new AppError(errorMsg, 400, 'MEMBERS_NOT_ALL_ACCEPTED');
      }
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
    
    // 如果有最终交付附件，发送给项目创建人（销售）
    const { finalNote, finalAttachments } = extra || {};
    if (finalAttachments && Array.isArray(finalAttachments) && finalAttachments.length > 0) {
      try {
        const attachments = finalAttachments.map(att => ({
          filename: att.filename,
          content: Buffer.from(att.content, 'base64')
        }));
        const emailService = require('./emailService');
        await emailService.sendProjectFinalDeliveryEmail(project, user, finalNote, attachments);
      } catch (err) {
        console.error('[ProjectService] 发送最终交付邮件失败:', err);
      }
    }
    
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

  /**
   * PM 内部交付：项目经理将交付包发送给销售（项目创建人），不改变项目状态
   */
  async pmInternalDelivery(projectId, user, extra = {}) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    // 检查用户是否是该项目的 PM 成员，或具备 pm 角色
    const isPmRole = (user.roles || []).includes('pm');
    const pmMember = await ProjectMember.findOne({
      projectId: project._id,
      userId: user._id,
      role: 'pm'
    });
    if (!isPmRole && !pmMember) {
      throw new AppError('仅项目经理可以执行内部交付', 403, 'PERMISSION_DENIED');
    }

    const { note, attachments } = extra;
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
      throw new AppError('请至少选择一个附件再提交给销售', 400, 'NO_ATTACHMENTS');
    }

    try {
      const bufAttachments = attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64')
      }));
      const emailService = require('./emailService');
      await emailService.sendProjectFinalDeliveryEmail(project, user, note, bufAttachments);
    } catch (err) {
      console.error('[ProjectService] PM 内部交付邮件发送失败:', err);
      throw new AppError('发送邮件失败，请稍后重试', 500, 'EMAIL_SEND_FAILED');
    }

    return { projectId: project._id };
  }
}

module.exports = new ProjectService();

