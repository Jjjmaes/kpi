const mongoose = require('mongoose');

const kpiConfigSchema = new mongoose.Schema({
  // 翻译系数
  translator_ratio_mtpe: {
    type: Number,
    required: true,
    default: 0.12,
    min: 0,
    max: 1
  },
  translator_ratio_deepedit: {
    type: Number,
    required: true,
    default: 0.18,
    min: 0,
    max: 1
  },
  // 审校系数
  reviewer_ratio: {
    type: Number,
    required: true,
    default: 0.08,
    min: 0,
    max: 1
  },
  // PM系数
  pm_ratio: {
    type: Number,
    required: true,
    default: 0.03,
    min: 0,
    max: 1
  },
  // 销售系数
  sales_bonus_ratio: {
    type: Number,
    required: true,
    default: 0.02,
    min: 0,
    max: 1
  },
  sales_commission_ratio: {
    type: Number,
    required: true,
    default: 0.10,
    min: 0,
    max: 1
  },
  // 综合岗系数
  admin_ratio: {
    type: Number,
    required: true,
    default: 0.005,
    min: 0,
    max: 1
  },
  // 完成系数（返修/延期/客诉影响）
  completion_factor: {
    type: Number,
    required: true,
    default: 1.0,
    min: 0,
    max: 1
  },
  // 机构信息
  companyName: {
    type: String,
    default: '公司名称'
  },
  companyAddress: {
    type: String,
    default: ''
  },
  companyContact: {
    type: String,
    default: ''
  },
  companyPhone: {
    type: String,
    default: ''
  },
  companyEmail: {
    type: String,
    default: ''
  },
  // 版本号和变更记录
  version: {
    type: Number,
    default: 1
  },
  // 变更历史
  changeHistory: [{
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    oldValues: mongoose.Schema.Types.Mixed,
    newValues: mongoose.Schema.Types.Mixed,
    reason: String
  }],
  isActive: {
    type: Boolean,
    default: true
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

// 获取当前激活配置
kpiConfigSchema.statics.getActiveConfig = async function() {
  let config = await this.findOne({ isActive: true });
  if (!config) {
    // 如果没有配置，创建默认配置
    config = await this.create({
      companyName: '公司名称'
    });
  }
  return config;
};

// 获取锁定的比例对象（用于项目创建时锁定）
kpiConfigSchema.methods.getLockedRatios = function() {
  return {
    translator_mtpe: this.translator_ratio_mtpe,
    translator_deepedit: this.translator_ratio_deepedit,
    reviewer: this.reviewer_ratio,
    pm: this.pm_ratio,
    sales_bonus: this.sales_bonus_ratio,
    sales_commission: this.sales_commission_ratio,
    admin: this.admin_ratio,
    completion_factor: this.completion_factor
  };
};

module.exports = mongoose.model('KpiConfig', kpiConfigSchema);





















