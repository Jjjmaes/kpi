const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const OfficeSupplyRequest = require('../models/OfficeSupplyRequest');
const User = require('../models/User');
const { createNotification, createNotificationsForUsers, NotificationTypes } = require('../services/notificationService');
const { isAdminStaff, isFinance } = require('../utils/permissionChecker');

// 所有路由需要认证
router.use(authenticate);

// 生成申请编号
async function generateRequestNumber() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  const prefix = `OSP${year}${month}${day}`;
  const lastRequest = await OfficeSupplyRequest.findOne({
    requestNumber: { $regex: `^${prefix}` }
  }).sort({ requestNumber: -1 });

  let sequence = 1;
  if (lastRequest && lastRequest.requestNumber) {
    const lastSeq = parseInt(lastRequest.requestNumber.slice(-3)) || 0;
    sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

// 创建办公用品采购申请（仅行政综合岗）
router.post('/', authorize('admin_staff', 'admin'), asyncHandler(async (req, res) => {
  const { items, totalAmount, purpose, urgency, note } = req.body;

  // 验证必填字段
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError('请至少添加一个采购物品', 400, 'MISSING_ITEMS');
  }

  // 验证物品信息
  for (const item of items) {
    if (!item.name || !item.quantity) {
      throw new AppError('物品信息不完整，请填写物品名称和数量', 400, 'INVALID_ITEM');
    }
    if (item.quantity <= 0) {
      throw new AppError('物品数量必须大于0', 400, 'INVALID_QUANTITY');
    }
  }

  if (!totalAmount || totalAmount <= 0) {
    throw new AppError('总金额必须大于0', 400, 'INVALID_AMOUNT');
  }

  if (!purpose || !purpose.trim()) {
    throw new AppError('请填写申请用途', 400, 'MISSING_PURPOSE');
  }

  // 生成申请编号
  const requestNumber = await generateRequestNumber();

  // 创建申请
  const request = await OfficeSupplyRequest.create({
    requestNumber,
    items,
    totalAmount,
    purpose: purpose.trim(),
    urgency: urgency || 'normal',
    note: note ? note.trim() : undefined,
    createdBy: req.user._id,
    status: 'pending'
  });

  await request.populate('createdBy', 'name username');

  // 通知财务岗（失败不影响主流程）
  try {
    const financeUsers = await User.find({
      roles: { $in: ['finance', 'admin'] },
      isActive: true
    });

    if (financeUsers.length > 0) {
      await createNotificationsForUsers(
        financeUsers.map(u => u._id),
        NotificationTypes.OFFICE_SUPPLY_REQUEST,
        `新的办公用品采购申请：${requestNumber}`,
        `/officeSupply/${request._id}`,
        null
      );
    }
  } catch (notificationError) {
    console.error('[OfficeSupply] 通知发送失败:', notificationError);
  }

  res.status(201).json({
    success: true,
    message: '采购申请已提交',
    data: request
  });
}));

