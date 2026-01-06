/**
 * 收款记录数据迁移脚本
 * 为现有 PaymentRecord 记录添加默认值，确保向后兼容
 */

const mongoose = require('mongoose');
const PaymentRecord = require('../models/PaymentRecord');

async function migratePaymentRecords() {
  try {
    console.log('开始迁移收款记录...');
    
    // 连接数据库
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('数据库连接成功');

    // 查找所有没有 status 字段的记录（旧记录）
    const oldRecords = await PaymentRecord.find({
      $or: [
        { status: { $exists: false } },
        { status: null }
      ]
    });

    console.log(`找到 ${oldRecords.length} 条需要迁移的记录`);

    let updatedCount = 0;
    for (const record of oldRecords) {
      const updateData = {
        status: 'confirmed', // 默认已确认（向后兼容）
      };

      // 如果有 recordedBy，设置为 initiatedBy
      if (record.recordedBy) {
        updateData.initiatedBy = record.recordedBy;
      }

      // 如果有 receivedBy，设置为 confirmedBy
      if (record.receivedBy) {
        updateData.confirmedBy = record.receivedBy;
        updateData.confirmedAt = record.createdAt || new Date();
      } else if (record.recordedBy) {
        // 如果没有 receivedBy，但有 recordedBy，也设置为 confirmedBy（向后兼容）
        updateData.confirmedBy = record.recordedBy;
        updateData.confirmedAt = record.createdAt || new Date();
      }

      // 对公转账（bank）直接生效，无需确认流程
      if (record.method === 'bank') {
        updateData.status = 'confirmed';
        if (!updateData.confirmedBy && record.recordedBy) {
          updateData.confirmedBy = record.recordedBy;
          updateData.confirmedAt = record.createdAt || new Date();
        }
      }

      await PaymentRecord.updateOne(
        { _id: record._id },
        { $set: updateData }
      );
      updatedCount++;
    }

    console.log(`成功迁移 ${updatedCount} 条记录`);
    console.log('迁移完成');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migratePaymentRecords();
}

module.exports = migratePaymentRecords;


