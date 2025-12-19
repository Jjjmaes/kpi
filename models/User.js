const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  roles: [{
    type: String,
    required: true,
    // 移除硬编码的 enum，改为在保存时验证角色是否存在
    // 验证逻辑在 userService 中处理
  }],
  // 专/兼职标记：full_time / part_time
  employmentType: {
    type: String,
    enum: ['full_time', 'part_time'],
    default: 'full_time'
  },
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
  },
  passwordMustChange: {
    type: Boolean,
    default: true
  },
  passwordUpdatedAt: {
    type: Date
  }
});

// 密码加密
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// 密码验证方法
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);















