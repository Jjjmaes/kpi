const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const User = require('../models/User');

// 密码复杂度校验（与 auth 保持一致）
function validatePassword(password) {
  const minLen = 8;
  if (!password || password.length < minLen) {
    return '密码长度至少 8 位';
  }
  const upper = /[A-Z]/.test(password);
  const lower = /[a-z]/.test(password);
  const digit = /\d/.test(password);
  const special = /[^A-Za-z0-9]/.test(password);
  if (!upper || !lower || !digit || !special) {
    return '密码需包含大写字母、小写字母、数字和特殊字符';
  }
  if (password.length > 64) {
    return '密码长度不能超过 64 位';
  }
  return null;
}

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
    const { username, password, name, email, phone, roles } = req.body;

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

    const pwdError = validatePassword(password);
    if (pwdError) {
      return res.status(400).json({ success: false, message: pwdError });
    }

    const user = await User.create({
      username,
      password,
      name,
      email,
      phone: phone || '',
      roles
    });

    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone,
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
    const { name, email, phone, roles, isActive } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone || '';
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
        phone: user.phone,
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

// 重置用户密码（仅管理员）
router.post('/:id/reset-password', authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }

    // 生成随机密码（符合密码复杂度要求）
    // 包含：大写字母、小写字母、数字、特殊字符
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    const allChars = uppercase + lowercase + numbers + special;
    
    // 确保至少包含每种类型的字符
    let newPassword = '';
    newPassword += uppercase[Math.floor(Math.random() * uppercase.length)];
    newPassword += lowercase[Math.floor(Math.random() * lowercase.length)];
    newPassword += numbers[Math.floor(Math.random() * numbers.length)];
    newPassword += special[Math.floor(Math.random() * special.length)];
    
    // 补充到12位（8位最小要求 + 4位额外）
    for (let i = newPassword.length; i < 12; i++) {
      newPassword += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // 打乱字符顺序
    newPassword = newPassword.split('').sort(() => Math.random() - 0.5).join('');

    // 重置密码并设置必须修改标志
    user.password = newPassword;
    user.passwordMustChange = true;
    user.passwordUpdatedAt = null; // 清除之前的密码更新时间
    user.updatedAt = Date.now();
    await user.save();

    res.json({
      success: true,
      message: '密码已重置',
      data: {
        newPassword: newPassword, // 返回新密码，管理员可以告知用户
        passwordMustChange: true
      }
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

