const mongoose = require('mongoose');

const expressRequestSchema = new mongoose.Schema({
  // 申请编号（自动生成，如 EXP20250115001）
  requestNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    index: true
  },
  
  // 收件人信息
  recipient: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    province: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    district: {
      type: String,
      trim: true
    },
    postalCode: {
      type: String,
      trim: true
    }
  },
  
  // 邮寄内容
  content: {
    type: {
      type: String,
      enum: ['promotion', 'document', 'sample', 'other'],
      required: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      min: 1,
      default: 1
    },
    weight: {
      type: Number,
      min: 0
    },
    estimatedValue: {
      type: Number,
      min: 0
    }
  },
  
  // 快递信息（综合岗填写）
  express: {
    company: {
      type: String,
      trim: true
    },
    trackingNumber: {
      type: String,
      trim: true
    },
    cost: {
      type: Number,
      min: 0
    },
    sentAt: {
      type: Date
    }
  },
  
  // 申请状态
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'cancelled'],
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
  
  // 处理人（综合岗）
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // 处理时间
  processedAt: {
    type: Date
  },
  
  // 备注
  note: {
    type: String,
    trim: true
  },
  
  // 取消原因（仅当status为cancelled时）
  cancelReason: {
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
expressRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// 索引优化
expressRequestSchema.index({ status: 1, createdAt: -1 });
expressRequestSchema.index({ createdBy: 1, status: 1 });
expressRequestSchema.index({ 'express.trackingNumber': 1 });
expressRequestSchema.index({ 'recipient.phone': 1 });

module.exports = mongoose.model('ExpressRequest', expressRequestSchema);


