const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  // 项目编号（自动生成或手动输入）
  projectNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    index: true
  },
  // 基本信息
  projectName: {
    type: String,
    required: true,
    trim: true
  },
  // 客户ID（关联到Customer表）
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  // 客户名称（冗余字段，便于查询）
  clientName: {
    type: String,
    required: true,
    trim: true
  },
  // 业务类型
  businessType: {
    type: String,
    enum: ['translation', 'interpretation', 'transcription', 'localization', 'other'],
    default: 'translation',
    required: true
  },
  // 项目类型（MTPE/深度编辑/审校项目）
  projectType: {
    type: String,
    enum: ['mtpe', 'deepedit', 'review', 'mixed'],
    default: 'mtpe'
  },
  // 翻译语言对（如：中英、英中、中日等）
  languagePair: {
    type: String,
    trim: true
  },
  // 字数（笔译项目）
  wordCount: {
    type: Number,
    min: 0,
    default: 0
  },
  // 单价（每千字或每小时）
  unitPrice: {
    type: Number,
    min: 0,
    default: 0
  },
  // 项目总金额
  projectAmount: {
    type: Number,
    required: true,
    min: 0
  },
  // 是否含税
  isTaxIncluded: {
    type: Boolean,
    default: false
  },
  // 是否需要发票
  needInvoice: {
    type: Boolean,
    default: false
  },
  // 特殊要求
  specialRequirements: {
    terminology: { type: Boolean, default: false }, // 术语表
    nda: { type: Boolean, default: false }, // 保密协议
    referenceFiles: { type: Boolean, default: false }, // 参考文件
    notes: String // 其他备注
  },
  // 交付时间
  deadline: {
    type: Date,
    required: true
  },
  // 实际完成时间
  completedAt: {
    type: Date
  },
  // 创建者（销售）
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 锁定的KPI系数（项目创建时锁定，不可修改）
  locked_ratios: {
    translator_mtpe: { type: Number, required: true },
    translator_deepedit: { type: Number, required: true },
    reviewer: { type: Number, required: true },
    pm: { type: Number, required: true },
    sales_bonus: { type: Number, required: true },
    sales_commission: { type: Number, required: true },
    admin: { type: Number, required: true },
    completion_factor: { type: Number, required: true, default: 1.0 }
  },
  // 项目状态
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  // 项目开始时间（PM确认进入执行状态）
  startedAt: {
    type: Date
  },
  // 项目完成检查标记
  completionChecks: {
    hasMembers: { type: Boolean, default: false },
    hasAmount: { type: Boolean, default: false },
    hasQualityInfo: { type: Boolean, default: false },
    allCapacitySubmitted: { type: Boolean, default: false }
  },
  // 返修次数
  revisionCount: {
    type: Number,
    default: 0,
    min: 0
  },
  // 是否延期
  isDelayed: {
    type: Boolean,
    default: false
  },
  // 是否有客户投诉
  hasComplaint: {
    type: Boolean,
    default: false
  },
  // 项目文件（译文、备注、术语问题等）
  projectFiles: [{
    filename: String,
    url: String,
    fileType: {
      type: String,
      enum: ['translation', 'review', 'terminology', 'reference', 'other'],
      default: 'other'
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    notes: String
  }],
  // 项目证明文件（可选，用于财务）
  proofFiles: [{
    filename: String,
    url: String,
    uploadedAt: Date
  }],
  // 产能记录（翻译/审校提交的工作量）
  capacityRecords: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['translator', 'reviewer']
    },
    wordCount: Number, // 实际完成字数
    hours: Number, // 实际工作小时（口译/转录项目）
    submittedAt: {
      type: Date,
      default: Date.now
    },
    notes: String
  }],
  // 回款信息
  payment: {
    receivedAmount: { type: Number, default: 0 },
    receivedAt: Date,
    expectedAt: Date, // 合同约定回款日期
    isFullyPaid: { type: Boolean, default: false }
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

// 计算完成系数
projectSchema.methods.calculateCompletionFactor = function() {
  let factor = this.locked_ratios.completion_factor;
  
  // 返修影响（每次返修减少5%）
  if (this.revisionCount > 0) {
    factor = factor * (1 - this.revisionCount * 0.05);
  }
  
  // 延期影响（减少10%）
  if (this.isDelayed) {
    factor = factor * 0.9;
  }
  
  // 客户投诉影响（减少20%）
  if (this.hasComplaint) {
    factor = factor * 0.8;
  }
  
  // 确保不低于0
  return Math.max(0, factor);
};

// 更新完成系数
projectSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Project', projectSchema);

