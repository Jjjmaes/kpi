const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  // 客户名称
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  // 客户简称
  shortName: {
    type: String,
    trim: true
  },
  // 联系人列表（支持多个联系人）
  contacts: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    position: {
      type: String,
      trim: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  // 兼容旧数据：保留单个联系人字段（已废弃，仅用于向后兼容）
  contactPerson: {
    type: String,
    trim: true
  },
  // 兼容旧数据：保留单个电话字段（已废弃，仅用于向后兼容）
  phone: {
    type: String,
    trim: true
  },
  // 兼容旧数据：保留单个邮箱字段（已废弃，仅用于向后兼容）
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  // 地址
  address: {
    type: String,
    trim: true
  },
  // 备注
  notes: {
    type: String,
    trim: true
  },
  // 创建人
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 是否激活
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

// 更新时自动更新updatedAt
customerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// 索引
customerSchema.index({ name: 1 });
customerSchema.index({ isActive: 1 });

module.exports = mongoose.model('Customer', customerSchema);






















































