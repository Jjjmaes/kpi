const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const customerService = require('../services/customerService');

// 所有客户路由需要认证
router.use(authenticate);

// 获取所有客户（销售、兼职销售、管理员、财务可见）
router.get('/', authorize('admin', 'finance', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  const customers = await customerService.getAllCustomers(req.query, req.user);

  res.json({
    success: true,
    data: customers
  });
}));

// 获取单个客户详情
router.get('/:id', authorize('admin', 'finance', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id);

  res.json({
    success: true,
    data: customer
  });
}));

// 创建客户（销售、管理员）
router.post('/', authorize('admin', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  const customer = await customerService.createCustomer(req.body, req.user);

  res.status(201).json({
    success: true,
    message: '客户创建成功',
    data: customer
  });
}));

// 更新客户（销售、管理员）
router.put('/:id', authorize('admin', 'sales', 'part_time_sales'), asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(req.params.id, req.body, req.user);

  res.json({
    success: true,
    message: '客户更新成功',
    data: customer
  });
}));

// 删除客户（软删除，仅管理员）
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  await customerService.deleteCustomer(req.params.id);

  res.json({
    success: true,
    message: '客户已删除'
  });
}));

module.exports = router;
















