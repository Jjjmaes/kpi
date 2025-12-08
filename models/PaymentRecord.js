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
  reference: String,
  note: String,
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PaymentRecord', paymentRecordSchema);



