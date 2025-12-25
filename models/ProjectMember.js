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
    type: String, // 允许动态角色代码
    required: true
  },
  // 专/兼职快照：在添加成员时从用户带入，便于历史追溯
  employmentType: {
    type: String,
    enum: ['full_time', 'part_time'],
    default: 'full_time'
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
  // 兼职费用：目前用于兼职翻译等按金额结算的角色
  partTimeFee: {
    type: Number,
    default: 0,
    min: 0
  },
  // 锁定的系数（从项目locked_ratios复制）
  ratio_locked: {
    type: Number,
    required: true
  },
  // 成员接受状态
  acceptanceStatus: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'accepted', // 历史数据兼容：默认为 accepted
    required: true
  },
  // 接受/拒绝时间
  acceptanceAt: {
    type: Date,
    default: null
  },
  // 拒绝原因（可选）
  rejectionReason: {
    type: String,
    maxlength: 500,
    default: null
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















