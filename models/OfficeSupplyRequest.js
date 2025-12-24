const mongoose = require('mongoose');

const officeSupplyRequestSchema = new mongoose.Schema({
  // 申请编号（自动生成，如 OSP20250115001）
  requestNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    index: true
  },
  
  // 采购物品列表
  items: [{
    name: { type: String, required: true, trim: true },        // 物品名称
    specification: { type: String, trim: true },               // 规格型号
    quantity: { type: Number, required: true, min: 1 },        // 数量
    unit: { type: String, trim: true, default: '件' },         // 单位（件/个/套等）
    unitPrice: { type: Number, min: 0 },                       // 单价（元）
    totalPrice: { type: Number, min: 0 },                      // 小计（元）
    brand: { type: String, trim: true },                        // 品牌（可选）
    supplier: { type: String, trim: true },                     // 供应商（可选）
    note: { type: String, trim: true }                          // 备注
  }],
  
  // 总金额
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // 申请用途/说明
  purpose: {
    type: String,
    required: true,
    trim: true
  },
  
  // 紧急程度
  urgency: {
    type: String,
    enum: ['normal', 'urgent', 'very_urgent'],
    default: 'normal'
  },
  
  // 申请状态
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'purchased', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // 申请人（行政综合岗）
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // 审批人（财务岗）
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
  
  // 采购信息（行政填写）
  purchase: {
    supplier: { type: String, trim: true },                     // 供应商
    purchaseDate: { type: Date },                               // 采购日期
    invoiceNumber: { type: String, trim: true },                // 发票号
    actualAmount: { type: Number, min: 0 },                     // 实际金额
    note: { type: String, trim: true }                          // 采购备注
  },
  
  // 备注
  note: { type: String, trim: true },
  
  // 取消原因
  cancelReason: { type: String, trim: true },
  
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// 更新时自动更新updatedAt
officeSupplyRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// 索引优化
officeSupplyRequestSchema.index({ status: 1, createdAt: -1 });
officeSupplyRequestSchema.index({ createdBy: 1, status: 1 });
officeSupplyRequestSchema.index({ approvedBy: 1, status: 1 });
officeSupplyRequestSchema.index({ requestNumber: 1 });

module.exports = mongoose.model('OfficeSupplyRequest', officeSupplyRequestSchema);


