const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Language = require('../models/Language');

router.use(authenticate);

// 列表
router.get('/', async (req, res) => {
  try {
    const { active } = req.query;
    const query = {};
    if (active === 'true') query.isActive = true;
    const list = await Language.find(query).sort({ name: 1 });
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 创建
router.post('/', authorize('admin', 'pm', 'sales'), async (req, res) => {
  try {
    const { name, code, nativeName } = req.body;
    if (!name || !code) {
      return res.status(400).json({ success: false, message: '名称和代码必填' });
    }
    const lang = await Language.create({ name, code, nativeName });
    res.json({ success: true, data: lang });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: '语种名称或代码已存在' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新
router.put('/:id', authorize('admin', 'pm', 'sales'), async (req, res) => {
  try {
    const lang = await Language.findById(req.params.id);
    if (!lang) return res.status(404).json({ success: false, message: '语种不存在' });
    ['name', 'code', 'nativeName', 'isActive'].forEach(f => {
      if (req.body[f] !== undefined) lang[f] = req.body[f];
    });
    await lang.save();
    res.json({ success: true, data: lang });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: '语种名称或代码已存在' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    await Language.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;




