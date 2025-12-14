import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { NOTIFICATION_POLL_INTERVAL } from '../core/config.js';

let poller = null;
let panelPoller = null;
let previousUnreadCount = -1;
let notificationAudio = null;
let notificationSoundEnabled = true;

function ensureAudio() {
    if (notificationAudio) return notificationAudio;
    // 简单提示音（可替换为实际资源）
    notificationAudio = new Audio('/audio/notification.mp3');
    notificationAudio.preload = 'auto';
    return notificationAudio;
}

function playNotificationSound() {
    if (!notificationSoundEnabled) return;
    const audio = ensureAudio();
    if (!audio) return;
    // 忽略播放失败（如未有用户交互）
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

// ================== Polling ==================
export function startNotificationPolling() {
    stopNotificationPolling();
    previousUnreadCount = -1;
    fetchUnreadCount();
    poller = setInterval(fetchUnreadCount, NOTIFICATION_POLL_INTERVAL);
}

export function stopNotificationPolling() {
    if (poller) {
        clearInterval(poller);
        poller = null;
    }
    if (panelPoller) {
        clearInterval(panelPoller);
        panelPoller = null;
    }
}

async function fetchUnreadCount() {
    if (!state.token) return;
    try {
        const res = await apiFetch('/notifications/unread-count');
        const data = await res.json();
        const newCount = data?.data?.count || 0;
        if (previousUnreadCount >= 0 && newCount > previousUnreadCount) {
            playNotificationSound();
        }
        state.unreadNotificationCount = newCount;
        previousUnreadCount = newCount;
        updateBadge();
    } catch (e) {
        console.error('[Notifications] unread count error', e);
    }
}

// ================== UI ==================
function updateBadge() {
    const area = document.getElementById('notificationArea');
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    if (area) area.style.display = 'inline-block';
    const count = state.unreadNotificationCount || 0;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
    badge.textContent = count > 99 ? '99+' : count;
}

export async function toggleNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    if (!panel) return;
    const isOpen = panel.style.display === 'block';
    if (isOpen) {
        panel.style.display = 'none';
        if (panelPoller) {
            clearInterval(panelPoller);
            panelPoller = null;
        }
    } else {
        panel.style.display = 'block';
        await loadNotifications();
        if (panelPoller) {
            clearInterval(panelPoller);
            panelPoller = null;
        }
        // Refresh every 5s while panel open
        panelPoller = setInterval(() => {
            const currentPanel = document.getElementById('notificationPanel');
            if (!currentPanel || currentPanel.style.display !== 'block') {
                clearInterval(panelPoller);
                panelPoller = null;
                return;
            }
            loadNotifications();
        }, 5000);
    }
}

// ================== Data ==================
async function loadNotifications(limit = 50) {
    if (!state.token) return;
    try {
        const res = await apiFetch(`/notifications?limit=${limit}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = data?.data || [];
        const newCount = list.filter(n => !n.read).length;
        // 如果从服务端拿到更多未读且此前有计数，播放提示音
        if (previousUnreadCount >= 0 && newCount > (state.unreadNotificationCount || 0)) {
            playNotificationSound();
        }
        state.notifications = list;
        state.unreadNotificationCount = newCount;
        previousUnreadCount = newCount;
        updateBadge();
        renderNotifications();
    } catch (err) {
        console.error('[Notifications] load error', err);
    }
}

async function markNotificationRead(id, link) {
    try {
        const res = await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
        if (!res.ok) return;
        state.notifications = (state.notifications || []).map(n => n._id === id ? { ...n, read: true } : n);
        state.unreadNotificationCount = state.notifications.filter(n => !n.read).length;
        updateBadge();
        renderNotifications();
        if (link) window.location.href = link;
    } catch (err) {
        console.error('[Notifications] mark read error', err);
    }
}

export async function markAllNotificationsRead() {
    try {
        const res = await apiFetch('/notifications/read-all', { method: 'POST' });
        if (!res.ok) return;
        state.notifications = (state.notifications || []).map(n => ({ ...n, read: true }));
        state.unreadNotificationCount = 0;
        updateBadge();
        renderNotifications();
    } catch (err) {
        console.error('[Notifications] mark all read error', err);
    }
}

// ================== Render ==================
function renderNotifications() {
    const listEl = document.getElementById('notificationList');
    if (!listEl) return;
    const list = state.notifications || [];
    if (!list.length) {
        listEl.innerHTML = '<div class="notification-empty">暂无通知</div>';
        return;
    }
    listEl.innerHTML = '';
    list.forEach(n => {
        const item = document.createElement('div');
        item.className = `notification-item ${n.read ? '' : 'unread'}`;
        item.addEventListener('click', () => markNotificationRead(n._id, n.link));

        const msg = document.createElement('div');
        msg.className = 'notification-message';
        msg.textContent = n.message || '';
        item.appendChild(msg);

        const time = document.createElement('div');
        time.className = 'notification-time';
        time.textContent = formatNotificationTime(n.createdAt);
        item.appendChild(time);

        listEl.appendChild(item);
    });
}

function formatNotificationTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
}

// --- exports to window for existing onclick ---
