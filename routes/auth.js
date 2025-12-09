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

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: '用户名和密码不能为空' 
      });
    }

    const user = await User.findOne({ username, isActive: true });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: '用户名或密码错误' 
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: '用户名或密码错误' 
      });
    }

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

module.exports = router;






















