/**
 * 初始化管理员用户脚本
 * 使用方法: node scripts/initAdmin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function initAdmin() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi_system');
    console.log('✅ 数据库连接成功');

    // 检查是否已存在管理员
    const existingAdmin = await User.findOne({ username: 'admin' });
    if (existingAdmin) {
      console.log('⚠️  管理员用户已存在');
      process.exit(0);
    }

    // 创建管理员
    const admin = await User.create({
      username: 'admin',
      password: 'admin123', // 生产环境请修改！
      name: '系统管理员',
      email: 'admin@example.com',
      roles: ['admin']
    });

    console.log('✅ 管理员创建成功!');
    console.log('用户名: admin');
    console.log('密码: admin123');
    console.log('⚠️  请在生产环境中修改默认密码！');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    process.exit(1);
  }
}

initAdmin();
































