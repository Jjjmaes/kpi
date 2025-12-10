const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');

// 所有审计日志路由需要认证
router.use(authenticate);

// 记录角色切换
router.post('/role-switch', async (req, res) => {
  try {
    const { fromRole, toRole } = req.body;
    
    const auditLog = await AuditLog.create({
      userId: req.user._id,
      action: 'role_switch',
      details: {
        fromRole,
        toRole,
        timestamp: new Date()
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: auditLog
    });
  } catch (error) {
    console.error('记录角色切换审计日志失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取审计日志（仅管理员）
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const { action, userId, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (action) query.action = action;
    if (userId) query.userId = userId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const logs = await AuditLog.find(query)
      .populate('userId', 'name username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AuditLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        logs,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;

