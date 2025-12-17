/**
 * 配置检查脚本
 * 用于诊断程序移动目录后的配置问题
 * 用法: node scripts/checkConfig.js
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');

console.log('=== 配置检查 ===\n');

// 1. 检查工作目录
console.log('1. 工作目录:');
console.log('   ', process.cwd());
console.log('   ', __dirname);
console.log('');

// 2. 检查 .env 文件
console.log('2. .env 文件检查:');
const envPath = path.join(process.cwd(), '.env');
const envExists = fs.existsSync(envPath);
console.log('   .env 路径:', envPath);
console.log('   文件存在:', envExists ? '✅' : '❌');
if (envExists) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const hasMongoDB = envContent.includes('MONGODB_URI');
  const hasJWT = envContent.includes('JWT_SECRET');
  console.log('   包含 MONGODB_URI:', hasMongoDB ? '✅' : '❌');
  console.log('   包含 JWT_SECRET:', hasJWT ? '✅' : '❌');
} else {
  console.log('   ⚠️  警告: .env 文件不存在！');
}
console.log('');

// 3. 检查环境变量
console.log('3. 环境变量:');
console.log('   MONGODB_URI:', process.env.MONGODB_URI || '(未设置，将使用默认值)');
console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '已设置' : '(未设置，将使用默认值 - 不安全！)');
console.log('   PORT:', process.env.PORT || '3000 (默认)');
console.log('   NODE_ENV:', process.env.NODE_ENV || '(未设置)');
console.log('');

// 4. 检查关键目录
console.log('4. 关键目录检查:');
const publicPath = path.join(__dirname, '..', 'public');
const modelsPath = path.join(__dirname, '..', 'models');
const routesPath = path.join(__dirname, '..', 'routes');
console.log('   public 目录:', fs.existsSync(publicPath) ? '✅' : '❌', publicPath);
console.log('   models 目录:', fs.existsSync(modelsPath) ? '✅' : '❌', modelsPath);
console.log('   routes 目录:', fs.existsSync(routesPath) ? '✅' : '❌', routesPath);
console.log('');

// 5. 检查 MongoDB 连接（如果配置了）
if (process.env.MONGODB_URI) {
  console.log('5. MongoDB 连接测试:');
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
  })
  .then(async () => {
    console.log('   ✅ MongoDB 连接成功');
    
    // 检查用户集合
    const User = require('../models/User');
    const userCount = await User.countDocuments();
    const adminCount = await User.countDocuments({ username: 'admin', isActive: true });
    console.log('   用户总数:', userCount);
    console.log('   活跃管理员数:', adminCount);
    
    if (adminCount > 0) {
      const admin = await User.findOne({ username: 'admin', isActive: true });
      console.log('   管理员信息:');
      console.log('     - 用户名:', admin.username);
      console.log('     - 名称:', admin.name);
      console.log('     - 邮箱:', admin.email);
      console.log('     - 角色:', admin.roles);
      console.log('     - 是否激活:', admin.isActive);
      console.log('     - 密码已设置:', admin.password ? '✅' : '❌');
    } else {
      console.log('   ⚠️  警告: 未找到活跃的管理员用户！');
    }
    
    await mongoose.disconnect();
    console.log('\n=== 检查完成 ===');
    process.exit(0);
  })
  .catch((err) => {
    console.log('   ❌ MongoDB 连接失败:', err.message);
    console.log('\n=== 检查完成（MongoDB 连接失败） ===');
    process.exit(1);
  });
} else {
  console.log('5. MongoDB 连接测试:');
  console.log('   ⚠️  跳过（未配置 MONGODB_URI）');
  console.log('\n=== 检查完成 ===');
  process.exit(0);
}

