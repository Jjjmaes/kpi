const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const ExpenseRequest = require('../models/ExpenseRequest');
const User = require('../models/User');
const { createNotification, createNotificationsForUsers, NotificationTypes } = require('../services/notificationService');
const { isFinance, isAdmin } = require('../utils/permissionChecker');
const emailService = require('../services/emailService');

// 所有路由需要认证
router.use(authenticate);

// 生成申请编号
async function generateRequestNumber() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  const prefix = `EXP${year}${month}${day}`;
  const lastRequest = await ExpenseRequest.findOne({
    requestNumber: { $regex: `^${prefix}` }
  }).sort({ requestNumber: -1 });

  let sequence = 1;
  if (lastRequest && lastRequest.requestNumber) {
    const lastSeq = parseInt(lastRequest.requestNumber.slice(-3)) || 0;
    sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

// 创建报销申请（专职人员）
router.post('/', asyncHandler(async (req, res) => {
  const { expenseType, items, totalAmount, reason, note, attachments } = req.body;

  // 验证申请人是否为专职人员
  const user = await User.findById(req.user._id);
  if (!user || user.employmentType !== 'full_time') {
    throw new AppError('只有专职人员可以申请报销', 403, 'PERMISSION_DENIED');
  }

  // 验证必填字段
  if (!expenseType) {
    throw new AppError('请选择费用类型', 400, 'MISSING_EXPENSE_TYPE');
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError('请至少添加一条费用明细', 400, 'MISSING_ITEMS');
  }

  // 验证费用明细
  for (const item of items) {
    if (!item.date || !item.amount || !item.description) {
      throw new AppError('费用明细信息不完整，请填写日期、金额和说明', 400, 'INVALID_ITEM');
    }
    if (item.amount <= 0) {
      throw new AppError('费用金额必须大于0', 400, 'INVALID_AMOUNT');
    }
  }

  if (!totalAmount || totalAmount <= 0) {
    throw new AppError('总金额必须大于0', 400, 'INVALID_AMOUNT');
  }

  if (!reason || !reason.trim()) {
    throw new AppError('请填写申请说明', 400, 'MISSING_REASON');
  }

  // 生成申请编号
  const requestNumber = await generateRequestNumber();

  // 创建申请
  const request = await ExpenseRequest.create({
    requestNumber,
    expenseType,
    items,
    totalAmount,
    reason: reason.trim(),
    note: note ? note.trim() : undefined,
    createdBy: req.user._id,
    status: 'pending'
  });

  await request.populate('createdBy', 'name username');

  // 通知财务和管理员（失败不影响主流程）
  try {
    const financeUsers = await User.find({
      roles: { $in: ['finance', 'admin'] },
      isActive: true
    }).select('name email username');

    if (financeUsers.length > 0) {
      // 发送站内通知
      await createNotificationsForUsers(
        financeUsers.map(u => u._id),
        NotificationTypes.EXPENSE_REQUEST,
        `新的报销申请：${requestNumber}`,
        `/expense/${request._id}`,
        null
      );

      // 发送邮件通知（包含附件）
      try {
        // 处理附件：将 base64 转换为 Buffer
        const emailAttachments = attachments && Array.isArray(attachments) && attachments.length > 0
          ? attachments.map(att => ({
              filename: att.filename,
              content: Buffer.from(att.content, 'base64')
            }))
          : null;
        
        await emailService.sendBulkExpenseRequestEmails(
          financeUsers,
          request,
          request.createdBy,
          emailAttachments
        );
      } catch (emailError) {
        console.error('[Expense] 邮件发送失败:', emailError);
        // 邮件发送失败不影响主流程
      }
    }
  } catch (notificationError) {
    console.error('[Expense] 通知发送失败:', notificationError);
  }

  res.status(201).json({
    success: true,
    message: '报销申请已提交',
    data: request
  });
}));

// 获取报销申请列表
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20, status, expenseType, tab } = req.query;
  const currentRole = req.currentRole;
  const isFinanceRole = isFinance(req) || isAdmin(req);

  // 构建查询条件
  const query = {};

  // 根据标签页和角色过滤
  if (tab === 'my') {
    // 我的申请：只显示当前用户的申请
    query.createdBy = req.user._id;
  } else if (tab === 'approve' && isFinanceRole) {
    // 待审批：财务和管理员可以看到所有待审批的申请
    query.status = 'pending';
  } else if (!isFinanceRole) {
    // 非财务/管理员：只能看到自己的申请
    query.createdBy = req.user._id;
  }

  // 状态筛选
  if (status) {
    query.status = status;
  }

  // 费用类型筛选
  if (expenseType) {
    query.expenseType = expenseType;
  }

  // 分页
  const skip = (parseInt(page) - 1) * parseInt(pageSize);
  const limit = parseInt(pageSize);

  // 查询
  const [requests, total] = await Promise.all([
    ExpenseRequest.find(query)
      .populate('createdBy', 'name username')
      .populate('approvedBy', 'name username')
      .populate('payment.paidBy', 'name username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ExpenseRequest.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: {
      requests,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total,
        totalPages: Math.ceil(total / parseInt(pageSize))
      }
    }
  });
}));

