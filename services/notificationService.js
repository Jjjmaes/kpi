const Notification = require('../models/Notification');

/**
 * 创建通知
 * @param {Object} params - 通知参数
 * @param {String} params.userId - 用户ID
 * @param {String} params.type - 通知类型
 * @param {String} params.message - 通知消息
 * @param {String} params.link - 跳转链接（可选）
 */
async function createNotification({ userId, type = 'general', message, link = null }) {
  try {
    const notification = await Notification.create({
      user: userId,
      type,
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
async function createNotificationsForUsers(userIds, type, message, link = null) {
  try {
    const notifications = userIds.map(userId => ({
      user: userId,
      type,
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
  PROJECT_STATUS_CHANGED: 'project_status_changed', // 项目状态变更
  PROJECT_COMPLETED: 'project_completed',     // 项目完成
  KPI_GENERATED: 'kpi_generated',            // KPI生成
  KPI_REVIEWED: 'kpi_reviewed',              // KPI审核
  PAYMENT_RECEIVED: 'payment_received',      // 回款到账
  PROJECT_DELAYED: 'project_delayed',        // 项目延期
  PROJECT_REVISION: 'project_revision'       // 项目返修
};

module.exports = {
  createNotification,
  createNotificationsForUsers,
  NotificationTypes
};

