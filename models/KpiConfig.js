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
  // 动态角色系数配置（JSON对象）
  // 格式：{ roleCode: { base: 0.08, mtpe: 0.12, deepedit: 0.18, bonus: 0.02, commission: 0.10 } }
  // 用于支持新增角色的系数配置，无需修改代码
  // 优先级：固定字段 > roleRatios
  roleRatios: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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
// 优先从固定字段读取，如果没有则从roleRatios读取（向后兼容）
kpiConfigSchema.methods.getLockedRatios = function() {
  const ratios = {
    translator_mtpe: this.translator_ratio_mtpe,
    translator_deepedit: this.translator_ratio_deepedit,
    reviewer: this.reviewer_ratio,
    pm: this.pm_ratio,
    sales_bonus: this.sales_bonus_ratio,
    sales_commission: this.sales_commission_ratio,
    admin: this.admin_ratio,
    completion_factor: this.completion_factor
  };

  // 从动态配置中读取新角色的系数
  const roleRatios = this.roleRatios || {};
  Object.keys(roleRatios).forEach(roleCode => {
    const roleConfig = roleRatios[roleCode];
    if (typeof roleConfig === 'object' && roleConfig !== null) {
      // 如果角色有base系数，添加到ratios中
      if (roleConfig.base !== undefined) {
        ratios[roleCode] = roleConfig.base;
      }
      // 如果角色有其他类型的系数（如mtpe, deepedit等），也添加
      Object.keys(roleConfig).forEach(key => {
        if (key !== 'base') {
          ratios[`${roleCode}_${key}`] = roleConfig[key];
        }
      });
    } else if (typeof roleConfig === 'number') {
      // 如果直接是数字，作为base系数
      ratios[roleCode] = roleConfig;
    }
  });

  return ratios;
};

// 获取特定角色的系数（支持动态配置）
kpiConfigSchema.methods.getRoleRatio = function(roleCode, ratioType = 'base') {
  // 先检查固定字段（向后兼容）
  const fixedFieldMap = {
    'translator': { mtpe: 'translator_ratio_mtpe', deepedit: 'translator_ratio_deepedit' },
    'reviewer': { base: 'reviewer_ratio' },
    'pm': { base: 'pm_ratio' },
    'sales': { bonus: 'sales_bonus_ratio', commission: 'sales_commission_ratio' },
    'admin_staff': { base: 'admin_ratio' },
    'finance': { base: 'admin_ratio' } // 财务岗使用综合岗系数
  };

  if (fixedFieldMap[roleCode] && fixedFieldMap[roleCode][ratioType]) {
    const fieldName = fixedFieldMap[roleCode][ratioType];
    if (this[fieldName] !== undefined) {
      return this[fieldName];
    }
  }

  // 从动态配置读取
  const roleRatios = this.roleRatios || {};
  if (roleRatios[roleCode]) {
    const roleConfig = roleRatios[roleCode];
    if (typeof roleConfig === 'object' && roleConfig !== null) {
      return roleConfig[ratioType] !== undefined ? roleConfig[ratioType] : roleConfig.base;
    } else if (typeof roleConfig === 'number' && ratioType === 'base') {
      return roleConfig;
    }
  }

  // 默认返回0
  return 0;
};

module.exports = mongoose.model('KpiConfig', kpiConfigSchema);





















