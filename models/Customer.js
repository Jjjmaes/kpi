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
  // 联系人
  contactPerson: {
    type: String,
    trim: true
  },
  // 联系电话
  phone: {
    type: String,
    trim: true
  },
  // 邮箱
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


















