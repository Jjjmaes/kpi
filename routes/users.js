const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const userService = require('../services/userService');

// 所有用户路由需要认证
router.use(authenticate);

// 获取所有用户（管理员、财务、销售、项目经理可见）
// 用于项目成员选择
router.get('/', authorize('admin', 'finance', 'sales', 'part_time_sales', 'pm', 'translator', 'reviewer'), asyncHandler(async (req, res) => {
  const users = await userService.getAllActiveUsers();
    
    res.json({
      success: true,
      data: users
    });
}));

// 创建用户（仅管理员）
router.post('/', authorize('admin'), asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body);

    res.status(201).json({
      success: true,
    data: user
    });
}));

// 更新用户（仅管理员）
router.put('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body);

    res.json({
      success: true,
    data: user
    });
}));

// 获取单个用户信息
router.get('/:id', asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id, req.user);

    res.json({
      success: true,
      data: user
    });
}));

// 重置用户密码（仅管理员）
router.post('/:id/reset-password', authorize('admin'), asyncHandler(async (req, res) => {
  const result = await userService.resetUserPassword(req.params.id);

  res.json({
    success: true,
    message: '密码已重置',
    data: result
    });
}));

// 删除用户（仅管理员，软删除）
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  await userService.deleteUser(req.params.id);

    res.json({
      success: true,
      message: '用户已删除'
    });
}));

module.exports = router;

