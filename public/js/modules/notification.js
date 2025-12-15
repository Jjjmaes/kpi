import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { NOTIFICATION_POLL_INTERVAL } from '../core/config.js';

// 导出初始化函数，供主入口调用
export async function initNotificationAudio() {
    // 在用户首次交互时初始化 AudioContext
    if (!notificationAudioContext) {
        console.log('[Notifications] 初始化AudioContext');
        const ctx = initNotificationAudioContext();
        if (ctx) {
            console.log('[Notifications] AudioContext初始化成功，状态:', ctx.state);
            // 如果状态是 suspended，尝试立即恢复（需要用户交互）
            if (ctx.state === 'suspended') {
                try {
                    await ctx.resume();
                    console.log('[Notifications] AudioContext已恢复，状态:', ctx.state);
                } catch (err) {
                    console.warn('[Notifications] AudioContext恢复失败:', err);
                }
            }
        } else {
            console.warn('[Notifications] AudioContext初始化失败');
        }
    } else {
        // 如果 AudioContext 已存在但被暂停，尝试恢复（用户交互时）
        if (notificationAudioContext.state === 'suspended') {
            console.log('[Notifications] AudioContext已暂停，尝试恢复...');
            try {
                await notificationAudioContext.resume();
                console.log('[Notifications] AudioContext已恢复，状态:', notificationAudioContext.state);
            } catch (err) {
                console.warn('[Notifications] AudioContext恢复失败:', err);
            }
        } else {
            console.log('[Notifications] AudioContext已存在，状态:', notificationAudioContext.state);
        }
    }
}

let poller = null;
let panelPoller = null;
let previousUnreadCount = -1;
let notificationAudioContext = null;
let notificationSoundEnabled = true;

// 初始化 AudioContext
function initNotificationAudioContext() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        notificationAudioContext = new AudioContextClass();
        return notificationAudioContext;
    } catch (err) {
        console.warn('[Notifications] 无法创建AudioContext:', err);
        return null;
    }
}

// 恢复 AudioContext（浏览器要求用户交互后才能播放声音）
async function resumeNotificationAudioContext() {
    if (notificationAudioContext && notificationAudioContext.state === 'suspended') {
        try {
            await notificationAudioContext.resume();
        } catch (err) {
            console.warn('[Notifications] 恢复AudioContext失败:', err);
        }
    }
}

// 播放通知声音（使用 Web Audio API）
async function playNotificationSound() {
    if (!notificationSoundEnabled) {
        console.log('[Notifications] 声音已禁用');
        return;
    }
    
    console.log('[Notifications] 尝试播放通知声音');
    
    try {
        // 确保AudioContext已初始化
        let audioContext = notificationAudioContext || initNotificationAudioContext();
        
        if (!audioContext) {
            console.warn('[Notifications] 无法创建AudioContext，使用备用方案');
            // 如果无法创建AudioContext，使用HTML5 Audio作为备用方案
            playNotificationSoundFallback();
            return;
        }
        
        console.log('[Notifications] AudioContext状态:', audioContext.state);
        
        // 如果AudioContext被暂停，直接使用备用方案（因为需要用户交互才能恢复）
        if (audioContext.state === 'suspended') {
            console.warn('[Notifications] AudioContext被暂停（需要用户交互），直接使用备用方案');
            playNotificationSoundFallback();
            return;
        }
        
        // 确保AudioContext是running状态
        if (audioContext.state !== 'running') {
            console.warn('[Notifications] AudioContext状态不是running:', audioContext.state, '，使用备用方案');
            playNotificationSoundFallback();
            return;
        }
        
        console.log('[Notifications] AudioContext状态正常，使用Web Audio播放');
        
        console.log('[Notifications] 开始播放Web Audio声音');
        
        // 创建两个音调，模拟常见的"叮"声（类似系统通知音）
        const now = audioContext.currentTime;
        
        // 第一个音调：高音（800Hz）
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.frequency.value = 800;
        osc1.type = 'sine';
        
        // 第二个音调：低音（600Hz），稍微延迟，形成"叮咚"效果
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 600;
        osc2.type = 'sine';
        
        // 设置音量包络（渐入渐出，更柔和）
        // 第一个音调：0-0.05秒渐入，0.05-0.2秒保持，0.2-0.4秒渐出
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.4, now + 0.05);
        gain1.gain.setValueAtTime(0.4, now + 0.2);
        gain1.gain.linearRampToValueAtTime(0, now + 0.4);
        
        // 第二个音调：0.1秒开始，0.1-0.15秒渐入，0.15-0.35秒保持，0.35-0.5秒渐出
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(0.35, now + 0.15);
        gain2.gain.setValueAtTime(0.35, now + 0.35);
        gain2.gain.linearRampToValueAtTime(0, now + 0.5);
        
        // 播放声音（总共500毫秒，形成"叮咚"效果）
        osc1.start(now);
        osc1.stop(now + 0.4);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.5);
        
        console.log('[Notifications] Web Audio声音播放成功');
    } catch (err) {
        console.warn('[Notifications] 播放声音失败:', err);
        // 使用备用方案
        playNotificationSoundFallback();
    }
}

