const Notification = require('../models/Notification');

/**
 * 创建通知
 * @param {Object} params - 通知参数
 * @param {String} params.userId - 用户ID
 * @param {String} params.type - 通知类型
 * @param {String} params.message - 通知消息
 * @param {String} params.link - 跳转链接（可选）
 */
async function createNotification({ userId, type = 'general', message, link = null, projectId = null }) {
  try {
    const notification = await Notification.create({
      user: userId,
      type,
      projectId,
      message,
      link,
      read: false
    });
    return notification;
  } catch (error) {
    console.error('[NotificationService] 创建通知失败:', error);
    throw error;
  }
}

/**
 * 批量创建通知（给多个用户）
 * @param {Array} userIds - 用户ID数组
 * @param {String} type - 通知类型
 * @param {String} message - 通知消息
 * @param {String} link - 跳转链接（可选）
 */
async function createNotificationsForUsers(userIds, type, message, link = null, projectId = null) {
  try {
    const notifications = userIds.map(userId => ({
      user: userId,
      type,
      projectId,
      message,
      link,
      read: false
    }));
    
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (error) {
    console.error('[NotificationService] 批量创建通知失败:', error);
    throw error;
  }
}

/**
 * 项目相关通知
 */
const NotificationTypes = {
  PROJECT_ASSIGNED: 'project_assigned',      // 项目分配
  PROJECT_MEMBER_REMOVED: 'project_member_removed', // 项目成员移除
  PROJECT_STATUS_CHANGED: 'project_status_changed', // 项目状态变更
  PROJECT_COMPLETED: 'project_completed',     // 项目完成
  KPI_GENERATED: 'kpi_generated',            // KPI生成
  KPI_REVIEWED: 'kpi_reviewed',              // KPI审核
  PAYMENT_RECEIVED: 'payment_received',      // 回款到账
  PROJECT_DELAYED: 'project_delayed',        // 项目延期
  PROJECT_REVISION: 'project_revision',      // 项目返修
  PAYMENT_OVERDUE: 'payment_overdue',        // 回款逾期
  PAYMENT_DUE_SOON: 'payment_due_soon',      // 回款即将到期
  DELIVERY_OVERDUE: 'delivery_overdue'       // 交付逾期
};

/**
 * 去重创建通知：同一用户、项目、类型在当天只创建一次
 */
async function createNotificationIfNotExists({ userId, type, message, link = null, projectId = null }) {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const exists = await Notification.findOne({
      user: userId,
      type,
      projectId,
      createdAt: { $gte: startOfDay }
    });
    if (exists) return { notification: exists, created: false };
    const notification = await createNotification({ userId, type, message, link, projectId });
    return { notification, created: true };
  } catch (error) {
    console.error('[NotificationService] 去重创建通知失败:', error);
    throw error;
  }
}

module.exports = {
  createNotification,
  createNotificationsForUsers,
  createNotificationIfNotExists,
  NotificationTypes
};

