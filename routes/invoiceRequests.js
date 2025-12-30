const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { asyncHandler } = require('../middleware/errorHandler');
const InvoiceRequest = require('../models/InvoiceRequest');
const Project = require('../models/Project');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const emailService = require('../services/emailService');

// 所有路由需要认证
router.use(authenticate);

// 权限：销售/兼职销售可以创建和查看自己的申请，财务可以查看所有并审批
const allowSales = authorize('admin', 'sales', 'part_time_sales');
const allowFinance = authorize('admin', 'finance');

/**
 * 创建发票申请（销售/兼职销售）
 * POST /api/invoice-requests
 */
router.post('/', allowSales, asyncHandler(async (req, res) => {
  const { projects, amount, invoiceType, invoiceInfo, note } = req.body;

  // 验证必填字段
  if (!projects || !Array.isArray(projects) || projects.length === 0) {
    throw new AppError('请至少选择一个项目', 400, 'MISSING_REQUIRED_FIELDS');
  }

  if (!amount || amount <= 0) {
    throw new AppError('申请金额必须大于0', 400, 'VALIDATION_ERROR');
  }

  if (!invoiceInfo || !invoiceInfo.title) {
    throw new AppError('发票抬头必填', 400, 'MISSING_REQUIRED_FIELDS');
  }

  // 验证项目是否存在且属于当前用户创建（销售只能申请自己创建的项目）
  const userProjects = await Project.find({
    _id: { $in: projects },
    createdBy: req.user._id,
    status: { $ne: 'cancelled' }
  });

  if (userProjects.length !== projects.length) {
    throw new AppError('部分项目不存在或不属于您，或项目已取消', 403, 'FORBIDDEN');
  }

  // 验证申请金额不超过项目总金额
  const totalProjectAmount = userProjects.reduce((sum, p) => sum + (p.projectAmount || 0), 0);
  if (amount > totalProjectAmount) {
    throw new AppError(
      `申请金额(${amount.toLocaleString()})不能超过项目总金额(${totalProjectAmount.toLocaleString()})`,
      400,
      'VALIDATION_ERROR'
    );
  }

  // 检查这些项目是否已有待审批的申请
  const existingRequests = await InvoiceRequest.find({
    projects: { $in: projects },
    status: 'pending'
  });

  if (existingRequests.length > 0) {
    throw new AppError('所选项目中存在待审批的发票申请，请等待审批完成', 400, 'DUPLICATE_ENTRY');
  }

  // 获取客户ID（从第一个项目获取）
  const customerId = userProjects[0].customerId;

  // 创建申请
  const invoiceRequest = await InvoiceRequest.create({
    projects,
    customerId,
    amount,
    invoiceType: invoiceType || 'vat',
    invoiceInfo,
    note,
    createdBy: req.user._id,
    status: 'pending'
  });

  // 填充关联数据
  await invoiceRequest.populate([
    { path: 'projects', select: 'projectNumber projectName projectAmount customerId clientName' },
    { path: 'customerId', select: 'name shortName' },
    { path: 'createdBy', select: 'username name' }
  ]);

  res.json({
    success: true,
    data: invoiceRequest
  });
}));

/**
 * 批量查询项目的发票申请状态
 * GET /api/invoice-requests/by-projects?projectIds=id1,id2,id3
 */
router.get('/by-projects', asyncHandler(async (req, res) => {
  const { projectIds } = req.query;
  
  if (!projectIds) {
    return res.json({
      success: true,
      data: {}
    });
  }
  
  const ids = Array.isArray(projectIds) ? projectIds : projectIds.split(',').filter(Boolean);
  
  if (ids.length === 0) {
    return res.json({
      success: true,
      data: {}
    });
  }
  
  // 查询这些项目的所有发票申请（包括pending、approved、rejected）
  const requests = await InvoiceRequest.find({
    projects: { $in: ids }
  })
    .select('projects status createdAt approvedAt rejectReason linkedInvoiceId')
    .populate('linkedInvoiceId', 'invoiceNumber')
    .sort({ createdAt: -1 });
  
  // 构建项目ID到最新申请状态的映射
  // 优先级：pending > approved > rejected
  const projectStatusMap = {};
  
  requests.forEach(req => {
    req.projects.forEach(projectId => {
      const pid = projectId.toString();
      if (!projectStatusMap[pid]) {
        projectStatusMap[pid] = {
          status: req.status,
          requestId: req._id,
          createdAt: req.createdAt,
          approvedAt: req.approvedAt,
          rejectReason: req.rejectReason,
          linkedInvoiceId: req.linkedInvoiceId?._id,
          linkedInvoiceNumber: req.linkedInvoiceId?.invoiceNumber
        };
      } else {
        // 如果已有记录，按优先级更新（pending优先）
        const current = projectStatusMap[pid];
        if (req.status === 'pending' || 
            (req.status === 'approved' && current.status !== 'pending') ||
            (req.status === 'rejected' && current.status === 'rejected' && req.createdAt > current.createdAt)) {
          projectStatusMap[pid] = {
            status: req.status,
            requestId: req._id,
            createdAt: req.createdAt,
            approvedAt: req.approvedAt,
            rejectReason: req.rejectReason,
            linkedInvoiceId: req.linkedInvoiceId?._id,
            linkedInvoiceNumber: req.linkedInvoiceId?.invoiceNumber
          };
        }
      }
    });
  });
  
  res.json({
    success: true,
    data: projectStatusMap
  });
}));

