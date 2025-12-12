const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const LanguagePair = require('../models/LanguagePair');

router.use(authenticate);

// 列表
router.get('/', async (req, res) => {
  try {
    const { active } = req.query;
    const query = {};
    if (active === 'true') query.isActive = true;
    const list = await LanguagePair.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 创建
router.post('/', authorize('admin', 'pm', 'sales'), async (req, res) => {
  try {
    const { name, source, target, direction } = req.body;
    if (!name || !source || !target) {
      return res.status(400).json({ success: false, message: '名称、源语言、目标语言必填' });
    }
    const lp = await LanguagePair.create({ name, source, target, direction });
    res.json({ success: true, data: lp });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新
router.put('/:id', authorize('admin', 'pm', 'sales'), async (req, res) => {
  try {
    const lp = await LanguagePair.findById(req.params.id);
    if (!lp) return res.status(404).json({ success: false, message: '语言对不存在' });
    ['name', 'source', 'target', 'direction', 'isActive'].forEach(f => {
      if (req.body[f] !== undefined) lp[f] = req.body[f];
    });
    await lp.save();
    res.json({ success: true, data: lp });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    await LanguagePair.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;



