// 获取单条报销申请详情
router.get('/:id', asyncHandler(async (req, res) => {
  const request = await ExpenseRequest.findById(req.params.id)
    .populate('createdBy', 'name username email phone')
    .populate('approvedBy', 'name username')
    .populate('payment.paidBy', 'name username');

  if (!request) {
    throw new AppError('报销申请不存在', 404, 'NOT_FOUND');
  }

  // 权限检查：只能查看自己的申请或财务/管理员可以查看所有
  const isFinanceRole = isFinance(req) || isAdmin(req);
  if (request.createdBy._id.toString() !== req.user._id.toString() && !isFinanceRole) {
    throw new AppError('无权限查看此报销申请', 403, 'PERMISSION_DENIED');
  }

  res.json({
    success: true,
    data: request
  });
}));

// 批准报销申请（财务/管理员）
router.put('/:id/approve', authorize('finance', 'admin'), asyncHandler(async (req, res) => {
  const { approvalNote } = req.body;

  const request = await ExpenseRequest.findById(req.params.id)
    .populate('createdBy', 'name username');

  if (!request) {
    throw new AppError('报销申请不存在', 404, 'NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new AppError('该申请已处理，无法重复审批', 400, 'INVALID_OPERATION');
  }

  // 更新状态
  request.status = 'approved';
  request.approvedBy = req.user._id;
  request.approvedAt = new Date();
  request.approvalNote = approvalNote ? approvalNote.trim() : undefined;
  await request.save();

  // 通知申请人（失败不影响主流程）
  try {
    await createNotification({
      userId: request.createdBy._id,
      type: NotificationTypes.EXPENSE_APPROVED,
      message: `您的报销申请 ${request.requestNumber} 已批准`,
      link: `/expense/${request._id}`
    });
  } catch (notificationError) {
    console.error('[Expense] 通知发送失败:', notificationError);
  }

  res.json({
    success: true,
    message: '报销申请已批准',
    data: request
  });
}));

// 拒绝报销申请（财务/管理员）
router.put('/:id/reject', authorize('finance', 'admin'), asyncHandler(async (req, res) => {
  const { rejectReason } = req.body;

  if (!rejectReason || !rejectReason.trim()) {
    throw new AppError('请填写拒绝原因', 400, 'MISSING_REJECT_REASON');
  }

  const request = await ExpenseRequest.findById(req.params.id)
    .populate('createdBy', 'name username');

  if (!request) {
    throw new AppError('报销申请不存在', 404, 'NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new AppError('该申请已处理，无法重复审批', 400, 'INVALID_OPERATION');
  }

  // 更新状态
  request.status = 'rejected';
  request.approvedBy = req.user._id;
  request.approvedAt = new Date();
  request.rejectReason = rejectReason.trim();
  await request.save();

  // 通知申请人（失败不影响主流程）
  try {
    await createNotification({
      userId: request.createdBy._id,
      type: NotificationTypes.EXPENSE_REJECTED,
      message: `您的报销申请 ${request.requestNumber} 已拒绝：${rejectReason.trim()}`,
      link: `/expense/${request._id}`
    });
  } catch (notificationError) {
    console.error('[Expense] 通知发送失败:', notificationError);
  }

  res.json({
    success: true,
    message: '报销申请已拒绝',
    data: request
  });
}));

// 标记为已支付（财务/管理员）
router.put('/:id/pay', authorize('finance', 'admin'), asyncHandler(async (req, res) => {
  const { paymentMethod, note } = req.body;

  const request = await ExpenseRequest.findById(req.params.id)
    .populate('createdBy', 'name username');

  if (!request) {
    throw new AppError('报销申请不存在', 404, 'NOT_FOUND');
  }

  if (request.status !== 'approved') {
    throw new AppError('只有已批准的申请才能标记为已支付', 400, 'INVALID_OPERATION');
  }

  // 更新状态和支付信息
  request.status = 'paid';
  request.payment = {
    paidBy: req.user._id,
    paidAt: new Date(),
    paymentMethod: paymentMethod ? paymentMethod.trim() : undefined,
    note: note ? note.trim() : undefined
  };
  await request.save();

  // 通知申请人（失败不影响主流程）
  try {
    await createNotification({
      userId: request.createdBy._id,
      type: NotificationTypes.EXPENSE_PAID,
      message: `您的报销申请 ${request.requestNumber} 已支付`,
      link: `/expense/${request._id}`
    });
  } catch (notificationError) {
    console.error('[Expense] 通知发送失败:', notificationError);
  }

  res.json({
    success: true,
    message: '报销申请已标记为已支付',
    data: request
  });
}));

// 取消报销申请（申请人）
router.put('/:id/cancel', asyncHandler(async (req, res) => {
  const { cancelReason } = req.body;

  const request = await ExpenseRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('报销申请不存在', 404, 'NOT_FOUND');
  }

  // 只能取消自己的申请
  if (request.createdBy.toString() !== req.user._id.toString()) {
    throw new AppError('只能取消自己的报销申请', 403, 'PERMISSION_DENIED');
  }

  // 只能取消待审批或已拒绝的申请
  if (request.status !== 'pending' && request.status !== 'rejected') {
    throw new AppError('只能取消待审批或已拒绝的申请', 400, 'INVALID_OPERATION');
  }

  // 更新状态
  request.status = 'cancelled';
  request.cancelReason = cancelReason ? cancelReason.trim() : undefined;
  await request.save();

  res.json({
    success: true,
    message: '报销申请已取消',
    data: request
  });
}));

// 获取待审批数量（财务/管理员）
router.get('/pending/count', authorize('finance', 'admin'), asyncHandler(async (req, res) => {
  const count = await ExpenseRequest.countDocuments({ status: 'pending' });
  
  res.json({
    success: true,
    data: { count }
  });
}));

module.exports = router;

