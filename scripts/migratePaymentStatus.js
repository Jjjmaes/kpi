/**
 * 数据迁移脚本：为所有项目设置正确的 paymentStatus
 * 运行方式: node scripts/migratePaymentStatus.js
 */

const mongoose = require('mongoose');
const Project = require('../models/Project');
require('dotenv').config();

async function migratePaymentStatus() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('数据库连接成功');

    // 查找所有项目
    const projects = await Project.find({});
    console.log(`找到 ${projects.length} 个项目`);

    let updated = 0;
    let skipped = 0;

    for (const project of projects) {
      const projectAmount = project.projectAmount || 0;
      const receivedAmount = project.payment?.receivedAmount || 0;
      const currentStatus = project.payment?.paymentStatus;

      // 计算正确的状态
      let correctStatus;
      if (receivedAmount >= projectAmount && projectAmount > 0) {
        correctStatus = 'paid';
      } else if (receivedAmount > 0) {
        correctStatus = 'partially_paid';
      } else {
        correctStatus = 'unpaid';
      }

      // 如果状态不正确或不存在，则更新
      if (currentStatus !== correctStatus) {
        project.payment = project.payment || {};
        project.payment.paymentStatus = correctStatus;
        project.payment.remainingAmount = Math.max(0, projectAmount - receivedAmount);
        project.payment.isFullyPaid = receivedAmount >= projectAmount && projectAmount > 0;
        
        await project.save();
        updated++;
        console.log(`✓ 更新项目 ${project.projectNumber || project._id}: ${currentStatus || 'null'} -> ${correctStatus}`);
      } else {
        skipped++;
      }
    }

    console.log(`\n迁移完成:`);
    console.log(`- 更新: ${updated} 个项目`);
    console.log(`- 跳过: ${skipped} 个项目（状态已正确）`);

    await mongoose.disconnect();
    console.log('数据库连接已关闭');
    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// 运行迁移
migratePaymentStatus();


