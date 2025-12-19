const mongoose = require('mongoose');

const invoiceRequestSchema = new mongoose.Schema({
  // 关联的项目ID列表（支持多项目申请）
  projects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  }],
  // 客户ID（从第一个项目获取，便于查询）
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  // 申请开票金额
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  // 发票类型
  invoiceType: {
    type: String,
    enum: ['vat', 'normal', 'other'],
    default: 'vat',
    required: true
  },
  // 开票信息
  invoiceInfo: {
    // 发票抬头
    title: {
      type: String,
      required: true,
      trim: true
    },
    // 税号
    taxNumber: {
      type: String,
      trim: true
    },
    // 地址
    address: {
      type: String,
      trim: true
    },
    // 电话
    phone: {
      type: String,
      trim: true
    },
    // 开户银行
    bank: {
      type: String,
      trim: true
    },
    // 银行账号
    bankAccount: {
      type: String,
      trim: true
    }
  },
  // 申请状态
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  // 拒绝原因（仅当status为rejected时）
  rejectReason: {
    type: String,
    trim: true
  },
  // 申请人（销售/兼职销售）
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // 审批人（财务）
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // 审批时间
  approvedAt: {
    type: Date
  },
  // 关联的发票ID（审批通过后创建发票时关联）
  linkedInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  // 备注
  note: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 更新时自动更新updatedAt
invoiceRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// 索引
invoiceRequestSchema.index({ status: 1, createdAt: -1 });
invoiceRequestSchema.index({ createdBy: 1, status: 1 });
invoiceRequestSchema.index({ customerId: 1 });

module.exports = mongoose.model('InvoiceRequest', invoiceRequestSchema);