// 获取办公用品采购申请列表
router.get('/', asyncHandler(async (req, res) => {
  const { status, createdBy, tab, page = 1, pageSize = 20 } = req.query;
  const isStaff = isAdminStaff(req);
  const isFinanceRole = isFinance(req);

  // 构建查询条件
  const query = {};

  // 权限控制
  if (isStaff) {
    // 行政综合岗：根据标签页决定
    if (tab === 'my') {
      // "我的申请"标签页：只显示自己提交的
      query.createdBy = req.user._id;
    } else if (tab === 'manage' && createdBy) {
      // "申请管理"标签页：可以按申请人筛选
      query.createdBy = createdBy;
    }
    // 如果 tab === 'manage' 且没有 createdBy，显示所有申请
  } else if (isFinanceRole) {
    // 财务岗：可以查看所有申请（用于审批）
    // 不限制查询条件
  } else {
    // 其他角色：无权访问
    throw new AppError('无权访问', 403, 'PERMISSION_DENIED');
  }

  // 状态筛选
  if (status) {
    query.status = status;
  }

  // 分页
  const skip = (parseInt(page) - 1) * parseInt(pageSize);
  const limit = parseInt(pageSize);

  // 查询
  const [requests, total] = await Promise.all([
    OfficeSupplyRequest.find(query)
      .populate('createdBy', 'name username')
      .populate('approvedBy', 'name username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    OfficeSupplyRequest.countDocuments(query)
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

// 获取单个申请详情
router.get('/:id', asyncHandler(async (req, res) => {
  const request = await OfficeSupplyRequest.findById(req.params.id)
    .populate('createdBy', 'name username email')
    .populate('approvedBy', 'name username');

  if (!request) {
    throw new AppError('申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  // 权限检查
  const isStaff = isAdminStaff(req);
  const isFinanceRole = isFinance(req);
  const isOwner = request.createdBy._id.toString() === req.user._id.toString();

  if (!isOwner && !isStaff && !isFinanceRole) {
    throw new AppError('无权查看该申请', 403, 'PERMISSION_DENIED');
  }

  res.json({
    success: true,
    data: request
  });
}));

// 审批申请（财务岗）
router.post('/:id/approve', authorize('finance', 'admin'), asyncHandler(async (req, res) => {
  const { approvalNote } = req.body;

  const request = await OfficeSupplyRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new AppError('只能审批待审批状态的申请', 400, 'INVALID_STATUS');
  }

  request.status = 'approved';
  request.approvedBy = req.user._id;
  request.approvedAt = new Date();
  if (approvalNote) {
    request.approvalNote = approvalNote.trim();
  }

  await request.save();
  await request.populate('createdBy', 'name username');
  await request.populate('approvedBy', 'name username');

  // 通知申请人
  try {
    await createNotification({
      userId: request.createdBy._id,
      type: NotificationTypes.OFFICE_SUPPLY_APPROVED,
      message: `您的办公用品采购申请 ${request.requestNumber} 已批准`,
      link: `/officeSupply/${request._id}`,
      projectId: null
    });
  } catch (notificationError) {
    console.error('[OfficeSupply] 通知发送失败:', notificationError);
  }

  res.json({
    success: true,
    message: '申请已批准',
    data: request
  });
}));

// 拒绝申请（财务岗）
router.post('/:id/reject', authorize('finance', 'admin'), asyncHandler(async (req, res) => {
  const { rejectReason } = req.body;

  if (!rejectReason || !rejectReason.trim()) {
    throw new AppError('请填写拒绝原因', 400, 'MISSING_REJECT_REASON');
  }

  const request = await OfficeSupplyRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new AppError('只能拒绝待审批状态的申请', 400, 'INVALID_STATUS');
  }

  request.status = 'rejected';
  request.approvedBy = req.user._id;
  request.approvedAt = new Date();
  request.rejectReason = rejectReason.trim();

  await request.save();
  await request.populate('createdBy', 'name username');
  await request.populate('approvedBy', 'name username');

  // 通知申请人
  try {
    await createNotification({
      userId: request.createdBy._id,
      type: NotificationTypes.OFFICE_SUPPLY_REJECTED,
      message: `您的办公用品采购申请 ${request.requestNumber} 已拒绝：${rejectReason.trim()}`,
      link: `/officeSupply/${request._id}`,
      projectId: null
    });
  } catch (notificationError) {
    console.error('[OfficeSupply] 通知发送失败:', notificationError);
  }

  res.json({
    success: true,
    message: '申请已拒绝',
    data: request
  });
}));

// 标记已采购（行政综合岗）
router.post('/:id/purchase', authorize('admin_staff', 'admin'), asyncHandler(async (req, res) => {
  const { supplier, purchaseDate, invoiceNumber, actualAmount, note } = req.body;

  const request = await OfficeSupplyRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  if (request.status !== 'approved') {
    throw new AppError('只能标记已批准状态的申请为已采购', 400, 'INVALID_STATUS');
  }

  request.status = 'purchased';
  if (supplier) request.purchase = { ...request.purchase, supplier: supplier.trim() };
  if (purchaseDate) request.purchase = { ...request.purchase, purchaseDate: new Date(purchaseDate) };
  if (invoiceNumber) request.purchase = { ...request.purchase, invoiceNumber: invoiceNumber.trim() };
  if (actualAmount !== undefined) request.purchase = { ...request.purchase, actualAmount };
  if (note) request.purchase = { ...request.purchase, note: note.trim() };

  await request.save();
  await request.populate('createdBy', 'name username');
  await request.populate('approvedBy', 'name username');

  res.json({
    success: true,
    message: '已标记为已采购',
    data: request
  });
}));

// 取消申请（申请人）
router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const { cancelReason } = req.body;

  const request = await OfficeSupplyRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  // 权限检查：只能申请人本人取消
  if (request.createdBy.toString() !== req.user._id.toString()) {
    throw new AppError('只能取消自己的申请', 403, 'PERMISSION_DENIED');
  }

  // 状态检查：只能取消待审批状态的申请
  if (request.status !== 'pending') {
    throw new AppError('只能取消待审批状态的申请', 400, 'INVALID_STATUS');
  }

  request.status = 'cancelled';
  request.cancelReason = cancelReason || '申请人取消';
  await request.save();

  await request.populate('createdBy', 'name username');

  res.json({
    success: true,
    message: '申请已取消',
    data: request
  });
}));

// 获取待审批数量（财务岗）
router.get('/pending/count', authorize('finance', 'admin'), asyncHandler(async (req, res) => {
  const count = await OfficeSupplyRequest.countDocuments({ status: 'pending' });

  res.json({
    success: true,
    data: { count }
  });
}));

module.exports = router;


