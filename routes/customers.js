const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Customer = require('../models/Customer');

// 所有客户路由需要认证
router.use(authenticate);

// 获取所有客户（销售、管理员、财务可见）
router.get('/', authorize('admin', 'finance', 'sales'), async (req, res) => {
  try {
    const { search, isActive } = req.query;
    let query = {};

    // 搜索条件
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { shortName: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } }
      ];
    }

    // 激活状态过滤
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    } else {
      query.isActive = true; // 默认只显示激活的
    }

    const customers = await Customer.find(query)
      .populate('createdBy', 'name username')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取单个客户详情
router.get('/:id', authorize('admin', 'finance', 'sales'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate('createdBy', 'name username');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: '客户不存在'
      });
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 创建客户（销售、管理员）
router.post('/', authorize('admin', 'sales'), async (req, res) => {
  try {
    const { name, shortName, contactPerson, phone, email, address, notes } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: '客户名称不能为空'
      });
    }

    // 检查是否已存在同名客户
    const existingCustomer = await Customer.findOne({ name, isActive: true });
    if (existingCustomer) {
      return res.status(400).json({
        success: false,
        message: '客户名称已存在'
      });
    }

    const customer = await Customer.create({
      name,
      shortName,
      contactPerson,
      phone,
      email,
      address,
      notes,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: '客户创建成功',
      data: customer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 更新客户（销售、管理员）
router.put('/:id', authorize('admin', 'sales'), async (req, res) => {
  try {
    const { name, shortName, contactPerson, phone, email, address, notes, isActive } = req.body;
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: '客户不存在'
      });
    }

    // 如果修改名称，检查是否与其他客户重复
    if (name && name !== customer.name) {
      const existingCustomer = await Customer.findOne({ name, isActive: true, _id: { $ne: customer._id } });
      if (existingCustomer) {
        return res.status(400).json({
          success: false,
          message: '客户名称已存在'
        });
      }
    }

    if (name) customer.name = name;
    if (shortName !== undefined) customer.shortName = shortName;
    if (contactPerson !== undefined) customer.contactPerson = contactPerson;
    if (phone !== undefined) customer.phone = phone;
    if (email !== undefined) customer.email = email;
    if (address !== undefined) customer.address = address;
    if (notes !== undefined) customer.notes = notes;
    if (typeof isActive === 'boolean') customer.isActive = isActive;

    await customer.save();

    res.json({
      success: true,
      message: '客户更新成功',
      data: customer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 删除客户（软删除，仅管理员）
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: '客户不存在'
      });
    }

    // 软删除
    customer.isActive = false;
    await customer.save();

    res.json({
      success: true,
      message: '客户已删除'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;








