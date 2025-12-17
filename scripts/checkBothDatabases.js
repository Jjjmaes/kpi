/**
 * 检查两个数据库中的用户
 * 用于诊断数据库不一致问题
 * 用法: node scripts/checkBothDatabases.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function checkBothDatabases() {
  const User = require('../models/User');
  
  const databases = [
    { name: 'kpi', uri: 'mongodb://127.0.0.1:27017/kpi' },
    { name: 'kpi_system', uri: 'mongodb://127.0.0.1:27017/kpi_system' }
  ];
  
  console.log('=== 检查两个数据库中的用户 ===\n');
  
  for (const db of databases) {
    try {
      console.log(`\n检查数据库: ${db.name}`);
      console.log('─'.repeat(50));
      
      await mongoose.connect(db.uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
      });
      
      const userCount = await User.countDocuments();
      const adminCount = await User.countDocuments({ username: 'admin' });
      const activeAdminCount = await User.countDocuments({ username: 'admin', isActive: true });
      
      console.log(`  用户总数: ${userCount}`);
      console.log(`  管理员用户数: ${adminCount}`);
      console.log(`  活跃管理员数: ${activeAdminCount}`);
      
      if (adminCount > 0) {
        const admin = await User.findOne({ username: 'admin' });
        console.log(`  管理员详情:`);
        console.log(`    - 用户名: ${admin.username}`);
        console.log(`    - 名称: ${admin.name}`);
        console.log(`    - 邮箱: ${admin.email}`);
        console.log(`    - 角色: ${admin.roles}`);
        console.log(`    - 是否激活: ${admin.isActive}`);
        console.log(`    - 密码已设置: ${admin.password ? '✅' : '❌'}`);
      }
      
      await mongoose.disconnect();
    } catch (error) {
      console.log(`  ❌ 连接失败: ${error.message}`);
    }
  }
  
  console.log('\n=== 检查完成 ===');
  console.log('\n建议:');
  console.log('1. 如果管理员在 kpi_system 数据库中，可以：');
  console.log('   - 选项A: 修改 .env 中的 MONGODB_URI 为 mongodb://127.0.0.1:27017/kpi_system');
  console.log('   - 选项B: 使用 mongodump/mongorestore 迁移数据到 kpi 数据库');
  console.log('2. 如果管理员在 kpi 数据库中，直接使用即可');
  console.log('3. 如果两个数据库都有用户，建议统一使用一个数据库');
  
  process.exit(0);
}

checkBothDatabases();

