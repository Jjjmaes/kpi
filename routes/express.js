const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const ExpressRequest = require('../models/ExpressRequest');
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
  
  const prefix = `EXP${year}${month}${day}`;
  const lastRequest = await ExpressRequest.findOne({
    requestNumber: { $regex: `^${prefix}` }
  }).sort({ requestNumber: -1 });

  let sequence = 1;
  if (lastRequest && lastRequest.requestNumber) {
    const lastSeq = parseInt(lastRequest.requestNumber.slice(-3)) || 0;
    sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

// 创建快递申请
router.post('/', asyncHandler(async (req, res) => {
  const { recipient, content, note } = req.body;

  console.log('[Express] 创建申请请求:', { 
    recipient: recipient ? { name: recipient.name, phone: recipient.phone, hasAddress: !!recipient.address } : null,
    content: content ? { type: content.type, hasDescription: !!content.description } : null,
    userId: req.user?._id 
  });

  // 验证必填字段
  if (!recipient || !recipient.name || !recipient.phone || !recipient.address) {
    console.error('[Express] 收件人信息不完整:', recipient);
    throw new AppError('收件人信息不完整', 400, 'MISSING_RECIPIENT_INFO');
  }

  if (!content || !content.type || !content.description) {
    console.error('[Express] 邮寄内容信息不完整:', content);
    throw new AppError('邮寄内容信息不完整', 400, 'MISSING_CONTENT_INFO');
  }

  // 生成申请编号
  const requestNumber = await generateRequestNumber();
  console.log('[Express] 生成的申请编号:', requestNumber);

  // 创建申请
  console.log('[Express] 开始创建申请记录...');
  const expressRequest = await ExpressRequest.create({
    requestNumber,
    recipient,
    content,
    note,
    createdBy: req.user._id,
    status: 'pending'
  });
  console.log('[Express] 申请记录创建成功, ID:', expressRequest._id);

  // 填充申请人信息
  await expressRequest.populate('createdBy', 'name username');
  console.log('[Express] 申请人信息已填充');

  // 通知综合岗（失败不影响主流程）
  try {
    const adminStaffUsers = await User.find({
      roles: { $in: ['admin_staff', 'admin'] },
      isActive: true
    });

    if (adminStaffUsers.length > 0) {
      await createNotificationsForUsers(
        adminStaffUsers.map(u => u._id),
        NotificationTypes.EXPRESS_REQUEST,
        `新的快递申请：${requestNumber}`,
        `/express/${expressRequest._id}`,
        null // projectId，快递申请不是项目，所以为 null
      );
    }
  } catch (notificationError) {
    // 通知发送失败不影响申请创建
    console.error('[Express] 通知发送失败:', notificationError);
  }

  res.status(201).json({
    success: true,
    message: '快递申请已提交',
    data: expressRequest
  });
}));

// 获取快递申请列表
router.get('/', asyncHandler(async (req, res) => {
  const { status, createdBy, startDate, endDate, tab, page = 1, pageSize = 20 } = req.query;
  const isStaff = isAdminStaff(req);

  // 构建查询条件
  const query = {};

  // 权限控制
  if (!isStaff) {
    // 普通用户只能查看自己的申请
    query.createdBy = req.user._id;
  } else {
    // 综合岗：根据标签页决定
    if (tab === 'my') {
      // "我的申请"标签页：只显示自己提交的
      query.createdBy = req.user._id;
    } else if (tab === 'manage' && createdBy) {
      // "申请管理"标签页：可以按申请人筛选
      query.createdBy = createdBy;
    }
    // 如果 tab === 'manage' 且没有 createdBy，显示所有申请（用于管理）
  }

  // 状态筛选
  if (status) {
    query.status = status;
  }

  // 日期范围筛选
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  // 分页
  const skip = (parseInt(page) - 1) * parseInt(pageSize);
  const limit = parseInt(pageSize);

  // 查询
  const [requests, total] = await Promise.all([
    ExpressRequest.find(query)
      .populate('createdBy', 'name username')
      .populate('processedBy', 'name username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ExpressRequest.countDocuments(query)
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

// 获取单个快递申请详情
router.get('/:id', asyncHandler(async (req, res) => {
  const request = await ExpressRequest.findById(req.params.id)
    .populate('createdBy', 'name username email')
    .populate('processedBy', 'name username');

  if (!request) {
    throw new AppError('快递申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  // 权限检查：申请人本人或综合岗
  const isOwner = request.createdBy._id.toString() === req.user._id.toString();
  const isStaff = isAdminStaff(req);

  if (!isOwner && !isStaff) {
    throw new AppError('无权查看该申请', 403, 'PERMISSION_DENIED');
  }

  res.json({
    success: true,
    data: request
  });
}));

// 更新快递申请（综合岗处理）
router.put('/:id', authorize('admin_staff', 'admin'), asyncHandler(async (req, res) => {
  const { status, express, note } = req.body;

  const request = await ExpressRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('快递申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  // 状态流转验证
  if (status === 'processing' && request.status !== 'pending') {
    throw new AppError('只能处理待处理状态的申请', 400, 'INVALID_STATUS_TRANSITION');
  }

  if (status === 'sent' && request.status !== 'processing') {
    throw new AppError('只能标记处理中状态的申请为已发出', 400, 'INVALID_STATUS_TRANSITION');
  }

  // 更新状态
  if (status) {
    request.status = status;
    if (status === 'processing' || status === 'sent') {
      request.processedBy = req.user._id;
      request.processedAt = new Date();
    }
  }

  // 更新快递信息
  if (express) {
    request.express = {
      ...request.express,
      ...express
    };
    // 如果标记为已发出，自动设置发出时间
    if (status === 'sent' && !express.sentAt) {
      request.express.sentAt = new Date();
    }
  }

  // 更新备注
  if (note !== undefined) {
    request.note = note;
  }

  await request.save();

  // 填充关联信息
  await request.populate('createdBy', 'name username');
  await request.populate('processedBy', 'name username');

  // 通知申请人状态变更
  if (status === 'processing' || status === 'sent') {
    try {
      await createNotification({
        userId: request.createdBy._id,
        type: NotificationTypes.EXPRESS_STATUS_CHANGE,
        message: `您的快递申请 ${request.requestNumber} 状态已更新为：${status === 'processing' ? '处理中' : '已发出'}`,
        link: `/express/${request._id}`,
        projectId: null
      });
    } catch (notificationError) {
      console.error('[Express] 通知发送失败:', notificationError);
      // 通知发送失败不影响主流程
    }
  }

  res.json({
    success: true,
    message: '申请已更新',
    data: request
  });
}));

// 取消快递申请
router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const { cancelReason } = req.body;

  const request = await ExpressRequest.findById(req.params.id);

  if (!request) {
    throw new AppError('快递申请不存在', 404, 'REQUEST_NOT_FOUND');
  }

  // 权限检查：只能申请人本人取消
  if (request.createdBy.toString() !== req.user._id.toString()) {
    throw new AppError('只能取消自己的申请', 403, 'PERMISSION_DENIED');
  }

  // 状态检查：只能取消待处理或处理中的申请
  if (request.status !== 'pending' && request.status !== 'processing') {
    throw new AppError('只能取消待处理或处理中的申请', 400, 'INVALID_STATUS');
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

// 获取待处理数量（综合岗）
router.get('/pending/count', authorize('admin_staff', 'admin'), asyncHandler(async (req, res) => {
  const count = await ExpressRequest.countDocuments({ status: 'pending' });

  res.json({
    success: true,
    data: { count }
  });
}));

module.exports = router;


