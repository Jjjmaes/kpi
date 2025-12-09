const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const User = require('../models/User');

// 所有用户路由需要认证
router.use(authenticate);

// 获取所有用户（管理员、财务、销售、项目经理可见）
// 用于项目成员选择
router.get('/', authorize('admin', 'finance', 'sales', 'part_time_sales', 'pm', 'translator', 'reviewer'), async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 创建用户（仅管理员）
router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { username, password, name, email, roles } = req.body;

    if (!username || !password || !name || !email || !roles || roles.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: '请填写所有必填字段' 
      });
    }

    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }] 
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: '用户名或邮箱已存在' 
      });
    }

    const user = await User.create({
      username,
      password,
      name,
      email,
      roles
    });

    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        roles: user.roles
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 更新用户（仅管理员）
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { name, email, roles, isActive } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (roles) user.roles = roles;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    user.updatedAt = Date.now();

    await user.save();

    res.json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        roles: user.roles,
        isActive: user.isActive
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 获取单个用户信息
router.get('/:id', async (req, res) => {
  try {
    // 用户只能查看自己的信息，管理员和财务可以查看所有
    const canViewAll = req.user.roles.includes('admin') || req.user.roles.includes('finance');
    const userId = canViewAll ? req.params.id : req.user._id;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 删除用户（仅管理员，软删除）
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }

    // 软删除：设置为非激活状态
    user.isActive = false;
    user.updatedAt = Date.now();
    await user.save();

    res.json({
      success: true,
      message: '用户已删除'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;

