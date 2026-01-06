const mongoose = require('mongoose');

const paymentRecordSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  receivedAt: {
    type: Date,
    required: true
  },
  method: {
    type: String,
    enum: ['bank', 'cash', 'alipay', 'wechat', 'other'],
    default: 'bank'
  },
  // 收款人（现金/支付宝/微信需填写），需为项目成员，且角色为销售/客户经理/财务
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reference: String, // 凭证号/备注
  invoiceNumber: String, // 关联的发票号（如果有）
  note: String,
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // 收款确认流程相关字段
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'approved'],
    default: 'pending', // 待确认
    index: true
  },
  // 发起人（销售/客户经理）
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // 确认人（收款人/现金保管员）
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // 确认时间
  confirmedAt: {
    type: Date
  },
  // 确认备注
  confirmNote: {
    type: String
  },
  // 财务是否已检查
  financeReviewed: {
    type: Boolean,
    default: false
  },
  // 财务检查人
  financeReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // 财务检查时间
  financeReviewedAt: {
    type: Date
  },
  // 财务检查备注
  financeReviewNote: {
    type: String
  }
});

module.exports = mongoose.model('PaymentRecord', paymentRecordSchema);



