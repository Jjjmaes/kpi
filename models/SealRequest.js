const mongoose = require('mongoose');

const sealRequestSchema = new mongoose.Schema({
  // 申请编号（自动生成，如 SEAL20250115001）
  requestNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    index: true
  },
  
  // 章证类型
  sealType: {
    type: String,
    enum: ['公章', '合同章', '法人章', '财务章', '营业执照及复印件'],
    required: true,
    index: true
  },
  
  // 使用用途
  purpose: {
    type: String,
    required: true,
    trim: true
  },
  
  // 使用日期
  useDate: {
    type: Date,
    required: true
  },
  
  // 预计归还日期
  expectedReturnDate: {
    type: Date
  },
  
  // 申请状态
  status: {
    type: String,
    enum: ['pending', 'processing', 'returned', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // 申请人
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // 操作人（行政综合岗）
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // 使用开始时间
  useStartAt: { type: Date },
  
  // 归还时间
  returnedAt: { type: Date },
  
  // 备注
  note: { type: String, trim: true },
  
  // 取消原因
  cancelReason: { type: String, trim: true },
  
  // 归还备注
  returnNote: { type: String, trim: true },
  
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// 更新时自动更新updatedAt
sealRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// 索引优化
sealRequestSchema.index({ status: 1, createdAt: -1 });
sealRequestSchema.index({ createdBy: 1, status: 1 });
sealRequestSchema.index({ processedBy: 1, status: 1 });
sealRequestSchema.index({ sealType: 1, status: 1 });
sealRequestSchema.index({ useDate: 1 });
sealRequestSchema.index({ requestNumber: 1 });

module.exports = mongoose.model('SealRequest', sealRequestSchema);


