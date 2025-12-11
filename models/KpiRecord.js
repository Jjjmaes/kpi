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

// 复合唯一索引：确保同一用户在同一项目的同一月份同一角色只有一条记录（幂等性）
kpiRecordSchema.index({ userId: 1, projectId: 1, month: 1, role: 1 }, { unique: true });
// 月份索引
kpiRecordSchema.index({ month: 1 });
// 项目索引（用于查询项目相关KPI）
kpiRecordSchema.index({ projectId: 1 });

module.exports = mongoose.model('KpiRecord', kpiRecordSchema);















