const mongoose = require('mongoose');

const languagePairSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  source: {
    type: String,
    required: true,
    trim: true
  },
  target: {
    type: String,
    required: true,
    trim: true
  },
  direction: {
    type: String,
    enum: ['one_to_one', 'one_to_many', 'many_to_one'],
    default: 'one_to_one'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 自动生成名称：源-目标
languagePairSchema.pre('save', function(next) {
  if (!this.name) {
    this.name = `${this.source}-${this.target}`;
  }
  next();
});

module.exports = mongoose.model('LanguagePair', languagePairSchema);


