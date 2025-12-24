const mongoose = require('mongoose');

const expenseRequestSchema = new mongoose.Schema({
  // 申请编号（自动生成，如 EXP20250115001）
  requestNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    index: true
  },
  
  // 费用类型
  expenseType: {
    type: String,
    enum: ['travel', 'meal', 'transport', 'office_supply', 'communication', 'other'],
    required: true,
    index: true
  },
  
  // 费用明细列表
  items: [{
    date: { type: Date, required: true },              // 费用日期
    amount: { type: Number, required: true, min: 0 },  // 金额
    description: { type: String, required: true, trim: true }, // 费用说明
    invoice: { type: String, trim: true },             // 发票号（可选）
    attachments: [{ type: String }]                    // 附件URL（发票照片等）
  }],
  
  // 总金额
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // 申请说明
  reason: {
    type: String,
    required: true,
    trim: true
  },
  
  // 申请状态
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'paid', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // 申请人（专职人员）
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // 审批人（财务/管理员）
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // 审批时间
  approvedAt: { type: Date },
  
  // 审批意见
  approvalNote: { type: String, trim: true },
  
  // 拒绝原因
  rejectReason: { type: String, trim: true },
  
  // 支付信息（财务填写）
  payment: {
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // 支付人
    paidAt: { type: Date },                                         // 支付时间
    paymentMethod: { type: String, trim: true },                    // 支付方式
    note: { type: String, trim: true }                              // 支付备注
  },
  
  // 备注
  note: { type: String, trim: true },
  
  // 取消原因
  cancelReason: { type: String, trim: true },
  
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// 更新时自动更新updatedAt
expenseRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// 索引优化
expenseRequestSchema.index({ status: 1, createdAt: -1 });
expenseRequestSchema.index({ createdBy: 1, status: 1 });
expenseRequestSchema.index({ approvedBy: 1, status: 1 });
expenseRequestSchema.index({ expenseType: 1, createdAt: -1 });
expenseRequestSchema.index({ requestNumber: 1 });

module.exports = mongoose.model('ExpenseRequest', expenseRequestSchema);


