const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z][a-z0-9_]*$/, // 只能包含小写字母、数字和下划线，且必须以字母开头
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  priority: {
    type: Number,
    required: true,
    default: 0,
    index: true
  },
  // 权限配置（JSON对象，存储所有权限）
  // 注意：不能使用 Map 类型，因为权限键包含 "."（如 "project.view"），Mongoose Map 不支持
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // 是否启用
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // 是否系统内置角色（系统内置角色不能删除，但可以禁用）
  isSystem: {
    type: Boolean,
    default: false
  },
  // 是否可用于项目成员角色
  canBeProjectMember: {
    type: Boolean,
    default: true
  },
  // 是否可用于KPI记录角色
  canBeKpiRole: {
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
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// 更新时自动更新 updatedAt
roleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// 索引优化
roleSchema.index({ code: 1, isActive: 1 });
roleSchema.index({ priority: -1, isActive: 1 });

// 静态方法：获取所有启用的角色
roleSchema.statics.getActiveRoles = async function() {
  return this.find({ isActive: true }).sort({ priority: -1 });
};

// 静态方法：根据代码获取角色
roleSchema.statics.getByCode = async function(code) {
  return this.findOne({ code, isActive: true });
};

// 静态方法：获取权限配置（用于兼容旧的 permissions.js）
roleSchema.statics.getPermissionsMap = async function() {
  const roles = await this.find({ isActive: true });
  const permissionsMap = {};
  roles.forEach(role => {
    permissionsMap[role.code] = {};
    role.permissions.forEach((value, key) => {
      permissionsMap[role.code][key] = value;
    });
  });
  return permissionsMap;
};

// 静态方法：获取角色优先级映射
roleSchema.statics.getPriorityMap = async function() {
  const roles = await this.find({ isActive: true });
  const priorityMap = {};
  roles.forEach(role => {
    priorityMap[role.code] = role.priority;
  });
  return priorityMap;
};

// 静态方法：获取角色名称映射
roleSchema.statics.getNameMap = async function() {
  const roles = await this.find({ isActive: true });
  const nameMap = {};
  roles.forEach(role => {
    nameMap[role.code] = role.name;
  });
  return nameMap;
};

module.exports = mongoose.model('Role', roleSchema);

