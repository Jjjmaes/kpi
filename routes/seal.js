const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const SealRequest = require('../models/SealRequest');
const User = require('../models/User');
const { createNotification, createNotificationsForUsers, NotificationTypes } = require('../services/notificationService');
const { isAdminStaff } = require('../utils/permissionChecker');

// 所有路由需要认证
router.use(authenticate);

// 生成申请编号
async function generateRequestNumber() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  const prefix = `SEAL${year}${month}${day}`;
  const lastRequest = await SealRequest.findOne({
    requestNumber: { $regex: `^${prefix}` }
  }).sort({ requestNumber: -1 });

  let sequence = 1;
  if (lastRequest && lastRequest.requestNumber) {
    const lastSeq = parseInt(lastRequest.requestNumber.slice(-3)) || 0;
    sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

// 创建章证使用申请（所有用户）
router.post('/', asyncHandler(async (req, res) => {
  const { sealType, purpose, useDate, expectedReturnDate, note } = req.body;

  // 验证必填字段
  if (!sealType) {
    throw new AppError('请选择章证类型', 400, 'MISSING_SEAL_TYPE');
  }

  if (!purpose || !purpose.trim()) {
    throw new AppError('请填写使用用途', 400, 'MISSING_PURPOSE');
  }

  if (!useDate) {
    throw new AppError('请选择使用日期', 400, 'MISSING_USE_DATE');
  }

  // 生成申请编号
  const requestNumber = await generateRequestNumber();

  // 创建申请
  const request = await SealRequest.create({
    requestNumber,
    sealType,
    purpose: purpose.trim(),
    useDate: new Date(useDate),
    expectedReturnDate: expectedReturnDate ? new Date(expectedReturnDate) : undefined,
    note: note ? note.trim() : undefined,
    createdBy: req.user._id,
    status: 'pending'
  });

  await request.populate('createdBy', 'name username');

  // 通知行政综合岗（失败不影响主流程）
  try {
    const adminStaffUsers = await User.find({
      roles: { $in: ['admin_staff', 'admin'] },
      isActive: true
    });

    if (adminStaffUsers.length > 0) {
      await createNotificationsForUsers(
        adminStaffUsers.map(u => u._id),
        NotificationTypes.SEAL_REQUEST,
        `新的章证使用申请：${requestNumber}（${sealType}）`,
        `/seal/${request._id}`,
        null
      );
    }
  } catch (notificationError) {
    console.error('[Seal] 通知发送失败:', notificationError);
  }

  res.status(201).json({
    success: true,
    message: '章证使用申请已提交',
    data: request
  });
}));

// 获取章证使用申请列表
router.get('/', asyncHandler(async (req, res) => {
  const { status, sealType, tab, page = 1, pageSize = 20 } = req.query;
  const isStaff = isAdminStaff(req);

  // 构建查询条件
  const query = {};

  // 权限控制
  if (isStaff) {
    // 行政综合岗：根据标签页决定
    if (tab === 'my') {
      // "我的申请"标签页：只显示自己提交的
      query.createdBy = req.user._id;
    }
    // 如果 tab === 'manage'，显示所有申请（用于管理）
  } else {
    // 普通用户：只能查看自己的申请
    query.createdBy = req.user._id;
  }

  // 状态筛选
  if (status) {
    query.status = status;
  }

  // 章证类型筛选
  if (sealType) {
    query.sealType = sealType;
  }

  // 分页
  const skip = (parseInt(page) - 1) * parseInt(pageSize);
  const limit = parseInt(pageSize);

  // 查询
  const [requests, total] = await Promise.all([
    SealRequest.find(query)
      .populate('createdBy', 'name username')
      .populate('processedBy', 'name username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SealRequest.countDocuments(query)
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
  const request = await SealRequest.findById(req.params.id)
    .populate('createdBy', 'name username email')
    .populate('processedBy', 'name username');

  if (!request) {
    throw new AppError('申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  // 权限检查：申请人本人或行政综合岗
  const isStaff = isAdminStaff(req);
  const isOwner = request.createdBy._id.toString() === req.user._id.toString();

  if (!isOwner && !isStaff) {
    throw new AppError('无权查看该申请', 403, 'PERMISSION_DENIED');
  }

  res.json({
    success: true,
    data: request
  });
}));

// 确认使用（行政综合岗）
router.post('/:id/process', authorize('admin_staff', 'admin'), asyncHandler(async (req, res) => {
  const request = await SealRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  if (request.status !== 'pending') {
    throw new AppError('只能处理待处理状态的申请', 400, 'INVALID_STATUS');
  }

  request.status = 'processing';
  request.processedBy = req.user._id;
  request.useStartAt = new Date();
  await request.save();

  await request.populate('createdBy', 'name username');
  await request.populate('processedBy', 'name username');

  // 通知申请人
  try {
    await createNotification({
      userId: request.createdBy._id,
      type: NotificationTypes.SEAL_STATUS_CHANGE,
      message: `您的章证使用申请 ${request.requestNumber} 已确认使用`,
      link: `/seal/${request._id}`,
      projectId: null
    });
  } catch (notificationError) {
    console.error('[Seal] 通知发送失败:', notificationError);
  }

  res.json({
    success: true,
    message: '已确认使用',
    data: request
  });
}));

// 标记归还（行政综合岗）
router.post('/:id/return', authorize('admin_staff', 'admin'), asyncHandler(async (req, res) => {
  const { returnNote } = req.body;

  const request = await SealRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  if (request.status !== 'processing') {
    throw new AppError('只能归还使用中状态的申请', 400, 'INVALID_STATUS');
  }

  request.status = 'returned';
  request.returnedAt = new Date();
  if (returnNote) {
    request.returnNote = returnNote.trim();
  }
  await request.save();

  await request.populate('createdBy', 'name username');
  await request.populate('processedBy', 'name username');

  // 通知申请人
  try {
    await createNotification({
      userId: request.createdBy._id,
      type: NotificationTypes.SEAL_STATUS_CHANGE,
      message: `您的章证使用申请 ${request.requestNumber} 已归还`,
      link: `/seal/${request._id}`,
      projectId: null
    });
  } catch (notificationError) {
    console.error('[Seal] 通知发送失败:', notificationError);
  }

  res.json({
    success: true,
    message: '已标记归还',
    data: request
  });
}));

// 取消申请（申请人）
router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const { cancelReason } = req.body;

  const request = await SealRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  // 权限检查：只能申请人本人取消
  if (request.createdBy.toString() !== req.user._id.toString()) {
    throw new AppError('只能取消自己的申请', 403, 'PERMISSION_DENIED');
  }

  // 状态检查：只能取消待处理状态的申请
  if (request.status !== 'pending') {
    throw new AppError('只能取消待处理状态的申请', 400, 'INVALID_STATUS');
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

// 获取待处理数量（行政综合岗）
router.get('/pending/count', authorize('admin_staff', 'admin'), asyncHandler(async (req, res) => {
  const count = await SealRequest.countDocuments({ status: 'pending' });

  res.json({
    success: true,
    data: { count }
  });
}));

module.exports = router;


