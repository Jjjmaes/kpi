const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, default: 'general' },
  // 可选：关联的项目，用于预警去重
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  message: { type: String, required: true },
  link: { type: String },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', NotificationSchema);


