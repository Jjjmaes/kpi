const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const KpiConfig = require('../models/KpiConfig');

// 所有配置路由需要管理员权限
router.use(authenticate);
router.use(authorize('admin'));

// 获取当前KPI配置
router.get('/', async (req, res) => {
  try {
    const config = await KpiConfig.getActiveConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 更新KPI配置
router.post('/update', async (req, res) => {
  try {
    const {
      translator_ratio_mtpe,
      translator_ratio_deepedit,
      reviewer_ratio,
      pm_ratio,
      sales_bonus_ratio,
      sales_commission_ratio,
      admin_ratio,
      completion_factor,
      reason
    } = req.body;

    // 获取当前配置
    const currentConfig = await KpiConfig.getActiveConfig();
    
    // 保存旧值
    const oldValues = {
      translator_ratio_mtpe: currentConfig.translator_ratio_mtpe,
      translator_ratio_deepedit: currentConfig.translator_ratio_deepedit,
      reviewer_ratio: currentConfig.reviewer_ratio,
      pm_ratio: currentConfig.pm_ratio,
      sales_bonus_ratio: currentConfig.sales_bonus_ratio,
      sales_commission_ratio: currentConfig.sales_commission_ratio,
      admin_ratio: currentConfig.admin_ratio,
      completion_factor: currentConfig.completion_factor
    };

    // 更新配置
    if (translator_ratio_mtpe !== undefined) currentConfig.translator_ratio_mtpe = translator_ratio_mtpe;
    if (translator_ratio_deepedit !== undefined) currentConfig.translator_ratio_deepedit = translator_ratio_deepedit;
    if (reviewer_ratio !== undefined) currentConfig.reviewer_ratio = reviewer_ratio;
    if (pm_ratio !== undefined) currentConfig.pm_ratio = pm_ratio;
    if (sales_bonus_ratio !== undefined) currentConfig.sales_bonus_ratio = sales_bonus_ratio;
    if (sales_commission_ratio !== undefined) currentConfig.sales_commission_ratio = sales_commission_ratio;
    if (admin_ratio !== undefined) currentConfig.admin_ratio = admin_ratio;
    if (completion_factor !== undefined) currentConfig.completion_factor = completion_factor;

    currentConfig.version += 1;
    currentConfig.updatedAt = Date.now();

    // 记录变更历史
    currentConfig.changeHistory.push({
      changedBy: req.user._id,
      changedAt: Date.now(),
      oldValues,
      newValues: {
        translator_ratio_mtpe: currentConfig.translator_ratio_mtpe,
        translator_ratio_deepedit: currentConfig.translator_ratio_deepedit,
        reviewer_ratio: currentConfig.reviewer_ratio,
        pm_ratio: currentConfig.pm_ratio,
        sales_bonus_ratio: currentConfig.sales_bonus_ratio,
        sales_commission_ratio: currentConfig.sales_commission_ratio,
        admin_ratio: currentConfig.admin_ratio,
        completion_factor: currentConfig.completion_factor
      },
      reason: reason || '未提供原因'
    });

    await currentConfig.save();

    res.json({
      success: true,
      message: '配置更新成功',
      data: currentConfig
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 获取配置变更历史
router.get('/history', async (req, res) => {
  try {
    const config = await KpiConfig.getActiveConfig();
    const history = config.changeHistory || [];
    
    // 填充变更人信息
    const User = require('../models/User');
    const historyWithUsers = await Promise.all(
      history.map(async (item) => {
        const user = await User.findById(item.changedBy).select('name username');
        return {
          ...item.toObject(),
          changedByUser: user
        };
      })
    );

    res.json({
      success: true,
      data: historyWithUsers.reverse() // 最新的在前
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;








