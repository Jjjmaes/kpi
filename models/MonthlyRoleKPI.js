const mongoose = require('mongoose');

/**
 * 月度角色KPI模型
 * 用于存储综合岗和财务岗的月度汇总KPI（按管理员评价完成系数计算）
 */
const monthlyRoleKPISchema = new mongoose.Schema({
  // 用户ID
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 角色
  // 注意：不再使用enum限制，通过Role模型的canBeKpiRole标志控制
  // 在创建/更新月度角色KPI记录时，需要通过验证确保角色允许用于KPI
  role: {
    type: String,
    required: true,
    trim: true
  },
  // 计算月份（YYYY-MM格式）
  month: {
    type: String,
    required: true,
    index: true
  },
  // 全公司当月项目总金额
  totalCompanyAmount: {
    type: Number,
    required: true,
    min: 0
  },
  // 系数（admin_ratio）
  ratio: {
    type: Number,
    required: true,
    min: 0
  },
  // 管理员评价的完成系数（好1.1、中1.0、差0.8）
  evaluationFactor: {
    type: Number,
    default: 1.0,
    enum: [0.8, 1.0, 1.1],
    required: true
  },
  // 评价等级（好、中、差）
  evaluationLevel: {
    type: String,
    enum: ['good', 'medium', 'poor'],
    default: 'medium'
  },
  // KPI数值 = totalCompanyAmount × ratio × evaluationFactor
  kpiValue: {
    type: Number,
    required: true,
    min: 0
  },
  // 评价人（管理员）
  evaluatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // 评价时间
  evaluatedAt: {
    type: Date,
    default: Date.now
  },
  // 计算详情
  calculationDetails: {
    formula: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 复合唯一索引：确保同一用户在同一月份同一角色只有一条记录
monthlyRoleKPISchema.index({ userId: 1, month: 1, role: 1 }, { unique: true });
// 月份索引
monthlyRoleKPISchema.index({ month: 1 });
// 用户索引
monthlyRoleKPISchema.index({ userId: 1 });

// 更新时自动更新 updatedAt
monthlyRoleKPISchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('MonthlyRoleKPI', monthlyRoleKPISchema);


