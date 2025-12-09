const mongoose = require('mongoose');

const kpiRecordSchema = new mongoose.Schema({
  // 用户ID
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 项目ID
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  // 角色
  role: {
    type: String,
    enum: ['translator', 'reviewer', 'pm', 'sales', 'admin_staff', 'part_time_sales', 'layout'],
    required: true
  },
  // 计算月份（YYYY-MM格式）
  month: {
    type: String,
    required: true,
    index: true
  },
  // KPI数值
  kpiValue: {
    type: Number,
    required: true,
    min: 0
  },
  // 计算详情
  calculationDetails: {
    projectAmount: Number,
    ratio: Number,
    wordRatio: Number,
    completionFactor: Number,
    formula: String
  },
  // 是否已审核
  isReviewed: {
    type: Boolean,
    default: false
  },
  // 审核人
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // 审核时间
  reviewedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 复合索引：用户+月份+角色
kpiRecordSchema.index({ userId: 1, month: 1, role: 1 });
// 月份索引
kpiRecordSchema.index({ month: 1 });

module.exports = mongoose.model('KpiRecord', kpiRecordSchema);















