const mongoose = require('mongoose');

const projectMemberSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['translator', 'reviewer', 'pm', 'sales', 'admin_staff', 'part_time_sales', 'layout'],
    required: true
  },
  // 翻译类型（仅翻译角色需要）
  translatorType: {
    type: String,
    enum: ['mtpe', 'deepedit'],
    default: 'mtpe'
  },
  // 字数占比（仅翻译角色需要，多个翻译时使用）
  wordRatio: {
    type: Number,
    default: 1.0,
    min: 0,
    max: 1
  },
  // 锁定的系数（从项目locked_ratios复制）
  ratio_locked: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 复合索引：确保同一项目同一用户同一角色只能有一条记录
projectMemberSchema.index({ projectId: 1, userId: 1, role: 1 }, { unique: true });
// 优化查询性能：按用户ID查询项目
projectMemberSchema.index({ userId: 1, projectId: 1 });
// 优化查询性能：按项目ID查询成员
projectMemberSchema.index({ projectId: 1 });

module.exports = mongoose.model('ProjectMember', projectMemberSchema);