// 导出测试函数，供控制台调试使用
export async function testNotificationSound() {
    console.log('[Notifications] 手动测试声音播放');
    await playNotificationSound();
}

// 备用声音播放方案（使用HTML5 Audio，生成简单的beep音）
function playNotificationSoundFallback() {
    console.log('[Notifications] 使用备用声音方案');
    try {
        // 创建一个短暂的音频数据URL（800Hz的正弦波，100ms）
        const sampleRate = 44100;
        const duration = 0.1; // 100ms
        const frequency = 800;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(buffer);
        
        // WAV文件头
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, numSamples * 2, true);
        
        // 生成音频数据
        for (let i = 0; i < numSamples; i++) {
            const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
            const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32768)));
            view.setInt16(44 + i * 2, intSample, true);
        }
        
        // 创建音频并播放
        const blob = new Blob([buffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = 0.7; // 提高音量（从0.5提高到0.7）
        audio.play().then(() => {
            console.log('[Notifications] 备用声音播放成功');
        }).catch(err => {
            console.warn('[Notifications] 备用声音播放失败:', err);
        });
        
        // 清理
        audio.onended = () => {
            URL.revokeObjectURL(url);
        };
    } catch (err) {
        console.warn('[Notifications] 备用声音方案失败:', err);
    }
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
        const oldCount = state.unreadNotificationCount || 0;
        console.log('[Notifications] 未读通知数量:', newCount, '之前:', previousUnreadCount, '当前显示:', oldCount);
        
        // 检测是否有新通知（未读数量增加）- 与 app.js 逻辑保持一致
        if (newCount > previousUnreadCount && previousUnreadCount >= 0) {
            console.log('[Notifications] 检测到新通知，准备播放声音');
            await playNotificationSound();
        }
        
        // 更新计数 - 与 app.js 逻辑保持一致
        previousUnreadCount = oldCount;  // 使用旧的 unreadNotificationCount
        state.unreadNotificationCount = newCount;
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
        // 打开面板时初始化AudioContext（用户交互后可以播放声音）
        await initNotificationAudio();
        
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
        const oldCount = state.unreadNotificationCount || 0;
        console.log('[Notifications] 加载通知列表，未读数量:', newCount, '之前:', oldCount);
        // 如果从服务端拿到更多未读且此前有计数，播放提示音
        // 注意：这里比较的是 state.unreadNotificationCount（当前显示的数量），而不是 previousUnreadCount
        if (oldCount >= 0 && newCount > oldCount) {
            console.log('[Notifications] 检测到新通知（从列表），准备播放声音');
            await playNotificationSound();
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
