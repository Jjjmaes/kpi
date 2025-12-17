const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

// 密码复杂度校验
function validatePassword(password) {
  // 最少 8 位，需包含大写、小写、数字、特殊字符
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

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 添加调试日志（生产环境可以移除）
    console.log('[Login] 登录请求:', { 
      username, 
      hasPassword: !!password,
      timestamp: new Date().toISOString()
    });

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: '用户名和密码不能为空',
          statusCode: 400
        }
      });
    }

    const user = await User.findOne({ username, isActive: true });
    if (!user) {
      console.log('[Login] 用户未找到或已禁用:', username);
      return res.status(401).json({ 
        success: false, 
        error: {
          code: 'INVALID_CREDENTIALS',
          message: '用户名或密码错误',
          statusCode: 401
        }
      });
    }

    console.log('[Login] 用户找到:', { 
      username: user.username, 
      isActive: user.isActive,
      hasPassword: !!user.password 
    });

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log('[Login] 密码验证失败:', username);
      return res.status(401).json({ 
        success: false, 
        error: {
          code: 'INVALID_CREDENTIALS',
          message: '用户名或密码错误',
          statusCode: 401
        }
      });
    }

    console.log('[Login] 登录成功:', username);

    // 兼容历史用户：若未设置标记，则要求修改密码
    if (user.passwordMustChange === undefined) {
      user.passwordMustChange = true;
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
      roles: user.roles,
      passwordMustChange: user.passwordMustChange
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 注册（仅管理员可用，通过用户管理接口）
// 获取当前用户信息
router.get('/me', require('../middleware/auth').authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 修改密码
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: '旧密码和新密码不能为空' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

    const isOldValid = await user.comparePassword(oldPassword);
    if (!isOldValid) {
      return res.status(400).json({ success: false, message: '旧密码不正确' });
    }

    const pwdError = validatePassword(newPassword);
    if (pwdError) return res.status(400).json({ success: false, message: pwdError });

    user.password = newPassword;
    user.passwordMustChange = false;
    user.passwordUpdatedAt = Date.now();
    await user.save();

    res.json({ success: true, message: '密码已更新' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新个人信息（电话、邮箱）
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { email, phone } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 验证邮箱格式
    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (email && !emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: '邮箱格式不正确' });
      }
      // 检查邮箱是否已被其他用户使用
      const existingUser = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({ success: false, message: '该邮箱已被其他用户使用' });
      }
      user.email = email.toLowerCase();
    }

    // 验证电话格式（可选，如果提供则验证）
    if (phone !== undefined) {
      if (phone && phone.trim()) {
        // 简单的电话格式验证（可根据需要调整）
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        if (!phoneRegex.test(phone)) {
          return res.status(400).json({ success: false, message: '电话格式不正确' });
        }
      }
      user.phone = phone || '';
    }

    user.updatedAt = Date.now();
    await user.save();

    res.json({
      success: true,
      message: '个人信息已更新',
      data: {
        id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;






















