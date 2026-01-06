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
  // 选中的联系人ID（关联到Customer.contacts数组中的索引）
  contactId: {
    type: Number,
    default: null
  },
  // 联系人信息（冗余字段，便于查询和显示）
  contactInfo: {
    name: String,
    phone: String,
    email: String,
    position: String
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
  // 源语种（源语言）
  sourceLanguage: {
    type: String,
    required: true,
    trim: true
  },
  // 目标语言列表（支持一对多）
  targetLanguages: [{
    type: String,
    required: true,
    trim: true
  }],
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
    pureTranslationDelivery: { type: Boolean, default: false }, // 纯译文交付
    bilingualDelivery: { type: Boolean, default: false }, // 对照版交付
    printSealExpress: { type: Boolean, default: false }, // 打印盖章快递
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
    enum: [
      'pending',            // 待开始
      'in_progress',        // 进行中
      'scheduled',          // 待安排（销售已通知PM，等待PM安排翻译、审校、排版等人员）
      'translation_done',   // 翻译完成
      'review_done',        // 审校完成
      'layout_done',        // 排版完成
      'completed',          // 已完成
      'cancelled'           // 已取消
    ],
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
  // 成员确认状态追踪
  memberAcceptance: {
    // 是否需要成员确认（生产人员需要，PM/销售不需要）
    requiresConfirmation: {
      type: Boolean,
      default: false
    },
    // 待确认成员数量
    pendingCount: {
      type: Number,
      default: 0,
      min: 0
    },
    // 已接受成员数量
    acceptedCount: {
      type: Number,
      default: 0,
      min: 0
    },
    // 已拒绝成员数量
    rejectedCount: {
      type: Number,
      default: 0,
      min: 0
    },
    // 所有成员是否都已确认（接受或拒绝）
    allConfirmed: {
      type: Boolean,
      default: false
    }
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
  // 报价明细（精确记录每个文件×语种的明细）
  quotationDetails: [{
    filename: {
      type: String,
      required: true,
      trim: true
    },
    sourceLanguage: {
      type: String,
      required: true,
      trim: true
    },
    targetLanguage: {
      type: String,
      required: true,
      trim: true
    },
    wordCount: {
      type: Number,
      required: true,
      min: 0
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    fileType: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    }
  }],
  // 项目证明文件（可选，用于财务）
  proofFiles: [{
    filename: String,
    url: String,
    uploadedAt: Date
  }],
  // 产能记录（支持所有生产角色提交的工作量）
  capacityRecords: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      required: true,
      trim: true
      // 移除enum限制，允许动态角色
      // 验证逻辑在业务层处理（检查角色是否允许记录产能）
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
    receivedAmount: { type: Number, default: 0 }, // 已收到回款金额
    remainingAmount: { type: Number, default: 0 }, // 剩余应收金额（自动计算）
    receivedAt: Date, // 最近一次回款日期
    expectedAt: Date, // 合同约定回款日期
    isFullyPaid: { type: Boolean, default: false }, // 是否已全额回款
    paymentStatus: { // 回款状态
      type: String,
      enum: ['unpaid', 'partially_paid', 'paid'],
      default: 'unpaid'
    }
  },
  // 客户经理相关字段
  partTimeSales: {
    isPartTime: { type: Boolean, default: false }, // 是否为客户经理项目
    companyReceivable: { type: Number, default: 0 }, // 公司应收金额（含税）
    taxRate: { type: Number, default: 0, min: 0, max: 1 }, // 税率（0-1之间，如0.1表示10%）
    partTimeSalesCommission: { type: Number, default: 0 } // 客户经理佣金（税后部分，自动计算）
  },
  // 兼职排版相关字段
  partTimeLayout: {
    isPartTime: { type: Boolean, default: false }, // 是否为兼职排版项目
    layoutCost: { type: Number, default: 0, min: 0 }, // 排版费用
    layoutAssignedTo: { // 排版员ID
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    layoutCostPercentage: { type: Number, default: 0 } // 排版费占总金额的百分比（自动计算）
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

// 计算客户经理佣金
projectSchema.methods.calculatePartTimeSalesCommission = function() {
  if (!this.partTimeSales?.isPartTime) {
    return 0;
  }
  
  const totalAmount = this.projectAmount || 0;
  const companyReceivable = this.partTimeSales.companyReceivable || 0;
  const taxRate = this.partTimeSales.taxRate || 0;
  
  // 计算应收金额（成交额 - 公司应收）
  const receivableAmount = totalAmount - companyReceivable;
  
  // 计算税后金额（应收金额 - 税费）
  const taxDeductedAmount = receivableAmount - (receivableAmount * taxRate);
  
  // 返还给销售的佣金 = 税后金额
  return Math.max(0, Math.round(taxDeductedAmount * 100) / 100);
};

// 校验排版费用
projectSchema.methods.validateLayoutCost = function(layoutCost) {
  if (!this.partTimeLayout?.isPartTime) {
    return { valid: true };
  }
  
  const projectAmount = this.projectAmount || 0;
  if (projectAmount <= 0) {
    return { valid: false, message: '项目总金额必须大于0' };
  }
  
  const percentage = (layoutCost / projectAmount) * 100;
  
  if (percentage > 5) {
    return {
      valid: false,
      message: `排版费用(${layoutCost})不能超过项目总金额(${projectAmount})的5%，当前占比为${percentage.toFixed(2)}%`
    };
  }
  
  return { valid: true, percentage: Math.round(percentage * 100) / 100 };
};

// 更新完成系数和自动计算字段
projectSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // 自动计算剩余应收金额和回款状态
  if (this.payment && this.projectAmount !== undefined) {
    const receivedAmount = this.payment.receivedAmount || 0;
    const projectAmount = this.projectAmount || 0;
    this.payment.remainingAmount = Math.max(0, projectAmount - receivedAmount);
    
    // 自动计算回款状态
    if (receivedAmount >= projectAmount && projectAmount > 0) {
      this.payment.paymentStatus = 'paid';
      this.payment.isFullyPaid = true;
    } else if (receivedAmount > 0) {
      this.payment.paymentStatus = 'partially_paid';
      this.payment.isFullyPaid = false;
    } else {
      this.payment.paymentStatus = 'unpaid';
      this.payment.isFullyPaid = false;
    }
  }
  
  // 自动计算客户经理佣金
  if (this.partTimeSales?.isPartTime) {
    this.partTimeSales.partTimeSalesCommission = this.calculatePartTimeSalesCommission();
  }
  
  // 自动计算排版费用百分比
  if (this.partTimeLayout?.isPartTime && this.partTimeLayout.layoutCost && this.projectAmount) {
    this.partTimeLayout.layoutCostPercentage = Math.round(
      (this.partTimeLayout.layoutCost / this.projectAmount) * 100 * 100
    ) / 100;
  }
  
  next();
});

// 添加索引优化查询性能
// 按创建者查询（销售查看自己的项目）
projectSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
// 按状态和完成时间查询（用于Dashboard统计）
projectSchema.index({ status: 1, completedAt: -1 });
// 按状态和交付时间查询（用于"今日待交付"查询）
projectSchema.index({ status: 1, deadline: 1 });
// 按月份查询（用于月度KPI生成）
projectSchema.index({ status: 1, completedAt: 1 });
// 客户索引（用于按客户查询）
projectSchema.index({ customerId: 1 });

module.exports = mongoose.model('Project', projectSchema);