/**
 * 获取我的发票申请列表（销售/兼职销售）
 * GET /api/invoice-requests/my
 */
router.get('/my', allowSales, asyncHandler(async (req, res) => {
  const { status, page = 1, pageSize = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(pageSize);

  const query = { createdBy: req.user._id };
  if (status) {
    query.status = status;
  }

  const [requests, total] = await Promise.all([
    InvoiceRequest.find(query)
      .populate('projects', 'projectNumber projectName projectAmount clientName')
      .populate('customerId', 'name shortName')
      .populate('approvedBy', 'username name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(pageSize)),
    InvoiceRequest.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: requests,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total,
      totalPages: Math.ceil(total / parseInt(pageSize))
    }
  });
}));

/**
 * 获取发票申请列表（财务/管理员）
 * GET /api/invoice-requests
 */
router.get('/', allowFinance, asyncHandler(async (req, res) => {
  const { status, createdBy, customerId, page = 1, pageSize = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(pageSize);

  const query = {};
  if (status) {
    query.status = status;
  }
  if (createdBy) {
    query.createdBy = createdBy;
  }
  if (customerId) {
    query.customerId = customerId;
  }

  const [requests, total] = await Promise.all([
    InvoiceRequest.find(query)
      .populate('projects', 'projectNumber projectName projectAmount clientName')
      .populate('customerId', 'name shortName')
      .populate('createdBy', 'username name')
      .populate('approvedBy', 'username name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(pageSize)),
    InvoiceRequest.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: requests,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total,
      totalPages: Math.ceil(total / parseInt(pageSize))
    }
  });
}));

/**
 * 获取发票申请详情
 * GET /api/invoice-requests/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const request = await InvoiceRequest.findById(req.params.id)
    .populate('projects', 'projectNumber projectName projectAmount clientName customerId')
    .populate('customerId', 'name shortName')
    .populate('createdBy', 'username name email')
    .populate('approvedBy', 'username name')
    .populate('linkedInvoiceId', 'invoiceNumber amount issueDate status type');

  if (!request) {
    throw new AppError('发票申请不存在', 404, 'NOT_FOUND');
  }

  // 权限检查：销售只能查看自己的申请，财务可以查看所有
  const isSales = ['sales', 'part_time_sales'].includes(req.currentRole);
  const isFinance = ['admin', 'finance'].includes(req.currentRole);

  if (isSales && request.createdBy._id.toString() !== req.user._id.toString()) {
    throw new AppError('无权查看此申请', 403, 'FORBIDDEN');
  }

  if (!isSales && !isFinance) {
    throw new AppError('无权查看发票申请', 403, 'FORBIDDEN');
  }

  res.json({
    success: true,
    data: request
  });
}));

/**
 * 审批通过发票申请（财务/管理员）
 * POST /api/invoice-requests/:id/approve
 */
router.post('/:id/approve', allowFinance, asyncHandler(async (req, res) => {
  const { projectId, invoiceNumber, issueDate, note: invoiceNote, notifyEmail, attachment } = req.body;

  const request = await InvoiceRequest.findById(req.params.id)
    .populate('projects');

  if (!request) {
    throw new AppError('发票申请不存在', 404, 'NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new AppError('该申请已处理，无法重复审批', 400, 'INVALID_OPERATION');
  }

  // 如果提供了发票信息，直接创建发票
  if (projectId && invoiceNumber && issueDate) {
    // 验证项目是否在申请的项目列表中
    const projectIds = request.projects.map(p => p._id.toString());
    if (!projectIds.includes(projectId)) {
      throw new AppError('所选项目不在申请的项目列表中', 400, 'VALIDATION_ERROR');
    }

    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    // 验证发票号是否已存在
    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (existingInvoice) {
      throw new AppError('发票号已存在', 400, 'DUPLICATE_ENTRY');
    }

    // 验证发票金额
    const invoiceAmount = Number(request.amount);
    if (invoiceAmount <= 0) {
      throw new AppError('发票金额必须大于0', 400, 'VALIDATION_ERROR');
    }

    // 检查项目累计开票金额
    const existingInvoices = await Invoice.find({
      projectId,
      status: { $ne: 'void' }
    });
    const totalInvoiceAmount = existingInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const projectAmount = project.projectAmount || 0;

    if (totalInvoiceAmount + invoiceAmount > projectAmount) {
      const remaining = projectAmount - totalInvoiceAmount;
      throw new AppError(
        `累计开票金额不能超过项目总金额！项目金额：¥${projectAmount.toLocaleString()}，已开票：¥${totalInvoiceAmount.toLocaleString()}，本次开票：¥${invoiceAmount.toLocaleString()}，最多可开票：¥${Math.max(0, remaining).toLocaleString()}`,
        400,
        'VALIDATION_ERROR'
      );
    }

    // 创建发票
    const invoice = await Invoice.create({
      projectId,
      invoiceNumber,
      amount: invoiceAmount,
      issueDate: new Date(issueDate),
      status: 'issued',
      type: request.invoiceType,
      note: invoiceNote || request.note,
      createdBy: req.user._id
    });

    // 更新申请状态
    request.status = 'approved';
    request.approvedBy = req.user._id;
    request.approvedAt = new Date();
    request.linkedInvoiceId = invoice._id;

    // 如果前端传了附件信息，暂存在申请记录上（主要用于邮件发送）
    if (attachment && attachment.filename && attachment.base64) {
      request.invoiceAttachment = {
        filename: attachment.filename,
        contentType: attachment.contentType || 'application/octet-stream',
        size: attachment.size || undefined,
        base64: attachment.base64
      };
    }

    if (notifyEmail && typeof notifyEmail === 'string') {
      request.notifyEmail = notifyEmail.trim();
    }

    await request.save();

    // 返回申请和发票信息
    await request.populate([
      { path: 'projects', select: 'projectNumber projectName projectAmount clientName' },
      { path: 'customerId', select: 'name shortName' },
      { path: 'createdBy', select: 'username name email' },
      { path: 'approvedBy', select: 'username name' },
      { path: 'linkedInvoiceId' }
    ]);

    // 发送发票开具通知邮件（异步，不阻塞接口返回）
    try {
      const attachmentsForEmail = request.invoiceAttachment?.base64 ? [{
        filename: request.invoiceAttachment.filename || `invoice-${invoice.invoiceNumber}.pdf`,
        content: request.invoiceAttachment.base64,
        contentType: request.invoiceAttachment.contentType || 'application/octet-stream'
      }] : null;

      emailService.sendInvoiceIssuedEmail(request, invoice, attachmentsForEmail)
        .catch(err => {
          console.error('[InvoiceRequests] 发送发票开具通知邮件失败:', err.message);
        });
    } catch (err) {
      console.error('[InvoiceRequests] 发票通知邮件发送异常:', err.message);
    }

    res.json({
      success: true,
      message: '申请已批准，发票已创建',
      data: {
        request,
        invoice
      }
    });
  } else {
    // 仅批准申请，不创建发票（财务稍后手动创建）
    request.status = 'approved';
    request.approvedBy = req.user._id;
    request.approvedAt = new Date();
    await request.save();

    await request.populate([
      { path: 'projects', select: 'projectNumber projectName projectAmount clientName' },
      { path: 'customerId', select: 'name shortName' },
      { path: 'createdBy', select: 'username name' },
      { path: 'approvedBy', select: 'username name' }
    ]);

    res.json({
      success: true,
      message: '申请已批准',
      data: request
    });
  }
}));

/**
 * 拒绝发票申请（财务/管理员）
 * POST /api/invoice-requests/:id/reject
 */
router.post('/:id/reject', allowFinance, asyncHandler(async (req, res) => {
  const { rejectReason } = req.body;

  if (!rejectReason || !rejectReason.trim()) {
    throw new AppError('拒绝原因必填', 400, 'MISSING_REQUIRED_FIELDS');
  }

  const request = await InvoiceRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('发票申请不存在', 404, 'NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new AppError('该申请已处理，无法重复审批', 400, 'INVALID_OPERATION');
  }

  request.status = 'rejected';
  request.rejectReason = rejectReason.trim();
  request.approvedBy = req.user._id;
  request.approvedAt = new Date();
  await request.save();

  await request.populate([
    { path: 'projects', select: 'projectNumber projectName projectAmount clientName' },
    { path: 'customerId', select: 'name shortName' },
    { path: 'createdBy', select: 'username name' },
    { path: 'approvedBy', select: 'username name' }
  ]);

  res.json({
    success: true,
    message: '申请已拒绝',
    data: request
  });
}));

/**
 * 删除发票申请（仅待审批状态可删除，且只能删除自己的申请）
 * DELETE /api/invoice-requests/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const request = await InvoiceRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('发票申请不存在', 404, 'NOT_FOUND');
  }

  // 权限检查：只能删除自己的待审批申请，或财务可以删除任何待审批申请
  const isFinance = ['admin', 'finance'].includes(req.currentRole);
  const isOwner = request.createdBy.toString() === req.user._id.toString();

  if (!isFinance && !isOwner) {
    throw new AppError('无权删除此申请', 403, 'FORBIDDEN');
  }

  if (request.status !== 'pending') {
    throw new AppError('只能删除待审批的申请', 400, 'INVALID_OPERATION');
  }

  await InvoiceRequest.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: '申请已删除'
  });
}));

module.exports = router;



