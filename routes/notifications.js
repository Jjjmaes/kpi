const express = require('express');
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// 认证
router.use(authenticate);

// 获取当前用户通知列表
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('[Notifications] list error', error);
    res.status(500).json({ success: false, message: '获取通知失败' });
  }
});

// 获取未读数量
router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('[Notifications] unread count error', error);
    res.status(500).json({ success: false, message: '获取未读数量失败' });
  }
});

// 标记单条已读
router.post('/:id/read', async (req, res) => {
  try {
    const updated = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: '通知不存在' });
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('[Notifications] mark read error', error);
    res.status(500).json({ success: false, message: '标记通知失败' });
  }
});

// 全部标记为已读
router.post('/read-all', async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] mark all read error', error);
    res.status(500).json({ success: false, message: '批量标记失败' });
  }
});

module.exports = router;


