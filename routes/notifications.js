const express = require('express');
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const { createNotificationIfNotExists, NotificationTypes } = require('../services/notificationService');

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

// 看板预警同步为通知（去重：项目+类型+当天）
router.post('/sync-warnings', async (req, res) => {
  try {
    const { paymentWarnings = [], paymentDueSoon = [], deliveryWarnings = [] } = req.body || {};

    // 汇总需要处理的项目ID
    const warningItems = [
      ...paymentWarnings.map(w => ({ ...w, _type: NotificationTypes.PAYMENT_OVERDUE })),
      ...paymentDueSoon.map(w => ({ ...w, _type: NotificationTypes.PAYMENT_DUE_SOON })),
      ...deliveryWarnings.map(w => ({ ...w, _type: NotificationTypes.DELIVERY_OVERDUE }))
    ].filter(w => w.projectId);

    const projectIds = [...new Set(warningItems.map(w => w.projectId))];
    if (projectIds.length === 0) {
      return res.json({ success: true, data: { created: 0, skipped: 0 } });
    }

    // 查询项目的销售和PM
    const projects = await Project.find({ _id: { $in: projectIds } }).select('_id projectName createdBy');
    const projectMap = {};
    projects.forEach(p => { projectMap[p._id.toString()] = p; });

    const pmMembers = await ProjectMember.find({ projectId: { $in: projectIds }, role: 'pm' }).select('projectId userId');
    const pmMap = {};
    pmMembers.forEach(m => {
      const pid = m.projectId.toString();
      if (!pmMap[pid]) pmMap[pid] = new Set();
      pmMap[pid].add(m.userId.toString());
    });

    let created = 0;
    let skipped = 0;

    for (const item of warningItems) {
      const pid = item.projectId.toString();
      const project = projectMap[pid];
      if (!project) {
        skipped += 1;
        continue;
      }

      const targets = new Set();
      if (project.createdBy) targets.add(project.createdBy.toString());
      if (pmMap[pid]) {
        pmMap[pid].forEach(uid => targets.add(uid));
      }
      if (targets.size === 0) {
        skipped += 1;
        continue;
      }

      // 组装文案
      const link = `/projects/${pid}`;
      let message = '';
      if (item._type === NotificationTypes.PAYMENT_OVERDUE) {
        message = `项目「${project.projectName}」回款已逾期 ${item.daysOverdue || 0} 天，约定回款日 ${item.expectedAt ? new Date(item.expectedAt).toLocaleDateString() : ''}`;
      } else if (item._type === NotificationTypes.PAYMENT_DUE_SOON) {
        message = `项目「${project.projectName}」回款将在 ${item.daysLeft || 0} 天内到期，约定回款日 ${item.expectedAt ? new Date(item.expectedAt).toLocaleDateString() : ''}`;
      } else if (item._type === NotificationTypes.DELIVERY_OVERDUE) {
        message = `项目「${project.projectName}」交付已逾期 ${item.daysOverdue || 0} 天，截止 ${item.deadline ? new Date(item.deadline).toLocaleDateString() : ''}`;
      } else {
        message = `项目「${project.projectName}」存在预警`;
      }

      for (const userId of targets) {
        const { created: createdNow } = await createNotificationIfNotExists({
          userId,
          type: item._type,
          message,
          link,
          projectId: pid
        });
        if (createdNow) {
          created += 1;
        } else {
          skipped += 1;
        }
      }
    }

    res.json({ success: true, data: { created, skipped } });
  } catch (error) {
    console.error('[Notifications] sync warnings error', error);
    res.status(500).json({ success: false, message: '同步预警通知失败' });
  }
});

module.exports = router;


