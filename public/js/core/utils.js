import { state } from './state.js';
import { PERMISSIONS, ROLE_NAMES } from './config.js';

// Toast 提示
export function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    void toast.offsetWidth; // 强制回流
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

// Alert 提示
export function showAlert(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    element.insertBefore(alertDiv, element.firstChild);
    setTimeout(() => alertDiv.remove(), 3000);
}

// 权限检查
export function hasPermission(permission) {
    if (!state.currentRole || !PERMISSIONS[state.currentRole]) return false;
    const permValue = PERMISSIONS[state.currentRole][permission];
    return permValue !== undefined && permValue !== false;
}

// 获取权限值（可能返回 'all', 'self', true, false 等）
export function getPermission(permission) {
    if (!state.currentRole || !PERMISSIONS[state.currentRole]) return false;
    return PERMISSIONS[state.currentRole][permission] || false;
}

export function getRoleText(role) {
    return ROLE_NAMES[role] || role;
}

export function getStatusText(status) {
    const map = {
        pending: '待开始',
        in_progress: '进行中',
        scheduled: '待安排',
        translation_done: '翻译完成',
        review_done: '审校完成',
        layout_done: '排版完成',
        completed: '已交付',
        cancelled: '已取消'
    };
    return map[status] || status;
}

export function getStatusBadgeClass(status) {
    const map = {
        pending: 'badge-warning',
        in_progress: 'badge-info',
        scheduled: 'badge-primary',
        cancelled: 'badge-danger'
    };
    return map[status] || 'badge-success'; // 默认成功色
}

export function getBusinessTypeText(type) {
    const map = {
        translation: '笔译',
        interpretation: '口译',
        transcription: '转录',
        localization: '本地化',
        other: '其他'
    };
    return map[type] || type;
}

