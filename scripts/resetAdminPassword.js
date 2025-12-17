/**
 * 重置管理员密码脚本
 * 用法: node scripts/resetAdminPassword.js admin NewStrongPassword123!
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function resetAdminPassword() {
  const [, , usernameArg, newPasswordArg] = process.argv;
  const username = usernameArg || 'admin';
  const newPassword = newPasswordArg || 'admin123';

  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi');
    console.log('✅ 数据库连接成功');

    const admin = await User.findOne({ username });
    if (!admin) {
      console.log(`❌ 未找到用户: ${username}`);
      process.exit(1);
    }

    // 关键：用 save()，确保触发 password 的 hash 钩子（如果你的模型有的话）
    admin.password = newPassword;
    await admin.save();

    console.log('✅ 密码重置成功');
    console.log('用户名:', username);
    console.log('新密码:', newPassword);
    process.exit(0);
  } catch (error) {
    console.error('❌ 重置失败:', error);
    process.exit(1);
  }
}

resetAdminPassword();
