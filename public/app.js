// API基础URL - 动态获取，支持局域网和域名访问
// 优先使用URL参数中的api地址，否则使用当前页面的origin
(function initAPIBase() {
    const urlParams = new URLSearchParams(window.location.search);
    const customApi = urlParams.get('api');
    if (customApi) {
        window.API_BASE = customApi.endsWith('/api') ? customApi : `${customApi}/api`;
        console.log('使用自定义API地址:', window.API_BASE);
    } else {
        // 使用当前页面的origin（自动适配域名、IP、localhost）
        window.API_BASE = `${window.location.origin}/api`;
        console.log('使用当前页面API地址:', window.API_BASE);
    }
})();

// 使用全局变量，确保在所有地方都能访问
const API_BASE = window.API_BASE || `${window.location.origin}/api`;

// 全局状态
let currentUser = null;
let token = null;
let allUsers = []; // 缓存用户列表
let allCustomers = []; // 缓存客户列表
let currentProjectDetail = null; // 缓存当前项目详情
let notifications = [];
let unreadNotificationCount = 0;
let previousUnreadCount = 0; // 上一次的未读数量，用于检测新通知
let notificationPoller = null;
let notificationPanelPoller = null; // 通知面板打开时的刷新定时器
let notificationSoundEnabled = true; // 通知声音开关，默认开启
const NOTIFICATION_POLL_INTERVAL = 60000;

// 角色管理
let currentRole = null; // 当前选择的角色（localStorage持久化）

// 角色显示名称映射
const roleNames = {
    'admin': '管理员',
    'finance': '财务',
    'pm': '项目经理',
    'sales': '销售',
    'part_time_sales': '兼职销售',
    'translator': '翻译',
    'reviewer': '审校',
    'layout': '排版',
    'admin_staff': '综合岗'
};

// 角色优先级（用于默认角色选择）
const rolePriority = {
    'admin': 100,
    'finance': 90,
    'pm': 80,
    'admin_staff': 75,
    'sales': 70,
    'part_time_sales': 65,
    'reviewer': 50,
    'translator': 40,
    'layout': 30
};

// 权限表（与后端保持一致）
const PERMISSIONS = {
    admin: {
        'project.view': 'all',
        'project.edit': true,
        'project.create': true,
        'kpi.view': 'all',
        'finance.view': true,
        'customer.view': true,
        'customer.edit': true,
        'user.manage': true,
        'system.config': true
    },
    finance: {
        'project.view': 'all',
        'project.edit': false,
        'project.create': false,
        'kpi.view': 'all',
        'finance.view': true,
        'customer.view': true,
        'customer.edit': true,
        'user.manage': false,
        'system.config': false
    },
    pm: {
        'project.view': 'all',
        'project.edit': true,
        'project.create': true,
        'kpi.view': 'all',
        'finance.view': false,
        'customer.view': true,
        'customer.edit': true,
        'user.manage': false,
        'system.config': false
    },
    sales: {
        'project.view': 'sales',
        'project.edit': 'sales',
        'project.create': true,
        'kpi.view': 'self',
        // 销售无财务模块权限
        'finance.view': false,
        'customer.view': true,
        'customer.edit': true,
        'user.manage': false,
        'system.config': false
    },
    part_time_sales: {
        'project.view': 'sales',
        'project.edit': 'sales',
        'project.create': true,
        'kpi.view': 'self',
        // 兼职销售无财务模块权限
        'finance.view': false,
        'customer.view': true,
        'customer.edit': false,
        'user.manage': false,
        'system.config': false
    },
    translator: {
        'project.view': 'assigned',
        'project.edit': false,
        'project.create': false,
        'kpi.view': 'self',
        'finance.view': false,
        'customer.view': false,
        'customer.edit': false,
        'user.manage': false,
        'system.config': false
    },
    reviewer: {
        'project.view': 'assigned',
        'project.edit': false,
        'project.create': false,
        'kpi.view': 'self',
        'finance.view': false,
        'customer.view': false,
        'customer.edit': false,
        'user.manage': false,
        'system.config': false
    },
    layout: {
        'project.view': 'assigned',
        'project.edit': false,
        'project.create': false,
        'kpi.view': 'self',
        'finance.view': false,
        'customer.view': false,
        'customer.edit': false,
        'user.manage': false,
        'system.config': false
    },
    admin_staff: {
        'project.view': 'all',
        'project.edit': true,
        'project.create': true,
        'kpi.view': 'all',
        'finance.view': false,
        'customer.view': true,
        'customer.edit': true,
        'user.manage': false,
        'system.config': false
    }
};

// 根据优先级选择默认角色
function getDefaultRole(userRoles) {
    if (!userRoles || userRoles.length === 0) {
        return null;
    }
    const sortedRoles = userRoles.sort((a, b) => {
        const priorityA = rolePriority[a] || 0;
        const priorityB = rolePriority[b] || 0;
        return priorityB - priorityA;
    });
    return sortedRoles[0];
}

// 初始化当前角色
function initCurrentRole() {
    if (!currentUser || !currentUser.roles || currentUser.roles.length === 0) {
        currentRole = null;
        return;
    }
    
    // 从localStorage恢复上次选择的角色
    const savedRole = localStorage.getItem('currentRole');
    if (savedRole && currentUser.roles.includes(savedRole)) {
        currentRole = savedRole;
    } else {
        // 使用默认角色（优先级最高的）
        currentRole = getDefaultRole(currentUser.roles);
        if (currentRole) {
            localStorage.setItem('currentRole', currentRole);
        }
    }
    updateCurrentRoleTag();
}

// 切换角色
function switchRole(newRole) {
    if (!currentUser || !currentUser.roles.includes(newRole)) {
        console.error('用户不拥有该角色:', newRole);
        return;
    }
    
    currentRole = newRole;
    localStorage.setItem('currentRole', newRole);
    updateCurrentRoleTag();
    
    // 刷新界面
    refreshMenu();
    
    // 重新加载数据
    if (document.getElementById('mainApp').style.display !== 'none') {
        loadDashboard();
        loadProjects();
        loadKPI();
        if (hasPermission('finance.view')) {
            loadReceivables();
            loadPaymentRecordsProjects();
            loadInvoiceProjects();
        }
    }
    // 切换角色时刷新通知角标（不同角色可能有不同通知策略，先简单刷新未读数）
    fetchUnreadNotificationsCount();
}

// API请求包装函数，自动添加Authorization和X-Role header
async function apiFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (currentRole) {
        headers['X-Role'] = currentRole;
    }
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    return response;
}

function formatNotificationTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
}

function updateNotificationBadge() {
    const area = document.getElementById('notificationArea');
    const badge = document.getElementById('notificationBadge');
    if (!area || !badge) return;
    // 确保通知区域始终显示（即使没有未读通知）
    area.style.display = 'inline-block';
    if (unreadNotificationCount > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = unreadNotificationCount > 99 ? '99+' : unreadNotificationCount;
    } else {
        badge.style.display = 'none';
    }
}

// 全局AudioContext，延迟初始化
let notificationAudioContext = null;

// 初始化AudioContext（需要在用户交互后调用）
function initNotificationAudioContext() {
    if (!notificationAudioContext && notificationSoundEnabled) {
        try {
            notificationAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (err) {
            console.warn('[Notifications] 初始化AudioContext失败:', err);
        }
    }
    return notificationAudioContext;
}

// 恢复AudioContext（如果被暂停）
async function resumeNotificationAudioContext() {
    if (notificationAudioContext && notificationAudioContext.state === 'suspended') {
        try {
            await notificationAudioContext.resume();
        } catch (err) {
            console.warn('[Notifications] 恢复AudioContext失败:', err);
        }
    }
}

// 播放通知声音
async function playNotificationSound() {
    if (!notificationSoundEnabled) return;
    
    try {
        // 确保AudioContext已初始化
        let audioContext = notificationAudioContext || initNotificationAudioContext();
        
        if (!audioContext) {
            // 如果无法创建AudioContext，使用HTML5 Audio作为备用方案
            playNotificationSoundFallback();
            return;
        }
        
        // 如果AudioContext被暂停，尝试恢复
        if (audioContext.state === 'suspended') {
            await resumeNotificationAudioContext();
        }
        
        // 如果仍然无法使用，使用备用方案
        if (audioContext.state === 'suspended') {
            playNotificationSoundFallback();
            return;
        }
        
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
    } catch (err) {
        console.warn('[Notifications] 播放声音失败:', err);
        // 使用备用方案
        playNotificationSoundFallback();
    }
}

// 备用声音播放方案（使用HTML5 Audio，生成简单的beep音）
function playNotificationSoundFallback() {
    try {
        // 创建一个短暂的音频数据URL（440Hz的正弦波，100ms）
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
        audio.volume = 0.3;
        audio.play().catch(err => {
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

async function fetchUnreadNotificationsCount() {
    if (!token) return;
    try {
        const res = await apiFetch(`${API_BASE}/notifications/unread-count`);
        if (!res.ok) return;
        const data = await res.json();
        const newCount = data?.data?.count || 0;
        
        // 检测是否有新通知（未读数量增加）
        if (newCount > previousUnreadCount && previousUnreadCount >= 0) {
            // 有新通知，播放声音
            playNotificationSound();
        }
        
        previousUnreadCount = unreadNotificationCount;
        unreadNotificationCount = newCount;
        updateNotificationBadge();
    } catch (err) {
        console.error('[Notifications] unread count error', err);
    }
}

async function loadNotifications(limit = 50) {
    if (!token) return;
    try {
        const res = await apiFetch(`${API_BASE}/notifications?limit=${limit}`);
        if (!res.ok) return;
        const data = await res.json();
        notifications = data?.data || [];
        const newCount = notifications.filter(n => !n.read).length;
        
        // 如果打开通知面板时发现新通知，也播放声音
        if (newCount > unreadNotificationCount) {
            playNotificationSound();
        }
        
        unreadNotificationCount = newCount;
        previousUnreadCount = newCount; // 更新上一次的计数
        updateNotificationBadge();
        renderNotifications();
    } catch (err) {
        console.error('[Notifications] load error', err);
    }
}

function renderNotifications() {
    const listEl = document.getElementById('notificationList');
    if (!listEl) return;
    if (!notifications || notifications.length === 0) {
        listEl.innerHTML = '<div class="notification-empty">暂无通知</div>';
        return;
    }
    listEl.innerHTML = '';
    notifications.forEach(n => {
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

function toggleNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    if (!panel) return;
    const isOpen = panel.style.display === 'block';
    if (isOpen) {
        // 关闭面板时清除定时器
        panel.style.display = 'none';
        if (notificationPanelPoller) {
            clearInterval(notificationPanelPoller);
            notificationPanelPoller = null;
        }
    } else {
        // 打开面板时初始化AudioContext（用户交互后可以播放声音）
        initNotificationAudioContext();
        
        // 打开面板时加载通知并启动自动刷新
        panel.style.display = 'block';
        loadNotifications();
        
        // 清除之前的定时器（如果存在）
        if (notificationPanelPoller) {
            clearInterval(notificationPanelPoller);
            notificationPanelPoller = null;
        }
        
        // 启动自动刷新定时器（每5秒刷新一次，更及时）
        console.log('[Notifications] 启动通知面板自动刷新定时器，间隔5秒');
        
        // 清除之前的定时器（如果存在）
        if (notificationPanelPoller) {
            clearInterval(notificationPanelPoller);
            notificationPanelPoller = null;
        }
        
        // 启动新的定时器
        notificationPanelPoller = setInterval(() => {
            const currentPanel = document.getElementById('notificationPanel');
            if (!currentPanel) {
                console.log('[Notifications] 面板元素不存在，停止自动刷新');
                if (notificationPanelPoller) {
                    clearInterval(notificationPanelPoller);
                    notificationPanelPoller = null;
                }
                return;
            }
            
            // 检查面板是否可见（简化检查逻辑）
            const panelDisplay = currentPanel.style.display;
            const isVisible = panelDisplay === 'block';
            
            if (isVisible) {
                console.log('[Notifications] 自动刷新通知列表 - 面板可见，时间:', new Date().toLocaleTimeString());
                loadNotifications();
            } else {
                // 如果面板已关闭，清除定时器
                console.log('[Notifications] 面板已关闭，停止自动刷新');
                if (notificationPanelPoller) {
                    clearInterval(notificationPanelPoller);
                    notificationPanelPoller = null;
                }
            }
        }, 5000); // 5秒刷新一次，更及时
        
        console.log('[Notifications] 定时器已启动，ID:', notificationPanelPoller);
    }
}

async function markNotificationRead(id, link) {
    try {
        const res = await apiFetch(`${API_BASE}/notifications/${id}/read`, { method: 'POST' });
        if (!res.ok) return;
        notifications = notifications.map(n => n._id === id ? { ...n, read: true } : n);
        unreadNotificationCount = notifications.filter(n => !n.read).length;
        updateNotificationBadge();
        renderNotifications();
        if (link) {
            window.location.href = link;
        }
    } catch (err) {
        console.error('[Notifications] mark read error', err);
    }
}

async function markAllNotificationsRead() {
    try {
        const res = await apiFetch(`${API_BASE}/notifications/read-all`, { method: 'POST' });
        if (!res.ok) return;
        notifications = notifications.map(n => ({ ...n, read: true }));
        unreadNotificationCount = 0;
        updateNotificationBadge();
        renderNotifications();
    } catch (err) {
        console.error('[Notifications] mark all read error', err);
    }
}

function startNotificationPolling() {
    stopNotificationPolling();
    // 初始化时重置计数，避免首次加载时误触发声音
    previousUnreadCount = -1;
    fetchUnreadNotificationsCount();
    notificationPoller = setInterval(fetchUnreadNotificationsCount, NOTIFICATION_POLL_INTERVAL);
}

function stopNotificationPolling() {
    if (notificationPoller) {
        clearInterval(notificationPoller);
        notificationPoller = null;
    }
    if (notificationPanelPoller) {
        clearInterval(notificationPanelPoller);
        notificationPanelPoller = null;
    }
}

// 权限判断函数
function hasPermission(permission) {
    if (!currentRole || !PERMISSIONS[currentRole]) {
        return false;
    }
    const permValue = PERMISSIONS[currentRole][permission];
    return permValue !== undefined && permValue !== false;
}

// 获取权限值
function getPermission(permission) {
    if (!currentRole || !PERMISSIONS[currentRole]) {
        return false;
    }
    return PERMISSIONS[currentRole][permission] || false;
}

// 基于当前角色的判断函数
const isFinanceRole = () => currentRole === 'admin' || currentRole === 'finance';
const isSalesRole = () => currentRole === 'sales' || currentRole === 'part_time_sales';
let orgInfo = {
    companyName: '语家 OA 系统',
    companyAddress: '',
    companyContact: '',
    companyPhone: '',
    companyEmail: ''
};

// 判断当前用户是否应该看到项目金额和单价信息
// 业务要求：项目经理、专/兼职翻译、专/兼职排版、审校都不该看到项目金额
// 允许看到的：管理员、财务、销售、兼职销售、综合岗（如需调整可在此扩展）
const canViewProjectAmount = () => {
    if (!currentRole) return false;
    const allowedRoles = ['admin', 'finance', 'sales', 'part_time_sales', 'admin_staff'];
    return allowedRoles.includes(currentRole);
};
let allProjectsCache = []; // 缓存项目列表
let receivablesCache = []; // 缓存应收结果
let projectPage = 1;
let projectFilterMonth = ''; // 来自看板的月份筛选（成交/创建月份）
let projectFilterDeliveryOverdue = false; // 看板跳转：只看交付逾期
let salesFinanceView = false; // 销售从看板进入财务只读视图
let receivablePage = 1;
let paymentRecordsProjectsCache = []; // 缓存回款记录项目列表
let paymentRecordsProjectsPage = 1;
let expandedPaymentProjectId = null; // 当前展开显示回款记录的项目ID
let invoiceProjectsCache = []; // 缓存发票项目列表
let invoiceProjectsPage = 1;
let expandedInvoiceProjectId = null; // 当前展开显示发票的项目ID
let languagesCache = [];
let forcePasswordChangeRequired = false;

// 机构信息（公开读取，用于展示名称）
async function loadOrgInfo() {
    try {
        const res = await fetch(`${API_BASE}/config/public`);
        const data = await res.json();
        if (data.success && data.data) {
            orgInfo = data.data;
        }
    } catch (e) {
        console.warn('加载机构信息失败，使用默认值', e);
    }
    const titleText = `${orgInfo.companyName || '语家 OA'}系统`;
    document.title = titleText;
    const loginTitle = document.getElementById('loginTitle');
    if (loginTitle) loginTitle.textContent = 'KPI SYSTEM';
    const mainTitle = document.getElementById('mainTitle');
    if (mainTitle) mainTitle.textContent = titleText;
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 显示服务器访问信息（开发调试用）
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        console.log('🌐 当前访问地址:', window.location.origin);
        console.log('🔗 API地址:', API_BASE);
    }
    
    await loadOrgInfo();
        token = localStorage.getItem('token');
        console.log('[Auth] DOMContentLoaded, token exists:', !!token);
        if (token) {
            checkAuth();
        } else {
            showLogin();
        }
    });

// 认证检查
async function checkAuth() {
    try {
        console.log('[Auth] checkAuth start');
        const response = await apiFetch(`${API_BASE}/auth/me`);
        const data = await response.json();
        console.log('[Auth] /auth/me result:', data);
        if (data.success) {
            currentUser = data.user;
            // 初始化当前角色
            initCurrentRole();
            if (currentUser.passwordMustChange) {
                // 不在未登录状态直接弹窗，要求重新登录后再改密码
                token = null;
                localStorage.removeItem('token');
                showLogin();
                showAlert('loginAlert', '首次登录需修改密码，请先登录后按提示修改', 'error');
            } else {
            showMainApp();
            }
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('[Auth] checkAuth error:', error);
        showLogin();
    }
}

// 登录
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        console.log('[Auth] login start', { username });
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        console.log('[Auth] login result:', data);

        if (data.success) {
            token = data.token;
            currentUser = data.user;
            localStorage.setItem('token', token);
            // 初始化当前角色
            initCurrentRole();
            if (currentUser.passwordMustChange) {
                showForcePasswordChangeModal(false, password);
            } else {
            showMainApp();
            }
        } else {
            showAlert('loginAlert', data.message, 'error');
        }
    } catch (error) {
        console.error('[Auth] login error:', error);
        showAlert('loginAlert', '登录失败: ' + error.message, 'error');
    }
});

function passwordValidationMessage(pwd) {
    if (!pwd || pwd.length < 8) return '密码长度至少 8 位';
    if (pwd.length > 64) return '密码长度不能超过 64 位';
    if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/\d/.test(pwd) || !/[^A-Za-z0-9]/.test(pwd)) {
        return '密码需包含大写字母、小写字母、数字和特殊字符';
    }
    return '';
}

function showForcePasswordChangeModal(fromAuthCheck = false, defaultOldPwd = '') {
    forcePasswordChangeRequired = true;
    const content = `
        <div id="forcePwdAlert"></div>
        <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 12px; margin-bottom: 16px; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-weight: 600; color: #1e40af;">首次登录需修改密码</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e3a8a;">为了账户安全，请设置一个强密码。密码要求如下：</p>
            <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: #1e3a8a;">
                <li>长度要求：至少 8 位，最多 64 位</li>
                <li>必须包含：<strong>大写字母</strong>（A-Z）</li>
                <li>必须包含：<strong>小写字母</strong>（a-z）</li>
                <li>必须包含：<strong>数字</strong>（0-9）</li>
                <li>必须包含：<strong>特殊字符</strong>（如 !@#$%^&* 等）</li>
            </ul>
            <p style="margin: 8px 0 0 0; font-size: 13px; color: #64748b;">示例：MyP@ssw0rd、Abc123!@#</p>
        </div>
        <form id="forcePwdForm">
            <div class="form-group">
                <label>旧密码</label>
                <input type="password" id="forceOldPwd" value="${defaultOldPwd || ''}" required>
            </div>
            <div class="form-group">
                <label>新密码</label>
                <input type="password" id="forceNewPwd" required placeholder="请输入符合要求的新密码">
                <div id="forcePwdHint" style="font-size: 12px; color: #64748b; margin-top: 4px;"></div>
            </div>
            <div class="form-group">
                <label>确认新密码</label>
                <input type="password" id="forceNewPwdConfirm" required placeholder="请再次输入新密码">
            </div>
            <div class="action-buttons">
                <button type="submit">提交</button>
            </div>
        </form>
    `;
    showModal('修改密码', content);
    
    // 实时验证密码强度
    const newPwdInput = document.getElementById('forceNewPwd');
    const hintDiv = document.getElementById('forcePwdHint');
    if (newPwdInput && hintDiv) {
        newPwdInput.addEventListener('input', function() {
            const pwd = this.value;
            if (!pwd) {
                hintDiv.innerHTML = '';
                return;
            }
            
            const checks = {
                length: pwd.length >= 8 && pwd.length <= 64,
                upper: /[A-Z]/.test(pwd),
                lower: /[a-z]/.test(pwd),
                digit: /\d/.test(pwd),
                special: /[^A-Za-z0-9]/.test(pwd)
            };
            
            let hintHtml = '<div style="margin-top: 4px;">';
            hintHtml += checks.length ? '✓ 长度符合要求' : '✗ 长度需8-64位';
            hintHtml += checks.upper ? ' ✓ 含大写字母' : ' ✗ 需含大写字母';
            hintHtml += checks.lower ? ' ✓ 含小写字母' : ' ✗ 需含小写字母';
            hintHtml += checks.digit ? ' ✓ 含数字' : ' ✗ 需含数字';
            hintHtml += checks.special ? ' ✓ 含特殊字符' : ' ✗ 需含特殊字符';
            hintHtml += '</div>';
            
            const allPass = Object.values(checks).every(v => v);
            hintDiv.innerHTML = hintHtml;
            hintDiv.style.color = allPass ? '#10b981' : '#64748b';
        });
    }
    const form = document.getElementById('forcePwdForm');
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const oldPwd = document.getElementById('forceOldPwd').value;
        const newPwd = document.getElementById('forceNewPwd').value;
        const newPwdConfirm = document.getElementById('forceNewPwdConfirm').value;

        if (newPwd !== newPwdConfirm) {
            showAlert('forcePwdAlert', '两次输入的新密码不一致', 'error');
            return;
        }
        const msg = passwordValidationMessage(newPwd);
        if (msg) {
            showAlert('forcePwdAlert', msg, 'error');
            return;
        }
        try {
            const resp = await apiFetch(`${API_BASE}/auth/change-password`, {
                method: 'POST',
                body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
            });
            const result = await resp.json();
            if (result.success) {
                showAlert('forcePwdAlert', '密码更新成功，请继续使用系统', 'success');
                currentUser.passwordMustChange = false;
                forcePasswordChangeRequired = false;
                setTimeout(() => {
                    closeModal();
                    showMainApp();
                }, 500);
            } else {
                showAlert('forcePwdAlert', result.message || '修改失败', 'error');
            }
        } catch (err) {
            showAlert('forcePwdAlert', '请求失败: ' + err.message, 'error');
        }
    });
}

// 退出
function logout() {
    token = null;
    currentUser = null;
    stopNotificationPolling();
    localStorage.removeItem('token');
    console.log('[Auth] logout -> redirect /');
    // 强制回到登录页（清除可能残留的 ? 查询）
    window.location.href = '/';
}

function updateCurrentRoleTag() {
    const el = document.getElementById('currentRoleTag');
    if (!el) return;
    if (!currentRole) {
        el.style.display = 'none';
        return;
    }
    el.textContent = roleNames[currentRole] || currentRole;
    el.style.display = 'inline-flex';
}

// 显示登录页
function showLogin() {
    console.log('[UI] showLogin');
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
}

// 初始化角色切换器
function initRoleSwitcher() {
    const roleSwitcherContainer = document.getElementById('roleSwitcherContainer');
    if (!roleSwitcherContainer) return;
    
    // 初始化当前角色
    initCurrentRole();
    
    // 如果用户只有一个角色，不显示切换器
    if (!currentUser || !currentUser.roles || currentUser.roles.length <= 1) {
        roleSwitcherContainer.style.display = 'none';
        return;
    }
    
    roleSwitcherContainer.style.display = 'inline-flex';
    
    // 创建角色选择下拉框
    const select = document.createElement('select');
    select.id = 'roleSwitcher';
    select.style.cssText = 'padding: 6px 10px; border: 1px solid #dfe3f0; border-radius: 8px; background: rgba(255,255,255,0.96); color: #333;';
    select.onchange = (e) => {
        switchRole(e.target.value);
    };
    
    // 添加选项
    currentUser.roles.forEach(role => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = roleNames[role] || role;
        if (role === currentRole) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    // 清空容器并添加新元素（去掉"当前角色:"标签，因为已经有currentRoleTag显示了）
    roleSwitcherContainer.innerHTML = '';
    roleSwitcherContainer.appendChild(select);
}

// 刷新菜单显示（基于当前角色）
function refreshMenu() {
    if (!currentRole) return;
    
    // 显示/隐藏菜单项
    const configBtn = document.getElementById('configBtn');
    const usersBtn = document.getElementById('usersBtn');
    const languagesBtn = document.getElementById('languagesBtn');
    const financeBtn = document.getElementById('financeBtn');
    const customersBtn = document.getElementById('customersBtn');
    const createProjectBtn = document.getElementById('createProjectBtn');
    const createLanguageBtn = document.getElementById('createLanguageBtn');
    const kpiUserSelect = document.getElementById('kpiUserSelect');
    const exportKpiBtn = document.getElementById('exportKpiBtn');
    const generateKpiBtn = document.getElementById('generateKpiBtn');
    const backupBtn = document.getElementById('backupBtn');
    
    // 系统配置
    if (configBtn) configBtn.style.display = hasPermission('system.config') ? 'inline-block' : 'none';
    
    // 用户管理
    if (usersBtn) usersBtn.style.display = hasPermission('user.manage') ? 'inline-block' : 'none';
    
    // 数据备份（仅管理员）
    if (backupBtn) backupBtn.style.display = hasPermission('user.manage') ? 'inline-block' : 'none';
    
    // 语种管理
    if (languagesBtn) languagesBtn.style.display = hasPermission('system.config') ? 'inline-block' : 'none';
    if (createLanguageBtn) createLanguageBtn.style.display = hasPermission('system.config') ? 'inline-block' : 'none';
    
    // 财务管理
    if (financeBtn) financeBtn.style.display = hasPermission('finance.view') ? 'inline-block' : 'none';
    
    // 客户管理
    if (customersBtn) customersBtn.style.display = hasPermission('customer.view') ? 'inline-block' : 'none';
    
    // 创建项目
    if (createProjectBtn) createProjectBtn.style.display = hasPermission('project.create') ? 'inline-block' : 'none';
    
    // KPI相关
    if (kpiUserSelect) kpiUserSelect.style.display = getPermission('kpi.view') === 'all' ? 'block' : 'none';
    if (exportKpiBtn) exportKpiBtn.style.display = getPermission('kpi.view') === 'all' ? 'inline-block' : 'none';
    if (generateKpiBtn) generateKpiBtn.style.display = getPermission('kpi.view') === 'all' ? 'inline-block' : 'none';

    updateCurrentRoleTag();
}

// 显示主应用
function showMainApp() {
    console.log('[UI] showMainApp user:', currentUser?.username, 'roles:', currentUser?.roles);
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userName').textContent = currentUser.name;
    updateCurrentRoleTag();
    const notificationArea = document.getElementById('notificationArea');
    if (notificationArea) notificationArea.style.display = 'inline-block';

    // 初始化角色切换器
    initRoleSwitcher();
    
    // 显示个人中心按钮（所有登录用户都可以访问）
    const profileHeaderBtn = document.getElementById('profileHeaderBtn');
    if (profileHeaderBtn) {
        profileHeaderBtn.style.display = 'inline-flex';
    }
    
    // 刷新菜单显示
    refreshMenu();

    // 根据当前角色加载数据
    const isAdmin = hasPermission('system.config');
    const isFinance = hasPermission('finance.view');
    const canCreateProject = hasPermission('project.create');
    const canViewCustomers = hasPermission('customer.view');

    // 加载数据
    if (isAdmin) {
        loadUsers();
        loadConfig();
    }

    // 加载用户列表（用于下拉选择）
    if (isAdmin || isFinance) {
        loadUsersForSelect();
    }
    
    // 创建项目时需要加载用户列表（用于选择成员）
    if (canCreateProject) {
        loadUsersForProjectMembers();
    }
    
    // 加载客户列表
    if (canViewCustomers || isAdmin || isFinance) {
        loadCustomers();
    }
    
    // 财务筛选下拉需要客户/销售
    if (isAdmin || isFinance) {
        loadCustomers().then(() => fillFinanceFilters());
        loadUsersForSelect().then(() => fillFinanceFilters());
    }
    // Dashboard 默认月份
    const dashboardMonthInput = document.getElementById('dashboardMonth');
    if (dashboardMonthInput && !dashboardMonthInput.value) {
        dashboardMonthInput.value = new Date().toISOString().slice(0, 7);
    }
    loadDashboard();
    loadProjects();
    loadKPI();
    if (isFinance) {
        // 不自动设置月份，让用户自己选择
        loadReceivables();
        loadPaymentRecordsProjects(); // 加载回款记录项目列表
        loadInvoiceProjects(); // 加载发票项目列表
        loadPendingKpi();
        loadFinanceSummary();
    }
    
    // 加载语种（需要创建项目或管理的角色）
    if (canCreateProject || isAdmin || hasPermission('system.config')) {
        loadLanguages(true);
    }

    startNotificationPolling();
}

// 切换section
function showSection(sectionId, triggerBtn) {
    // 如果是权限配置section，加载权限配置
    if (sectionId === 'permissions') {
        loadPermissionsConfig();
    }
    
    // 如果是数据备份section，加载备份列表
    if (sectionId === 'backup') {
        loadBackups();
    }
    
    // 如果是个人中心section，加载个人信息
    if (sectionId === 'profile') {
        loadProfile();
    }
    
    if (sectionId === 'finance') {
        if (isFinanceRole()) {
            // 财务或管理员完整访问
            salesFinanceView = false;
        } else if (isSalesRole() && salesFinanceView) {
            // 销售从看板跳转进入，只读视图
        } else {
        showToast('无权限访问财务模块', 'error');
        return;
        }
    } else {
        salesFinanceView = false; // 切换到其他模块时关闭销售财务视图
    }
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    const btn = triggerBtn || (typeof event !== 'undefined' ? event.target : null) || document.querySelector(`.nav button[onclick*="${sectionId}"]`);
    if (btn) btn.classList.add('active');
    
    // 切换到财务管理时，确保筛选条件已填充
    if (sectionId === 'finance') {
        const isAdmin = currentUser?.roles?.includes('admin');
        const isFinance = currentUser?.roles?.includes('finance');
        if ((isAdmin || isFinance) && (!allUsers?.length || !allCustomers?.length)) {
            // 如果数据还没加载，重新加载
            loadUsersForSelect().then(() => {
                loadCustomers().then(() => {
                    fillFinanceFilters();
                });
            });
        } else if (isAdmin || isFinance) {
            // 如果数据已加载，直接填充
            fillFinanceFilters();
        }
        // 默认显示第一个section（应收对账）
        showFinanceSection('receivables');
    }
}

// 显示财务管理子section
function showFinanceSection(sectionName) {
    // 销售只允许查看回款列表
    if (salesFinanceView && !isFinanceRole()) {
        sectionName = 'paymentRecords';
    }
    const financeTitle = document.querySelector('#finance h2');
    const financeNav = document.getElementById('financeNavCards');
    // 隐藏所有section内容
    document.querySelectorAll('.finance-section-content').forEach(s => {
        s.style.display = 'none';
    });
    
    // 移除所有卡片的active状态
    document.querySelectorAll('.finance-nav-card').forEach(card => {
        card.classList.remove('active');
    });
    
    // 显示选中的section
    const targetSection = document.getElementById(`financeSection-${sectionName}`);
    if (targetSection) {
        targetSection.style.display = 'block';
    }
    
    // 添加选中卡片的active状态
    const activeCard = document.querySelector(`.finance-nav-card[data-section="${sectionName}"]`);
    if (activeCard) {
        activeCard.classList.add('active');
    }
    
    // 如果是销售只读视图，隐藏其他卡片
    if (salesFinanceView && !isFinanceRole()) {
        document.querySelectorAll('.finance-nav-card').forEach(card => {
            const sec = card.getAttribute('data-section');
            card.style.display = sec === 'paymentRecords' ? 'flex' : 'none';
        });
        if (financeTitle) financeTitle.textContent = '回款预警';
        if (financeNav) financeNav.style.display = 'none';
        // 锁定筛选：销售只能看自己创建的项目
        const paymentSales = document.getElementById('paymentSales');
        if (paymentSales) {
            paymentSales.value = currentUser?._id || '';
            paymentSales.disabled = true;
        }
        const paymentCustomer = document.getElementById('paymentCustomer');
        if (paymentCustomer) paymentCustomer.disabled = false; // 可按客户筛选自己的项目
        const paymentFilterNotice = document.getElementById('paymentFilterNotice');
        if (paymentFilterNotice) {
            paymentFilterNotice.style.display = 'block';
        }
    } else {
        document.querySelectorAll('.finance-nav-card').forEach(card => card.style.display = 'flex');
        if (financeTitle) financeTitle.textContent = '财务管理';
        if (financeNav) financeNav.style.display = 'grid';
        const paymentSales = document.getElementById('paymentSales');
        if (paymentSales) paymentSales.disabled = false;
        const paymentCustomer = document.getElementById('paymentCustomer');
        if (paymentCustomer) paymentCustomer.disabled = false;
        const paymentFilterNotice = document.getElementById('paymentFilterNotice');
        if (paymentFilterNotice) {
            paymentFilterNotice.style.display = 'none';
        }
    }
}

// Dashboard 卡片跳转导航
function navigateFromDashboardCard(target, overrideStatus) {
    const dashMonth = document.getElementById('dashboardMonth')?.value || '';
    const dashStatus = document.getElementById('dashboardStatus')?.value || '';
    const dashBiz = document.getElementById('dashboardBusinessType')?.value || '';
    const applyProjectFilters = () => {
        projectFilterMonth = dashMonth || '';
        const statusSel = document.getElementById('projectStatusFilter');
        const bizSel = document.getElementById('projectBizFilter');
        if (statusSel && (overrideStatus || dashStatus !== undefined)) statusSel.value = overrideStatus || dashStatus;
        if (bizSel && dashBiz !== undefined) bizSel.value = dashBiz;
        renderProjects?.();
    };
    const applyFinanceMonth = (fieldId) => {
        if (dashMonth) {
            const el = document.getElementById(fieldId);
            if (el) el.value = dashMonth;
        }
    };

    switch (target) {
        case 'projects':
            showSection('projects');
            projectFilterDeliveryOverdue = false;
            applyProjectFilters();
            break;
        case 'paymentOverdue':
            salesFinanceView = true; // 允许销售只读进入
            showSection('finance');
            showFinanceSection('paymentRecords');
            applyFinanceMonth('paymentMonth');
            loadPaymentRecordsProjects?.();
            break;
        case 'paymentDueSoon':
            salesFinanceView = true;
            showSection('finance');
            showFinanceSection('paymentRecords');
            applyFinanceMonth('paymentMonth');
            loadPaymentRecordsProjects?.();
            break;
        case 'receivables':
            showSection('finance');
            showFinanceSection('receivables');
            applyFinanceMonth('financeMonth');
            loadReceivables?.();
            break;
        case 'deliveryOverdue':
            showSection('projects');
            // 交付逾期，倾向于查看进行中/待开始
            const statusSel = document.getElementById('projectStatusFilter');
            if (statusSel) {
                statusSel.value = overrideStatus || dashStatus || 'in_progress';
            }
            projectFilterDeliveryOverdue = true;
            applyProjectFilters();
            break;
        default:
            showSection('dashboard');
    }
}

// ==================== 语种管理 ====================
async function loadLanguages(refresh) {
    try {
        const res = await apiFetch(`${API_BASE}/languages${refresh ? '' : '?active=true'}`);
        const data = await res.json();
        if (!data.success) {
            showAlert('languagesList', data.message || '加载失败', 'error');
            return;
        }
        languagesCache = data.data || [];
        renderLanguages();
    } catch (error) {
        showAlert('languagesList', '加载失败: ' + error.message, 'error');
    }
}

function renderLanguages() {
    if (!document.getElementById('languagesList')) return;
    const rows = (languagesCache || []).map(lang => `
        <tr>
            <td>${lang.name}</td>
            <td>${lang.code}</td>
            <td>${lang.nativeName || '-'}</td>
            <td>${lang.isActive ? '<span class="badge badge-success">启用</span>' : '<span class="badge badge-danger">停用</span>'}</td>
            <td>
                <button class="btn-small" onclick="showEditLanguageModal('${lang._id}')">编辑</button>
                </td>
            </tr>
        `).join('');
    document.getElementById('languagesList').innerHTML = `
            <table>
                <thead>
                    <tr>
                    <th>语种名称</th>
                    <th>代码</th>
                    <th>本地名称</th>
                        <th>状态</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                ${rows || '<tr><td colspan="5" style="text-align:center;">暂无语种</td></tr>'}
                </tbody>
            </table>
        `;
}

function showCreateLanguageModal() {
    const content = `
        <form id="createLangForm" onsubmit="createLanguage(event)">
            <div class="form-group">
                <label>语种名称 *</label>
                <input type="text" name="name" placeholder="如：中文、英文" required>
            </div>
            <div class="form-group">
                <label>语种代码 *</label>
                <input type="text" name="code" placeholder="如：ZH、EN" required style="text-transform: uppercase;">
                <small style="color: #666; font-size: 12px;">通常使用ISO 639-1标准代码（大写）</small>
            </div>
            <div class="form-group">
                <label>本地名称（可选）</label>
                <input type="text" name="nativeName" placeholder="如：中文、English">
            </div>
            <div class="action-buttons">
                <button type="submit">创建</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('新增语种', content);
}

async function createLanguage(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
        name: formData.get('name'),
        code: formData.get('code').toUpperCase(),
        nativeName: formData.get('nativeName') || undefined
    };
    try {
        const res = await apiFetch(`${API_BASE}/languages`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '创建失败', 'error');
            return;
        }
        closeModal();
        loadLanguages(true);
        showToast('语种已创建', 'success');
    } catch (error) {
        showToast('创建失败: ' + error.message, 'error');
    }
}

function showEditLanguageModal(id) {
    const lang = languagesCache.find(l => l._id === id);
    if (!lang) return;
    const content = `
        <form id="editLangForm" onsubmit="updateLanguage(event, '${id}')">
            <div class="form-group">
                <label>语种名称 *</label>
                <input type="text" name="name" value="${lang.name}" required>
            </div>
            <div class="form-group">
                <label>语种代码 *</label>
                <input type="text" name="code" value="${lang.code}" required style="text-transform: uppercase;">
            </div>
            <div class="form-group">
                <label>本地名称（可选）</label>
                <input type="text" name="nativeName" value="${lang.nativeName || ''}">
            </div>
            <div class="form-group">
                <label>状态</label>
                <select name="isActive">
                    <option value="true" ${lang.isActive ? 'selected' : ''}>启用</option>
                    <option value="false" ${!lang.isActive ? 'selected' : ''}>停用</option>
                </select>
            </div>
            <div class="action-buttons">
                <button type="submit">保存</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('编辑语种', content);
}

async function updateLanguage(e, id) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
        name: formData.get('name'),
        code: formData.get('code').toUpperCase(),
        nativeName: formData.get('nativeName') || undefined,
        isActive: formData.get('isActive') === 'true'
    };
    try {
        const res = await apiFetch(`${API_BASE}/languages/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '更新失败', 'error');
            return;
        }
        closeModal();
        loadLanguages(true);
        showToast('语种已更新', 'success');
    } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
    }
}


// ==================== 模态框管理 ====================
function showModal(title, content) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    if (forcePasswordChangeRequired) return;
    document.getElementById('modalOverlay').classList.remove('active');
}

// ==================== 用户管理 ====================
async function loadUsers() {
    try {
        const response = await apiFetch(`${API_BASE}/users`);
        const data = await response.json();

        if (data.success) {
            allUsers = data.data;
            const html = `
                <table>
                    <thead>
                        <tr>
                            <th>姓名</th>
                            <th>用户名</th>
                            <th>邮箱</th>
                            <th>电话</th>
                            <th>角色</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.data.map(u => `
                            <tr>
                                <td>${u.name}</td>
                                <td>${u.username}</td>
                                <td>${u.email}</td>
                                <td>${u.phone || '-'}</td>
                                <td>${u.roles.map(r => getRoleText(r)).join(', ')}</td>
                                <td><span class="badge ${u.isActive ? 'badge-success' : 'badge-danger'}">${u.isActive ? '激活' : '禁用'}</span></td>
                                <td>
                                    <button class="btn-small" onclick="editUser('${u._id}')">编辑</button>
                                    <button class="btn-small" onclick="resetUserPassword('${u._id}', '${u.name}')" style="background: #f59e0b; color: white;">重置密码</button>
                                    <button class="btn-small btn-danger" onclick="deleteUser('${u._id}')">删除</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            document.getElementById('usersList').innerHTML = html;
        }
    } catch (error) {
        console.error('加载用户失败:', error);
        showAlert('usersList', '加载用户失败: ' + error.message, 'error');
    }
}

async function loadUsersForSelect() {
    try {
        const response = await apiFetch(`${API_BASE}/users`);
        const data = await response.json();
        if (data.success) {
            // 保存到全局变量，供其他功能使用
            allUsers = data.data;
            const select = document.getElementById('kpiUserSelect');
            if (select) {
            select.innerHTML = '<option value="">全部用户</option>' +
                data.data.map(u => `<option value="${u._id}">${u.name}</option>`).join('');
        }
        }
        return data;
    } catch (error) {
        console.error('加载用户列表失败:', error);
        return { success: false };
    }
}

// 为项目成员选择加载用户列表
async function loadUsersForProjectMembers() {
    try {
        const response = await apiFetch(`${API_BASE}/users`);
        const data = await response.json();
        if (data.success) {
            allUsers = data.data;
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
    }
}

function showCreateUserModal() {
    const content = `
        <form id="createUserForm" onsubmit="createUser(event)">
            <div class="form-group">
                <label>用户名 *</label>
                <input type="text" name="username" required>
            </div>
            <div class="form-group">
                <label>密码 *</label>
                <input type="password" name="password" required>
            </div>
            <div class="form-group">
                <label>姓名 *</label>
                <input type="text" name="name" required>
            </div>
            <div class="form-group">
                <label>邮箱 *</label>
                <input type="email" name="email" required>
            </div>
            <div class="form-group">
                <label>电话</label>
                <input type="tel" name="phone" placeholder="请输入联系电话">
            </div>
            <div class="form-group">
                <label>角色 *</label>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">
                    ${['admin', 'finance', 'sales', 'pm', 'translator', 'reviewer', 'admin_staff', 'part_time_sales', 'layout'].map(role => `
                        <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                            <input type="checkbox" name="roles" value="${role}">
                            ${getRoleText(role)}
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="action-buttons">
                <button type="submit">创建</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('创建用户', content);
}

async function createUser(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const roles = Array.from(formData.getAll('roles'));
    
    if (roles.length === 0) {
        alert('请至少选择一个角色');
        return;
    }

    const data = {
        username: formData.get('username'),
        password: formData.get('password'),
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone') || '',
        roles
    };

    try {
        const response = await apiFetch(`${API_BASE}/users`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadUsers();
            showAlert('usersList', '用户创建成功', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('创建失败: ' + error.message);
    }
}

async function editUser(userId) {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;

    const content = `
        <form id="editUserForm" onsubmit="updateUser(event, '${userId}')">
            <div class="form-group">
                <label>姓名 *</label>
                <input type="text" name="name" value="${user.name}" required>
            </div>
            <div class="form-group">
                <label>邮箱 *</label>
                <input type="email" name="email" value="${user.email}" required>
            </div>
            <div class="form-group">
                <label>电话</label>
                <input type="tel" name="phone" value="${user.phone || ''}" placeholder="请输入联系电话">
            </div>
            <div class="form-group">
                <label>角色 *</label>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">
                    ${['admin', 'finance', 'sales', 'pm', 'translator', 'reviewer', 'admin_staff', 'part_time_sales', 'layout'].map(role => `
                        <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                            <input type="checkbox" name="roles" value="${role}" ${user.roles.includes(role) ? 'checked' : ''}>
                            ${getRoleText(role)}
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label>状态</label>
                <select name="isActive">
                    <option value="true" ${user.isActive ? 'selected' : ''}>激活</option>
                    <option value="false" ${!user.isActive ? 'selected' : ''}>禁用</option>
                </select>
            </div>
            <div class="action-buttons">
                <button type="submit">更新</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('编辑用户', content);
}

async function updateUser(e, userId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const roles = Array.from(formData.getAll('roles'));
    
    if (roles.length === 0) {
        alert('请至少选择一个角色');
        return;
    }

    const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone') || '',
        roles,
        isActive: formData.get('isActive') === 'true'
    };

    try {
        const response = await apiFetch(`${API_BASE}/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadUsers();
            showAlert('usersList', '用户更新成功', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('更新失败: ' + error.message);
    }
}

async function resetUserPassword(userId, userName) {
    if (!confirm(`确定要重置用户 "${userName}" 的密码吗？\n\n重置后，系统将生成一个新密码，用户首次登录时需要修改密码。`)) {
        return;
    }

    try {
        const response = await apiFetch(`${API_BASE}/users/${userId}/reset-password`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            // 显示新密码（管理员可以复制给用户）
            const newPassword = result.data.newPassword;
            const content = `
                <div style="padding: 20px;">
                    <p style="margin-bottom: 16px; color: #10b981; font-weight: 600;">密码重置成功！</p>
                    <div style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">新密码：</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="text" id="newPasswordDisplay" value="${newPassword}" readonly 
                                   style="flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; font-family: monospace; font-size: 14px; background: white;">
                            <button type="button" onclick="copyPasswordToClipboard('${newPassword}')" 
                                    style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                复制
                            </button>
                        </div>
                    </div>
                    <p style="font-size: 13px; color: #6b7280; margin-bottom: 16px;">
                        ⚠️ 请妥善保存并告知用户。用户首次登录时需要修改密码。
                    </p>
                    <div style="text-align: right;">
                        <button type="button" onclick="closeModal()" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            确定
                        </button>
                    </div>
                </div>
            `;
            showModal('密码重置成功', content);
            
            loadUsers();
            showAlert('usersList', '密码重置成功', 'success');
        } else {
            alert(result.message || '重置密码失败');
        }
    } catch (error) {
        alert('重置密码失败: ' + error.message);
    }
}

function copyPasswordToClipboard(password) {
    navigator.clipboard.writeText(password).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '已复制';
        btn.style.background = '#10b981';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '#667eea';
        }, 2000);
    }).catch(() => {
        // 如果复制失败，选中输入框内容让用户手动复制
        const input = document.getElementById('newPasswordDisplay');
        if (input) {
            input.select();
            input.setSelectionRange(0, 99999);
            alert('请手动复制密码（已选中）');
        }
    });
}

async function deleteUser(userId) {
    if (!confirm('确定要删除此用户吗？')) return;

    try {
        const response = await apiFetch(`${API_BASE}/users/${userId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            loadUsers();
            showAlert('usersList', '用户已删除', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// ==================== 客户管理 ====================
async function loadCustomers() {
    try {
        const response = await apiFetch(`${API_BASE}/customers`);
        const data = await response.json();

        if (data.success) {
            allCustomers = data.data;
            renderCustomersList(data.data);
            fillFinanceFilters();
            fillProjectCustomerFilter();
        }
    } catch (error) {
        console.error('加载客户失败:', error);
        showAlert('customersList', '加载客户失败: ' + error.message, 'error');
    }
}

function renderCustomersList(customers) {
    const html = `
        <table>
            <thead>
                <tr>
                    <th>客户名称</th>
                    <th>简称</th>
                    <th>联系人</th>
                    <th>联系电话</th>
                    <th>邮箱</th>
                    <th>状态</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${customers.length === 0 ? '<tr><td colspan="7" style="text-align: center;">暂无客户</td></tr>' : ''}
                ${customers.map(c => `
                    <tr>
                        <td>${c.name}</td>
                        <td>${c.shortName || '-'}</td>
                        <td>${c.contactPerson || '-'}</td>
                        <td>${c.phone || '-'}</td>
                        <td>${c.email || '-'}</td>
                        <td><span class="badge ${c.isActive ? 'badge-success' : 'badge-danger'}">${c.isActive ? '激活' : '禁用'}</span></td>
                        <td>
                            <button class="btn-small" onclick="editCustomer('${c._id}')">编辑</button>
                            ${currentUser.roles.includes('admin') ? `<button class="btn-small btn-danger" onclick="deleteCustomer('${c._id}')">删除</button>` : ''}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    document.getElementById('customersList').innerHTML = html;
}

async function searchCustomers() {
    const search = document.getElementById('customerSearch').value;
    try {
        const response = await apiFetch(`${API_BASE}/customers?search=${encodeURIComponent(search)}`);
        const data = await response.json();
        if (data.success) {
            renderCustomersList(data.data);
        }
    } catch (error) {
        console.error('搜索客户失败:', error);
    }
}

function showCreateCustomerModal() {
    const content = `
        <form id="createCustomerForm" onsubmit="createCustomer(event)">
            <div class="form-group">
                <label>客户名称 *</label>
                <input type="text" name="name" required>
            </div>
            <div class="form-group">
                <label>客户简称</label>
                <input type="text" name="shortName">
            </div>
            <div class="form-group">
                <label>联系人</label>
                <input type="text" name="contactPerson">
            </div>
            <div class="form-group">
                <label>联系电话</label>
                <input type="text" name="phone">
            </div>
            <div class="form-group">
                <label>邮箱</label>
                <input type="email" name="email">
            </div>
            <div class="form-group">
                <label>地址</label>
                <input type="text" name="address">
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea name="notes" rows="3"></textarea>
            </div>
            <div class="action-buttons">
                <button type="submit">创建</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('创建客户', content);
}

async function createCustomer(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        shortName: formData.get('shortName'),
        contactPerson: formData.get('contactPerson'),
        phone: formData.get('phone'),
        email: formData.get('email'),
        address: formData.get('address'),
        notes: formData.get('notes')
    };

    try {
        const response = await apiFetch(`${API_BASE}/customers`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadCustomers();
            showAlert('customersList', '客户创建成功', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('创建失败: ' + error.message);
    }
}

async function editCustomer(customerId) {
    const customer = allCustomers.find(c => c._id === customerId);
    if (!customer) {
        await loadCustomers();
        const updated = allCustomers.find(c => c._id === customerId);
        if (!updated) {
            alert('客户不存在');
            return;
        }
    }

    const c = customer || allCustomers.find(c => c._id === customerId);
    const content = `
        <form id="editCustomerForm" onsubmit="updateCustomer(event, '${customerId}')">
            <div class="form-group">
                <label>客户名称 *</label>
                <input type="text" name="name" value="${c.name}" required>
            </div>
            <div class="form-group">
                <label>客户简称</label>
                <input type="text" name="shortName" value="${c.shortName || ''}">
            </div>
            <div class="form-group">
                <label>联系人</label>
                <input type="text" name="contactPerson" value="${c.contactPerson || ''}">
            </div>
            <div class="form-group">
                <label>联系电话</label>
                <input type="text" name="phone" value="${c.phone || ''}">
            </div>
            <div class="form-group">
                <label>邮箱</label>
                <input type="email" name="email" value="${c.email || ''}">
            </div>
            <div class="form-group">
                <label>地址</label>
                <input type="text" name="address" value="${c.address || ''}">
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea name="notes" rows="3">${c.notes || ''}</textarea>
            </div>
            ${currentUser.roles.includes('admin') ? `
                <div class="form-group">
                    <label>状态</label>
                    <select name="isActive">
                        <option value="true" ${c.isActive ? 'selected' : ''}>激活</option>
                        <option value="false" ${!c.isActive ? 'selected' : ''}>禁用</option>
                    </select>
                </div>
            ` : ''}
            <div class="action-buttons">
                <button type="submit">更新</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('编辑客户', content);
}

async function updateCustomer(e, customerId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        shortName: formData.get('shortName'),
        contactPerson: formData.get('contactPerson'),
        phone: formData.get('phone'),
        email: formData.get('email'),
        address: formData.get('address'),
        notes: formData.get('notes')
    };

    if (currentUser.roles.includes('admin')) {
        data.isActive = formData.get('isActive') === 'true';
    }

    try {
        const response = await apiFetch(`${API_BASE}/customers/${customerId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadCustomers();
            showAlert('customersList', '客户更新成功', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('更新失败: ' + error.message);
    }
}

async function deleteCustomer(customerId) {
    if (!confirm('确定要删除此客户吗？')) return;

    try {
        const response = await apiFetch(`${API_BASE}/customers/${customerId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            loadCustomers();
            showAlert('customersList', '客户已删除', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// ==================== 项目管理 ====================
async function loadProjects() {
    try {
        const response = await apiFetch(`${API_BASE}/projects`);
        const data = await response.json();

        if (data.success) {
            allProjectsCache = data.data || [];
            renderProjects();
            fillFinanceProjectSelects();
        }
    } catch (error) {
        console.error('加载项目失败:', error);
        showAlert('projectsList', '加载项目失败: ' + error.message, 'error');
    }
}

function renderProjects() {
    const search = document.getElementById('projectSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('projectStatusFilter')?.value || '';
    const biz = document.getElementById('projectBizFilter')?.value || '';
    const cust = document.getElementById('projectCustomerFilter')?.value || '';
    const pageSizeSel = document.getElementById('projectPageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value, 10) || 10 : 10;
    const now = new Date();
    const filtered = allProjectsCache.filter(p => {
        const matchesSearch = !search || (p.projectName?.toLowerCase().includes(search)) || (p.projectNumber?.toLowerCase().includes(search)) || ((p.customerId?.name || p.clientName || '').toLowerCase().includes(search));
        const matchesStatus = !status || p.status === status;
        const matchesBiz = !biz || p.businessType === biz;
        const matchesCust = !cust || (p.customerId && p.customerId._id === cust);
        const matchesMonth = !projectFilterMonth || (p.createdAt && new Date(p.createdAt).toISOString().slice(0,7) === projectFilterMonth);
        const matchesDeliveryOverdue = !projectFilterDeliveryOverdue || (p.deadline && new Date(p.deadline) < now && p.status !== 'completed');
        return matchesSearch && matchesStatus && matchesBiz && matchesCust && matchesMonth && matchesDeliveryOverdue;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (projectPage > totalPages) projectPage = totalPages;
    const start = (projectPage - 1) * pageSize;
    const pageData = filtered.slice(start, start + pageSize);
    const showAmount = canViewProjectAmount();
    document.getElementById('projectsList').innerHTML = `
        <table class="table-sticky">
                    <thead>
                        <tr>
                            <th>项目编号</th>
                            <th>项目名称</th>
                            <th>客户名称</th>
                            <th>业务类型</th>
                            ${showAmount ? '<th>项目金额</th>' : ''}
                            <th>交付时间</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                ${(pageData.length ? pageData : []).map(p => `
                    <tr class="row-striped">
                                <td>${p.projectNumber || '-'}</td>
                                <td>${p.projectName}</td>
                                <td>${p.customerId?.name || p.clientName}</td>
                                <td>${getBusinessTypeText(p.businessType)}</td>
                                ${showAmount ? `<td>¥${p.projectAmount.toLocaleString()}</td>` : ''}
                                <td>${new Date(p.deadline).toLocaleDateString()}</td>
                                <td><span class="badge ${getStatusBadgeClass(p.status)}">${getStatusText(p.status)}</span></td>
                        <td><button class="btn-small" onclick="viewProject('${p._id}')">查看</button></td>
                            </tr>
                `).join('') || `<tr><td colspan="${showAmount ? 8 : 7}" style="text-align:center;">暂无项目</td></tr>`}
                    </tbody>
                </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${projectPage<=1?'disabled':''} onclick="projectPage=Math.max(1, projectPage-1);renderProjects();">上一页</button>
            <span style="align-self:center;">${projectPage} / ${totalPages}</span>
            <button class="btn-small" ${projectPage>=totalPages?'disabled':''} onclick="projectPage=Math.min(${totalPages}, projectPage+1);renderProjects();">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${projectPage}" style="width:70px;padding:6px;" onchange="jumpProjectPage(this.value, ${totalPages})">
        </div>
    `;
}

function jumpProjectPage(val, total) {
    const page = Math.min(Math.max(parseInt(val || 1, 10), 1), total);
    projectPage = page;
    renderProjects();
}

// 通用CSV导出函数，解决Excel中文乱码问题
// 注意：此函数使用UTF-8 BOM，但Excel可能仍显示乱码
// 建议使用后端API导出（GBK编码）以获得更好的兼容性
function exportToCSV(data, filename) {
    try {
        // 将数据转换为CSV格式
        const csv = data.map(row => 
            row.map(cell => {
                const str = (cell ?? '').toString();
                // 转义引号和换行符
                return `"${str.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '')}"`;
            }).join(',')
        ).join('\r\n'); // 使用Windows换行符
        
        // 使用UTF-8 BOM
        const BOM = '\uFEFF';
        const csvWithBOM = BOM + csv;
        
        // 使用TextEncoder确保UTF-8编码正确
        const encoder = new TextEncoder();
        const csvBytes = encoder.encode(csvWithBOM);
        
        // 创建Blob
        const blob = new Blob([csvBytes], { 
            type: 'text/csv;charset=utf-8;' 
        });
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('CSV导出失败:', error);
        showToast('导出失败: ' + error.message, 'error');
    }
}

function exportProjects() {
    const search = document.getElementById('projectSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('projectStatusFilter')?.value || '';
    const biz = document.getElementById('projectBizFilter')?.value || '';
    const cust = document.getElementById('projectCustomerFilter')?.value || '';
    const filtered = allProjectsCache.filter(p => {
        const matchesSearch = !search || (p.projectName?.toLowerCase().includes(search)) || (p.projectNumber?.toLowerCase().includes(search)) || ((p.customerId?.name || p.clientName || '').toLowerCase().includes(search));
        const matchesStatus = !status || p.status === status;
        const matchesBiz = !biz || p.businessType === biz;
        const matchesCust = !cust || (p.customerId && p.customerId._id === cust);
        return matchesSearch && matchesStatus && matchesBiz && matchesCust;
    });
    const showAmount = canViewProjectAmount();
    const rows = filtered.map(p => {
        const baseRow = [
        p.projectNumber || '-',
        p.projectName,
        p.customerId?.name || p.clientName,
            getBusinessTypeText(p.businessType)
        ];
        if (showAmount) {
            baseRow.push(p.projectAmount);
        }
        baseRow.push(
        new Date(p.deadline).toLocaleDateString(),
        getStatusText(p.status)
        );
        return baseRow;
    });
    const header = showAmount ? ['项目编号','项目名称','客户','业务类型','项目金额','交付时间','状态'] : ['项目编号','项目名称','客户','业务类型','交付时间','状态'];
    exportToCSV([header, ...rows], 'projects.csv');
}

function fillProjectCustomerFilter() {
    const sel = document.getElementById('projectCustomerFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="">全部客户</option>' + (allCustomers || []).map(c => `<option value="${c._id}">${c.name}</option>`).join('');
}

function fillFinanceFilters() {
    const custSel = document.getElementById('financeCustomer');
    if (custSel) {
        custSel.innerHTML = '<option value="">全部客户</option>' + (allCustomers || []).map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    }
    const salesSel = document.getElementById('financeSales');
    if (salesSel && allUsers?.length) {
        // 包含销售和兼职销售
        const sales = allUsers.filter(u => {
            const roles = u.roles || [];
            return roles.includes('sales') || roles.includes('part_time_sales');
        });
        salesSel.innerHTML = '<option value="">全部销售</option>' + sales.map(s => `<option value="${s._id}">${s.name}${(s.roles || []).includes('part_time_sales') ? ' (兼职)' : ''}</option>`).join('');
    } else if (salesSel && !allUsers?.length) {
        // 如果用户列表还没加载，显示提示
        salesSel.innerHTML = '<option value="">加载中...</option>';
    }
    
    // 填充回款记录部分的筛选下拉框
    const paymentCustSel = document.getElementById('paymentCustomer');
    if (paymentCustSel) {
        paymentCustSel.innerHTML = '<option value="">全部客户</option>' + (allCustomers || []).map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    }
    const paymentSalesSel = document.getElementById('paymentSales');
    if (paymentSalesSel && allUsers?.length) {
        // 包含销售和兼职销售
        const sales = allUsers.filter(u => {
            const roles = u.roles || [];
            return roles.includes('sales') || roles.includes('part_time_sales');
        });
        paymentSalesSel.innerHTML = '<option value="">全部销售</option>' + sales.map(s => `<option value="${s._id}">${s.name}${(s.roles || []).includes('part_time_sales') ? ' (兼职)' : ''}</option>`).join('');
    } else if (paymentSalesSel && !allUsers?.length) {
        // 如果用户列表还没加载，显示提示
        paymentSalesSel.innerHTML = '<option value="">加载中...</option>';
    }
    
    // 填充发票管理部分的筛选下拉框
    const invoiceCustSel = document.getElementById('invoiceCustomer');
    if (invoiceCustSel) {
        invoiceCustSel.innerHTML = '<option value="">全部客户</option>' + (allCustomers || []).map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    }
    const invoiceSalesSel = document.getElementById('invoiceSales');
    if (invoiceSalesSel && allUsers?.length) {
        // 包含销售和兼职销售
        const sales = allUsers.filter(u => {
            const roles = u.roles || [];
            return roles.includes('sales') || roles.includes('part_time_sales');
        });
        invoiceSalesSel.innerHTML = '<option value="">全部销售</option>' + sales.map(s => `<option value="${s._id}">${s.name}${(s.roles || []).includes('part_time_sales') ? ' (兼职)' : ''}</option>`).join('');
    } else if (invoiceSalesSel && !allUsers?.length) {
        // 如果用户列表还没加载，显示提示
        invoiceSalesSel.innerHTML = '<option value="">加载中...</option>';
    }
}

function fillFinanceProjectSelects() {
    // 不再需要填充下拉框，改为使用搜索选择器
}

// 显示项目选择器模态框
async function showProjectSelector(type) {
    // 确保项目列表已加载
    if (allProjectsCache.length === 0) {
        try {
            const response = await apiFetch(`${API_BASE}/projects`);
            const data = await response.json();
            if (data.success) {
                allProjectsCache = data.data;
            }
        } catch (error) {
            showToast('加载项目列表失败: ' + error.message, 'error');
            return;
        }
    }
    
    const content = `
        <div style="max-width: 800px; width: 90vw;">
            <div style="margin-bottom: 16px;">
                <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
                    <input type="text" id="projectSelectorSearch" placeholder="搜索项目编号、名称或客户..." 
                           style="flex: 1; min-width: 200px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                           onkeyup="filterProjectSelector()">
                    <select id="projectSelectorStatus" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;" onchange="filterProjectSelector()">
                        <option value="">全部状态</option>
                        <option value="pending">待开始</option>
                        <option value="in_progress">进行中</option>
                        <option value="completed">已完成</option>
                        <option value="cancelled">已取消</option>
                    </select>
                    <select id="projectSelectorBusinessType" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;" onchange="filterProjectSelector()">
                        <option value="">全部业务</option>
                        <option value="translation">笔译</option>
                        <option value="interpretation">口译</option>
                        <option value="transcription">转录</option>
                        <option value="localization">本地化</option>
                        <option value="other">其他</option>
                    </select>
                </div>
                <div style="font-size: 12px; color: #666;">
                    共 ${allProjectsCache.length} 个项目，使用搜索和筛选快速找到目标项目
                </div>
            </div>
            <div id="projectSelectorList" style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">
                ${renderProjectSelectorList(allProjectsCache, type)}
            </div>
        </div>
    `;
    
    showModal('选择项目', content);
    
    // 存储当前选择类型
    window.currentProjectSelectorType = type;
}

function renderProjectSelectorList(projects, type) {
    if (projects.length === 0) {
        return '<div style="padding: 20px; text-align: center; color: #999;">暂无项目</div>';
    }
    
    return `
        <table style="width: 100%; border-collapse: collapse;">
            <thead style="background: #f5f5f5; position: sticky; top: 0;">
                <tr>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">项目编号</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">项目名称</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">客户</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">业务类型</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">状态</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">金额</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">操作</th>
                </tr>
            </thead>
            <tbody>
                ${projects.map(p => `
                    <tr style="border-bottom: 1px solid #eee; cursor: pointer;" 
                        onmouseover="this.style.background='#f9f9f9'" 
                        onmouseout="this.style.background=''"
                        onclick="selectProject('${p._id}', '${(p.projectNumber || p.projectName || '').replace(/'/g, "\\'")}', '${(p.customerId?.name || p.clientName || '').replace(/'/g, "\\'")}', '${type}')">
                        <td style="padding: 10px;">${p.projectNumber || '-'}</td>
                        <td style="padding: 10px;">${p.projectName || '-'}</td>
                        <td style="padding: 10px;">${p.customerId?.name || p.clientName || '-'}</td>
                        <td style="padding: 10px;">${getBusinessTypeText(p.businessType)}</td>
                        <td style="padding: 10px;"><span class="badge ${getStatusBadgeClass(p.status)}">${getStatusText(p.status)}</span></td>
                        <td style="padding: 10px;">¥${(p.projectAmount || 0).toLocaleString()}</td>
                        <td style="padding: 10px;">
                            <button class="btn-small" onclick="event.stopPropagation(); selectProject('${p._id}', '${(p.projectNumber || p.projectName || '').replace(/'/g, "\\'")}', '${(p.customerId?.name || p.clientName || '').replace(/'/g, "\\'")}', '${type}')">选择</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function filterProjectSelector() {
    const search = document.getElementById('projectSelectorSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('projectSelectorStatus')?.value || '';
    const businessType = document.getElementById('projectSelectorBusinessType')?.value || '';
    const type = window.currentProjectSelectorType || 'payment';
    
    const filtered = allProjectsCache.filter(p => {
        const matchesSearch = !search || 
            (p.projectNumber || '').toLowerCase().includes(search) ||
            (p.projectName || '').toLowerCase().includes(search) ||
            ((p.customerId?.name || p.clientName || '')).toLowerCase().includes(search);
        const matchesStatus = !status || p.status === status;
        const matchesBusinessType = !businessType || p.businessType === businessType;
        return matchesSearch && matchesStatus && matchesBusinessType;
    });
    
    const listContainer = document.getElementById('projectSelectorList');
    if (listContainer) {
        listContainer.innerHTML = renderProjectSelectorList(filtered, type);
    }
}

function selectProject(projectId, projectName, customerName, type) {
    if (type === 'payment') {
        document.getElementById('paymentProjectId').value = projectId;
        document.getElementById('paymentProjectSearch').value = `${projectName} - ${customerName}`;
        document.getElementById('paymentProjectInfo').textContent = `已选择：${projectName}`;
    } else if (type === 'invoice') {
        document.getElementById('invoiceProjectId').value = projectId;
        document.getElementById('invoiceProjectSearch').value = `${projectName} - ${customerName}`;
        document.getElementById('invoiceProjectInfo').textContent = `已选择：${projectName}`;
        // 不需要自动刷新，用户点击新增发票时会刷新
    }
    closeModal();
}

async function showCreateProjectModal() {
    // 确保客户列表已加载
    if (allCustomers.length === 0) {
        await loadCustomers();
    }
    
    // 确保用户列表已加载（用于成员选择）
    if (allUsers.length === 0) {
        try {
            const response = await apiFetch(`${API_BASE}/users`);
            const data = await response.json();
            if (data.success) {
                allUsers = data.data;
            }
        } catch (error) {
            console.error('加载用户列表失败:', error);
        }
    }

    // 确保语种列表已加载
    if (languagesCache.length === 0) {
        await loadLanguages();
    }

    const languageOptions = languagesCache
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}">${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');

    const content = `
        <form id="createProjectForm" onsubmit="createProject(event)">
            <div class="form-group">
                <label>项目编号（留空自动生成）</label>
                <input type="text" name="projectNumber" placeholder="如：PRJ2024010001">
            </div>
            <div class="form-group">
                <label>项目名称 *</label>
                <input type="text" name="projectName" required>
            </div>
            <div class="form-group">
                <label>选择客户 *</label>
                <select name="customerId" id="projectCustomerSelect" required onchange="updateCustomerInfo()">
                    <option value="">请选择客户</option>
                    ${allCustomers.filter(c => c.isActive).map(c => 
                        `<option value="${c._id}">${c.name}${c.shortName ? ' (' + c.shortName + ')' : ''}</option>`
                    ).join('')}
                </select>
                <button type="button" class="btn-small" onclick="closeModal(); showCreateCustomerModal();" style="margin-top: 5px;">创建新客户</button>
            </div>
            <div class="form-group">
                <label>业务类型 *</label>
                <select name="businessType" id="businessType" required onchange="toggleProjectFields()">
                    <option value="translation">笔译</option>
                    <option value="interpretation">口译</option>
                    <option value="transcription">转录</option>
                    <option value="localization">本地化</option>
                    <option value="other">其他</option>
                </select>
            </div>
            <div class="form-group" id="projectTypeGroup">
                <label>项目类型（笔译项目）</label>
                <select name="projectType">
                    <option value="mtpe">MTPE</option>
                    <option value="deepedit">深度编辑</option>
                    <option value="review">审校项目</option>
                    <option value="mixed">混合类型</option>
                </select>
            </div>
            <div class="form-group">
                <label>源语种 *</label>
                <select name="sourceLanguage" id="sourceLanguageSelect" required>
                    <option value="">请选择源语种</option>
                    ${languageOptions}
                </select>
                </div>
            <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin-bottom: 0;">目标语言 *</label>
                    <button type="button" class="btn-small" onclick="addTargetLanguageRow()">+ 添加目标语种</button>
                </div>
                <div id="targetLanguagesContainer" style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- 目标语种行将动态添加到这里 -->
                </div>
                <small style="color:#666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个目标语种，支持一对多翻译</small>
                <div style="margin-top:8px;font-size:12px;color:#667eea;">
                    如需新增语种，请在"语种管理"中添加。
                </div>
            </div>
            <div class="form-group" id="wordCountGroup">
                <label>字数（笔译项目）</label>
                <input type="number" name="wordCount" id="wordCount" min="0" step="1" onchange="calculateAmount()">
            </div>
            <div class="form-group" id="unitPriceGroup">
                <label>单价（每千字，元）</label>
                <input type="number" name="unitPrice" id="unitPrice" min="0" step="0.01" onchange="calculateAmount()">
            </div>
            <div class="form-group">
                <label>项目总金额 *</label>
                <input type="number" name="projectAmount" id="projectAmount" step="0.01" min="0" required onchange="calculatePartTimeSalesCommission(); validateLayoutCost();">
                <small style="color: #666; font-size: 12px;">笔译项目：字数×单价/1000；其他项目：手动输入</small>
            </div>
            <div class="form-group">
                <label>交付时间 *</label>
                <input type="date" name="deadline" required>
            </div>
            <div class="form-group">
                <label>合同约定回款日期（协议付款日，未填默认创建日起 3 个月内）</label>
                <input type="date" name="expectedAt" id="createExpectedAt">
            </div>
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">其他信息（可选）</h4>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="isTaxIncluded">
                        是否含税
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="needInvoice">
                        需要发票
                    </label>
                </div>
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职销售（可选）</h4>
                <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" name="partTimeSales.isPartTime" id="partTimeSalesEnabled" onchange="togglePartTimeSalesFields()">
                    启用兼职销售
                </label>
                <div id="partTimeSalesFields" style="display: none; padding-left: 20px; border-left: 2px solid #667eea;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>公司应收金额（元）</label>
                        <input type="number" name="partTimeSales.companyReceivable" id="companyReceivable" step="0.01" min="0" onchange="calculatePartTimeSalesCommission()" style="width: 100%;">
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>税率（%）</label>
                        <input type="number" name="partTimeSales.taxRate" id="taxRate" step="0.01" min="0" max="100" value="10" onchange="calculatePartTimeSalesCommission()" style="width: 100%;">
                        <small style="color: #666; font-size: 12px;">例如：10 表示 10%</small>
                    </div>
                    <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <label style="font-weight: 600; color: #0369a1;">返还佣金（自动计算）</label>
                        <div id="partTimeSalesCommissionDisplay" style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                            ¥0.00
                        </div>
                        <small style="color: #666; font-size: 12px; display: block; margin-top: 5px;">公式：成交额 - 公司应收 - 税费</small>
                    </div>
                </div>
            </div>
            
            ${(() => {
                // 判断是否是销售或兼职销售（销售创建项目时不能设置兼职排版，由项目经理添加）
                const isSales = currentUser?.roles?.includes('sales') || currentUser?.roles?.includes('part_time_sales');
                const isAdmin = currentUser?.roles?.includes('admin');
                // 只有管理员和项目经理可以在创建项目时设置兼职排版
                if (isSales && !isAdmin) {
                    return '';
                }
                return `
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职排版（可选）</h4>
                <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" name="partTimeLayout.isPartTime" id="partTimeLayoutEnabled" onchange="togglePartTimeLayoutFields()">
                    启用兼职排版
                </label>
                <div id="partTimeLayoutFields" style="display: none; padding-left: 20px; border-left: 2px solid #667eea;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>选择排版员</label>
                        <select name="partTimeLayout.layoutAssignedTo" id="layoutAssignedTo" style="width: 100%;">
                            <option value="">请选择排版员</option>
                            ${allUsers.filter(u => u.isActive).map(u => 
                                `<option value="${u._id}">${u.name} (${u.username})</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>排版费用（元）</label>
                        <input type="number" name="partTimeLayout.layoutCost" id="layoutCost" step="0.01" min="0" onchange="validateLayoutCost()" style="width: 100%;">
                        <small style="color: #666; font-size: 12px;">排版费用不能超过项目总金额的5%</small>
                    </div>
                    <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <label style="font-weight: 600; color: #0369a1;">费用占比（自动计算）</label>
                        <div id="layoutCostPercentageDisplay" style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                            0%
                        </div>
                        <div id="layoutCostValidation" style="margin-top: 5px;"></div>
                    </div>
                </div>
            </div>
                `;
            })()}
            <div class="form-group">
                <label>特殊要求</label>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; margin-top: 5px;">
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="specialRequirements.terminology">
                        术语表
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="specialRequirements.nda">
                        保密协议
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="specialRequirements.referenceFiles">
                        参考文件
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="specialRequirements.pureTranslationDelivery">
                        纯译文交付
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="specialRequirements.bilingualDelivery">
                        对照版交付
                    </label>
                </div>
                <textarea name="specialRequirements.notes" rows="2" placeholder="其他特殊要求备注" style="margin-top: 10px;"></textarea>
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <label style="margin-bottom: 0;">项目成员（可选，创建后也可添加）</label>
                    <button type="button" class="btn-small" onclick="addMemberRow()">+ 添加项目经理</button>
                </div>
                <div id="membersContainer" style="max-height: 300px; overflow-y: auto;">
                    <!-- 成员行将动态添加到这里 -->
                </div>
                <small style="color: #666; font-size: 12px;">提示：销售创建项目时只能添加项目经理，翻译、审校、排版等成员由项目经理在项目详情中添加</small>
            </div>
            
            <div class="action-buttons">
                <button type="button" onclick="exportQuotationPreview()" style="background: #10b981; margin-right: 10px;">📄 导出报价单</button>
                <button type="submit">创建</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('创建项目', content);
    // 重置成员容器和目标语种容器
    document.getElementById('membersContainer').innerHTML = '';
    document.getElementById('targetLanguagesContainer').innerHTML = '';
    // 添加第一个目标语种行
    addTargetLanguageRow();
    // 设置协议付款日默认值：创建日起 3 个月
    const expectedAtInput = document.getElementById('createExpectedAt');
    if (expectedAtInput) {
        const d = new Date();
        d.setMonth(d.getMonth() + 3);
        expectedAtInput.value = d.toISOString().slice(0, 10);
    }
}

let targetLanguageRowIndex = 0;

function addTargetLanguageRow() {
    // 确保语种列表已加载
    if (languagesCache.length === 0) {
        showToast('请先等待语种列表加载完成', 'error');
        return;
    }
    
    targetLanguageRowIndex++;
    const container = document.getElementById('targetLanguagesContainer');
    if (!container) return;
    
    const languageOptions = languagesCache
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}">${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    
    const row = document.createElement('div');
    row.className = 'target-language-row';
    row.id = `targetLanguageRow${targetLanguageRowIndex}`;
    row.style.cssText = 'display: flex; gap: 10px; align-items: flex-end; padding: 8px; background: #f8f9fa; border-radius: 4px;';
    
    row.innerHTML = `
        <div style="flex: 1;">
            <label style="font-size: 12px; display: block; margin-bottom: 4px;">目标语种 ${targetLanguageRowIndex}</label>
            <select class="target-language-select" required style="width: 100%; padding: 6px;">
                <option value="">请选择目标语种</option>
                ${languageOptions}
            </select>
        </div>
        <div style="flex: 0 0 auto;">
            <button type="button" class="btn-small btn-danger" onclick="removeTargetLanguageRow('targetLanguageRow${targetLanguageRowIndex}')" style="margin-bottom: 0;">删除</button>
        </div>
    `;
    container.appendChild(row);
}

function removeTargetLanguageRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        // 重新编号
        const container = document.getElementById('targetLanguagesContainer');
        if (container) {
            const rows = container.querySelectorAll('.target-language-row');
            rows.forEach((r, index) => {
                const label = r.querySelector('label');
                if (label) {
                    label.textContent = `目标语种 ${index + 1}`;
                }
            });
        }
    }
}

function addEditTargetLanguageRow(selectedValue = '') {
    // 确保语种列表已加载
    if (languagesCache.length === 0) {
        showToast('请先等待语种列表加载完成', 'error');
        return;
    }
    
    targetLanguageRowIndex++;
    const container = document.getElementById('editTargetLanguagesContainer');
    if (!container) return;
    
    const languageOptions = languagesCache
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}" ${selectedValue === lang.name ? 'selected' : ''}>${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    
    const row = document.createElement('div');
    row.className = 'target-language-row';
    row.id = `targetLanguageRow${targetLanguageRowIndex}`;
    row.style.cssText = 'display: flex; gap: 10px; align-items: flex-end; padding: 8px; background: #f8f9fa; border-radius: 4px;';
    
    const rowNumber = container.querySelectorAll('.target-language-row').length + 1;
    row.innerHTML = `
        <div style="flex: 1;">
            <label style="font-size: 12px; display: block; margin-bottom: 4px;">目标语种 ${rowNumber}</label>
            <select class="target-language-select" required style="width: 100%; padding: 6px;">
                <option value="">请选择目标语种</option>
                ${languageOptions}
            </select>
        </div>
        <div style="flex: 0 0 auto;">
            <button type="button" class="btn-small btn-danger" onclick="removeEditTargetLanguageRow('targetLanguageRow${targetLanguageRowIndex}')" style="margin-bottom: 0;">删除</button>
        </div>
    `;
    container.appendChild(row);
}

function removeEditTargetLanguageRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        // 重新编号
        const container = document.getElementById('editTargetLanguagesContainer');
        if (container) {
            const rows = container.querySelectorAll('.target-language-row');
            rows.forEach((r, index) => {
                const label = r.querySelector('label');
                if (label) {
                    label.textContent = `目标语种 ${index + 1}`;
                }
            });
        }
    }
}

let memberRowIndex = 0;
let projectMemberRolesLoadedPromise = null;

async function ensureProjectMemberRoles() {
    if (window.projectMemberRoles && Array.isArray(window.projectMemberRoles)) {
        return window.projectMemberRoles;
    }
    if (projectMemberRolesLoadedPromise) {
        return projectMemberRolesLoadedPromise;
    }
    projectMemberRolesLoadedPromise = (async () => {
        try {
            // 使用专门的接口获取「可作为项目成员」的角色，非管理员也可访问
            const res = await apiFetch(`/roles/project-member-roles`);
            const data = await res.json();
            if (data.success) {
                const roles = (data.data || [])
                    .filter(r => r.isActive && r.canBeProjectMember)
                    .map(r => ({ value: r.code, label: r.name }));
                window.projectMemberRoles = roles;
                return roles;
            }
        } catch (err) {
            console.error('加载项目成员角色失败:', err);
        }
        window.projectMemberRoles = [];
        return [];
    })();
    return projectMemberRolesLoadedPromise;
}

async function addMemberRow() {
    // 确保用户列表已加载
    if (allUsers.length === 0) {
        try {
            const response = await apiFetch(`${API_BASE}/users`);
            const data = await response.json();
            if (data.success) {
                allUsers = data.data;
            } else {
                alert('无法加载用户列表: ' + (data.message || '未知错误'));
                return;
            }
        } catch (error) {
            alert('加载用户列表失败: ' + error.message);
            return;
        }
    }
    
    // 判断当前用户是否是销售或兼职销售（创建项目时只能添加项目经理）
    const isSales = currentUser?.roles?.includes('sales') || currentUser?.roles?.includes('part_time_sales');
    
    memberRowIndex++;
    const container = document.getElementById('membersContainer');
    const row = document.createElement('div');
    row.className = 'member-row';
    row.id = `memberRow${memberRowIndex}`;
    row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; align-items: flex-end;';
    
    const dynamicProjectMemberRoles = await ensureProjectMemberRoles();
    const baseRoles = isSales ? [
        { value: 'pm', label: '项目经理' }
    ] : [
        { value: 'translator', label: '翻译' },
        { value: 'reviewer', label: '审校' },
        { value: 'pm', label: '项目经理' },
        { value: 'sales', label: '销售' },
        { value: 'admin_staff', label: '综合岗' },
        { value: 'part_time_sales', label: '兼职销售' },
        { value: 'layout', label: '兼职排版' }
    ];
    const combinedRoles = [
        ...baseRoles,
        ...dynamicProjectMemberRoles.filter(r => !baseRoles.some(b => b.value === r.value))
    ];
    const roleOptions = `
                <option value="">请选择</option>
                ${combinedRoles.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
    `;
    
    // 过滤用户列表：如果销售有PM角色，且当前选择的是PM角色，则过滤掉自己
    let filteredUsers = allUsers.filter(u => u.isActive);
    if (isSales && currentUser) {
        const hasPMRole = currentUser.roles?.includes('pm');
        // 如果销售有PM角色，在创建项目时选择PM角色时，过滤掉自己
        // 注意：这里我们无法知道用户会选择什么角色，所以需要在onchange事件中处理
        // 但为了安全，我们可以在用户选择PM角色时动态过滤
    }
    
    row.innerHTML = `
        <div style="flex: 2;">
            <label style="font-size: 12px;">选择用户</label>
            <select name="memberUserId" class="member-user-select" required onchange="validateMemberSelection(this)">
                <option value="">请选择</option>
                ${filteredUsers.map(u => 
                    `<option value="${u._id}">${u.name} (${u.username})</option>`
                ).join('')}
            </select>
        </div>
        <div style="flex: 1.5;">
            <label style="font-size: 12px;">角色</label>
            <select name="memberRole" class="member-role-select" required onchange="toggleMemberFields(this); filterMemberUsersByRole(this)">
                ${roleOptions}
            </select>
        </div>
        <div class="member-translator-group" style="flex: 1; display: none;">
            <label style="font-size: 12px;">翻译类型</label>
            <select name="memberTranslatorType">
                <option value="mtpe">MTPE</option>
                <option value="deepedit">深度编辑</option>
            </select>
        </div>
        <div class="member-wordratio-group" style="flex: 1; display: none;">
            <label style="font-size: 12px;">字数占比</label>
            <input type="number" name="memberWordRatio" step="0.01" min="0" max="1" value="1.0" style="width: 100%;">
        </div>
        <div style="flex: 0.5;">
            <button type="button" class="btn-small btn-danger" onclick="removeMemberRow('memberRow${memberRowIndex}')">删除</button>
        </div>
    `;
    container.appendChild(row);
}

function removeMemberRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
    }
}

function toggleMemberFields(selectElement) {
    const row = selectElement.closest('.member-row');
    const role = selectElement.value;
    const translatorGroup = row.querySelector('.member-translator-group');
    const wordRatioGroup = row.querySelector('.member-wordratio-group');
    
    if (role === 'translator') {
        translatorGroup.style.display = 'block';
        wordRatioGroup.style.display = 'block';
    } else {
        translatorGroup.style.display = 'none';
        wordRatioGroup.style.display = 'none';
    }
    
    // 根据角色过滤用户列表
    filterMemberUsersByRole(selectElement);
}

// 根据角色过滤成员用户列表（创建项目时使用）
function filterMemberUsersByRole(selectElement) {
    const row = selectElement.closest('.member-row');
    if (!row) return;
    
    const role = selectElement.value;
    const userSelect = row.querySelector('.member-user-select');
    
    if (!userSelect || !role) return;
    
    // 过滤出具有该角色的激活用户
    let filteredUsers = allUsers.filter(u => {
        if (!u.isActive) return false;
        return u.roles && Array.isArray(u.roles) && u.roles.includes(role);
    });
    
    // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许
    // 前端不再过滤用户列表，以保持与后端配置的一致性
    
    // 更新下拉列表
    const currentValue = userSelect.value;
    userSelect.innerHTML = '<option value="">请选择</option>' + 
        filteredUsers.map(u => `<option value="${u._id}">${u.name} (${u.username})</option>`).join('');
    
    // 如果之前选中的用户还在列表中，恢复选中
    if (currentValue && filteredUsers.some(u => u._id === currentValue)) {
        userSelect.value = currentValue;
    } else {
        userSelect.value = '';
    }
}

// 验证成员选择（创建项目时使用）
function validateMemberSelection(selectElement) {
    // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许
    // 前端不再进行自分配限制验证，以保持与后端配置的一致性
}

function toggleProjectFields() {
    const businessType = document.getElementById('businessType').value;
    const wordCountGroup = document.getElementById('wordCountGroup');
    const unitPriceGroup = document.getElementById('unitPriceGroup');
    const projectTypeGroup = document.getElementById('projectTypeGroup');
    
    if (businessType === 'translation') {
        wordCountGroup.style.display = 'block';
        unitPriceGroup.style.display = 'block';
        projectTypeGroup.style.display = 'block';
    } else {
        wordCountGroup.style.display = 'none';
        unitPriceGroup.style.display = 'none';
        projectTypeGroup.style.display = 'none';
        document.getElementById('wordCount').value = '';
        document.getElementById('unitPrice').value = '';
    }
}

function calculateAmount() {
    const businessType = document.getElementById('businessType')?.value;
    const wordCount = parseFloat(document.getElementById('wordCount')?.value || 0);
    const unitPrice = parseFloat(document.getElementById('unitPrice')?.value || 0);
    const amountInput = document.getElementById('projectAmount');
    
    if (businessType === 'translation' && wordCount > 0 && unitPrice > 0) {
        const amount = (wordCount / 1000) * unitPrice;
        if (amountInput) {
            amountInput.value = amount.toFixed(2);
        }
    }
    
    // 重新计算兼职销售佣金和排版费用校验
    calculatePartTimeSalesCommission();
    validateLayoutCost();
}

// 切换兼职销售字段显示
function togglePartTimeSalesFields() {
    const enabled = document.getElementById('partTimeSalesEnabled')?.checked;
    const fields = document.getElementById('partTimeSalesFields');
    if (fields) {
        fields.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            calculatePartTimeSalesCommission();
        }
    }
}

// 计算兼职销售佣金
function calculatePartTimeSalesCommission() {
    const enabled = document.getElementById('partTimeSalesEnabled')?.checked;
    if (!enabled) {
        const display = document.getElementById('partTimeSalesCommissionDisplay');
        if (display) display.textContent = '¥0.00';
        return;
    }
    
    const totalAmount = parseFloat(document.getElementById('projectAmount')?.value || 0);
    const companyReceivable = parseFloat(document.getElementById('companyReceivable')?.value || 0);
    const taxRatePercent = parseFloat(document.getElementById('taxRate')?.value || 0);
    const taxRate = taxRatePercent / 100; // 转换为小数
    
    if (totalAmount <= 0) {
        const display = document.getElementById('partTimeSalesCommissionDisplay');
        if (display) display.textContent = '¥0.00';
        return;
    }
    
    // 计算应收金额
    const receivableAmount = totalAmount - companyReceivable;
    
    // 计算税费
    const taxAmount = receivableAmount * taxRate;
    
    // 计算税后金额（返还佣金）
    const commission = receivableAmount - taxAmount;
    const finalCommission = Math.max(0, Math.round(commission * 100) / 100);
    
    const display = document.getElementById('partTimeSalesCommissionDisplay');
    if (display) {
        display.textContent = `¥${finalCommission.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

// 切换兼职排版字段显示
function togglePartTimeLayoutFields() {
    const enabled = document.getElementById('partTimeLayoutEnabled')?.checked;
    const fields = document.getElementById('partTimeLayoutFields');
    if (fields) {
        fields.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            validateLayoutCost();
        }
    }
}

// 编辑表单：切换兼职销售字段显示
function toggleEditPartTimeSalesFields() {
    const enabled = document.getElementById('editPartTimeSalesEnabled')?.checked;
    const fields = document.getElementById('editPartTimeSalesFields');
    if (fields) {
        fields.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            calculateEditPartTimeSalesCommission();
        }
    }
}

// 编辑表单：计算兼职销售佣金
function calculateEditPartTimeSalesCommission() {
    const enabled = document.getElementById('editPartTimeSalesEnabled')?.checked;
    if (!enabled) {
        const display = document.getElementById('editPartTimeSalesCommissionDisplay');
        if (display) display.textContent = '¥0.00';
        return;
    }
    
    const totalAmount = parseFloat(document.querySelector('#editProjectForm [name="projectAmount"]')?.value || 0);
    const companyReceivable = parseFloat(document.getElementById('editCompanyReceivable')?.value || 0);
    const taxRatePercent = parseFloat(document.getElementById('editTaxRate')?.value || 0);
    const taxRate = taxRatePercent / 100;
    
    if (totalAmount <= 0) {
        const display = document.getElementById('editPartTimeSalesCommissionDisplay');
        if (display) display.textContent = '¥0.00';
        return;
    }
    
    const receivableAmount = totalAmount - companyReceivable;
    const taxAmount = receivableAmount * taxRate;
    const commission = receivableAmount - taxAmount;
    const finalCommission = Math.max(0, Math.round(commission * 100) / 100);
    
    const display = document.getElementById('editPartTimeSalesCommissionDisplay');
    if (display) {
        display.textContent = `¥${finalCommission.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

// 编辑表单：切换兼职排版字段显示
function toggleEditPartTimeLayoutFields() {
    const enabled = document.getElementById('editPartTimeLayoutEnabled')?.checked;
    const fields = document.getElementById('editPartTimeLayoutFields');
    if (fields) {
        fields.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            validateEditLayoutCost();
        }
    }
}

// 编辑表单：校验排版费用
function validateEditLayoutCost() {
    const enabled = document.getElementById('editPartTimeLayoutEnabled')?.checked;
    if (!enabled) {
        const display = document.getElementById('editLayoutCostPercentageDisplay');
        const validation = document.getElementById('editLayoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '';
        return;
    }
    
    const projectAmount = parseFloat(document.querySelector('#editProjectForm [name="projectAmount"]')?.value || 0);
    const layoutCost = parseFloat(document.getElementById('editLayoutCost')?.value || 0);
    
    if (projectAmount <= 0) {
        const display = document.getElementById('editLayoutCostPercentageDisplay');
        const validation = document.getElementById('editLayoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '<small style="color: #999;">请输入项目总金额</small>';
        return;
    }
    
    if (layoutCost <= 0) {
        const display = document.getElementById('editLayoutCostPercentageDisplay');
        const validation = document.getElementById('editLayoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '';
        return;
    }
    
    const percentage = (layoutCost / projectAmount) * 100;
    const roundedPercentage = Math.round(percentage * 100) / 100;
    
    const display = document.getElementById('editLayoutCostPercentageDisplay');
    const validation = document.getElementById('editLayoutCostValidation');
    
    if (display) {
        display.textContent = `${roundedPercentage}%`;
        if (roundedPercentage > 5) {
            display.style.color = '#dc2626';
        } else {
            display.style.color = '#0369a1';
        }
    }
    
    if (validation) {
        if (roundedPercentage > 5) {
            validation.innerHTML = `<small style="color: #dc2626; font-weight: 600;">⚠️ 排版费用超过项目总金额的5%，请调整费用</small>`;
        } else if (roundedPercentage > 4.5) {
            validation.innerHTML = `<small style="color: #f59e0b;">⚠️ 接近5%限制，请注意</small>`;
        } else {
            validation.innerHTML = `<small style="color: #059669;">✓ 费用在允许范围内</small>`;
        }
    }
}

// 校验排版费用
function validateLayoutCost() {
    const enabled = document.getElementById('partTimeLayoutEnabled')?.checked;
    if (!enabled) {
        const display = document.getElementById('layoutCostPercentageDisplay');
        const validation = document.getElementById('layoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '';
        return;
    }
    
    const projectAmount = parseFloat(document.getElementById('projectAmount')?.value || 0);
    const layoutCost = parseFloat(document.getElementById('layoutCost')?.value || 0);
    
    if (projectAmount <= 0) {
        const display = document.getElementById('layoutCostPercentageDisplay');
        const validation = document.getElementById('layoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '<small style="color: #999;">请输入项目总金额</small>';
        return;
    }
    
    if (layoutCost <= 0) {
        const display = document.getElementById('layoutCostPercentageDisplay');
        const validation = document.getElementById('layoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '';
        return;
    }
    
    // 计算百分比
    const percentage = (layoutCost / projectAmount) * 100;
    const roundedPercentage = Math.round(percentage * 100) / 100;
    
    const display = document.getElementById('layoutCostPercentageDisplay');
    const validation = document.getElementById('layoutCostValidation');
    
    if (display) {
        display.textContent = `${roundedPercentage}%`;
        if (roundedPercentage > 5) {
            display.style.color = '#dc2626';
        } else {
            display.style.color = '#0369a1';
        }
    }
    
    if (validation) {
        if (roundedPercentage > 5) {
            validation.innerHTML = `<small style="color: #dc2626; font-weight: 600;">⚠️ 排版费用超过项目总金额的5%，请调整费用</small>`;
        } else if (roundedPercentage > 4.5) {
            validation.innerHTML = `<small style="color: #f59e0b;">⚠️ 接近5%限制，请注意</small>`;
        } else {
            validation.innerHTML = `<small style="color: #059669;">✓ 费用在允许范围内</small>`;
        }
    }
}

function updateCustomerInfo() {
    // 可以在这里显示客户信息，但不需要修改表单
}

// 导出项目报价单（已创建的项目）
async function exportProjectQuotation(projectId) {
    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}/quotation`);
        
        // 检查Content-Type，如果是Excel文件则直接下载
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('spreadsheetml')) {
            // 获取文件名
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = '报价单.xlsx';
            if (contentDisposition) {
                // 优先解析 filename*=UTF-8'' 格式
                const utf8Match = contentDisposition.match(/filename\*=UTF-8''(.+)/);
                if (utf8Match && utf8Match[1]) {
                    try {
                        filename = decodeURIComponent(utf8Match[1]);
                    } catch (e) {
                        filename = utf8Match[1];
                    }
                } else {
                    // 回退到标准格式
                    const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                    if (matches && matches[1]) {
                        filename = matches[1].replace(/['"]/g, '');
                        try {
                            filename = decodeURIComponent(filename);
                        } catch (e) {
                            // 如果解码失败，使用原始文件名
                        }
                    }
                }
            }
            
            // 下载文件
            const blob = await response.blob();
            
            // 验证blob是否有效
            if (!blob || blob.size === 0) {
                alert('导出的文件为空，请重试');
                return;
            }
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showToast('报价单导出成功', 'success');
            return;
        }
        
        // 如果不是Excel文件，尝试解析为JSON错误信息
        if (!response.ok) {
            const text = await response.text();
            let error;
            try {
                error = JSON.parse(text);
            } catch (e) {
                error = { message: text || '导出失败' };
            }
            alert('导出失败: ' + (error.message || '未知错误'));
            return;
        }
    } catch (error) {
        console.error('导出报价单失败:', error);
        alert('导出失败: ' + error.message);
    }
}

// 导出报价单预览（基于表单数据）
async function exportQuotationPreview() {
    try {
        const form = document.getElementById('createProjectForm');
        if (!form) {
            alert('请先填写项目信息');
            return;
        }
        
        const formData = new FormData(form);
        
        // 收集目标语种
        const targetLanguages = [];
        const targetLangInputs = document.querySelectorAll('#targetLanguagesContainer input[type="text"]');
        targetLangInputs.forEach(input => {
            if (input.value.trim()) {
                targetLanguages.push(input.value.trim());
            }
        });
        
        if (targetLanguages.length === 0) {
            alert('请至少添加一个目标语种');
            return;
        }
        
        // 收集特殊要求
        const specialRequirements = {
            terminology: formData.get('specialRequirements.terminology') === 'on',
            nda: formData.get('specialRequirements.nda') === 'on',
            referenceFiles: formData.get('specialRequirements.referenceFiles') === 'on',
            pureTranslationDelivery: formData.get('specialRequirements.pureTranslationDelivery') === 'on',
            bilingualDelivery: formData.get('specialRequirements.bilingualDelivery') === 'on',
            notes: formData.get('specialRequirements.notes') || undefined
        };
        
        // 验证必填字段
        if (!formData.get('projectName') || !formData.get('customerId') || !formData.get('deadline')) {
            alert('请填写项目名称、客户和交付时间');
            return;
        }
        
        // 构建项目数据
        const projectData = {
            projectNumber: formData.get('projectNumber') || undefined,
            projectName: formData.get('projectName'),
            customerId: formData.get('customerId'),
            businessType: formData.get('businessType'),
            projectType: formData.get('projectType') || undefined,
            sourceLanguage: formData.get('sourceLanguage'),
            targetLanguages: targetLanguages,
            wordCount: formData.get('wordCount') ? parseFloat(formData.get('wordCount')) : undefined,
            unitPrice: formData.get('unitPrice') ? parseFloat(formData.get('unitPrice')) : undefined,
            projectAmount: parseFloat(formData.get('projectAmount')) || 0,
            deadline: formData.get('deadline'),
            expectedAt: formData.get('expectedAt') || undefined,
            isTaxIncluded: formData.get('isTaxIncluded') === 'on',
            needInvoice: formData.get('needInvoice') === 'on',
            specialRequirements: Object.keys(specialRequirements).some(k => specialRequirements[k] || specialRequirements[k] === '') ? specialRequirements : undefined
        };
        
        // 调用导出API
        const response = await apiFetch(`${API_BASE}/projects/quotation/preview`, {
            method: 'POST',
            body: JSON.stringify(projectData)
        });
        
        // 检查Content-Type，如果是Excel文件则直接下载
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('spreadsheetml')) {
            // 下载文件
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `报价单-${projectData.projectName}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showToast('报价单导出成功', 'success');
            return;
        }
        
        // 如果不是Excel文件，尝试解析为JSON错误信息
        if (!response.ok) {
            const text = await response.text();
            let error;
            try {
                error = JSON.parse(text);
            } catch (e) {
                error = { message: text || '导出失败' };
            }
            alert('导出失败: ' + (error.message || '未知错误'));
            return;
        }
    } catch (error) {
        console.error('导出报价单失败:', error);
        alert('导出失败: ' + error.message);
    }
}

async function createProject(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // 收集成员信息
    const members = [];
    const memberRows = document.querySelectorAll('.member-row');
    memberRows.forEach(row => {
        const userId = row.querySelector('.member-user-select')?.value;
        const role = row.querySelector('.member-role-select')?.value;
        if (userId && role) {
            // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许
            
            const member = {
                userId,
                role,
                translatorType: role === 'translator' ? (row.querySelector('[name="memberTranslatorType"]')?.value || 'mtpe') : undefined,
                wordRatio: role === 'translator' ? parseFloat(row.querySelector('[name="memberWordRatio"]')?.value || '1.0') : undefined
            };
            members.push(member);
        }
    });
    
    // 收集特殊要求
    const specialRequirements = {
        terminology: formData.get('specialRequirements.terminology') === 'on',
        nda: formData.get('specialRequirements.nda') === 'on',
        referenceFiles: formData.get('specialRequirements.referenceFiles') === 'on',
        pureTranslationDelivery: formData.get('specialRequirements.pureTranslationDelivery') === 'on',
        bilingualDelivery: formData.get('specialRequirements.bilingualDelivery') === 'on',
        notes: formData.get('specialRequirements.notes') || undefined
    };
    
    // 收集目标语言
    const targetLanguageRows = document.querySelectorAll('.target-language-select');
    const targetLanguages = Array.from(targetLanguageRows)
        .map(select => select.value)
        .filter(value => value && value.trim() !== '');
    
    if (targetLanguages.length === 0) {
        alert('请至少添加并选择一个目标语种');
        return;
    }

    // 收集兼职销售信息
    const partTimeSalesEnabled = formData.get('partTimeSales.isPartTime') === 'on';
    const partTimeSales = partTimeSalesEnabled ? {
        isPartTime: true,
        companyReceivable: parseFloat(formData.get('partTimeSales.companyReceivable') || 0),
        taxRate: parseFloat(formData.get('partTimeSales.taxRate') || 0) / 100 // 转换为小数
    } : undefined;
    
    // 收集兼职排版信息
    const partTimeLayoutEnabled = formData.get('partTimeLayout.isPartTime') === 'on';
    const layoutCost = parseFloat(formData.get('partTimeLayout.layoutCost') || 0);
    const layoutAssignedTo = formData.get('partTimeLayout.layoutAssignedTo');
    
    // 校验排版费用
    if (partTimeLayoutEnabled && layoutCost > 0) {
        const projectAmount = parseFloat(formData.get('projectAmount'));
        const percentage = (layoutCost / projectAmount) * 100;
        if (percentage > 5) {
            alert(`排版费用(${layoutCost})不能超过项目总金额(${projectAmount})的5%，当前占比为${percentage.toFixed(2)}%`);
            return;
        }
        if (!layoutAssignedTo) {
            alert('请选择排版员');
            return;
        }
    }
    
    const partTimeLayout = partTimeLayoutEnabled ? {
        isPartTime: true,
        layoutCost: layoutCost,
        layoutAssignedTo: layoutAssignedTo || undefined
    } : undefined;
    
    // 协议回款日，默认创建日起 3 个月内
    const expectedAtInput = formData.get('expectedAt');
    const defaultExpected = new Date();
    defaultExpected.setMonth(defaultExpected.getMonth() + 3);
    
    const data = {
        projectNumber: formData.get('projectNumber') || undefined,
        projectName: formData.get('projectName'),
        customerId: formData.get('customerId'),
        businessType: formData.get('businessType'),
        projectType: formData.get('projectType') || undefined,
        sourceLanguage: formData.get('sourceLanguage'),
        targetLanguages: targetLanguages,
        wordCount: formData.get('wordCount') ? parseFloat(formData.get('wordCount')) : undefined,
        unitPrice: formData.get('unitPrice') ? parseFloat(formData.get('unitPrice')) : undefined,
        projectAmount: parseFloat(formData.get('projectAmount')),
        deadline: formData.get('deadline'),
        expectedAt: expectedAtInput || defaultExpected.toISOString().slice(0,10),
        isTaxIncluded: formData.get('isTaxIncluded') === 'on',
        needInvoice: formData.get('needInvoice') === 'on',
        specialRequirements: Object.keys(specialRequirements).some(k => specialRequirements[k]) ? specialRequirements : undefined,
        members: members.length > 0 ? members : undefined,
        partTimeSales: partTimeSales,
        partTimeLayout: partTimeLayout
    };

    try {
        const response = await apiFetch(`${API_BASE}/projects/create`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadProjects();
            showAlert('projectsList', '项目创建成功' + (members.length > 0 ? `，已添加 ${members.length} 名成员` : ''), 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('创建失败: ' + error.message);
    }
}

async function viewProject(projectId) {
    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}`);
        const data = await response.json();

        if (data.success) {
            const project = data.data;
            currentProjectDetail = project;
            const isAdmin = currentUser.roles.includes('admin');
            const isPM = currentUser.roles.includes('pm');
            const isSales = currentUser.roles.includes('sales');
            const isPartTimeSales = currentUser.roles.includes('part_time_sales');

            const canStart = isAdmin || isSales || isPartTimeSales; // 开始：管理员、销售、兼职销售
            const canSchedule = isAdmin || isPM; // 已安排：管理员、PM
            const canQualityOps = isAdmin || isPM || isSales || isPartTimeSales; // 返修/延期/客诉
            // 交付仅管理员/销售/兼职销售，且不含PM身份
            const canDeliver = (isAdmin || isSales || isPartTimeSales) && !isPM;
            // 编辑/删除/导出：仅管理员、销售、兼职销售，且用户不能含PM角色
            const canEditDeleteExport = (isAdmin || isSales || isPartTimeSales) && !isPM;
            const canManageMembers = isAdmin || isPM; // 添加/删除成员
            const canFinance = isFinanceRole();

            const canManagePayment = currentUser.roles.includes('admin') || 
                                    currentUser.roles.includes('finance') ||
                            project.createdBy._id === currentUser._id;

            const memberRoles = (project.members || []).reduce((acc, m) => {
                if (!m || !m.userId || !currentUser || !currentUser._id) return acc;
                const raw = typeof m.userId === 'object' ? m.userId._id : m.userId;
                if (!raw) return acc;
                const uidStr = raw.toString();
                if (uidStr === currentUser._id.toString()) {
                    acc.push(m.role);
                }
                return acc;
            }, []);
            const isTranslatorMember = memberRoles.includes('translator');
            const isReviewerMember = memberRoles.includes('reviewer');
            const isLayoutMember = memberRoles.includes('layout');
            const canSetScheduled = canSchedule;
            const canSetTranslationDone = isAdmin || isPM || isTranslatorMember; // PM可标记翻译完成
            const canSetReviewDone = isAdmin || isPM || isReviewerMember; // PM可标记审校完成
            const canSetLayoutDone = isAdmin || isPM || isLayoutMember; // PM可标记排版完成
            const statusOrder = ['pending','scheduled','in_progress','translation_done','review_done','layout_done','completed'];
            const currentStatusIdx = statusOrder.indexOf(project.status);
            const startReached = currentStatusIdx >= statusOrder.indexOf('scheduled');
            const scheduledReached = currentStatusIdx >= statusOrder.indexOf('scheduled');
            const translationReached = currentStatusIdx >= statusOrder.indexOf('translation_done');
            const reviewReached = currentStatusIdx >= statusOrder.indexOf('review_done');
            const layoutReached = currentStatusIdx >= statusOrder.indexOf('layout_done');

            const content = `
                <div class="project-detail">
                    <div class="detail-section">
                        <h4>基本信息</h4>
                        <div class="detail-row">
                            <div class="detail-label">项目编号:</div>
                            <div class="detail-value">${project.projectNumber || '-'}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">项目名称:</div>
                            <div class="detail-value">${project.projectName}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">客户名称:</div>
                            <div class="detail-value">${project.customerId?.name || project.clientName}</div>
                        </div>
                        ${project.customerId ? `
                            <div class="detail-row">
                                <div class="detail-label">客户联系人:</div>
                                <div class="detail-value">${project.customerId.contactPerson || '-'}</div>
                            </div>
                            <div class="detail-row">
                                <div class="detail-label">客户电话:</div>
                                <div class="detail-value">${project.customerId.phone || '-'}</div>
                            </div>
                            <div class="detail-row">
                                <div class="detail-label">客户邮箱:</div>
                                <div class="detail-value">${project.customerId.email || '-'}</div>
                            </div>
                        ` : ''}
                        <div class="detail-row">
                            <div class="detail-label">业务类型:</div>
                            <div class="detail-value">${getBusinessTypeText(project.businessType)}</div>
                        </div>
                        ${project.projectType ? `
                            <div class="detail-row">
                                <div class="detail-label">项目类型:</div>
                                <div class="detail-value">${getProjectTypeText(project.projectType)}</div>
                            </div>
                        ` : ''}
                        ${project.sourceLanguage ? `
                            <div class="detail-row">
                                <div class="detail-label">源语种:</div>
                                <div class="detail-value">${project.sourceLanguage}</div>
                            </div>
                        ` : ''}
                        ${project.targetLanguages && project.targetLanguages.length > 0 ? `
                            <div class="detail-row">
                                <div class="detail-label">目标语言:</div>
                                <div class="detail-value">${project.targetLanguages.join(', ')}</div>
                            </div>
                        ` : ''}
                        ${project.businessType === 'translation' && project.wordCount > 0 ? `
                            <div class="detail-row">
                                <div class="detail-label">字数:</div>
                                <div class="detail-value">${project.wordCount.toLocaleString()}</div>
                            </div>
                            ${canViewProjectAmount() ? `
                            <div class="detail-row">
                                <div class="detail-label">单价（每千字）:</div>
                                <div class="detail-value">¥${project.unitPrice ? project.unitPrice.toLocaleString() : '-'}</div>
                            </div>
                        ` : ''}
                        ` : ''}
                        ${canViewProjectAmount() ? `
                        <div class="detail-row">
                            <div class="detail-label">项目金额:</div>
                            <div class="detail-value">¥${project.projectAmount.toLocaleString()}${project.isTaxIncluded ? '（含税）' : ''}</div>
                        </div>
                        ` : ''}
                        ${project.needInvoice ? `
                            <div class="detail-row">
                                <div class="detail-label">发票:</div>
                                <div class="detail-value"><span class="badge badge-info">需要发票</span></div>
                            </div>
                        ` : ''}
                        ${project.partTimeSales?.isPartTime && canViewProjectAmount() ? `
                            <div class="detail-row" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                                <div class="detail-label" style="font-weight: 600; color: #0369a1;">兼职销售信息:</div>
                                <div class="detail-value" style="color: #0369a1;">
                                    <div>公司应收金额: ¥${(project.partTimeSales.companyReceivable || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    <div>税率: ${((project.partTimeSales.taxRate || 0) * 100).toFixed(2)}%</div>
                                    <div style="font-weight: bold; margin-top: 5px;">返还佣金: ¥${(project.partTimeSales.partTimeSalesCommission || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                            </div>
                        ` : ''}
                        ${project.partTimeLayout?.isPartTime || project.partTimeLayout?.layoutAssignedTo ? `
                            <div class="detail-row" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div>
                                        <div class="detail-label" style="font-weight: 600; color: #0369a1;">兼职排版信息:</div>
                                        <div class="detail-value" style="color: #0369a1;">
                                            <div>排版员: ${(() => {
                                                const layoutUser = project.partTimeLayout?.layoutAssignedTo;
                                                if (layoutUser && typeof layoutUser === 'object' && layoutUser.name) {
                                                    return layoutUser.name;
                                                }
                                                // 如果layoutAssignedTo是ID，尝试从项目成员中查找
                                                if (project.members) {
                                                    const layoutMember = project.members.find(m => 
                                                        m.role === 'layout' && 
                                                        (m.userId._id === layoutUser || m.userId._id.toString() === layoutUser || m.userId._id === project.partTimeLayout?.layoutAssignedTo?.toString())
                                                    );
                                                    if (layoutMember && layoutMember.userId) {
                                                        return layoutMember.userId.name;
                                                    }
                                                }
                                                return layoutUser || '-';
                                            })()}</div>
                                            ${canViewProjectAmount() ? `
                                            <div>排版费用: ¥${(project.partTimeLayout?.layoutCost || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                            <div>费用占比: ${(project.partTimeLayout?.layoutCostPercentage || 0).toFixed(2)}%</div>
                                            ` : ''}
                                        </div>
                                    </div>
                                    ${canManageMembers && project.status !== 'completed' ? `
                                        <button class="btn-small" onclick="showSetLayoutCostModal('${projectId}')" style="margin-left: 10px;">
                                            ${(project.partTimeLayout?.layoutCost || 0) > 0 ? '修改费用' : '设置费用'}
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}
                        ${project.specialRequirements && (
                            project.specialRequirements.terminology ||
                            project.specialRequirements.nda ||
                            project.specialRequirements.referenceFiles ||
                            project.specialRequirements.pureTranslationDelivery ||
                            project.specialRequirements.bilingualDelivery ||
                            project.specialRequirements.notes
                        ) ? `
                            <div class="detail-row">
                                <div class="detail-label">特殊要求:</div>
                                <div class="detail-value">
                                    ${project.specialRequirements.terminology ? '<span class="badge badge-info">术语表</span>' : ''}
                                    ${project.specialRequirements.nda ? '<span class="badge badge-info">保密协议</span>' : ''}
                                    ${project.specialRequirements.referenceFiles ? '<span class="badge badge-info">参考文件</span>' : ''}
                                    ${project.specialRequirements.pureTranslationDelivery ? '<span class="badge badge-info">纯译文交付</span>' : ''}
                                    ${project.specialRequirements.bilingualDelivery ? '<span class="badge badge-info">对照版交付</span>' : ''}
                                    ${project.specialRequirements.notes ? '<br><small>' + project.specialRequirements.notes + '</small>' : ''}
                                </div>
                            </div>
                        ` : ''}
                        <div class="detail-row">
                            <div class="detail-label">交付时间:</div>
                            <div class="detail-value">${new Date(project.deadline).toLocaleString()}</div>
                        </div>
                        ${project.startedAt ? `
                            <div class="detail-row">
                                <div class="detail-label">开始时间:</div>
                                <div class="detail-value">${new Date(project.startedAt).toLocaleString()}</div>
                            </div>
                        ` : ''}
                        <div class="detail-row">
                            <div class="detail-label">状态:</div>
                            <div class="detail-value"><span class="badge ${getStatusBadgeClass(project.status)}">${getStatusText(project.status)}</span></div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">返修次数:</div>
                            <div class="detail-value">${project.revisionCount}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">是否延期:</div>
                            <div class="detail-value">${project.isDelayed ? '<span class="badge badge-warning">是</span>' : '<span class="badge badge-success">否</span>'}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">客户投诉:</div>
                            <div class="detail-value">${project.hasComplaint ? '<span class="badge badge-danger">是</span>' : '<span class="badge badge-success">否</span>'}</div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h4>回款信息</h4>
                            ${canManagePayment ? `<button class="btn-small" onclick="closeModal(); setTimeout(() => showPaymentModal('${projectId}'), 100)">更新回款</button>` : ''}
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">合同约定回款日:</div>
                            <div class="detail-value">${project.payment?.expectedAt ? new Date(project.payment.expectedAt).toLocaleDateString() : '-'}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">已回款金额:</div>
                            <div class="detail-value">¥${(project.payment?.receivedAmount || 0).toLocaleString()}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">回款日期:</div>
                            <div class="detail-value">${project.payment?.receivedAt ? new Date(project.payment.receivedAt).toLocaleDateString() : '-'}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">是否回款完成:</div>
                            <div class="detail-value">${project.payment?.isFullyPaid ? '<span class="badge badge-success">是</span>' : '<span class="badge badge-warning">否</span>'}</div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h4>项目成员</h4>
                            ${canManageMembers ? '<button class="btn-small" onclick="closeModal(); setTimeout(() => showAddMemberModal(\'' + projectId + '\'), 100)">添加成员</button>' : ''}
                        </div>
                        <div id="projectMembers">
                            ${project.members && project.members.length > 0 ? project.members.map(m => `
                                <div class="member-item">
                                    <div class="member-info">
                                        <strong>${m.userId.name}</strong> - ${getRoleText(m.role)}
                                        ${m.role === 'translator' ? ` (${m.translatorType === 'deepedit' ? '深度编辑' : 'MTPE'}, 字数占比: ${(m.wordRatio * 100).toFixed(0)}%)` : ''}
                                    </div>
                                    ${canManageMembers ? `
                                        <div class="member-actions">
                                            <button class="btn-small btn-danger" onclick="deleteMember('${projectId}', '${m._id}')">删除</button>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('') : '<p>暂无成员</p>'}
                        </div>
                    </div>

                    <div class="detail-section" id="realtimeKpiSection">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h4>预估KPI（分值）</h4>
                            <button class="btn-small" onclick="loadRealtimeKPI('${projectId}')">刷新</button>
                        </div>
                        <div id="realtimeKpiContent"><div class="card-desc">加载中...</div></div>
                    </div>

                    ${canFinance ? `
                    <div class="detail-section">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <h4>回款管理</h4>
                        </div>
                        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                            <input type="number" id="projectPaymentAmount" placeholder="回款金额" style="padding:6px; width:140px;">
                            <input type="date" id="projectPaymentDate" style="padding:6px;">
                            <input type="text" id="projectPaymentRef" placeholder="凭证号/备注" style="padding:6px; min-width:160px;">
                            <button class="btn-small" onclick="addProjectPayment('${projectId}')">新增回款</button>
                        </div>
                        <div id="projectPaymentList"><div class="card-desc">加载中...</div></div>
                    </div>

                    <div class="detail-section">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <h4>发票管理</h4>
                        </div>
                        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                            <input type="text" id="projectInvoiceNumber" placeholder="发票号" style="padding:6px; min-width:120px;">
                            <input type="number" id="projectInvoiceAmount" placeholder="金额" style="padding:6px; width:120px;">
                            <input type="date" id="projectInvoiceDate" style="padding:6px;">
                            <select id="projectInvoiceType" style="padding:6px;">
                                <option value="vat">专票/增值税</option>
                                <option value="normal">普票</option>
                                <option value="other">其他</option>
                            </select>
                            <button class="btn-small" onclick="addProjectInvoice('${projectId}')">新增发票</button>
                        </div>
                        <div id="projectInvoiceList"><div class="card-desc">加载中...</div></div>
                    </div>
                    ` : ''}

                    ${(canStart || canSchedule || canQualityOps || isTranslatorMember || isReviewerMember || isLayoutMember) && project.status !== 'completed' && project.status !== 'cancelled' ? `
                        <div class="detail-section">
                            <h4>项目管理</h4>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                ${canStart ? `
                                    <button class="btn-small btn-success" ${startReached ? 'disabled' : ''} onclick="startProject('${projectId}')">开始项目</button>
                                ` : ''}
                                ${canSetScheduled && project.status === 'scheduled' ? `
                                    <button class="btn-small" onclick="updateProjectStatus('${projectId}','in_progress','确认人员已安排完毕，项目开始执行？')">开始执行</button>
                                ` : ''}
                                ${canSetTranslationDone ? `
                                    <button class="btn-small" ${translationReached ? 'disabled' : ''} onclick="updateProjectStatus('${projectId}','translation_done','确认标记翻译完成？')">翻译完成</button>
                                ` : ''}
                                ${canSetReviewDone ? `
                                    <button class="btn-small" ${reviewReached ? 'disabled' : ''} onclick="updateProjectStatus('${projectId}','review_done','确认标记审校完成？')">审校完成</button>
                                ` : ''}
                                ${canSetLayoutDone ? `
                                    <button class="btn-small" ${layoutReached ? 'disabled' : ''} onclick="updateProjectStatus('${projectId}','layout_done','确认标记排版完成？')">排版完成</button>
                                ` : ''}
                                ${(project.status === 'in_progress' || project.status === 'scheduled' || project.status === 'translation_done' || project.status === 'review_done' || project.status === 'layout_done') && canQualityOps ? `
                                    <button class="btn-small" onclick="setRevision('${projectId}', ${project.revisionCount})">标记返修</button>
                                    <button class="btn-small" onclick="setDelay('${projectId}')">标记延期</button>
                                    <button class="btn-small" onclick="setComplaint('${projectId}')">标记客诉</button>
                                ` : ''}
                                ${(project.status === 'in_progress' || project.status === 'scheduled' || project.status === 'translation_done' || project.status === 'review_done' || project.status === 'layout_done') && canDeliver ? `
                                    <button class="btn-small btn-success" onclick="finishProject('${projectId}')">交付项目</button>
                                ` : ''}
                                ${canEditDeleteExport ? `
                                  <button class="btn-small" onclick="exportProjectQuotation('${projectId}')" style="background: #10b981;">📄 导出报价单</button>
                                  <button class="btn-small" onclick="showEditProjectModal()">编辑项目</button>
                                  <button class="btn-small btn-danger" onclick="deleteProject('${projectId}')">删除项目</button>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
            showModal('项目详情', content);
            loadRealtimeKPI(projectId);
            if (canFinance) {
                loadProjectPayments(projectId);
                loadProjectInvoices(projectId);
            }
        }
    } catch (error) {
        alert('加载项目详情失败: ' + error.message);
    }
}

async function showAddMemberModal(projectId) {
    // 确保用户列表已加载
    if (allUsers.length === 0) {
        try {
            const response = await apiFetch(`${API_BASE}/users`);
            const data = await response.json();
            if (data.success) {
                allUsers = data.data;
            } else {
                alert('加载用户列表失败: ' + (data.message || '未知错误'));
                return;
            }
        } catch (error) {
            alert('加载用户列表失败: ' + error.message);
            return;
        }
    }

    // 加载项目信息（用于验证排版费用）
    let projectAmount = null;
    try {
        const projectResponse = await apiFetch(`${API_BASE}/projects/${projectId}`);
        const projectData = await projectResponse.json();
        if (projectData.success && projectData.data.projectAmount) {
            projectAmount = projectData.data.projectAmount;
            // 存储项目ID和金额到表单的data属性中
            window.currentAddMemberProjectId = projectId;
            window.currentAddMemberProjectAmount = projectAmount;
        }
    } catch (error) {
        console.error('加载项目信息失败:', error);
    }

    // 过滤出激活的用户
    const activeUsers = allUsers.filter(u => u.isActive);

    const dynamicProjectMemberRoles = await ensureProjectMemberRoles();
    const currentRole = currentRoleCode || (currentUser?.roles?.[0] || '');
    const isAdmin = currentRole === 'admin';
    const isPM = currentRole === 'pm';
    const isSales = currentRole === 'sales';
    const isPartTimeSales = currentRole === 'part_time_sales';
    let availableRoles;
    const baseAdminRoles = [
        { value: 'translator', label: '翻译' },
        { value: 'reviewer', label: '审校' },
        { value: 'pm', label: '项目经理' },
        { value: 'sales', label: '销售' },
        { value: 'admin_staff', label: '综合岗' },
        { value: 'part_time_sales', label: '兼职销售' },
        { value: 'layout', label: '兼职排版' }
    ];
    if (isAdmin) {
        availableRoles = [
            ...baseAdminRoles,
            ...dynamicProjectMemberRoles.filter(r => !baseAdminRoles.some(b => b.value === r.value))
        ];
    } else if (isPM) {
        availableRoles = [
            { value: 'translator', label: '翻译' },
            { value: 'reviewer', label: '审校' },
            { value: 'layout', label: '兼职排版' },
            ...dynamicProjectMemberRoles.filter(r => ['translator', 'reviewer', 'layout'].includes(r.value))
        ];
    } else if (isSales || isPartTimeSales) {
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    } else {
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    }

    const content = `
        <form id="addMemberForm" data-project-id="${projectId}" data-project-amount="${projectAmount || 0}" onsubmit="addMember(event, '${projectId}')">
            <div class="form-group">
                <label>角色 *</label>
                <select name="role" id="memberRole" onchange="toggleTranslatorFields(); filterUsersByRole()" required>
                    <option value="">请选择</option>
                    ${availableRoles.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>选择用户 *</label>
                <select name="userId" id="memberUserId" required>
                    <option value="">请先选择角色</option>
                </select>
            </div>
            <div class="form-group" id="translatorTypeGroup" style="display: none;">
                <label>翻译类型</label>
                <select name="translatorType">
                    <option value="mtpe">MTPE</option>
                    <option value="deepedit">深度编辑</option>
                </select>
            </div>
            <div class="form-group" id="wordRatioGroup" style="display: none;">
                <label>字数占比 (0-1，多个翻译时使用)</label>
                <input type="number" name="wordRatio" step="0.01" min="0" max="1" value="1.0">
            </div>
            <div class="form-group" id="layoutCostGroup" style="display: none;">
                <label>排版费用（元）</label>
                <input type="number" name="layoutCost" id="addMemberLayoutCost" step="0.01" min="0" onchange="validateAddMemberLayoutCost()">
                <small style="color: #666; font-size: 12px;">可选：排版费用不能超过项目总金额的5%，可在添加成员后通过编辑项目设置</small>
                <div id="addMemberLayoutCostValidation" style="margin-top: 5px;"></div>
            </div>
            <div class="action-buttons">
                <button type="submit">添加</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('添加项目成员', content);
    
    // 初始化：如果已选择角色，过滤用户列表
    setTimeout(() => {
        const roleSelect = document.getElementById('memberRole');
        if (roleSelect && roleSelect.value) {
            filterUsersByRole();
        }
    }, 100);
}

function toggleTranslatorFields() {
    const role = document.getElementById('memberRole').value;
    const translatorGroup = document.getElementById('translatorTypeGroup');
    const wordRatioGroup = document.getElementById('wordRatioGroup');
    const layoutCostGroup = document.getElementById('layoutCostGroup');
    
    if (role === 'translator') {
        translatorGroup.style.display = 'block';
        wordRatioGroup.style.display = 'block';
        layoutCostGroup.style.display = 'none';
    } else if (role === 'layout') {
        translatorGroup.style.display = 'none';
        wordRatioGroup.style.display = 'none';
        layoutCostGroup.style.display = 'block';
    } else {
        translatorGroup.style.display = 'none';
        wordRatioGroup.style.display = 'none';
        layoutCostGroup.style.display = 'none';
    }
}

function filterUsersByRole() {
    const role = document.getElementById('memberRole').value;
    const userIdSelect = document.getElementById('memberUserId');
    
    if (!role) {
        userIdSelect.innerHTML = '<option value="">请先选择角色</option>';
        return;
    }
    
    // 过滤出具有该角色的激活用户
    let filteredUsers = allUsers.filter(u => {
        if (!u.isActive) return false;
        // 检查用户是否具有该角色
        return u.roles && Array.isArray(u.roles) && u.roles.includes(role);
    });
    
    // 校验：如果当前用户是PM，并且同时有翻译或审校角色，则不能将翻译或审校分配给自己
    if (currentUser && (role === 'translator' || role === 'reviewer')) {
        const isPM = currentUser.roles?.includes('pm');
        const isTranslator = currentUser.roles?.includes('translator');
        const isReviewer = currentUser.roles?.includes('reviewer');
        
        if (isPM) {
            // 如果是PM且有翻译角色，且当前选择的是翻译角色，则过滤掉自己
            if (role === 'translator' && isTranslator) {
                filteredUsers = filteredUsers.filter(u => u._id !== currentUser._id);
            }
            // 如果是PM且有审校角色，且当前选择的是审校角色，则过滤掉自己
            if (role === 'reviewer' && isReviewer) {
                filteredUsers = filteredUsers.filter(u => u._id !== currentUser._id);
            }
        }
    }
    
    // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许
    // 前端不再过滤用户列表，以保持与后端配置的一致性
    
    if (filteredUsers.length === 0) {
        userIdSelect.innerHTML = '<option value="" disabled>暂无该角色的可用用户</option>';
    } else {
        userIdSelect.innerHTML = '<option value="">请选择</option>' + 
            filteredUsers.map(u => `<option value="${u._id}">${u.name} (${u.username})</option>`).join('');
    }
}

async function validateAddMemberLayoutCost() {
    const layoutCostInput = document.getElementById('addMemberLayoutCost');
    const validationDiv = document.getElementById('addMemberLayoutCostValidation');
    const layoutCost = parseFloat(layoutCostInput?.value || 0);
    
    // 如果未填写费用，清空验证信息（费用是可选的）
    if (!layoutCost || layoutCost <= 0) {
        validationDiv.innerHTML = '';
        return true; // 允许不填写费用
    }
    
    // 获取项目金额（优先从全局变量，其次从表单data属性，最后从currentProjectDetail）
    let projectAmount = window.currentAddMemberProjectAmount || null;
    if (!projectAmount) {
        const form = document.getElementById('addMemberForm');
        if (form) {
            projectAmount = parseFloat(form.getAttribute('data-project-amount') || 0);
        }
    }
    if (!projectAmount && currentProjectDetail && currentProjectDetail.projectAmount) {
        projectAmount = currentProjectDetail.projectAmount;
    }
    
    if (!projectAmount || projectAmount <= 0) {
        validationDiv.innerHTML = '<span style="color: #dc2626;">无法验证：项目金额未加载</span>';
        return false;
    }
    
    const percentage = (layoutCost / projectAmount) * 100;
    
    if (percentage > 5) {
        validationDiv.innerHTML = `<span style="color: #dc2626;">排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%</span>`;
        return false;
    }
    
    validationDiv.innerHTML = `<span style="color: #059669;">费用占比：${percentage.toFixed(2)}%</span>`;
    return true;
}

async function addMember(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const role = formData.get('role');
    const userId = formData.get('userId');
    const layoutCost = parseFloat(formData.get('layoutCost') || 0);
    
    // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许
    
    // 如果是兼职排版且填写了排版费用，验证费用
    if (role === 'layout' && layoutCost > 0) {
        // 验证排版费用是否超过项目总金额的5%
        if (!await validateAddMemberLayoutCost()) {
            return;
        }
    }
    
    const data = {
        userId: userId,
        role: role,
        translatorType: formData.get('translatorType'),
        wordRatio: parseFloat(formData.get('wordRatio') || '1.0'),
        layoutCost: role === 'layout' && layoutCost > 0 ? layoutCost : undefined
    };

    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}/add-member`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            // 重新加载项目列表
            loadProjects();
            // 如果项目详情模态框是打开的，重新加载
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
            showToast('成员添加成功', 'success');
        } else {
            // 处理错误信息：可能是 result.message 或 result.error.message
            let errorMessage = '添加失败';
            if (result.message) {
                errorMessage = result.message;
            } else if (result.error) {
                if (typeof result.error === 'string') {
                    errorMessage = result.error;
                } else if (result.error.message) {
                    errorMessage = result.error.message;
                }
            }
            showToast(errorMessage, 'error');
        }
    } catch (error) {
        const errorMessage = error?.message || (typeof error === 'string' ? error : '未知错误');
        showToast('添加失败: ' + errorMessage, 'error');
    }
}

async function deleteMember(projectId, memberId) {
    if (!confirm('确定要删除此成员吗？')) return;

    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}/member/${memberId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            // 重新加载项目列表
            loadProjects();
            // 如果项目详情模态框是打开的，重新加载
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
            showToast('成员已删除', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

async function setRevision(projectId, currentCount) {
    const count = prompt('请输入返修次数:', currentCount + 1);
    if (count === null) return;

    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}/set-revision`, {
            method: 'POST',
            body: JSON.stringify({ count: parseInt(count) })
        });
        const result = await response.json();
        
        if (result.success) {
            loadProjects();
            // 如果项目详情模态框是打开的，重新加载
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

async function setDelay(projectId) {
    if (!confirm('确定要标记为延期吗？')) return;

    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}/set-delay`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            loadProjects();
            // 如果项目详情模态框是打开的，重新加载
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

async function setComplaint(projectId) {
    if (!confirm('确定要标记为客户投诉吗？')) return;

    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}/set-complaint`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            loadProjects();
            // 如果项目详情模态框是打开的，重新加载
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

async function finishProject(projectId) {
    if (!confirm('确定要交付此项目吗？交付后将无法修改。')) return;

    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}/finish`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadProjects();
            showToast('项目已完成', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

async function updateProjectStatus(projectId, status, confirmMessage) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status })
        });
        const result = await response.json();
        if (result.success) {
            loadProjects();
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
            showToast('项目状态已更新', 'success');
        } else {
            showToast(result.message || '状态更新失败', 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

async function showEditProjectModal() {
    const p = currentProjectDetail;
    if (!p) return;
    
    // 确保语种列表已加载
    if (languagesCache.length === 0) {
        await loadLanguages();
    }
    
    const targetLanguagesArray = Array.isArray(p.targetLanguages) ? p.targetLanguages : (p.targetLanguages ? [p.targetLanguages] : []);
    
    const languageOptions = languagesCache
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}">${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    
    const sourceLanguageOptions = languagesCache
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}" ${p.sourceLanguage === lang.name ? 'selected' : ''}>${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    
    const content = `
        <form id="editProjectForm" onsubmit="updateProject(event, '${p._id}')">
            <div class="form-group">
                <label>项目名称 *</label>
                <input type="text" name="projectName" value="${p.projectName || ''}" required>
            </div>
            <div class="form-group">
                <label>业务类型</label>
                <select name="businessType">
                    <option value="translation" ${p.businessType === 'translation' ? 'selected' : ''}>笔译</option>
                    <option value="interpretation" ${p.businessType === 'interpretation' ? 'selected' : ''}>口译</option>
                    <option value="transcription" ${p.businessType === 'transcription' ? 'selected' : ''}>转录</option>
                    <option value="localization" ${p.businessType === 'localization' ? 'selected' : ''}>本地化</option>
                    <option value="other" ${p.businessType === 'other' ? 'selected' : ''}>其他</option>
                </select>
            </div>
            <div class="form-group">
                <label>项目类型</label>
                <select name="projectType">
                    <option value="mtpe" ${p.projectType === 'mtpe' ? 'selected' : ''}>MTPE</option>
                    <option value="deepedit" ${p.projectType === 'deepedit' ? 'selected' : ''}>深度编辑</option>
                    <option value="review" ${p.projectType === 'review' ? 'selected' : ''}>审校项目</option>
                    <option value="mixed" ${p.projectType === 'mixed' ? 'selected' : ''}>混合类型</option>
                </select>
            </div>
            <div class="form-group">
                <label>源语种 *</label>
                <select name="sourceLanguage" id="editSourceLanguageSelect" required>
                    <option value="">请选择源语种</option>
                    ${sourceLanguageOptions}
                </select>
            </div>
            <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin-bottom: 0;">目标语言 *</label>
                    <button type="button" class="btn-small" onclick="addEditTargetLanguageRow()">+ 添加目标语种</button>
                </div>
                <div id="editTargetLanguagesContainer" style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- 目标语种行将动态添加到这里 -->
                </div>
                <small style="color:#666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个目标语种，支持一对多翻译</small>
            </div>
            <div class="form-group">
                <label>字数（笔译）</label>
                <input type="number" name="wordCount" value="${p.wordCount || ''}" min="0" step="1">
            </div>
            ${canViewProjectAmount() ? `
            <div class="form-group">
                <label>单价（每千字）</label>
                <input type="number" name="unitPrice" value="${p.unitPrice || ''}" min="0" step="0.01">
            </div>
            <div class="form-group">
                <label>项目金额 *</label>
                <input type="number" name="projectAmount" value="${p.projectAmount || ''}" min="0" step="0.01" required onchange="calculateEditPartTimeSalesCommission(); validateEditLayoutCost();">
            </div>
            ` : ''}
            <div class="form-group">
                <label>交付时间 *</label>
                <input type="date" name="deadline" value="${p.deadline ? new Date(p.deadline).toISOString().slice(0,10) : ''}" required>
            </div>
            <div class="form-group" style="display:flex;gap:12px;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                    <input type="checkbox" name="isTaxIncluded" ${p.isTaxIncluded ? 'checked' : ''}> 含税
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                    <input type="checkbox" name="needInvoice" ${p.needInvoice ? 'checked' : ''}> 需要发票
                </label>
            </div>
            <div class="form-group">
                <label>特殊要求</label>
                <div style="display:flex;gap:15px;flex-wrap:wrap;margin-top:5px;">
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.terminology" ${p.specialRequirements?.terminology ? 'checked' : ''}> 术语表
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.nda" ${p.specialRequirements?.nda ? 'checked' : ''}> 保密协议
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.referenceFiles" ${p.specialRequirements?.referenceFiles ? 'checked' : ''}> 参考文件
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.pureTranslationDelivery" ${p.specialRequirements?.pureTranslationDelivery ? 'checked' : ''}> 纯译文交付
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.bilingualDelivery" ${p.specialRequirements?.bilingualDelivery ? 'checked' : ''}> 对照版交付
                    </label>
                </div>
                <textarea name="specialRequirements.notes" rows="3" style="margin-top:8px;">${p.specialRequirements?.notes || ''}</textarea>
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职销售（可选）</h4>
                <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" name="partTimeSales.isPartTime" id="editPartTimeSalesEnabled" ${p.partTimeSales?.isPartTime ? 'checked' : ''} onchange="toggleEditPartTimeSalesFields()">
                    启用兼职销售
                </label>
                <div id="editPartTimeSalesFields" style="display: ${p.partTimeSales?.isPartTime ? 'block' : 'none'}; padding-left: 20px; border-left: 2px solid #667eea;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>公司应收金额（元）</label>
                        <input type="number" name="partTimeSales.companyReceivable" id="editCompanyReceivable" step="0.01" min="0" value="${p.partTimeSales?.companyReceivable || 0}" onchange="calculateEditPartTimeSalesCommission()" style="width: 100%;">
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>税率（%）</label>
                        <input type="number" name="partTimeSales.taxRate" id="editTaxRate" step="0.01" min="0" max="100" value="${(p.partTimeSales?.taxRate || 0) * 100}" onchange="calculateEditPartTimeSalesCommission()" style="width: 100%;">
                        <small style="color: #666; font-size: 12px;">例如：10 表示 10%</small>
                    </div>
                    <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <label style="font-weight: 600; color: #0369a1;">返还佣金（自动计算）</label>
                        <div id="editPartTimeSalesCommissionDisplay" style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                            ¥${(p.partTimeSales?.partTimeSalesCommission || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <small style="color: #666; font-size: 12px; display: block; margin-top: 5px;">公式：成交额 - 公司应收 - 税费</small>
                    </div>
                </div>
            </div>
            
            ${(() => {
                // 判断是否是销售或兼职销售（销售编辑项目时不能设置兼职排版，由项目经理添加）
                const isSales = currentUser?.roles?.includes('sales') || currentUser?.roles?.includes('part_time_sales');
                const isAdmin = currentUser?.roles?.includes('admin');
                // 只有管理员和项目经理可以在编辑项目时设置兼职排版
                if (isSales && !isAdmin) {
                    return '';
                }
                return `
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职排版（可选）</h4>
                <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" name="partTimeLayout.isPartTime" id="editPartTimeLayoutEnabled" ${p.partTimeLayout?.isPartTime ? 'checked' : ''} onchange="toggleEditPartTimeLayoutFields()">
                    启用兼职排版
                </label>
                <div id="editPartTimeLayoutFields" style="display: ${p.partTimeLayout?.isPartTime ? 'block' : 'none'}; padding-left: 20px; border-left: 2px solid #667eea;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>选择排版员</label>
                        <select name="partTimeLayout.layoutAssignedTo" id="editLayoutAssignedTo" style="width: 100%;">
                            <option value="">请选择排版员</option>
                            ${allUsers.filter(u => u.isActive && (u.roles?.includes('layout') || u.roles?.includes('admin'))).map(u => {
                                // 检查是否已选择该排版员
                                const isSelected = (() => {
                                    const layoutAssignedTo = p.partTimeLayout?.layoutAssignedTo;
                                    if (!layoutAssignedTo) return false;
                                    // 如果是对象，比较_id
                                    if (typeof layoutAssignedTo === 'object' && layoutAssignedTo._id) {
                                        return layoutAssignedTo._id.toString() === u._id.toString();
                                    }
                                    // 如果是字符串ID，直接比较
                                    if (typeof layoutAssignedTo === 'string') {
                                        return layoutAssignedTo === u._id.toString();
                                    }
                                    // 从项目成员中查找
                                    if (p.members) {
                                        const layoutMember = p.members.find(m => m.role === 'layout' && m.userId?._id?.toString() === u._id.toString());
                                        return !!layoutMember;
                                    }
                                    return false;
                                })();
                                return `<option value="${u._id}" ${isSelected ? 'selected' : ''}>${u.name} (${u.username})</option>`;
                            }).join('')}
                        </select>
                        <small style="color: #666; font-size: 12px;">如果已通过添加成员指定了排版员，此处会显示已选择的排版员</small>
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>排版费用（元）</label>
                        <input type="number" name="partTimeLayout.layoutCost" id="editLayoutCost" step="0.01" min="0" value="${p.partTimeLayout?.layoutCost || 0}" onchange="validateEditLayoutCost()" style="width: 100%;">
                        <small style="color: #666; font-size: 12px;">排版费用不能超过项目总金额的5%</small>
                    </div>
                    <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <label style="font-weight: 600; color: #0369a1;">费用占比（自动计算）</label>
                        <div id="editLayoutCostPercentageDisplay" style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                            ${(p.partTimeLayout?.layoutCostPercentage || 0).toFixed(2)}%
                        </div>
                        <div id="editLayoutCostValidation" style="margin-top: 5px;"></div>
                    </div>
                </div>
            </div>
                `;
            })()}
            
            <div class="action-buttons">
                <button type="submit">保存</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('编辑项目', content);
    
    // 初始化计算
    setTimeout(() => {
        calculateEditPartTimeSalesCommission();
        validateEditLayoutCost();
    }, 100);
    
    // 初始化已有的目标语种
    const container = document.getElementById('editTargetLanguagesContainer');
    if (container) {
        container.innerHTML = '';
        const targetLanguagesArray = Array.isArray(p.targetLanguages) ? p.targetLanguages : (p.targetLanguages ? [p.targetLanguages] : []);
        if (targetLanguagesArray.length > 0) {
            targetLanguagesArray.forEach(lang => {
                addEditTargetLanguageRow(lang);
            });
        } else {
            // 如果没有目标语种，至少添加一个空行
            addEditTargetLanguageRow();
        }
    }
}

async function updateProject(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // 收集目标语言
    const targetLanguageRows = document.querySelectorAll('#editTargetLanguagesContainer .target-language-select');
    const targetLanguages = Array.from(targetLanguageRows)
        .map(select => select.value)
        .filter(value => value && value.trim() !== '');
    
    if (targetLanguages.length === 0) {
        alert('请至少添加并选择一个目标语种');
        return;
    }
    
    // 收集兼职销售信息
    const editPartTimeSalesEnabled = formData.get('partTimeSales.isPartTime') === 'on';
    const editPartTimeSales = editPartTimeSalesEnabled ? {
        isPartTime: true,
        companyReceivable: parseFloat(formData.get('partTimeSales.companyReceivable') || 0),
        taxRate: parseFloat(formData.get('partTimeSales.taxRate') || 0) / 100 // 转换为小数
    } : { isPartTime: false, companyReceivable: 0, taxRate: 0 };
    
    // 收集兼职排版信息
    const editPartTimeLayoutEnabled = formData.get('partTimeLayout.isPartTime') === 'on';
    const editLayoutCost = parseFloat(formData.get('partTimeLayout.layoutCost') || 0);
    const editLayoutAssignedTo = formData.get('partTimeLayout.layoutAssignedTo');
    
    // 校验排版费用
    if (editPartTimeLayoutEnabled && editLayoutCost > 0) {
        const projectAmount = parseFloat(formData.get('projectAmount'));
        const percentage = (editLayoutCost / projectAmount) * 100;
        if (percentage > 5) {
            alert(`排版费用(${editLayoutCost})不能超过项目总金额(${projectAmount})的5%，当前占比为${percentage.toFixed(2)}%`);
            return;
        }
        if (!editLayoutAssignedTo) {
            alert('请选择排版员');
            return;
        }
    }
    
    const editPartTimeLayout = editPartTimeLayoutEnabled ? {
        isPartTime: true,
        layoutCost: editLayoutCost,
        layoutAssignedTo: editLayoutAssignedTo || undefined
    } : { isPartTime: false, layoutCost: 0, layoutAssignedTo: null };
    
    const payload = {
        projectName: formData.get('projectName'),
        businessType: formData.get('businessType'),
        projectType: formData.get('projectType'),
        sourceLanguage: formData.get('sourceLanguage'),
        targetLanguages: targetLanguages,
        wordCount: formData.get('wordCount') ? parseFloat(formData.get('wordCount')) : undefined,
        unitPrice: formData.get('unitPrice') ? parseFloat(formData.get('unitPrice')) : undefined,
        projectAmount: formData.get('projectAmount') ? parseFloat(formData.get('projectAmount')) : undefined,
        deadline: formData.get('deadline'),
        isTaxIncluded: formData.get('isTaxIncluded') === 'on',
        needInvoice: formData.get('needInvoice') === 'on',
        specialRequirements: {
            terminology: formData.get('specialRequirements.terminology') === 'on',
            nda: formData.get('specialRequirements.nda') === 'on',
            referenceFiles: formData.get('specialRequirements.referenceFiles') === 'on',
            pureTranslationDelivery: formData.get('specialRequirements.pureTranslationDelivery') === 'on',
            bilingualDelivery: formData.get('specialRequirements.bilingualDelivery') === 'on',
            notes: formData.get('specialRequirements.notes') || undefined
        },
        partTimeSales: editPartTimeSales,
        partTimeLayout: editPartTimeLayout
    };

    try {
        const res = await apiFetch(`${API_BASE}/projects/${projectId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadProjects();
            viewProject(projectId);
            showToast('项目已更新', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
    }
}

async function deleteProject(projectId) {
    if (!confirm('确定要删除/取消此项目吗？已完成项目不可删除。')) return;
    try {
        const res = await apiFetch(`${API_BASE}/projects/${projectId}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadProjects();
            showToast('项目已取消', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

async function showPaymentModal(projectId) {
    try {
        // 读取最新项目数据以填充默认值
        const response = await apiFetch(`${API_BASE}/projects/${projectId}`);
        const data = await response.json();
        if (!data.success) {
            alert(data.message || '加载项目失败');
            return;
        }

        const payment = data.data.payment || {};
        const content = `
            <form id="paymentForm" onsubmit="updatePayment(event, '${projectId}')">
                <div class="form-group">
                    <label>合同约定回款日期</label>
                    <input type="date" name="expectedAt" value="${payment.expectedAt ? new Date(payment.expectedAt).toISOString().slice(0,10) : ''}">
                </div>
                <div class="form-group">
                    <label>已回款金额</label>
                    <input type="number" name="receivedAmount" step="0.01" min="0" value="${payment.receivedAmount || 0}">
                </div>
                <div class="form-group">
                    <label>回款日期</label>
                    <input type="date" name="receivedAt" value="${payment.receivedAt ? new Date(payment.receivedAt).toISOString().slice(0,10) : ''}">
                </div>
                <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="isFullyPaid" name="isFullyPaid" ${payment.isFullyPaid ? 'checked' : ''}>
                    <label for="isFullyPaid" style="margin: 0;">回款完成</label>
                </div>
                <div class="action-buttons">
                    <button type="submit">保存</button>
                    <button type="button" onclick="closeModal()">取消</button>
                </div>
            </form>
        `;
        showModal('更新回款', content);
    } catch (error) {
        alert('加载回款信息失败: ' + error.message);
    }
}

async function updatePayment(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
        expectedAt: formData.get('expectedAt') || undefined,
        receivedAmount: formData.get('receivedAmount') ? parseFloat(formData.get('receivedAmount')) : 0,
        receivedAt: formData.get('receivedAt') || undefined,
        isFullyPaid: formData.get('isFullyPaid') === 'on'
    };

    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}/payment`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.success) {
            closeModal();
            loadProjects();
            showAlert('projectsList', '回款信息已更新', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('更新失败: ' + error.message);
    }
}

// ==================== KPI管理 ====================
async function loadKPI() {
    const month = document.getElementById('kpiMonth').value || 
        new Date().toISOString().slice(0, 7);
    const userId = document.getElementById('kpiUserSelect').value;

    try {
        let response;
        let data;
        
        // 如果选择了"全部用户"，调用月度汇总接口
        if (!userId || userId === '') {
            if (!currentUser.roles.includes('admin') && !currentUser.roles.includes('finance')) {
                // 非管理员/财务不能查看全部用户，回退到查看自己的
                response = await apiFetch(`${API_BASE}/kpi/user/${currentUser._id}?month=${month}`);
            } else {
                response = await apiFetch(`${API_BASE}/kpi/month/${month}`);
            }
        } else {
            response = await apiFetch(`${API_BASE}/kpi/user/${userId}?month=${month}`);
        }
        
        data = await response.json();

        if (data.success) {
            // 判断是全部用户汇总还是单个用户查询
            const isAllUsers = !userId || userId === '';
            
            if (isAllUsers && data.data.summary) {
                // 全部用户汇总视图
                const html = `
                    <h3>全部用户KPI汇总 - ${month}</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>用户</th>
                                <th>角色</th>
                                <th>各角色KPI</th>
                                <th>总计</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.data.summary.map(user => {
                                // 判断用户是否有兼职岗位和专职岗位
                                const partTimeRoles = Object.keys(user.byRole).filter(role => {
                                    const roleStr = String(role || '').trim();
                                    return roleStr === 'part_time_sales' || roleStr === 'layout';
                                });
                                const fullTimeRoles = Object.keys(user.byRole).filter(role => {
                                    const roleStr = String(role || '').trim();
                                    return roleStr !== 'part_time_sales' && roleStr !== 'layout';
                                });
                                
                                // 计算兼职岗位和专职岗位的KPI总和
                                const partTimeTotal = partTimeRoles.reduce((sum, role) => sum + (user.byRole[role] || 0), 0);
                                const fullTimeTotal = fullTimeRoles.reduce((sum, role) => sum + (user.byRole[role] || 0), 0);
                                
                                // 根据岗位类型显示总计
                                let totalDisplay = '';
                                if (partTimeRoles.length > 0 && fullTimeRoles.length === 0) {
                                    // 只有兼职岗位
                                    totalDisplay = `<strong>¥${user.totalKPI.toLocaleString()} 元</strong>`;
                                } else if (partTimeRoles.length === 0 && fullTimeRoles.length > 0) {
                                    // 只有专职岗位
                                    totalDisplay = `<strong>${user.totalKPI.toLocaleString()} 分</strong>`;
                                } else if (partTimeRoles.length > 0 && fullTimeRoles.length > 0) {
                                    // 混合岗位
                                    totalDisplay = `<strong>兼职: ¥${partTimeTotal.toLocaleString()} 元<br>专职: ${fullTimeTotal.toLocaleString()} 分</strong>`;
                                } else {
                                    totalDisplay = `<strong>${user.totalKPI.toLocaleString()} 分</strong>`;
                                }
                                
                                return `
                                <tr>
                                    <td>${user.userName}</td>
                                    <td>${user.roles.map(r => getRoleText(r)).join(', ')}</td>
                                    <td style="font-size: 12px;">
                                        ${Object.entries(user.byRole).map(([role, value]) => {
                                            const roleStr = String(role || '').trim();
                                            const isPartTimeRole = roleStr === 'part_time_sales' || roleStr === 'layout';
                                            const unit = isPartTimeRole ? '元' : '分';
                                            const prefix = isPartTimeRole ? '¥' : '';
                                            return `${getRoleText(role)}: ${prefix}${value.toLocaleString()} ${unit}`;
                                        }).join('<br>')}
                                    </td>
                                    <td>${totalDisplay}</td>
                                </tr>
                            `;
                            }).join('')}
                        </tbody>
                    </table>
                    ${data.data.monthlyRoleKPIs && data.data.monthlyRoleKPIs.length > 0 ? `
                        <div style="margin-top: 20px;">
                            <h4>月度汇总KPI（综合岗/财务岗）</h4>
                            <table>
                                <thead>
                                    <tr>
                                        <th>用户</th>
                                        <th>角色</th>
                                        <th>全公司当月项目总金额</th>
                                        <th>系数</th>
                                        <th>完成系数（评价）</th>
                                        <th>KPI值</th>
                                        <th>计算公式</th>
                                        ${currentUser.roles.includes('admin') ? '<th>操作</th>' : ''}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.data.monthlyRoleKPIs.map(r => `
                                        <tr>
                                            <td>${r.userId?.name || 'N/A'}</td>
                                            <td>${getRoleText(r.role)}</td>
                                            <td>¥${r.totalCompanyAmount.toLocaleString()}</td>
                                            <td>${r.ratio}</td>
                                            <td>
                                                ${r.evaluationLevel === 'good' ? '<span style="color:#10b981;">好 (1.1)</span>' : 
                                                  r.evaluationLevel === 'poor' ? '<span style="color:#ef4444;">差 (0.8)</span>' : '<span>中 (1.0)</span>'}
                                                ${r.evaluatedBy ? `<br><small style="color:#666;">评价人: ${r.evaluatedBy.name || '管理员'}</small>` : '<br><small style="color:#999;">未评价</small>'}
                                            </td>
                                            <td>${r.kpiValue.toLocaleString()} 分</td>
                                            <td style="font-size: 12px;">${r.calculationDetails?.formula || ''}</td>
                                            ${currentUser.roles.includes('admin') ? `
                                                <td>
                                                    <button class="btn-small" onclick="showEvaluateModal('${r._id}', '${r.role}', '${r.evaluationLevel || 'medium'}')">
                                                        ${r.evaluatedBy ? '修改评价' : '评价'}
                                                    </button>
                                                </td>
                                            ` : ''}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : ''}
                `;
                document.getElementById('kpiResults').innerHTML = html;
            } else {
                // 单个用户查询视图
                const user = allUsers.find(u => u._id === userId) || currentUser;
                
                // 使用后端返回的canViewAmount字段，如果后端没有返回，则根据角色判断
                const canViewAmount = data.data.canViewAmount !== false;
                const userRoles = currentUser.roles || [];
                const isSensitiveRole = userRoles.includes('pm') || 
                                       userRoles.includes('translator') || 
                                       userRoles.includes('reviewer');
                // 如果后端明确返回false，或者用户是敏感角色且不是管理员/财务，则隐藏金额
                const shouldHideAmount = !canViewAmount || (isSensitiveRole && !userRoles.includes('admin') && !userRoles.includes('finance'));
                
                // 显示月度角色KPI（综合岗和财务岗）
                let monthlyRoleKPIHtml = '';
                if (data.data.monthlyRoleKPIs && data.data.monthlyRoleKPIs.length > 0) {
                    monthlyRoleKPIHtml = `
                        <div style="margin-top: 20px;">
                            <h4>月度汇总KPI（综合岗/财务岗）</h4>
                            <table>
                                <thead>
                                    <tr>
                                        <th>角色</th>
                                        <th>全公司当月项目总金额</th>
                                        <th>系数</th>
                                        <th>完成系数（评价）</th>
                                        <th>KPI值</th>
                                        <th>计算公式</th>
                                        ${currentUser.roles.includes('admin') ? '<th>操作</th>' : ''}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.data.monthlyRoleKPIs.map(r => `
                                        <tr>
                                            <td>${getRoleText(r.role)}</td>
                                            <td>¥${r.totalCompanyAmount.toLocaleString()}</td>
                                            <td>${r.ratio}</td>
                                            <td>
                                                ${r.evaluationLevel === 'good' ? '<span style="color:#10b981;">好 (1.1)</span>' : 
                                                  r.evaluationLevel === 'poor' ? '<span style="color:#ef4444;">差 (0.8)</span>' : '<span>中 (1.0)</span>'}
                                                ${r.evaluatedBy ? `<br><small style="color:#666;">评价人: ${r.evaluatedBy.name || '管理员'}</small>` : '<br><small style="color:#999;">未评价</small>'}
                                            </td>
                                            <td>${r.kpiValue.toLocaleString()} 分</td>
                                            <td style="font-size: 12px;">${r.calculationDetails?.formula || ''}</td>
                                            ${currentUser.roles.includes('admin') ? `
                                                <td>
                                                    <button class="btn-small" onclick="showEvaluateModal('${r._id}', '${r.role}', '${r.evaluationLevel || 'medium'}')">
                                                        ${r.evaluatedBy ? '修改评价' : '评价'}
                                                    </button>
                                                </td>
                                            ` : ''}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                }

                const html = `
                    <h3>${user.name} 的KPI - ${month}</h3>
                    <p><strong>总计: ${data.data.total.toLocaleString()} 分</strong> <small style="color:#666;">（兼职岗位按元计算，专职岗位按分计算）</small></p>
                    ${data.data.records.length === 0 && (!data.data.monthlyRoleKPIs || data.data.monthlyRoleKPIs.length === 0) ? '<p>该月暂无KPI记录</p>' : `
                        <table>
                            <thead>
                                <tr>
                                    <th>项目名称</th>
                                    <th>客户名称</th>
                                    ${shouldHideAmount ? '' : '<th>项目金额</th>'}
                                    <th>角色</th>
                                    <th>KPI值</th>
                                    <th>计算公式</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.data.records.map(r => {
                                    // 兼职销售和兼职排版按金额计算（元），其他角色按分值计算（分）
                                    const roleStr = String(r.role || '').trim();
                                    const isPartTimeRole = roleStr === 'part_time_sales' || roleStr === 'layout';
                                    const unit = isPartTimeRole ? '元' : '分';
                                    const prefix = isPartTimeRole ? '¥' : '';
                                    return `
                                    <tr>
                                        <td>${r.projectId?.projectName || 'N/A'}</td>
                                        <td>${r.projectId?.clientName || 'N/A'}</td>
                                        ${shouldHideAmount ? '' : `<td>${r.projectId?.projectAmount ? '¥' + r.projectId.projectAmount.toLocaleString() : '-'}</td>`}
                                        <td>${getRoleText(r.role)}</td>
                                        <td>${prefix}${r.kpiValue.toLocaleString()} ${unit}</td>
                                        <td style="font-size: 12px;">${r.calculationDetails?.formula || ''}</td>
                                    </tr>
                                `;
                                }).join('')}
                            </tbody>
                        </table>
                    `}
                    ${monthlyRoleKPIHtml}
                `;
                document.getElementById('kpiResults').innerHTML = html;
            }
        } else {
            // 如果查询失败，显示错误信息
            let errorMsg = data.message || '加载KPI失败';
            if (errorMsg.includes('无权')) {
                errorMsg = '您只能查看自己的KPI';
            }
            document.getElementById('kpiResults').innerHTML = `<div class="alert alert-error">${errorMsg}</div>`;
        }
    } catch (error) {
        console.error('加载KPI失败:', error);
        showAlert('kpiResults', '加载KPI失败: ' + error.message, 'error');
    }
}

async function generateMonthlyKPI() {
    const month = document.getElementById('kpiMonth').value || 
        new Date().toISOString().slice(0, 7);
    
    if (!month) {
        alert('请先选择月份');
        return;
    }

    // 询问是否强制更新已存在的记录
    const forceUpdate = confirm(
        `确定要生成 ${month} 的月度KPI吗？\n\n` +
        `点击"确定"：强制更新已存在的记录（适用于修改KPI参数后重新计算）\n` +
        `点击"取消"：跳过已存在的记录（仅生成新记录，不更新已有数据）`
    );
    
    const force = forceUpdate; // 用户点击确定表示强制更新

    try {
        const response = await apiFetch(`${API_BASE}/kpi/generate-monthly`, {
            method: 'POST',
            body: JSON.stringify({ month, force })
        });
        const result = await response.json();
        
        if (result.success) {
            alert(result.message || `月度KPI生成成功！共生成 ${result.data.count} 条记录`);
            loadKPI();
        } else {
            alert(result.message || '生成失败');
        }
    } catch (error) {
        alert('生成失败: ' + error.message);
    }
}

// 显示评价完成系数模态框
function showEvaluateModal(recordId, role, currentLevel) {
    const roleText = role === 'admin_staff' ? '综合岗' : '财务岗';
    const modalContent = `
        <div style="padding: 20px;">
            <h3>评价${roleText}完成系数</h3>
            <div style="margin: 20px 0;">
                <label style="display: block; margin-bottom: 10px;">选择评价等级：</label>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="radio" name="evaluationLevel" value="good" ${currentLevel === 'good' ? 'checked' : ''} style="margin-right: 5px;">
                        <span>好 (1.1倍)</span>
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="radio" name="evaluationLevel" value="medium" ${currentLevel === 'medium' ? 'checked' : ''} style="margin-right: 5px;">
                        <span>中 (1.0倍)</span>
                    </label>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="radio" name="evaluationLevel" value="poor" ${currentLevel === 'poor' ? 'checked' : ''} style="margin-right: 5px;">
                        <span>差 (0.8倍)</span>
                    </label>
                </div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                <button class="btn-small" onclick="closeModal()">取消</button>
                <button class="btn-small btn-success" onclick="submitEvaluation('${recordId}')">确定</button>
            </div>
        </div>
    `;
    showModal('评价完成系数', modalContent);
}

// 提交评价
async function submitEvaluation(recordId) {
    const selectedLevel = document.querySelector('input[name="evaluationLevel"]:checked');
    if (!selectedLevel) {
        alert('请选择评价等级');
        return;
    }

    try {
        const response = await apiFetch(`${API_BASE}/kpi/monthly-role/${recordId}/evaluate`, {
            method: 'POST',
            body: JSON.stringify({
                evaluationLevel: selectedLevel.value
            })
        });
        const result = await response.json();

        if (result.success) {
            closeModal();
            loadKPI(); // 重新加载KPI数据
            showAlert('kpiResults', '评价完成系数已更新', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('评价失败: ' + error.message);
    }
}

async function exportKPI() {
    const month = document.getElementById('kpiMonth').value || 
        new Date().toISOString().slice(0, 7);
    const userId = document.getElementById('kpiUserSelect').value;

    try {
        let url;
        let filename;
        
        if (userId) {
            // 导出单个用户
            url = `${API_BASE}/kpi/export/user/${userId}?month=${month}`;
            filename = `KPI明细-${month}.xlsx`;
        } else {
            // 导出月度汇总
            url = `${API_BASE}/kpi/export/month/${month}`;
            filename = `KPI工资表-${month}.xlsx`;
        }

        // 使用fetch下载文件，确保携带认证token
        // 注意：下载文件时不需要设置Content-Type
        const headers = {};
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        if (currentRole) {
            headers['X-Role'] = currentRole;
        }
        
        const response = await fetch(url, {
            headers: headers
        });
        
        if (!response.ok) {
            // 尝试解析错误信息
            let errorMessage = '导出失败';
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (e) {
                errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        // 获取文件名（从Content-Disposition header）
        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
            if (filenameMatch) {
                filename = decodeURIComponent(filenameMatch[1]);
            } else {
                const filenameMatch2 = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch2) {
                    filename = filenameMatch2[1];
                }
            }
        }

        // 将响应转换为blob
        const blob = await response.blob();
        
        // 创建下载链接
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        // 清理
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        console.error('导出Excel失败:', error);
        alert('导出失败: ' + (error.message || '未知错误'));
    }
}

// ==================== 配置管理 ====================
async function loadConfig() {
    try {
        const response = await apiFetch(`${API_BASE}/config`);
        const data = await response.json();

        if (data.success) {
            const config = data.data;
            const html = `
                <form id="configUpdateForm">
                    <h3 style="margin-bottom: 10px;">机构信息</h3>
                    <div class="form-group">
                        <label>公司名称</label>
                        <input type="text" name="companyName" value="${config.companyName || ''}" placeholder="请输入公司名称">
                    </div>
                    <div class="form-group">
                        <label>公司地址</label>
                        <input type="text" name="companyAddress" value="${config.companyAddress || ''}" placeholder="请输入公司地址">
                    </div>
                    <div class="form-group">
                        <label>联系人</label>
                        <input type="text" name="companyContact" value="${config.companyContact || ''}" placeholder="请输入联系人">
                    </div>
                    <div class="form-group">
                        <label>联系电话</label>
                        <input type="text" name="companyPhone" value="${config.companyPhone || ''}" placeholder="请输入联系电话">
                    </div>
                    <div class="form-group">
                        <label>联系邮箱</label>
                        <input type="text" name="companyEmail" value="${config.companyEmail || ''}" placeholder="请输入联系邮箱">
                    </div>

                    <h3 style="margin: 16px 0 10px;">KPI 系数</h3>
                    <div class="form-group">
                        <label>翻译（MTPE）系数</label>
                        <input type="number" step="0.001" value="${config.translator_ratio_mtpe}" 
                               name="translator_ratio_mtpe" required>
                    </div>
                    <div class="form-group">
                        <label>翻译（深度编辑）系数</label>
                        <input type="number" step="0.001" value="${config.translator_ratio_deepedit}" 
                               name="translator_ratio_deepedit" required>
                    </div>
                    <div class="form-group">
                        <label>审校系数</label>
                        <input type="number" step="0.001" value="${config.reviewer_ratio}" 
                               name="reviewer_ratio" required>
                    </div>
                    <div class="form-group">
                        <label>PM系数</label>
                        <input type="number" step="0.001" value="${config.pm_ratio}" 
                               name="pm_ratio" required>
                    </div>
                    <div class="form-group">
                        <label>销售金额奖励系数</label>
                        <input type="number" step="0.001" value="${config.sales_bonus_ratio}" 
                               name="sales_bonus_ratio" required>
                    </div>
                    <div class="form-group">
                        <label>销售回款系数</label>
                        <input type="number" step="0.001" value="${config.sales_commission_ratio}" 
                               name="sales_commission_ratio" required>
                    </div>
                    <div class="form-group">
                        <label>综合岗系数</label>
                        <input type="number" step="0.001" value="${config.admin_ratio}" 
                               name="admin_ratio" required>
                    </div>
                    <div class="form-group">
                        <label>完成系数（基础值）</label>
                        <input type="number" step="0.001" value="${config.completion_factor}" 
                               name="completion_factor" required>
                    </div>
                    <div class="form-group">
                        <label>变更原因</label>
                        <textarea name="reason" rows="3" placeholder="请说明变更原因"></textarea>
                    </div>
                    <div class="action-buttons">
                        <button type="submit">更新配置</button>
                    </div>
                </form>
            `;
            document.getElementById('configForm').innerHTML = html;
            
            document.getElementById('configUpdateForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);
                const numberFields = ['translator_ratio_mtpe','translator_ratio_deepedit','reviewer_ratio','pm_ratio','sales_bonus_ratio','sales_commission_ratio','admin_ratio','completion_factor'];
                Object.keys(data).forEach(k => {
                    if (numberFields.includes(k) && data[k]) data[k] = parseFloat(data[k]);
                });

                try {
                    const response = await apiFetch(`${API_BASE}/config/update`, {
                        method: 'POST',
                        body: JSON.stringify(data)
                    });
                    const result = await response.json();
                    if (result.success) {
                        showAlert('configAlert', '配置更新成功', 'success');
                        loadConfig();
                        // 重新加载机构信息，更新标题显示
                        loadOrgInfo();
                    } else {
                        showAlert('configAlert', result.message, 'error');
                    }
                } catch (error) {
                    showAlert('configAlert', '更新失败: ' + error.message, 'error');
                }
            });
        }
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

async function loadConfigHistory() {
    try {
        const response = await apiFetch(`${API_BASE}/config/history`);
        const data = await response.json();

        if (data.success) {
            const html = `
                <h4>配置变更历史</h4>
                <table>
                    <thead>
                        <tr>
                            <th>变更时间</th>
                            <th>变更人</th>
                            <th>变更原因</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.data.map((h, idx) => `
                            <tr>
                                <td>${new Date(h.changedAt).toLocaleString()}</td>
                                <td>${h.changedByUser?.name || '未知'}</td>
                                <td>${h.reason || '无'}</td>
                                <td><button class="btn-small" onclick="viewConfigChange(${idx})">查看详情</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            document.getElementById('configHistory').innerHTML = html;
        }
    } catch (error) {
        console.error('加载历史失败:', error);
    }
}

// ==================== 工具函数 ====================
function showAlert(elementId, message, type) {
    const element = document.getElementById(elementId);
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    element.insertBefore(alertDiv, element.firstChild);
    setTimeout(() => alertDiv.remove(), 3000);
}

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    // 强制回流以启用过渡
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

function getStatusText(status) {
    const statusMap = {
        'pending': '待开始',
        'in_progress': '进行中',
        'scheduled': '待安排',
        'translation_done': '翻译完成',
        'review_done': '审校完成',
        'layout_done': '排版完成',
        'completed': '已交付',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

function getStatusBadgeClass(status) {
    const classMap = {
        'pending': 'badge-warning',
        'in_progress': 'badge-info',
        'scheduled': 'badge-primary',
        'translation_done': 'badge-success',
        'review_done': 'badge-success',
        'layout_done': 'badge-success',
        'completed': 'badge-success',
        'cancelled': 'badge-danger'
    };
    return classMap[status] || 'badge-info';
}

function getRoleText(role) {
    const roleMap = {
        'admin': '管理员',
        'finance': '财务',
        'sales': '销售',
        'pm': '项目经理',
        'translator': '翻译',
        'reviewer': '审校',
        'admin_staff': '综合岗',
        'part_time_sales': '兼职销售',
        'layout': '兼职排版'
    };
    return roleMap[role] || role;
}

function getBusinessTypeText(type) {
    const typeMap = {
        'translation': '笔译',
        'interpretation': '口译',
        'transcription': '转录',
        'localization': '本地化',
        'other': '其他'
    };
    return typeMap[type] || type;
}

function getProjectTypeText(type) {
    const typeMap = {
        'mtpe': 'MTPE',
        'deepedit': '深度编辑',
        'review': '审校项目',
        'mixed': '混合类型'
    };
    return typeMap[type] || type;
}

// ==================== Dashboard ====================
async function loadDashboard() {
    try {
        // 销毁之前的图表
        destroyCharts();
        
        const month = document.getElementById('dashboardMonth')?.value || new Date().toISOString().slice(0, 7);
        const status = document.getElementById('dashboardStatus')?.value || '';
        const businessType = document.getElementById('dashboardBusinessType')?.value || '';
        const role = document.getElementById('dashboardRole')?.value || '';

        const params = new URLSearchParams();
        if (month) params.append('month', month);
        if (status) params.append('status', status);
        if (businessType) params.append('businessType', businessType);
        if (role) params.append('role', role);

        const response = await apiFetch(`${API_BASE}/kpi/dashboard?${params.toString()}`);
        const result = await response.json();

        if (!result.success) {
            showAlert('dashboardCards', result.message || '加载失败', 'error');
            return;
        }

        const data = result.data;
        renderDashboardTodayInfo(data);
        renderDashboardCards(data);
        renderDashboardCharts(data);
    } catch (error) {
        showAlert('dashboardCards', '加载业务看板失败: ' + error.message, 'error');
    }
}

function renderDashboardTodayInfo(data) {
    // 判断是否是销售或兼职销售
    const isSales = currentUser?.roles?.includes('sales') || currentUser?.roles?.includes('part_time_sales');
    const isAdmin = currentUser?.roles?.includes('admin');
    const isFinance = currentUser?.roles?.includes('finance');
    const isPM = currentUser?.roles?.includes('pm');
    const isWorker = currentUser?.roles?.includes('translator') || currentUser?.roles?.includes('reviewer') || currentUser?.roles?.includes('layout');
    const showSalesAmount = isSales && !isAdmin && !isFinance;
    const showPMDelivery = isPM && !isAdmin && !isFinance;
    
    let todayInfoHtml = '';
    
    // 销售和兼职销售：显示今日成交和今日进入交付
    if (showSalesAmount) {
        todayInfoHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px;">
                ${data.todayDeals ? `
                <div class="card" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">今日成交</div>
                            <div style="font-size: 36px; font-weight: bold; margin-bottom: 4px;">${data.todayDeals.count || 0}</div>
                            <div style="font-size: 18px; opacity: 0.9;">¥${(data.todayDeals.amount || 0).toLocaleString()}</div>
                        </div>
                        <div style="font-size: 48px; opacity: 0.3;">🎯</div>
                    </div>
                </div>
                ` : ''}
                ${data.todayDelivery ? `
                <div class="card" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">今日待交付</div>
                            <div style="font-size: 36px; font-weight: bold; margin-bottom: 4px;">${data.todayDelivery.count || 0}</div>
                            <div style="font-size: 18px; opacity: 0.9;">¥${(data.todayDelivery.amount || 0).toLocaleString()}</div>
                        </div>
                        <div style="font-size: 48px; opacity: 0.3;">🚀</div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }
    
    // 项目经理：显示今日待交付项目
    if (showPMDelivery && data.todayDelivery) {
        todayInfoHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px;">
                <div class="card" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">今日待交付</div>
                            <div style="font-size: 36px; font-weight: bold; margin-bottom: 4px;">${data.todayDelivery.count || 0}</div>
                            <div style="font-size: 18px; opacity: 0.9;">¥${(data.todayDelivery.amount || 0).toLocaleString()}</div>
                        </div>
                        <div style="font-size: 48px; opacity: 0.3;">🚀</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // 翻译、审校、排版：显示今日本人应完成项目
    if (isWorker && !isAdmin && !isFinance && data.todayMyDueProjects) {
        const projectCount = data.todayMyDueProjects.count || 0;
        const projects = data.todayMyDueProjects.projects || [];
        
        todayInfoHtml = `
            <div class="card" style="background: ${projectCount > 0 ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'}; color: white; border: none; box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3); margin-bottom: 20px;">
                <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: ${projects.length > 0 ? '16px' : '0'};">
                    <div style="flex: 1;">
                        <div style="font-size: 16px; opacity: 0.9; margin-bottom: 8px; font-weight: 500;">今日本人应完成项目</div>
                        <div style="font-size: 48px; font-weight: bold; margin-bottom: 8px;">${projectCount}</div>
                        ${projects.length === 0 ? '<div style="font-size: 16px; opacity: 0.9;">今日无应完成项目，继续保持！</div>' : ''}
                    </div>
                    <div style="font-size: 64px; opacity: 0.2;">📋</div>
                </div>
                ${projects.length > 0 ? `
                <div style="background: rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 16px; margin-top: 16px; backdrop-filter: blur(10px);">
                    <div style="font-size: 14px; opacity: 0.9; margin-bottom: 12px; font-weight: 500;">项目列表：</div>
                    <div style="max-height: 300px; overflow-y: auto;">
                        <table style="width: 100%; font-size: 14px; color: white;">
                            <thead>
                                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.3);">
                                    <th style="padding: 8px; text-align: left; font-weight: 600;">项目名称</th>
                                    <th style="padding: 8px; text-align: left; font-weight: 600;">客户</th>
                                    <th style="padding: 8px; text-align: left; font-weight: 600;">业务类型</th>
                                    <th style="padding: 8px; text-align: left; font-weight: 600;">状态</th>
                                    <th style="padding: 8px; text-align: left; font-weight: 600;">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${projects.map(p => `
                                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                                        <td style="padding: 10px;">${p.projectName || '-'}</td>
                                        <td style="padding: 10px;">${p.customerName || '-'}</td>
                                        <td style="padding: 10px;">${getBusinessTypeText(p.businessType)}</td>
                                        <td style="padding: 10px;">
                                            <span style="background: rgba(255, 255, 255, 0.2); padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                                                ${getStatusText(p.status)}
                                            </span>
                                        </td>
                                        <td style="padding: 10px;">
                                            <button onclick="viewProject('${p.projectId}')" style="background: rgba(255, 255, 255, 0.2); color: white; border: 1px solid rgba(255, 255, 255, 0.3); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s;" 
                                                onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
                                                onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                                                查看
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }
    
    const el = document.getElementById('dashboardTodayInfo');
    if (el) el.innerHTML = todayInfoHtml;
}

function renderDashboardCards(data) {
    const statusCounts = data.statusCounts || {};
    const inProgress = statusCounts['in_progress'] || 0;
    const pending = statusCounts['pending'] || 0;
    const completed = statusCounts['completed'] || 0;
    const total = data.projectCount || 0;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;
    const paymentRate = data.paymentCompletionRate !== undefined ? data.paymentCompletionRate : null;
    const recentCompleted = data.recentCompleted || 0;
    const recentPaymentOverdue = data.recentPaymentOverdue || 0;
    const recentDeliveryOverdue = data.recentDeliveryOverdue || 0;
    
    // 判断是否是销售或兼职销售
    const isSales = currentUser?.roles?.includes('sales') || currentUser?.roles?.includes('part_time_sales');
    const isAdmin = currentUser?.roles?.includes('admin');
    const isFinance = currentUser?.roles?.includes('finance');
    const isPM = currentUser?.roles?.includes('pm');
    const isAdminStaff = currentUser?.roles?.includes('admin_staff');
    const isWorker = currentUser?.roles?.includes('translator') || currentUser?.roles?.includes('reviewer') || currentUser?.roles?.includes('layout');
    
    // 销售和兼职销售显示成交额，但所有角色都应该显示KPI
    const showSalesAmount = isSales && !isAdmin && !isFinance;
    // 所有角色都可以查看KPI（只要后端返回了kpiTotal数据）
    const showKPI = data.kpiTotal !== undefined || data.kpiByRole !== undefined;
    
    const cards = `
        <div class="card-grid">
            <div class="card stat-card stat-primary" onclick="navigateFromDashboardCard('projects')">
                <div class="stat-icon">📊</div>
                <div class="stat-content">
                    <div class="card-title">当月项目数</div>
                    <div class="card-value">${data.projectCount || 0}</div>
                    <div class="card-desc">月份：${data.month}</div>
                </div>
            </div>
            ${showSalesAmount && data.totalProjectAmount !== undefined ? `
            <div class="card stat-card stat-success">
                <div class="stat-icon">💰</div>
                <div class="stat-content">
                    <div class="card-title">成交额合计</div>
                    <div class="card-value">¥${(data.totalProjectAmount || 0).toLocaleString()}</div>
                    <div class="card-desc">根据筛选条件汇总</div>
                </div>
            </div>
            ` : ''}
            ${!showSalesAmount && data.totalProjectAmount !== undefined ? `
            <div class="card stat-card stat-success" onclick="navigateFromDashboardCard('projects')">
                <div class="stat-icon">💰</div>
                <div class="stat-content">
                    <div class="card-title">项目金额合计</div>
                    <div class="card-value">¥${(data.totalProjectAmount || 0).toLocaleString()}</div>
                    <div class="card-desc">可见范围内金额</div>
                </div>
            </div>
            ` : ''}
            ${showKPI ? `
            <div class="card stat-card stat-info" onclick="navigateFromDashboardCard('kpi')">
                <div class="stat-icon">📈</div>
                <div class="stat-content">
                    <div class="card-title">KPI合计</div>
                    <div class="card-value">${(data.kpiTotal || 0).toLocaleString()} 分</div>
                    <div class="card-desc">根据角色权限汇总（兼职岗位按元，专职岗位按分）</div>
                </div>
            </div>
            ` : ''}
            <div class="card stat-card stat-primary" onclick="navigateFromDashboardCard('projects', 'in_progress')">
                <div class="stat-icon">✅</div>
                <div class="stat-content">
                    <div class="card-title">完成率</div>
                    <div class="card-value">${completionRate}%</div>
                    <div class="subtext">完成/总项目：${completed}/${total}</div>
                </div>
            </div>
            <div class="card stat-card stat-warning" onclick="navigateFromDashboardCard('projects', 'in_progress')">
                <div class="stat-icon">🔄</div>
                <div class="stat-content">
                    <div class="card-title">进行中</div>
                    <div class="card-value">${inProgress}</div>
                    <div class="subtext">当前执行的项目</div>
                </div>
            </div>
            <div class="card stat-card stat-success" onclick="navigateFromDashboardCard('projects', 'completed')">
                <div class="stat-icon">✓</div>
                <div class="stat-content">
                    <div class="card-title">已完成</div>
                    <div class="card-value">${completed}</div>
                    <div class="subtext">本月完成项目</div>
                </div>
            </div>
            <div class="card stat-card stat-info" onclick="navigateFromDashboardCard('projects', 'pending')">
                <div class="stat-icon">⏳</div>
                <div class="stat-content">
                    <div class="card-title">待开始</div>
                    <div class="card-value">${pending}</div>
                    <div class="subtext">待排期项目</div>
                </div>
            </div>
            <div class="card stat-card stat-danger" onclick="navigateFromDashboardCard('paymentOverdue')">
                <div class="stat-icon">⚠️</div>
                <div class="stat-content">
                    <div class="card-title">回款预警</div>
                    <div class="card-value">${(data.paymentWarnings?.length || 0)}</div>
                    <div class="card-desc">逾期未回款项目</div>
                </div>
            </div>
            <div class="card stat-card stat-danger" onclick="navigateFromDashboardCard('deliveryOverdue')">
                <div class="stat-icon">🚨</div>
                <div class="stat-content">
                    <div class="card-title">交付逾期</div>
                    <div class="card-value">${(data.deliveryWarnings?.length || 0)}</div>
                    <div class="card-desc">截止已过未完成</div>
                </div>
            </div>
            ${paymentRate !== null ? `
            <div class="card stat-card stat-success" onclick="navigateFromDashboardCard('receivables')">
                <div class="stat-icon">💵</div>
                <div class="stat-content">
                    <div class="card-title">回款完成率</div>
                    <div class="card-value">${paymentRate}%</div>
                    <div class="subtext">已回款/项目金额</div>
                </div>
            </div>
            ` : ''}
            <div class="card stat-card stat-info" onclick="navigateFromDashboardCard('projects')">
                <div class="stat-icon">📅</div>
                <div class="stat-content">
                    <div class="card-title">近7天完成</div>
                    <div class="card-value">${recentCompleted}</div>
                    <div class="subtext">近7天完成项目数</div>
                </div>
            </div>
            <div class="card stat-card stat-danger" onclick="navigateFromDashboardCard('paymentOverdue')">
                <div class="stat-icon">⚠️</div>
                <div class="stat-content">
                    <div class="card-title">近7天回款预警</div>
                    <div class="card-value">${recentPaymentOverdue}</div>
                    <div class="card-desc">近7天逾期回款项目</div>
                </div>
            </div>
            <div class="card stat-card stat-danger" onclick="navigateFromDashboardCard('deliveryOverdue')">
                <div class="stat-icon">🚨</div>
                <div class="stat-content">
                    <div class="card-title">近7天交付预警</div>
                    <div class="card-value">${recentDeliveryOverdue}</div>
                    <div class="card-desc">近7天交付逾期项目</div>
                </div>
            </div>
        </div>
    `;

    const el = document.getElementById('dashboardCards');
    if (el) el.innerHTML = cards;
}

// ==================== 财务管理 ====================
async function loadReceivables() {
    const month = document.getElementById('financeMonth')?.value || '';
    const startDate = document.getElementById('financeStartDate')?.value || '';
    const endDate = document.getElementById('financeEndDate')?.value || '';
    const status = document.getElementById('financeStatus')?.value || '';
    const paymentStatus = document.getElementById('financePaymentStatus')?.value || '';
    const hasInvoice = document.getElementById('financeHasInvoice')?.value || '';
    const customerId = document.getElementById('financeCustomer')?.value || '';
    const salesId = document.getElementById('financeSales')?.value || '';
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (paymentStatus) params.append('paymentStatus', paymentStatus);
    if (hasInvoice) params.append('hasInvoice', hasInvoice);
    // 日期范围筛选（优先使用起止日期，如果没有则使用月份）
    if (startDate) params.append('expectedStartDate', startDate);
    if (endDate) {
        // 结束日期设置为当天的23:59:59
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.append('expectedEndDate', end.toISOString());
    } else if (month) {
        // 如果没有结束日期但有月份，使用月份的最后一天
        const [y, m] = month.split('-');
        const end = new Date(y, m, 0);
        end.setHours(23, 59, 59, 999);
        params.append('dueBefore', end.toISOString());
    }
    if (customerId) params.append('customerId', customerId);
    if (salesId) params.append('salesId', salesId);
    const res = await apiFetch(`${API_BASE}/finance/receivables?${params.toString()}`);
    const data = await res.json();
    if (!data.success) {
        showAlert('receivablesList', data.message || '加载失败', 'error');
        return;
    }
    console.log('应收对账API返回:', {
        success: data.success,
        dataLength: data.data?.length || 0,
        firstItem: data.data?.[0] || null
    });
    receivablesCache = data.data || [];
    console.log('receivablesCache长度:', receivablesCache.length);
    receivablePage = 1;
    renderReceivables();
}

function exportReceivables() {
    // 使用后端API导出，确保编码正确（GBK编码，Windows Excel默认能识别）
    const month = document.getElementById('financeMonth')?.value || '';
    const startDate = document.getElementById('financeStartDate')?.value || '';
    const endDate = document.getElementById('financeEndDate')?.value || '';
    const status = document.getElementById('financeStatus')?.value || '';
    const paymentStatus = document.getElementById('financePaymentStatus')?.value || '';
    const hasInvoice = document.getElementById('financeHasInvoice')?.value || '';
    const customerId = document.getElementById('financeCustomer')?.value || '';
    const salesId = document.getElementById('financeSales')?.value || '';
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (paymentStatus) params.append('paymentStatus', paymentStatus);
    if (hasInvoice) params.append('hasInvoice', hasInvoice);
    // 日期范围筛选（优先使用起止日期，如果没有则使用月份）
    if (startDate) params.append('expectedStartDate', startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.append('expectedEndDate', end.toISOString());
    } else if (month) {
        const [y, m] = month.split('-');
        const end = new Date(y, m, 0);
        end.setHours(23, 59, 59, 999);
        params.append('dueBefore', end.toISOString());
    }
    if (customerId) params.append('customerId', customerId);
    if (salesId) params.append('salesId', salesId);
    
    // 使用fetch下载文件，包含认证token
    fetch(`${API_BASE}/finance/receivables/export?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.blob())
    .then(blob => {
    const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = '应收对账.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    URL.revokeObjectURL(url);
    })
    .catch(error => {
        showToast('导出失败: ' + error.message, 'error');
    });
}

function renderReceivables() {
    console.log('renderReceivables被调用, receivablesCache长度:', receivablesCache.length);
    const pageSizeSel = document.getElementById('financePageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value || '10', 10) : 10;
    const totalPages = Math.max(1, Math.ceil(receivablesCache.length / pageSize));
    if (receivablePage > totalPages) receivablePage = totalPages;
    const start = (receivablePage - 1) * pageSize;
    const pageData = receivablesCache.slice(start, start + pageSize);
    console.log('分页数据:', {
        totalPages,
        currentPage: receivablePage,
        pageSize,
        start,
        pageDataLength: pageData.length,
        firstItem: pageData[0] || null
    });
    const paymentStatusText = {
        'unpaid': '未支付',
        'partially_paid': '部分支付',
        'paid': '已支付'
    };
    
    const rows = pageData.map(r => {
        const paymentStatus = r.paymentStatus || 'unpaid';
        const paymentStatusBadge = paymentStatus === 'paid' ? 'badge-success' : 
                                   paymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger';
        return `
        <tr class="${r.overdue ? 'row-overdue' : ''}">
            <td>${r.projectNumber || '-'}</td>
            <td>${r.projectName}</td>
            <td>${r.customerName || ''}</td>
            <td>${r.salesName || ''}</td>
            <td>¥${(r.projectAmount || 0).toLocaleString()}</td>
            <td>¥${(r.receivedAmount || 0).toLocaleString()}</td>
            <td>¥${(r.outstanding || 0).toLocaleString()}</td>
            <td>${r.expectedAt ? new Date(r.expectedAt).toLocaleDateString() : '-'}</td>
            <td>
                <span class="badge ${paymentStatusBadge}">
                    ${paymentStatusText[paymentStatus] || paymentStatus}
                </span>
            </td>
            <td>
                ${r.hasInvoice ? 
                    `<span class="badge badge-info">已开票${r.invoiceCount > 0 ? `(${r.invoiceCount})` : ''}</span>` : 
                    '<span class="badge badge-secondary">未开票</span>'
                }
            </td>
            <td>${r.overdue ? '<span class="badge badge-danger">逾期</span>' : ''}</td>
        </tr>
    `;
    }).join('');
    document.getElementById('receivablesList').innerHTML = `
        <table class="table-sticky">
            <thead>
                <tr>
                    <th>项目编号</th>
                    <th>项目名称</th>
                    <th>客户</th>
                    <th>销售</th>
                    <th>项目金额</th>
                    <th>已回款</th>
                    <th>未回款</th>
                    <th>约定回款日</th>
                    <th>回款状态</th>
                    <th>发票状态</th>
                    <th>逾期</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="11" style="text-align:center;">暂无数据</td></tr>'}
            </tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${receivablePage<=1?'disabled':''} onclick="receivablePage=Math.max(1, receivablePage-1);renderReceivables();">上一页</button>
            <span style="align-self:center;">${receivablePage} / ${totalPages}</span>
            <button class="btn-small" ${receivablePage>=totalPages?'disabled':''} onclick="receivablePage=Math.min(${totalPages}, receivablePage+1);renderReceivables();">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${receivablePage}" style="width:70px;padding:6px;" onchange="jumpReceivablePage(this.value, ${totalPages})">
        </div>
    `;
}

function jumpReceivablePage(val, total) {
    const page = Math.min(Math.max(parseInt(val || 1, 10), 1), total);
    receivablePage = page;
    renderReceivables();
}

async function loadInvoices() {
    const status = document.getElementById('invoiceStatus')?.value || '';
    const type = document.getElementById('invoiceTypeFilter')?.value || '';
    const projectId = document.getElementById('invoiceProjectId')?.value || '';
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    if (projectId) params.append('projectId', projectId);
    const res = await apiFetch(`${API_BASE}/finance/invoice?${params.toString()}`);
    const data = await res.json();
    if (!data.success) {
            showAlert('invoiceList', data.message || '加载失败', 'error');
        return;
    }
    // 获取项目信息以便显示项目名称
    const projectMap = {};
    if (allProjectsCache.length > 0) {
        allProjectsCache.forEach(p => {
            projectMap[p._id] = p;
        });
    }
    
    const rows = data.data.map(i => {
        // 优先使用后端返回的项目信息
        const project = i.projectId && typeof i.projectId === 'object' ? i.projectId : projectMap[i.projectId];
        const projectDisplay = project ? 
            `${project.projectNumber || ''}${project.projectNumber ? ' - ' : ''}${project.projectName || ''}` : 
            (i.projectId?._id || i.projectId || '');
        
        const statusBadge = i.status === 'paid' ? 'badge-success' : 
                           i.status === 'issued' ? 'badge-info' : 
                           i.status === 'void' ? 'badge-danger' : 'badge-warning';
        const statusText = i.status === 'paid' ? '已支付' : 
                          i.status === 'issued' ? '已开' : 
                          i.status === 'void' ? '作废' : '待开';
        
        const typeText = i.type === 'vat' ? '增值税' : 
                        i.type === 'normal' ? '普通' : 
                        i.type === 'other' ? '其他' : i.type || '-';
        
        return `
        <tr>
            <td>${i.invoiceNumber || '-'}</td>
            <td>${projectDisplay}</td>
            <td>¥${(i.amount || 0).toLocaleString()}</td>
            <td>${i.issueDate ? new Date(i.issueDate).toLocaleDateString() : '-'}</td>
            <td><span class="badge ${statusBadge}">${statusText}</span></td>
            <td>${typeText}</td>
            <td>${i.note || '-'}</td>
        </tr>
    `;
    }).join('');
    document.getElementById('invoiceList').innerHTML = `
        <table class="table-sticky">
            <thead>
                <tr>
                    <th>发票号</th>
                    <th>项目</th>
                    <th>金额</th>
                    <th>开票日期</th>
                    <th>状态</th>
                    <th>类型</th>
                    <th>备注</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="7" style="text-align:center;">暂无发票</td></tr>'}
            </tbody>
        </table>
    `;
}

async function addInvoice() {
    const projectId = document.getElementById('invoiceProjectId')?.value;
    const invoiceNumber = document.getElementById('invoiceNumber')?.value;
    const amount = document.getElementById('invoiceAmount')?.value;
    const issueDate = document.getElementById('invoiceDate')?.value;
    if (!projectId || !invoiceNumber || !amount || !issueDate) {
        showToast('请选择项目、填写发票号、金额和开票日期', 'error');
        return;
    }
    
    const invoiceAmount = parseFloat(amount);
    if (isNaN(invoiceAmount) || invoiceAmount <= 0) {
        showToast('发票金额必须大于0', 'error');
        return;
    }
    
    try {
        // 先获取项目信息
        const projectRes = await apiFetch(`${API_BASE}/projects/${projectId}`);
        const projectData = await projectRes.json();
        if (!projectData.success) {
            showToast('获取项目信息失败', 'error');
            return;
        }
        const project = projectData.data;
        const projectAmount = project.projectAmount || 0;
        
        // 获取该项目的所有历史发票（排除作废的）
        const invoiceRes = await apiFetch(`${API_BASE}/finance/invoice?projectId=${projectId}`);
        const invoiceData = await invoiceRes.json();
        
        if (invoiceData.success) {
            // 计算累计开票金额（排除作废的发票）
            const existingInvoices = invoiceData.data || [];
            const totalInvoiceAmount = existingInvoices
                .filter(inv => inv.status !== 'void') // 排除作废的发票
                .reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
            
            // 检查累计开票金额（包括本次）是否超过项目金额
            const newTotalAmount = totalInvoiceAmount + invoiceAmount;
            if (newTotalAmount > projectAmount) {
                const remaining = projectAmount - totalInvoiceAmount;
                showToast(
                    `累计开票金额不能超过项目金额！\n项目金额：¥${projectAmount.toLocaleString()}\n已开票金额：¥${totalInvoiceAmount.toLocaleString()}\n本次开票：¥${invoiceAmount.toLocaleString()}\n最多可开票：¥${Math.max(0, remaining).toLocaleString()}`,
                    'error'
                );
                return;
            }
        }
        
    const payload = {
        invoiceNumber,
            amount: invoiceAmount,
        issueDate,
            status: 'issued',
            type: document.getElementById('invoiceType')?.value || 'vat',
            note: document.getElementById('invoiceNote')?.value || ''
    };
        
        const res = await apiFetch(`${API_BASE}/finance/invoice/${projectId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '新增失败', 'error');
            return;
        }
        // 清空表单
        document.getElementById('invoiceNumber').value = '';
        document.getElementById('invoiceAmount').value = '';
        document.getElementById('invoiceDate').value = '';
        document.getElementById('invoiceNote').value = '';
        loadInvoiceProjects(); // 刷新发票项目列表
        showToast('发票已新增', 'success');
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

async function addPaymentRecord() {
    if (!isFinanceRole()) {
        showToast('无权限新增回款', 'error');
        return;
    }
    const projectId = document.getElementById('paymentProjectId')?.value;
    const amount = document.getElementById('paymentAmount')?.value;
    const receivedAt = document.getElementById('paymentDate')?.value;
    const method = document.getElementById('paymentMethod')?.value || 'bank';
    const reference = document.getElementById('paymentReference')?.value || '';
    const invoiceNumber = document.getElementById('paymentInvoiceNumber')?.value || '';
    
    if (!projectId || !amount || !receivedAt) {
        showToast('请选择项目、填写金额和回款日期', 'error');
        return;
    }
    const payload = {
        amount: parseFloat(amount),
        receivedAt,
        method,
        reference,
        invoiceNumber
    };
    try {
        const res = await apiFetch(`${API_BASE}/finance/payment/${projectId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '新增失败', 'error');
            return;
        }
        showToast('回款已记录', 'success');
        // 清空表单
        document.getElementById('paymentAmount').value = '';
        document.getElementById('paymentReference').value = '';
        document.getElementById('paymentInvoiceNumber').value = '';
        // 重新加载应收与回款列表
        loadReceivables();
        loadPaymentRecords(projectId);
        loadPaymentRecordsProjects(); // 刷新回款记录项目列表
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

async function loadPaymentRecords(projectId) {
    if (!projectId) {
        document.getElementById('paymentRecords').innerHTML = '<div class="card-desc">请在上方选择项目后点击新增或刷新以查看回款记录</div>';
        return;
    }
    try {
        const paymentStatus = document.getElementById('paymentRecordStatus')?.value || '';
        const params = new URLSearchParams();
        if (paymentStatus) params.append('paymentStatus', paymentStatus);
        
        const res = await apiFetch(`${API_BASE}/finance/payment/${projectId}?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
            showAlert('paymentRecords', data.message || '加载失败', 'error');
            return;
        }
        // 获取项目信息以显示回款状态
        const projectRes = await apiFetch(`${API_BASE}/projects/${projectId}`);
        const projectData = await projectRes.json();
        const project = projectData.success ? projectData.data : null;
        
        const paymentStatusText = {
            'unpaid': '未支付',
            'partially_paid': '部分支付',
            'paid': '已支付'
        };
        
        // 如果没有数据，显示提示信息
        if (!data.data || data.data.length === 0) {
            const filterStatus = document.getElementById('paymentRecordStatus')?.value || '';
            const statusText = filterStatus === 'unpaid' ? '未支付' : 
                              filterStatus === 'partially_paid' ? '部分支付' : 
                              filterStatus === 'paid' ? '已支付' : '';
            const totalReceived = 0;
            const projectAmount = project?.projectAmount || 0;
            const remainingAmount = Math.max(0, projectAmount - totalReceived);
            const projectPaymentStatus = project?.payment?.paymentStatus || 'unpaid';
            
            document.getElementById('paymentRecords').innerHTML = `
                ${project ? `
                <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
                    <div>
                        <div style="font-size: 12px; color: #666;">项目金额</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #666;">已回款</div>
                        <div style="font-size: 16px; font-weight: bold; color: #10b981;">¥${totalReceived.toLocaleString()}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #666;">剩余应收</div>
                        <div style="font-size: 16px; font-weight: bold; color: ${remainingAmount > 0 ? '#f59e0b' : '#10b981'};">¥${remainingAmount.toLocaleString()}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #666;">回款状态</div>
                        <div>
                            <span class="badge ${projectPaymentStatus === 'paid' ? 'badge-success' : projectPaymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">
                                ${paymentStatusText[projectPaymentStatus] || projectPaymentStatus}
                            </span>
                        </div>
                    </div>
                </div>
                ` : ''}
                <div class="card-desc">${filterStatus ? `没有${statusText}状态的回款记录` : '暂无回款记录'}</div>
            `;
            return;
        }
        
        const canManageFinance = isFinanceRole();
        const rows = data.data.map(r => `
            <tr>
                <td>${new Date(r.receivedAt).toLocaleDateString()}</td>
                <td>¥${(r.amount || 0).toLocaleString()}</td>
                <td>${r.method === 'bank' ? '银行转账' : r.method === 'cash' ? '现金' : r.method === 'alipay' ? '支付宝' : r.method === 'wechat' ? '微信' : r.method || '-'}</td>
                <td>${r.reference || '-'}</td>
                <td>${r.invoiceNumber || '-'}</td>
                <td>${r.recordedBy?.name || '-'}</td>
                ${canManageFinance ? `<td><button class="btn-small btn-danger" onclick="removePaymentRecord('${r._id}', '${projectId}')">删除</button></td>` : ''}
            </tr>
        `).join('');
        
        const totalReceived = data.data.reduce((sum, r) => sum + (r.amount || 0), 0);
        const projectAmount = project?.projectAmount || 0;
        const remainingAmount = Math.max(0, projectAmount - totalReceived);
        const projectPaymentStatus = project?.payment?.paymentStatus || 'unpaid';
        
        // 获取当前筛选条件
        const currentFilterStatus = document.getElementById('paymentRecordStatus')?.value || '';
        const filterStatusText = currentFilterStatus === 'unpaid' ? '未支付' : 
                                currentFilterStatus === 'partially_paid' ? '部分支付' : 
                                currentFilterStatus === 'paid' ? '已支付' : '全部';
        
        document.getElementById('paymentRecords').innerHTML = `
            ${project ? `
            <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px;">
                <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 8px;">
                    <div>
                        <div style="font-size: 12px; color: #666;">项目金额</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #666;">已回款</div>
                        <div style="font-size: 16px; font-weight: bold; color: #10b981;">¥${totalReceived.toLocaleString()}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #666;">剩余应收</div>
                        <div style="font-size: 16px; font-weight: bold; color: ${remainingAmount > 0 ? '#f59e0b' : '#10b981'};">¥${remainingAmount.toLocaleString()}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #666;">回款状态</div>
                        <div>
                            <span class="badge ${projectPaymentStatus === 'paid' ? 'badge-success' : projectPaymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">
                                ${paymentStatusText[projectPaymentStatus] || projectPaymentStatus}
                            </span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid #e0e7ff;">
                    <div style="font-size: 12px; color: #666;">
                        筛选条件: <span style="color: #333; font-weight: 500;">${filterStatusText}</span>
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        显示结果: <span style="color: #333; font-weight: 500;">共 ${data.data.length} 条回款记录</span>
                    </div>
                    ${currentFilterStatus ? `
                    <button class="btn-small" onclick="document.getElementById('paymentRecordStatus').value=''; loadPaymentRecords('${projectId}');" style="padding: 4px 8px; font-size: 12px;">
                        清除筛选
                    </button>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            <table class="table-sticky">
                <thead>
                    <tr>
                        <th>回款日期</th>
                        <th>金额</th>
                        <th>支付方式</th>
                        <th>凭证号</th>
                        <th>关联发票号</th>
                        <th>记录人</th>
                        ${canManageFinance ? '<th>操作</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${rows || `<tr><td colspan="${canManageFinance ? 7 : 6}" style="text-align:center;">暂无回款记录</td></tr>`}
                </tbody>
            </table>
        `;
    } catch (error) {
        showAlert('paymentRecords', '加载失败: ' + error.message, 'error');
    }
}

async function removePaymentRecord(recordId, projectId) {
    if (!isFinanceRole()) {
        showToast('无权限删除回款记录', 'error');
        return;
    }
    if (!confirm('确定删除该回款记录？（不会自动回滚项目回款总额）')) return;
    try {
        const res = await apiFetch(`${API_BASE}/finance/payment/${recordId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.message || '删除失败');
            return;
        }
        showToast('已删除回款记录', 'success');
        loadPaymentRecords(projectId);
        loadReceivables();
        loadPaymentRecordsProjects(); // 刷新项目列表
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// 加载回款记录项目列表（类似应收对账）
async function loadPaymentRecordsProjects() {
    const month = document.getElementById('paymentMonth')?.value || '';
    const startDate = document.getElementById('paymentStartDate')?.value || '';
    const endDate = document.getElementById('paymentEndDate')?.value || '';
    const status = document.getElementById('paymentStatusFilter')?.value || '';
    const paymentStatus = document.getElementById('paymentProjectPaymentStatus')?.value || '';
    const customerId = document.getElementById('paymentCustomer')?.value || '';
    const salesId = isFinanceRole() ? (document.getElementById('paymentSales')?.value || '') : currentUser?._id || '';
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (paymentStatus) params.append('paymentStatus', paymentStatus);
    // 日期范围筛选（优先使用起止日期，如果没有则使用月份）
    if (startDate) params.append('paymentStartDate', startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.append('paymentEndDate', end.toISOString());
    } else if (month) {
        const [y, m] = month.split('-');
        const end = new Date(y, m, 0);
        end.setHours(23, 59, 59, 999);
        params.append('dueBefore', end.toISOString());
    }
    if (customerId) params.append('customerId', customerId);
    if (salesId) params.append('salesId', salesId);
    const res = await apiFetch(`${API_BASE}/finance/receivables?${params.toString()}`);
    const data = await res.json();
    if (!data.success) {
        showAlert('paymentProjectsList', data.message || '加载失败', 'error');
        return;
    }
    paymentRecordsProjectsCache = data.data || [];
    paymentRecordsProjectsPage = 1;
    renderPaymentRecordsProjects();
}

// 渲染回款记录项目列表
function renderPaymentRecordsProjects() {
    const pageSizeSel = document.getElementById('paymentPageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value || '10', 10) : 10;
    const totalPages = Math.max(1, Math.ceil(paymentRecordsProjectsCache.length / pageSize));
    if (paymentRecordsProjectsPage > totalPages) paymentRecordsProjectsPage = totalPages;
    const start = (paymentRecordsProjectsPage - 1) * pageSize;
    const pageData = paymentRecordsProjectsCache.slice(start, start + pageSize);
    const paymentStatusText = {
        'unpaid': '未支付',
        'partially_paid': '部分支付',
        'paid': '已支付'
    };
    
    const rows = pageData.map(r => {
        const paymentStatus = r.paymentStatus || 'unpaid';
        const paymentStatusBadge = paymentStatus === 'paid' ? 'badge-success' : 
                                   paymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger';
        const projectId = r.id || r.projectId; // 后端返回的是 id
        const isExpanded = expandedPaymentProjectId === projectId;
        return `
        <tr class="${r.overdue ? 'row-overdue' : ''}">
            <td>${r.projectNumber || '-'}</td>
            <td>${r.projectName}</td>
            <td>${r.customerName || ''}</td>
            <td>${r.salesName || ''}</td>
            <td>¥${(r.projectAmount || 0).toLocaleString()}</td>
            <td>¥${(r.receivedAmount || 0).toLocaleString()}</td>
            <td>¥${(r.outstanding || 0).toLocaleString()}</td>
            <td>${r.expectedAt ? new Date(r.expectedAt).toLocaleDateString() : '-'}</td>
            <td>
                <span class="badge ${paymentStatusBadge}">
                    ${paymentStatusText[paymentStatus] || paymentStatus}
                </span>
            </td>
            <td>
                <button class="btn-small" onclick="togglePaymentRecords('${projectId}')" style="padding: 4px 8px;">
                    ${isExpanded ? '收起' : '查看回款记录'}
                </button>
            </td>
        </tr>
        ${isExpanded ? `
        <tr id="payment-records-${projectId}">
            <td colspan="10" style="padding: 0;">
                <div id="payment-records-detail-${projectId}" style="padding: 16px; background: #f9fafb;">
                    <div style="text-align: center; color: #666;">加载中...</div>
                </div>
            </td>
        </tr>
        ` : ''}
    `;
    }).join('');
    
    // 获取当前筛选条件
    const month = document.getElementById('paymentMonth')?.value || '';
    const status = document.getElementById('paymentStatusFilter')?.value || '';
    const paymentStatus = document.getElementById('paymentProjectPaymentStatus')?.value || '';
    const customerId = document.getElementById('paymentCustomer')?.value || '';
    const salesId = document.getElementById('paymentSales')?.value || '';
    
    let filterText = [];
    if (month) filterText.push(`月份: ${month}`);
    if (status) {
        const statusText = { 'pending': '待开始', 'in_progress': '进行中', 'completed': '已完成', 'cancelled': '已取消' };
        filterText.push(`状态: ${statusText[status] || status}`);
    }
    if (paymentStatus) filterText.push(`回款状态: ${paymentStatusText[paymentStatus] || paymentStatus}`);
    if (customerId) {
        const customer = allCustomers.find(c => c._id === customerId);
        if (customer) filterText.push(`客户: ${customer.name}`);
    }
    if (salesId) {
        const sales = allUsers.find(u => u._id === salesId);
        if (sales) filterText.push(`销售: ${sales.name}`);
    }
    
    document.getElementById('paymentProjectsList').innerHTML = `
        ${filterText.length > 0 ? `
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px; background: #f0f9ff; border-radius: 4px; margin-bottom: 12px;">
            <div style="font-size: 12px; color: #666;">
                筛选条件: <span style="color: #333; font-weight: 500;">${filterText.join(' | ')}</span>
            </div>
            <div style="font-size: 12px; color: #666;">
                显示结果: <span style="color: #333; font-weight: 500;">共 ${paymentRecordsProjectsCache.length} 个项目</span>
            </div>
            <button class="btn-small" onclick="clearPaymentRecordsFilters()" style="padding: 4px 8px; font-size: 12px;">
                清除筛选
            </button>
        </div>
        ` : ''}
        <table class="table-sticky">
            <thead>
                <tr>
                    <th>项目编号</th>
                    <th>项目名称</th>
                    <th>客户</th>
                    <th>销售</th>
                    <th>项目金额</th>
                    <th>已回款</th>
                    <th>未回款</th>
                    <th>约定回款日</th>
                    <th>回款状态</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="10" style="text-align:center;">暂无数据</td></tr>'}
            </tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${paymentRecordsProjectsPage<=1?'disabled':''} onclick="paymentRecordsProjectsPage=Math.max(1, paymentRecordsProjectsPage-1);renderPaymentRecordsProjects();">上一页</button>
            <span style="align-self:center;">${paymentRecordsProjectsPage} / ${totalPages}</span>
            <button class="btn-small" ${paymentRecordsProjectsPage>=totalPages?'disabled':''} onclick="paymentRecordsProjectsPage=Math.min(${totalPages}, paymentRecordsProjectsPage+1);renderPaymentRecordsProjects();">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${paymentRecordsProjectsPage}" style="width:70px;padding:6px;" onchange="jumpPaymentRecordsProjectsPage(this.value, ${totalPages})">
        </div>
    `;
    
    // 如果当前有展开的项目，加载其回款记录
    if (expandedPaymentProjectId) {
        // 使用 setTimeout 确保 DOM 已经渲染完成
        setTimeout(() => {
            loadPaymentRecordsForProject(expandedPaymentProjectId);
        }, 100);
    }
}

// 切换项目回款记录的展开/收起
function togglePaymentRecords(projectId) {
    console.log('togglePaymentRecords called with projectId:', projectId, 'current expanded:', expandedPaymentProjectId);
    // 确保 projectId 是字符串类型进行比较
    const projectIdStr = String(projectId);
    if (expandedPaymentProjectId === projectIdStr) {
        expandedPaymentProjectId = null;
    } else {
        expandedPaymentProjectId = projectIdStr;
    }
    renderPaymentRecordsProjects();
}

// 为项目列表中的项目加载回款记录
async function loadPaymentRecordsForProject(projectId) {
    const containerId = `payment-records-detail-${projectId}`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    try {
        const startDate = document.getElementById('paymentStartDate')?.value || '';
        const endDate = document.getElementById('paymentEndDate')?.value || '';
        const filterStatus = document.getElementById('paymentRecordStatus')?.value || '';
        const params = new URLSearchParams();
        if (filterStatus) params.append('paymentStatus', filterStatus);
        if (startDate) params.append('startDate', startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            params.append('endDate', end.toISOString());
        }
        
        const res = await apiFetch(`${API_BASE}/finance/payment/${projectId}?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div style="text-align: center; color: #ef4444;">加载失败: ${data.message || '未知错误'}</div>`;
            return;
        }
        
        // 获取项目信息
        const projectRes = await apiFetch(`${API_BASE}/projects/${projectId}`);
        const projectData = await projectRes.json();
        const project = projectData.success ? projectData.data : null;
        
        const paymentStatusText = {
            'unpaid': '未支付',
            'partially_paid': '部分支付',
            'paid': '已支付'
        };
        
        if (!data.data || data.data.length === 0) {
            const projectAmount = project?.projectAmount || 0;
            const projectPaymentStatus = project?.payment?.paymentStatus || 'unpaid';
            container.innerHTML = `
                <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
                    <div>
                        <div style="font-size: 12px; color: #666;">项目金额</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #666;">已回款</div>
                        <div style="font-size: 16px; font-weight: bold; color: #10b981;">¥0</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #666;">剩余应收</div>
                        <div style="font-size: 16px; font-weight: bold; color: #f59e0b;">¥${projectAmount.toLocaleString()}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #666;">回款状态</div>
                        <div>
                            <span class="badge ${projectPaymentStatus === 'paid' ? 'badge-success' : projectPaymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">
                                ${paymentStatusText[projectPaymentStatus] || projectPaymentStatus}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="card-desc">暂无回款记录</div>
            `;
            return;
        }
        
        const rows = data.data.map(r => `
            <tr>
                <td>${new Date(r.receivedAt).toLocaleDateString()}</td>
                <td>¥${(r.amount || 0).toLocaleString()}</td>
                <td>${r.method === 'bank' ? '银行转账' : r.method === 'cash' ? '现金' : r.method === 'alipay' ? '支付宝' : r.method === 'wechat' ? '微信' : r.method || '-'}</td>
                <td>${r.reference || '-'}</td>
                <td>${r.invoiceNumber || '-'}</td>
                <td>${r.recordedBy?.name || '-'}</td>
                <td><button class="btn-small btn-danger" onclick="removePaymentRecord('${r._id}', '${projectId}')">删除</button></td>
            </tr>
        `).join('');
        
        const totalReceived = data.data.reduce((sum, r) => sum + (r.amount || 0), 0);
        const projectAmount = project?.projectAmount || 0;
        const remainingAmount = Math.max(0, projectAmount - totalReceived);
        const projectPaymentStatus = project?.payment?.paymentStatus || 'unpaid';
        
        container.innerHTML = `
            <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
                <div>
                    <div style="font-size: 12px; color: #666;">项目金额</div>
                    <div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div>
                </div>
                <div>
                    <div style="font-size: 12px; color: #666;">已回款</div>
                    <div style="font-size: 16px; font-weight: bold; color: #10b981;">¥${totalReceived.toLocaleString()}</div>
                </div>
                <div>
                    <div style="font-size: 12px; color: #666;">剩余应收</div>
                    <div style="font-size: 16px; font-weight: bold; color: ${remainingAmount > 0 ? '#f59e0b' : '#10b981'};">¥${remainingAmount.toLocaleString()}</div>
                </div>
                <div>
                    <div style="font-size: 12px; color: #666;">回款状态</div>
                    <div>
                        <span class="badge ${projectPaymentStatus === 'paid' ? 'badge-success' : projectPaymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">
                            ${paymentStatusText[projectPaymentStatus] || projectPaymentStatus}
                        </span>
                    </div>
                </div>
            </div>
            <table class="table-sticky">
                <thead>
                    <tr>
                        <th>回款日期</th>
                        <th>金额</th>
                        <th>支付方式</th>
                        <th>凭证号</th>
                        <th>关联发票号</th>
                        <th>记录人</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div style="text-align: center; color: #ef4444;">加载失败: ${error.message}</div>`;
    }
}

// 清除回款记录筛选条件
function clearPaymentRecordsFilters() {
    document.getElementById('paymentMonth').value = '';
    document.getElementById('paymentStartDate').value = '';
    document.getElementById('paymentEndDate').value = '';
    document.getElementById('paymentStatusFilter').value = '';
    document.getElementById('paymentProjectPaymentStatus').value = '';
    document.getElementById('paymentCustomer').value = '';
    document.getElementById('paymentSales').value = '';
    loadPaymentRecordsProjects();
}

// 跳转到指定页面
function jumpPaymentRecordsProjectsPage(page, maxPage) {
    const p = Math.max(1, Math.min(maxPage, parseInt(page) || 1));
    paymentRecordsProjectsPage = p;
    renderPaymentRecordsProjects();
}

// ==================== 发票管理项目列表 ====================
// 加载发票项目列表（类似应收对账）
async function loadInvoiceProjects() {
    const month = document.getElementById('invoiceMonth')?.value || '';
    const status = document.getElementById('invoiceStatusFilter')?.value || '';
    const type = document.getElementById('invoiceTypeFilter')?.value || '';
    const customerId = document.getElementById('invoiceCustomer')?.value || '';
    const salesId = document.getElementById('invoiceSales')?.value || '';
    const params = new URLSearchParams();
    // month 可用于到期过滤
    if (month) {
        const [y, m] = month.split('-');
        const end = new Date(y, m, 0).toISOString();
        params.append('dueBefore', end);
    }
    if (customerId) params.append('customerId', customerId);
    if (salesId) params.append('salesId', salesId);
    
    // 先获取项目列表
    const res = await apiFetch(`${API_BASE}/finance/receivables?${params.toString()}`);
    const data = await res.json();
    if (!data.success) {
        showAlert('invoiceProjectsList', data.message || '加载失败', 'error');
        return;
    }
    
    let projects = data.data || [];
    
    // 如果有发票状态或类型筛选，需要进一步过滤
    if (status || type) {
        // 获取所有匹配的发票
        const invoiceParams = new URLSearchParams();
        if (status) invoiceParams.append('status', status);
        if (type) invoiceParams.append('type', type);
        
        const invoiceRes = await apiFetch(`${API_BASE}/finance/invoice?${invoiceParams.toString()}`);
        const invoiceData = await invoiceRes.json();
        
        if (invoiceData.success && invoiceData.data) {
            // 获取有匹配发票的项目ID集合
            const projectIdsWithMatchingInvoices = new Set(
                invoiceData.data.map(inv => {
                    const pid = inv.projectId;
                    return String(pid?._id || pid || '');
                })
            );
            
            // 如果筛选状态是"待开"，显示没有发票的项目
            if (status === 'pending') {
                projects = projects.filter(p => {
                    const pid = String(p.id || p.projectId);
                    return !projectIdsWithMatchingInvoices.has(pid);
                });
            } else {
                // 其他状态，只显示有匹配发票的项目
                projects = projects.filter(p => {
                    const pid = String(p.id || p.projectId);
                    return projectIdsWithMatchingInvoices.has(pid);
                });
            }
        } else if (status === 'pending') {
            // 如果筛选"待开"但没有发票数据，保留所有项目
            // 项目列表保持不变
        } else {
            // 其他状态但没有匹配的发票，返回空列表
            projects = [];
        }
    }
    
    invoiceProjectsCache = projects;
    invoiceProjectsPage = 1;
    renderInvoiceProjects();
}

// 渲染发票项目列表
function renderInvoiceProjects() {
    const pageSizeSel = document.getElementById('invoicePageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value || '10', 10) : 10;
    const totalPages = Math.max(1, Math.ceil(invoiceProjectsCache.length / pageSize));
    if (invoiceProjectsPage > totalPages) invoiceProjectsPage = totalPages;
    const start = (invoiceProjectsPage - 1) * pageSize;
    const pageData = invoiceProjectsCache.slice(start, start + pageSize);
    
    const rows = pageData.map(r => {
        const projectId = r.id || r.projectId; // 后端返回的是 id
        const isExpanded = expandedInvoiceProjectId === projectId;
        return `
        <tr class="${r.overdue ? 'row-overdue' : ''}">
            <td>${r.projectNumber || '-'}</td>
            <td>${r.projectName}</td>
            <td>${r.customerName || ''}</td>
            <td>${r.salesName || ''}</td>
            <td>¥${(r.projectAmount || 0).toLocaleString()}</td>
            <td>${r.hasInvoice ? `<span class="badge badge-info">已开票${r.invoiceCount > 0 ? `(${r.invoiceCount})` : ''}</span>` : '<span class="badge badge-secondary">未开票</span>'}</td>
            <td>
                <button class="btn-small" onclick="toggleInvoiceRecords('${projectId}')" style="padding: 4px 8px;">
                    ${isExpanded ? '收起' : '查看发票'}
                </button>
            </td>
        </tr>
        ${isExpanded ? `
        <tr id="invoice-records-${projectId}">
            <td colspan="7" style="padding: 0;">
                <div id="invoice-records-detail-${projectId}" style="padding: 16px; background: #f9fafb;">
                    <div style="text-align: center; color: #666;">加载中...</div>
                </div>
            </td>
        </tr>
        ` : ''}
    `;
    }).join('');
    
    // 获取当前筛选条件
    const month = document.getElementById('invoiceMonth')?.value || '';
    const status = document.getElementById('invoiceStatusFilter')?.value || '';
    const type = document.getElementById('invoiceTypeFilter')?.value || '';
    const customerId = document.getElementById('invoiceCustomer')?.value || '';
    const salesId = document.getElementById('invoiceSales')?.value || '';
    
    let filterText = [];
    if (month) filterText.push(`月份: ${month}`);
    if (status) {
        const statusText = { 'pending': '待开', 'issued': '已开', 'paid': '已支付', 'void': '作废' };
        filterText.push(`状态: ${statusText[status] || status}`);
    }
    if (type) {
        const typeText = { 'vat': '增值税发票', 'normal': '普通发票', 'other': '其他' };
        filterText.push(`类型: ${typeText[type] || type}`);
    }
    if (customerId) {
        const customer = allCustomers.find(c => c._id === customerId);
        if (customer) filterText.push(`客户: ${customer.name}`);
    }
    if (salesId) {
        const sales = allUsers.find(u => u._id === salesId);
        if (sales) filterText.push(`销售: ${sales.name}`);
    }
    
    document.getElementById('invoiceProjectsList').innerHTML = `
        ${filterText.length > 0 ? `
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px; background: #f0f9ff; border-radius: 4px; margin-bottom: 12px;">
            <div style="font-size: 12px; color: #666;">
                筛选条件: <span style="color: #333; font-weight: 500;">${filterText.join(' | ')}</span>
            </div>
            <div style="font-size: 12px; color: #666;">
                显示结果: <span style="color: #333; font-weight: 500;">共 ${invoiceProjectsCache.length} 个项目</span>
            </div>
            <button class="btn-small" onclick="clearInvoiceFilters()" style="padding: 4px 8px; font-size: 12px;">
                清除筛选
            </button>
        </div>
        ` : ''}
        <table class="table-sticky">
            <thead>
                <tr>
                    <th>项目编号</th>
                    <th>项目名称</th>
                    <th>客户</th>
                    <th>销售</th>
                    <th>项目金额</th>
                    <th>发票状态</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="7" style="text-align:center;">暂无数据</td></tr>'}
            </tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${invoiceProjectsPage<=1?'disabled':''} onclick="invoiceProjectsPage=Math.max(1, invoiceProjectsPage-1);renderInvoiceProjects();">上一页</button>
            <span style="align-self:center;">${invoiceProjectsPage} / ${totalPages}</span>
            <button class="btn-small" ${invoiceProjectsPage>=totalPages?'disabled':''} onclick="invoiceProjectsPage=Math.min(${totalPages}, invoiceProjectsPage+1);renderInvoiceProjects();">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${invoiceProjectsPage}" style="width:70px;padding:6px;" onchange="jumpInvoiceProjectsPage(this.value, ${totalPages})">
        </div>
    `;
    
    // 如果当前有展开的项目，加载其发票
    if (expandedInvoiceProjectId) {
        // 使用 setTimeout 确保 DOM 已经渲染完成
        setTimeout(() => {
            loadInvoicesForProject(expandedInvoiceProjectId);
        }, 100);
    }
}

// 切换项目发票的展开/收起
function toggleInvoiceRecords(projectId) {
    console.log('toggleInvoiceRecords called with projectId:', projectId, 'current expanded:', expandedInvoiceProjectId);
    // 确保 projectId 是字符串类型进行比较
    const projectIdStr = String(projectId);
    if (expandedInvoiceProjectId === projectIdStr) {
        expandedInvoiceProjectId = null;
    } else {
        expandedInvoiceProjectId = projectIdStr;
    }
    renderInvoiceProjects();
}

// 为项目列表中的项目加载发票
async function loadInvoicesForProject(projectId) {
    const containerId = `invoice-records-detail-${projectId}`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    try {
        const status = document.getElementById('invoiceStatusFilter')?.value || '';
        const type = document.getElementById('invoiceTypeFilter')?.value || '';
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (type) params.append('type', type);
        params.append('projectId', projectId);
        
        const res = await apiFetch(`${API_BASE}/finance/invoice?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div style="text-align: center; color: #ef4444;">加载失败: ${data.message || '未知错误'}</div>`;
            return;
        }
        
        if (!data.data || data.data.length === 0) {
            container.innerHTML = `<div class="card-desc">暂无发票</div>`;
            return;
        }
        
        const rows = data.data.map(i => {
            const statusBadge = i.status === 'paid' ? 'badge-success' : 
                               i.status === 'issued' ? 'badge-info' : 
                               i.status === 'void' ? 'badge-danger' : 'badge-warning';
            const statusText = i.status === 'paid' ? '已支付' : 
                              i.status === 'issued' ? '已开' : 
                              i.status === 'void' ? '作废' : '待开';
            const typeText = i.type === 'vat' ? '增值税' : 
                            i.type === 'normal' ? '普通' : 
                            i.type === 'other' ? '其他' : i.type || '-';
            
            return `
            <tr>
                <td>${i.invoiceNumber || '-'}</td>
                <td>¥${(i.amount || 0).toLocaleString()}</td>
                <td>${i.issueDate ? new Date(i.issueDate).toLocaleDateString() : '-'}</td>
                <td><span class="badge ${statusBadge}">${statusText}</span></td>
                <td>${typeText}</td>
                <td>${i.note || '-'}</td>
            </tr>
        `;
        }).join('');
        
        container.innerHTML = `
            <table class="table-sticky">
                <thead>
                    <tr>
                        <th>发票号</th>
                        <th>金额</th>
                        <th>开票日期</th>
                        <th>状态</th>
                        <th>类型</th>
                        <th>备注</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div style="text-align: center; color: #ef4444;">加载失败: ${error.message}</div>`;
    }
}

// 清除发票筛选条件
function clearInvoiceFilters() {
    document.getElementById('invoiceMonth').value = '';
    document.getElementById('invoiceStatusFilter').value = '';
    document.getElementById('invoiceTypeFilter').value = '';
    document.getElementById('invoiceCustomer').value = '';
    document.getElementById('invoiceSales').value = '';
    loadInvoiceProjects();
}

// 跳转到指定页面
function jumpInvoiceProjectsPage(page, maxPage) {
    const p = Math.max(1, Math.min(maxPage, parseInt(page) || 1));
    invoiceProjectsPage = p;
    renderInvoiceProjects();
}

// 项目内回款
async function loadProjectPayments(projectId) {
    const container = document.getElementById('projectPaymentList');
    if (!container) return;
    try {
        const res = await apiFetch(`${API_BASE}/finance/payment/${projectId}`);
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div class="alert alert-error">${data.message || '加载失败'}</div>`;
            return;
        }
        const rows = data.data.map(r => `
            <tr>
                <td>${new Date(r.receivedAt).toLocaleDateString()}</td>
                <td>¥${(r.amount || 0).toLocaleString()}</td>
                <td>${r.method || '-'}</td>
                <td>${r.reference || ''}</td>
                <td>${r.note || ''}</td>
            </tr>
        `).join('');
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>回款日期</th>
                        <th>金额</th>
                        <th>方式</th>
                        <th>凭证</th>
                        <th>备注</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="5" style="text-align:center;">暂无回款</td></tr>'}
                </tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">加载失败: ${error.message}</div>`;
    }
}

async function addProjectPayment(projectId) {
    const amount = document.getElementById('projectPaymentAmount')?.value;
    const receivedAt = document.getElementById('projectPaymentDate')?.value;
    const reference = document.getElementById('projectPaymentRef')?.value;
    if (!amount || !receivedAt) {
        alert('请填写金额和回款日期');
        return;
    }
    const payload = {
        amount: parseFloat(amount),
        receivedAt,
        reference
    };
    try {
        const res = await apiFetch(`${API_BASE}/finance/payment/${projectId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.message || '新增失败');
            return;
        }
        loadProjectPayments(projectId);
        loadReceivables();
        showAlert('projectPaymentList', '回款已记录', 'success');
    } catch (error) {
        alert('新增失败: ' + error.message);
    }
}

// 项目内发票
async function loadProjectInvoices(projectId) {
    const container = document.getElementById('projectInvoiceList');
    if (!container) return;
    try {
        const res = await apiFetch(`${API_BASE}/finance/invoice?projectId=${projectId}`);
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div class="alert alert-error">${data.message || '加载失败'}</div>`;
            return;
        }
        const rows = data.data.map(i => `
            <tr>
                <td>${i.invoiceNumber}</td>
                <td>¥${(i.amount || 0).toLocaleString()}</td>
                <td>${i.issueDate ? new Date(i.issueDate).toLocaleDateString() : '-'}</td>
                <td>${i.status}</td>
                <td>${i.type || '-'}</td>
                <td>${i.note || ''}</td>
            </tr>
        `).join('');
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>发票号</th>
                        <th>金额</th>
                        <th>开票日期</th>
                        <th>状态</th>
                        <th>类型</th>
                        <th>备注</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="6" style="text-align:center;">暂无发票</td></tr>'}
                </tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">加载失败: ${error.message}</div>`;
    }
}

async function addProjectInvoice(projectId) {
    const invoiceNumber = document.getElementById('projectInvoiceNumber')?.value;
    const amount = document.getElementById('projectInvoiceAmount')?.value;
    const issueDate = document.getElementById('projectInvoiceDate')?.value;
    const type = document.getElementById('projectInvoiceType')?.value || 'vat';
    if (!invoiceNumber || !amount || !issueDate) {
        alert('请填写发票号、金额、日期');
        return;
    }
    const payload = {
        invoiceNumber,
        amount: parseFloat(amount),
        issueDate,
        type
    };
    try {
        const res = await apiFetch(`${API_BASE}/finance/invoice/${projectId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '新增失败', 'error');
            return;
        }
        loadProjectInvoices(projectId);
        showToast('发票已新增', 'success');
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

async function loadPendingKpi() {
    const month = document.getElementById('kpiPendingMonth')?.value || '';
    const params = new URLSearchParams();
    if (month) params.append('month', month);
    const res = await apiFetch(`${API_BASE}/finance/kpi/pending?${params.toString()}`);
    const data = await res.json();
    if (!data.success) {
        showAlert('pendingKpiList', data.message || '加载失败', 'error');
        return;
    }
    const rows = data.data.map(r => {
        // 兼职销售和兼职排版按金额计算（元），其他角色按分值计算（分）
        const roleStr = String(r.role || '').trim();
        const isPartTimeRole = roleStr === 'part_time_sales' || roleStr === 'layout';
        const unit = isPartTimeRole ? '元' : '分';
        const prefix = isPartTimeRole ? '¥' : '';
        return `
        <tr>
            <td>${r.userId?.name || 'N/A'}</td>
            <td>${r.projectId?.projectName || 'N/A'}</td>
            <td>${r.role}</td>
            <td>${prefix}${(r.kpiValue || 0).toLocaleString()} ${unit}</td>
            <td>${r.month}</td>
        </tr>
    `;
    }).join('');
    document.getElementById('pendingKpiList').innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>用户</th>
                    <th>项目</th>
                    <th>角色</th>
                    <th>KPI</th>
                    <th>月份</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="5" style="text-align:center;">暂无待审核</td></tr>'}
            </tbody>
        </table>
    `;
}

async function loadFinanceSummary() {
    const month = document.getElementById('reportMonth')?.value || '';
    const params = new URLSearchParams();
    if (month) params.append('month', month);
    const res = await apiFetch(`${API_BASE}/finance/reports/summary?${params.toString()}`);
    const data = await res.json();
    if (!data.success) {
        showAlert('financeSummary', data.message || '加载失败', 'error');
        return;
    }
    const custRows = Object.entries(data.data.byCustomer || {}).map(([k, v]) =>
        `<tr><td>${k}</td><td>¥${v.toLocaleString()}</td></tr>`
    ).join('');
    const salesRows = Object.entries(data.data.bySales || {}).map(([k, v]) =>
        `<tr><td>${k}</td><td>¥${v.toLocaleString()}</td></tr>`
    ).join('');
    document.getElementById('financeSummary').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
            <div class="card">
                <div class="card-title">按客户汇总</div>
                <table>
                    <thead><tr><th>客户</th><th>金额</th></tr></thead>
                    <tbody>${custRows || '<tr><td colspan="2" style="text-align:center;">暂无</td></tr>'}</tbody>
                </table>
            </div>
            <div class="card">
                <div class="card-title">按销售汇总</div>
                <table>
                    <thead><tr><th>销售</th><th>金额</th></tr></thead>
                    <tbody>${salesRows || '<tr><td colspan="2" style="text-align:center;">暂无</td></tr>'}</tbody>
                </table>
            </div>
        </div>
    `;
}
// 存储图表实例
let chartInstances = [];

function destroyCharts() {
    chartInstances.forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances = [];
}

function renderDashboardCharts(data) {
    // 销毁之前的图表
    destroyCharts();
    
    // 判断是否是销售或兼职销售
    const isSales = currentUser?.roles?.includes('sales') || currentUser?.roles?.includes('part_time_sales');
    const isAdmin = currentUser?.roles?.includes('admin');
    const isFinance = currentUser?.roles?.includes('finance');
    const showSalesAmount = isSales && !isAdmin && !isFinance;
    
    const charts = [];
    let chartIndex = 0;

    // KPI按角色（销售和兼职销售不显示）
    if (!showSalesAmount) {
    const kpiEntries = Object.entries(data.kpiByRole || {});
        if (kpiEntries.length > 0) {
            const chartId = `kpiRoleChart-${chartIndex++}`;
    charts.push(`
        <div class="card">
                    <div class="card-title" style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">KPI按角色</div>
                    <div class="chart-container">
                        <canvas id="${chartId}"></canvas>
                    </div>
        </div>
    `);
            setTimeout(() => {
                const ctx = document.getElementById(chartId);
                if (ctx) {
                    const chart = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: kpiEntries.map(([k]) => {
                                const roleStr = String(k || '').trim();
                                const isPartTimeRole = roleStr === 'part_time_sales' || roleStr === 'layout';
                                const unit = isPartTimeRole ? '(元)' : '(分)';
                                return getRoleText(k) + unit;
                            }),
                            datasets: [{
                                label: 'KPI值',
                                data: kpiEntries.map(([, v]) => v || 0),
                                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                                borderColor: 'rgba(102, 126, 234, 1)',
                                borderWidth: 1
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        label: (context) => {
                                            const roleStr = String(kpiEntries[context.dataIndex][0] || '').trim();
                                            const isPartTimeRole = roleStr === 'part_time_sales' || roleStr === 'layout';
                                            const prefix = isPartTimeRole ? '¥' : '';
                                            const unit = isPartTimeRole ? ' 元' : ' 分';
                                            return prefix + (context.parsed.y || 0).toLocaleString() + unit;
                                        }
                                    }
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: (value) => {
                                            // 图表中显示数值，单位在tooltip中显示
                                            return value.toLocaleString();
                                        }
                                    }
                                }
                            }
                        }
                    });
                    chartInstances.push(chart);
                }
            }, 100);
        }
    }

    // 项目状态分布 - 饼图
    const statusEntries = Object.entries(data.statusCounts || {});
    if (statusEntries.length > 0) {
        const chartId = `statusChart-${chartIndex++}`;
    charts.push(`
        <div class="card">
                <div class="card-title" style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">项目状态分布</div>
                <div class="chart-container">
                    <canvas id="${chartId}"></canvas>
                </div>
        </div>
    `);
        setTimeout(() => {
            const ctx = document.getElementById(chartId);
            if (ctx) {
                const colors = ['#667eea', '#2ecc71', '#f39c12', '#e74c3c'];
                const chart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: statusEntries.map(([k]) => getStatusText(k)),
                        datasets: [{
                            data: statusEntries.map(([, v]) => v || 0),
                            backgroundColor: colors.slice(0, statusEntries.length),
                            borderWidth: 2,
                            borderColor: '#fff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom'
                            },
                            tooltip: {
                                callbacks: {
                                    label: (context) => {
                                        const label = context.label || '';
                                        const value = context.parsed || 0;
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                        return `${label}: ${value} (${percentage}%)`;
                                    }
                                }
                            }
                        }
                    }
                });
                chartInstances.push(chart);
            }
        }, 100);
    }

    // 业务类型分布 - 柱状图
    const btEntries = Object.entries(data.businessTypeCounts || {});
    if (btEntries.length > 0) {
        const chartId = `businessTypeChart-${chartIndex++}`;
    charts.push(`
        <div class="card">
                <div class="card-title" style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">业务类型分布</div>
                <div class="chart-container">
                    <canvas id="${chartId}"></canvas>
                </div>
        </div>
    `);
        setTimeout(() => {
            const ctx = document.getElementById(chartId);
            if (ctx) {
                const chart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: btEntries.map(([k]) => getBusinessTypeText(k)),
                        datasets: [{
                            label: '项目数量',
                            data: btEntries.map(([, v]) => v || 0),
                            backgroundColor: 'rgba(52, 152, 219, 0.8)',
                            borderColor: 'rgba(52, 152, 219, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    stepSize: 1
                                }
                            }
                        }
                    }
                });
                chartInstances.push(chart);
            }
        }, 100);
    }

    // 回款预警
    charts.push(`
        <div class="card">
            <div class="card-title">回款预警</div>
            ${data.paymentWarnings && data.paymentWarnings.length > 0 ? `
                <ul class="list">
                    ${data.paymentWarnings.map(w => `
                        <li>
                            <div style="font-weight:600;">${w.projectName}</div>
                            <div class="card-desc">应回款：${new Date(w.expectedAt).toLocaleDateString()}，逾期 ${w.daysOverdue} 天，已回款 ¥${(w.receivedAmount||0).toLocaleString()}</div>
                        </li>
                    `).join('')}
                </ul>
            ` : '<div class="card-desc">暂无逾期回款</div>'}
        </div>
    `);

    // 回款即将到期（5天内）
    charts.push(`
        <div class="card" onclick="navigateFromDashboardCard('paymentDueSoon')" style="cursor:pointer;">
            <div class="card-title">回款即将到期（5天内）</div>
            ${data.paymentDueSoon && data.paymentDueSoon.length > 0 ? `
                <ul class="list">
                    ${data.paymentDueSoon.map(w => `
                        <li>
                            <div style="font-weight:600;">${w.projectName}</div>
                            <div class="card-desc">应回款：${new Date(w.expectedAt).toLocaleDateString()}，剩余 ${w.daysLeft} 天，已回款 ¥${(w.receivedAmount||0).toLocaleString()}</div>
                        </li>
                    `).join('')}
                </ul>
            ` : '<div class="card-desc">未来 5 天内暂无到期回款</div>'}
        </div>
    `);

    // 交付逾期预警
    charts.push(`
        <div class="card">
            <div class="card-title">交付逾期</div>
            ${data.deliveryWarnings && data.deliveryWarnings.length > 0 ? `
                <ul class="list">
                    ${data.deliveryWarnings.map(w => `
                        <li>
                            <div style="font-weight:600;">${w.projectName}</div>
                            <div class="card-desc">截止：${new Date(w.deadline).toLocaleDateString()}，逾期 ${w.daysOverdue} 天，状态：${getStatusText(w.status)}</div>
                        </li>
                    `).join('')}
                </ul>
            ` : '<div class="card-desc">暂无逾期项目</div>'}
        </div>
    `);

    // KPI/成交额趋势 - 折线图
    const trend = data.kpiTrend || [];
    const trendTitle = showSalesAmount ? '成交额趋势（近3个月）' : 'KPI趋势（近3个月）';
    if (trend.length > 0) {
        const chartId = `trendChart-${chartIndex++}`;
    charts.push(`
        <div class="card">
                <div class="card-title" style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">${trendTitle}</div>
                <div class="chart-container">
                    <canvas id="${chartId}"></canvas>
                            </div>
        </div>
    `);
        setTimeout(() => {
            const ctx = document.getElementById(chartId);
            if (ctx) {
                const chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: trend.map(t => t.month),
                        datasets: [{
                            label: showSalesAmount ? '成交额' : 'KPI',
                            data: trend.map(t => t.total || 0),
                            borderColor: 'rgba(46, 204, 113, 1)',
                            backgroundColor: 'rgba(46, 204, 113, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 6,
                            pointHoverRadius: 8,
                            pointBackgroundColor: 'rgba(46, 204, 113, 1)',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: (context) => `¥${(context.parsed.y || 0).toLocaleString()}`
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: (value) => '¥' + value.toLocaleString()
                                },
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.05)'
                                }
                            },
                            x: {
                                grid: {
                                    display: false
                                }
                            }
                        }
                    }
                });
                chartInstances.push(chart);
            }
        }, 100);
    }

    const el = document.getElementById('dashboardCharts');
    if (el) {
        el.innerHTML = `<div class="chart-grid">${charts.join('')}</div>`;
        // 确保图表在DOM更新后渲染
        setTimeout(() => {
            chartIndex = 0;
        }, 200);
    }
}

// 实时KPI
async function loadRealtimeKPI(projectId) {
    const container = document.getElementById('realtimeKpiContent');
    if (container) container.innerHTML = '<div class="card-desc">加载中...</div>';
    try {
        const res = await apiFetch(`${API_BASE}/kpi/project/${projectId}/realtime`);
        const data = await res.json();
        if (!data.success) {
            if (container) container.innerHTML = `<div class="alert alert-error">${data.message || '获取失败'}</div>`;
            return;
        }
        const results = data.data.results || [];
        if (results.length === 0) {
            container.innerHTML = '<div class="card-desc">暂无成员或无法计算</div>';
            return;
        }
        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table>
                    <thead>
                        <tr>
                            <th>成员</th>
                            <th>角色</th>
                            <th>金额奖励</th>
                            <th>回款奖励</th>
                            <th>KPI值</th>
                            <th>公式</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map(r => {
                            // 兼职销售和兼职排版按金额计算（元），其他角色按分值计算（分）
                            const roleStr = String(r.role || '').trim();
                            const isPartTimeRole = roleStr === 'part_time_sales' || roleStr === 'layout';
                            const unit = isPartTimeRole ? '元' : '分';
                            const prefix = isPartTimeRole ? '¥' : '';
                            const salesBonusUnit = r.role === 'sales' ? '分' : (r.role === 'part_time_sales' ? '元' : '');
                            const salesCommissionUnit = r.role === 'sales' ? '分' : (r.role === 'part_time_sales' ? '元' : '');
                            return `
                            <tr>
                                <td>${r.userName}</td>
                                <td>${getRoleText(r.role)}</td>
                                <td>${r.details?.salesBonus !== undefined ? (r.role === 'sales' ? '' : '¥') + (r.details.salesBonus || 0).toLocaleString() + (salesBonusUnit ? ' ' + salesBonusUnit : '') : '-'}</td>
                                <td>${r.details?.salesCommission !== undefined ? (r.role === 'sales' ? '' : '¥') + (r.details.salesCommission || 0).toLocaleString() + (salesCommissionUnit ? ' ' + salesCommissionUnit : '') : '-'}</td>
                                <td>${prefix}${(r.kpiValue || 0).toLocaleString()} ${unit}</td>
                                <td style="font-size:12px;">${r.formula || ''}</td>
                            </tr>
                        `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        if (container) container.innerHTML = `<div class="alert alert-error">获取失败: ${error.message}</div>`;
    }
}

async function startProject(projectId) {
    if (!confirm('确定要开始执行此项目吗？开始后项目状态将变为"待安排"，等待项目经理安排人员。')) return;

    try {
        const response = await apiFetch(`${API_BASE}/projects/${projectId}/start`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadProjects();
            showAlert('projectsList', '项目已通知项目经理，等待安排', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('操作失败: ' + error.message);
    }
}

// 显示设置排版费用模态框
async function showSetLayoutCostModal(projectId) {
    const project = currentProjectDetail;
    if (!project) {
        showToast('项目信息未加载', 'error');
        return;
    }
    
    // 获取排版员信息
    let layoutUser = null;
    if (project.partTimeLayout?.layoutAssignedTo) {
        if (typeof project.partTimeLayout.layoutAssignedTo === 'object' && project.partTimeLayout.layoutAssignedTo.name) {
            layoutUser = project.partTimeLayout.layoutAssignedTo;
        } else if (project.members) {
            const layoutMember = project.members.find(m => m.role === 'layout');
            if (layoutMember && layoutMember.userId) {
                layoutUser = layoutMember.userId;
            }
        }
    }
    
    const content = `
        <form id="setLayoutCostForm" onsubmit="setLayoutCost(event, '${projectId}')">
            <div class="form-group">
                <label>排版员</label>
                <input type="text" value="${layoutUser ? layoutUser.name + ' (' + layoutUser.username + ')' : '未指定'}" disabled style="background: #f5f5f5;">
                <small style="color: #666; font-size: 12px;">排版员已在添加成员时指定</small>
            </div>
            <div class="form-group">
                <label>排版费用（元） *</label>
                <input type="number" name="layoutCost" id="setLayoutCostInput" step="0.01" min="0" value="${project.partTimeLayout?.layoutCost || 0}" required onchange="validateSetLayoutCost()" style="width: 100%;">
                <small style="color: #666; font-size: 12px;">排版费用不能超过项目总金额的5%</small>
                <div id="setLayoutCostValidation" style="margin-top: 5px;"></div>
            </div>
            <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px;">
                <label style="font-weight: 600; color: #0369a1;">项目总金额</label>
                <div style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                    ¥${(project.projectAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>
            <div class="action-buttons">
                <button type="submit">保存</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('设置排版费用', content);
    
    // 初始化验证
    setTimeout(() => {
        validateSetLayoutCost();
    }, 100);
}

function validateSetLayoutCost() {
    const layoutCostInput = document.getElementById('setLayoutCostInput');
    const validationDiv = document.getElementById('setLayoutCostValidation');
    const layoutCost = parseFloat(layoutCostInput?.value || 0);
    const project = currentProjectDetail;
    
    if (!layoutCost || layoutCost <= 0) {
        validationDiv.innerHTML = '<span style="color: #dc2626;">请输入排版费用</span>';
        return false;
    }
    
    if (!project || !project.projectAmount) {
        validationDiv.innerHTML = '<span style="color: #dc2626;">无法验证：项目金额未加载</span>';
        return false;
    }
    
    const projectAmount = project.projectAmount;
    const percentage = (layoutCost / projectAmount) * 100;
    
    if (percentage > 5) {
        validationDiv.innerHTML = `<span style="color: #dc2626;">排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%</span>`;
        return false;
    }
    
    validationDiv.innerHTML = `<span style="color: #059669;">费用占比：${percentage.toFixed(2)}%</span>`;
    return true;
}

async function setLayoutCost(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const layoutCost = parseFloat(formData.get('layoutCost') || 0);
    
    if (!layoutCost || layoutCost <= 0) {
        showToast('请输入排版费用', 'error');
        return;
    }
    
    if (!validateSetLayoutCost()) {
        return;
    }
    
    try {
        // 更新项目的兼职排版信息
        const response = await apiFetch(`${API_BASE}/projects/${projectId}`, {
            method: 'PUT',
            body: JSON.stringify({
                partTimeLayout: {
                    isPartTime: true,
                    layoutCost: layoutCost,
                    layoutAssignedTo: currentProjectDetail.partTimeLayout?.layoutAssignedTo || 
                                    (currentProjectDetail.members?.find(m => m.role === 'layout')?.userId?._id)
                }
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            // 重新加载项目详情
            await viewProject(projectId);
            showToast('排版费用设置成功', 'success');
        } else {
            showToast(result.message || '设置失败', 'error');
        }
    } catch (error) {
        showToast('设置失败: ' + error.message, 'error');
    }
}

// 加载回款与发票对账
async function loadReconciliation() {
    const startDate = document.getElementById('reconciliationStartDate')?.value || '';
    const endDate = document.getElementById('reconciliationEndDate')?.value || '';
    
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    try {
        const res = await apiFetch(`${API_BASE}/finance/reconciliation?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
            showAlert('reconciliationList', data.message || '加载失败', 'error');
            return;
        }
        
        const reconciliationData = data.data || [];
        const summary = data.summary || {};
        
        if (reconciliationData.length === 0) {
            document.getElementById('reconciliationList').innerHTML = '<div class="card-desc">暂无对账数据</div>';
            return;
        }
        
        const rows = reconciliationData.map(item => {
            const paymentStatusText = {
                'unpaid': '未支付',
                'partially_paid': '部分支付',
                'paid': '已支付'
            };
            
            const paymentRows = item.payments.map(p => `
                <tr>
                    <td>${new Date(p.receivedAt).toLocaleDateString()}</td>
                    <td>¥${(p.amount || 0).toLocaleString()}</td>
                    <td>${p.method === 'bank' ? '银行' : p.method === 'cash' ? '现金' : p.method === 'alipay' ? '支付宝' : p.method === 'wechat' ? '微信' : p.method || '-'}</td>
                    <td>${p.reference || '-'}</td>
                    <td>${p.invoiceNumber || '-'}</td>
                </tr>
            `).join('');
            
            const invoiceRows = item.invoices.map(i => `
                <tr>
                    <td>${i.invoiceNumber || '-'}</td>
                    <td>¥${(i.amount || 0).toLocaleString()}</td>
                    <td>${new Date(i.issueDate).toLocaleDateString()}</td>
                    <td><span class="badge ${i.status === 'paid' ? 'badge-success' : i.status === 'issued' ? 'badge-info' : i.status === 'void' ? 'badge-danger' : 'badge-warning'}">
                        ${i.status === 'paid' ? '已支付' : i.status === 'issued' ? '已开' : i.status === 'void' ? '作废' : '待开'}
                    </span></td>
                    <td>${i.type === 'vat' ? '增值税' : i.type === 'normal' ? '普通' : i.type || '-'}</td>
                </tr>
            `).join('');
            
            return `
                <div class="card" style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #ddd;">
                        <div>
                            <div style="font-weight: bold; font-size: 16px;">${item.projectNumber || '-'} - ${item.projectName}</div>
                            <div style="font-size: 12px; color: #666; margin-top: 4px;">客户：${item.customerName} | 销售：${item.salesName}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 12px; color: #666;">项目金额</div>
                            <div style="font-size: 18px; font-weight: bold;">¥${(item.projectAmount || 0).toLocaleString()}</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px;">
                        <div style="background: #f0f9ff; padding: 10px; border-radius: 4px;">
                            <div style="font-size: 12px; color: #666;">已回款</div>
                            <div style="font-size: 16px; font-weight: bold; color: #10b981;">¥${(item.receivedAmount || 0).toLocaleString()}</div>
                        </div>
                        <div style="background: #fef3c7; padding: 10px; border-radius: 4px;">
                            <div style="font-size: 12px; color: #666;">剩余应收</div>
                            <div style="font-size: 16px; font-weight: bold; color: #f59e0b;">¥${(item.remainingAmount || 0).toLocaleString()}</div>
                        </div>
                        <div style="background: #f0f9ff; padding: 10px; border-radius: 4px;">
                            <div style="font-size: 12px; color: #666;">回款状态</div>
                            <div>
                                <span class="badge ${item.paymentStatus === 'paid' ? 'badge-success' : item.paymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">
                                    ${paymentStatusText[item.paymentStatus] || item.paymentStatus}
                                </span>
                            </div>
                        </div>
                        <div style="background: ${item.isBalanced ? '#d1fae5' : '#fee2e2'}; padding: 10px; border-radius: 4px;">
                            <div style="font-size: 12px; color: #666;">对账状态</div>
                            <div>
                                <span class="badge ${item.isBalanced ? 'badge-success' : 'badge-danger'}">
                                    ${item.isBalanced ? '已对平' : '未对平'}
                                </span>
                            </div>
                            ${!item.isBalanced ? `
                                <div style="font-size: 11px; color: #dc2626; margin-top: 4px;">
                                    差异：¥${Math.abs((item.totalPaymentAmount || 0) - (item.totalInvoiceAmount || 0)).toLocaleString()}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 8px;">回款记录 (${item.paymentCount}笔，合计：¥${(item.totalPaymentAmount || 0).toLocaleString()})</div>
                            <table style="width: 100%; font-size: 12px;">
                                <thead>
                                    <tr style="background: #f5f5f5;">
                                        <th style="padding: 6px; text-align: left;">日期</th>
                                        <th style="padding: 6px; text-align: left;">金额</th>
                                        <th style="padding: 6px; text-align: left;">方式</th>
                                        <th style="padding: 6px; text-align: left;">凭证</th>
                                        <th style="padding: 6px; text-align: left;">发票号</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${paymentRows || '<tr><td colspan="5" style="text-align:center; padding: 10px;">无回款记录</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <div style="font-weight: 600; margin-bottom: 8px;">发票记录 (${item.invoiceCount}张，合计：¥${(item.totalInvoiceAmount || 0).toLocaleString()})</div>
                            <table style="width: 100%; font-size: 12px;">
                                <thead>
                                    <tr style="background: #f5f5f5;">
                                        <th style="padding: 6px; text-align: left;">发票号</th>
                                        <th style="padding: 6px; text-align: left;">金额</th>
                                        <th style="padding: 6px; text-align: left;">开票日期</th>
                                        <th style="padding: 6px; text-align: left;">状态</th>
                                        <th style="padding: 6px; text-align: left;">类型</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${invoiceRows || '<tr><td colspan="5" style="text-align:center; padding: 10px;">无发票记录</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        const summaryHtml = `
            <div class="card" style="margin-bottom: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
                    <div>
                        <div style="font-size: 12px; opacity: 0.9;">项目总数</div>
                        <div style="font-size: 24px; font-weight: bold;">${summary.totalProjects || 0}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; opacity: 0.9;">回款总额</div>
                        <div style="font-size: 24px; font-weight: bold;">¥${(summary.totalPaymentAmount || 0).toLocaleString()}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; opacity: 0.9;">发票总额</div>
                        <div style="font-size: 24px; font-weight: bold;">¥${(summary.totalInvoiceAmount || 0).toLocaleString()}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; opacity: 0.9;">已对平项目</div>
                        <div style="font-size: 24px; font-weight: bold;">${summary.balancedProjects || 0}</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; opacity: 0.9;">未对平项目</div>
                        <div style="font-size: 24px; font-weight: bold; color: ${(summary.unbalancedProjects || 0) > 0 ? '#fbbf24' : 'white'};">${summary.unbalancedProjects || 0}</div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('reconciliationList').innerHTML = summaryHtml + rows;
    } catch (error) {
        showAlert('reconciliationList', '加载失败: ' + error.message, 'error');
    }
}

// 导出对账表（使用后端API，GBK编码）
function exportReconciliation() {
    const startDate = document.getElementById('reconciliationStartDate')?.value || '';
    const endDate = document.getElementById('reconciliationEndDate')?.value || '';
    
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    // 使用后端API导出，确保编码正确（GBK编码，Windows Excel默认能识别）
    fetch(`${API_BASE}/finance/reconciliation/export?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(data => {
                throw new Error(data.message || '导出失败');
            });
        }
        return res.blob();
    })
    .then(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const filename = `对账表_${startDate || '全部'}_${endDate || '全部'}.csv`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    })
    .catch(error => {
        console.error('导出对账表失败:', error);
        showToast('导出失败: ' + error.message, 'error');
    });
}

// ==================== 权限配置 ====================
async function loadPermissionsConfig() {
    try {
        // 从后端获取权限配置（实际上权限配置是硬编码在config/permissions.js中的）
        // 这里我们直接使用前端的PERMISSIONS对象
        const roles = Object.keys(PERMISSIONS);
        const permissionKeys = [
            'project.view', 'project.edit', 'project.create', 'project.delete', 'project.member.manage',
            'kpi.view', 'kpi.view.self', 'kpi.config',
            'finance.view', 'finance.edit',
            'customer.view', 'customer.edit',
            'user.manage', 'system.config'
        ];
        
        const permissionLabels = {
            'project.view': '查看项目',
            'project.edit': '编辑项目',
            'project.create': '创建项目',
            'project.delete': '删除项目',
            'project.member.manage': '管理项目成员',
            'kpi.view': '查看KPI',
            'kpi.view.self': '查看自己的KPI',
            'kpi.config': 'KPI配置',
            'finance.view': '查看财务',
            'finance.edit': '编辑财务',
            'customer.view': '查看客户',
            'customer.edit': '编辑客户',
            'user.manage': '用户管理',
            'system.config': '系统配置'
        };
        
        let html = `
            <div style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <p style="color: #666; margin-bottom: 20px;">
                    注意：权限配置目前为只读模式。如需修改权限，请联系系统管理员修改配置文件。
                </p>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 12px; text-align: left; border: 1px solid #ddd; min-width: 120px;">权限</th>
                                ${roles.map(role => `
                                    <th style="padding: 12px; text-align: center; border: 1px solid #ddd; min-width: 100px;">
                                        ${roleNames[role] || role}
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${permissionKeys.map(permKey => `
                                <tr>
                                    <td style="padding: 12px; border: 1px solid #ddd; font-weight: 500;">
                                        ${permissionLabels[permKey] || permKey}
                                    </td>
                                    ${roles.map(role => {
                                        const permValue = PERMISSIONS[role]?.[permKey];
                                        let displayValue = '';
                                        let bgColor = '#fff';
                                        
                                        if (permValue === true) {
                                            displayValue = '✅ 是';
                                            bgColor = '#e8f5e9';
                                        } else if (permValue === false) {
                                            displayValue = '❌ 否';
                                            bgColor = '#ffebee';
                                        } else if (permValue === 'all') {
                                            displayValue = '全部';
                                            bgColor = '#e3f2fd';
                                        } else if (permValue === 'sales') {
                                            displayValue = '自己的';
                                            bgColor = '#fff3e0';
                                        } else if (permValue === 'assigned') {
                                            displayValue = '分配的';
                                            bgColor = '#f3e5f5';
                                        } else if (permValue === 'self') {
                                            displayValue = '自己的';
                                            bgColor = '#fff3e0';
                                        } else {
                                            displayValue = '❌ 否';
                                            bgColor = '#ffebee';
                                        }
                                        
                                        return `
                                            <td style="padding: 12px; text-align: center; border: 1px solid #ddd; background: ${bgColor};">
                                                ${displayValue}
                                            </td>
                                        `;
                                    }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        document.getElementById('permissionsConfig').innerHTML = html;
    } catch (error) {
        console.error('加载权限配置失败:', error);
        showAlert('permissionsAlert', '加载权限配置失败: ' + error.message, 'error');
    }
}

// ========== 数据备份管理 ==========

// 加载备份列表
async function loadBackups() {
    try {
        const response = await apiFetch(`${API_BASE}/backup/list`);
        const data = await response.json();
        
        if (data.success) {
            renderBackups(data.data || []);
        } else {
            showAlert('backupAlert', '加载备份列表失败: ' + data.message, 'error');
            document.getElementById('backupsList').innerHTML = '<div class="card-desc">加载失败</div>';
        }
    } catch (error) {
        console.error('加载备份列表失败:', error);
        showAlert('backupAlert', '加载备份列表失败: ' + error.message, 'error');
        document.getElementById('backupsList').innerHTML = '<div class="card-desc">加载失败</div>';
    }
}

// 渲染备份列表
function renderBackups(backups) {
    const container = document.getElementById('backupsList');
    
    if (!backups || backups.length === 0) {
        container.innerHTML = '<div class="card-desc">暂无备份文件</div>';
        return;
    }
    
    const html = `
        <table style="width: 100%;">
            <thead>
                <tr>
                    <th>文件名</th>
                    <th>大小</th>
                    <th>格式</th>
                    <th>创建时间</th>
                    <th>保留天数</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${backups.map(backup => `
                    <tr>
                        <td><code>${backup.filename}</code></td>
                        <td>${backup.sizeFormatted}</td>
                        <td>${backup.format}</td>
                        <td>${new Date(backup.createdAt).toLocaleString('zh-CN')}</td>
                        <td>${backup.age} 天</td>
                        <td>
                            <button class="btn-small btn-success" onclick="restoreBackup('${backup.filename}')" 
                                    style="margin-right: 5px;">恢复</button>
                            <button class="btn-small btn-danger" onclick="deleteBackupFile('${backup.filename}')">删除</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// 创建备份
async function createBackup() {
    if (!confirm('确定要创建数据库备份吗？')) {
        return;
    }
    
    const alertEl = document.getElementById('backupAlert');
    showAlert('backupAlert', '正在创建备份，请稍候...', 'info');
    
    try {
        const response = await apiFetch(`${API_BASE}/backup/create`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showAlert('backupAlert', `备份创建成功: ${data.data.filename} (${data.data.sizeFormatted})`, 'success');
            await loadBackups();
        } else {
            showAlert('backupAlert', '备份创建失败: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('创建备份失败:', error);
        showAlert('backupAlert', '创建备份失败: ' + error.message, 'error');
    }
}

// 恢复备份
async function restoreBackup(filename) {
    if (!confirm(`⚠️ 警告：恢复操作会覆盖当前数据库！\n\n确定要恢复备份 "${filename}" 吗？\n\n此操作不可逆，请确保已做好当前数据的备份！`)) {
        return;
    }
    
    if (!confirm('请再次确认：您确定要恢复这个备份吗？当前所有数据将被覆盖！')) {
        return;
    }
    
    const alertEl = document.getElementById('backupAlert');
    showAlert('backupAlert', '正在恢复数据库，请稍候...（这可能需要几分钟）', 'info');
    
    try {
        const response = await apiFetch(`${API_BASE}/backup/restore`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: filename })
        });
        const data = await response.json();
        
        if (data.success) {
            showAlert('backupAlert', '数据库恢复成功！页面将在3秒后刷新...', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } else {
            showAlert('backupAlert', '数据库恢复失败: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('恢复备份失败:', error);
        showAlert('backupAlert', '恢复备份失败: ' + error.message, 'error');
    }
}

// 删除备份文件
async function deleteBackupFile(filename) {
    if (!confirm(`确定要删除备份 "${filename}" 吗？`)) {
        return;
    }
    
    try {
        const response = await apiFetch(`${API_BASE}/backup/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            showAlert('backupAlert', '备份文件删除成功', 'success');
            await loadBackups();
        } else {
            showAlert('backupAlert', '删除失败: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('删除备份失败:', error);
        showAlert('backupAlert', '删除备份失败: ' + error.message, 'error');
    }
}

// 清理旧备份
async function cleanupOldBackups() {
    if (!confirm('确定要清理超过5天的旧备份吗？')) {
        return;
    }
    
    const alertEl = document.getElementById('backupAlert');
    showAlert('backupAlert', '正在清理旧备份...', 'info');
    
    try {
        const response = await apiFetch(`${API_BASE}/backup/cleanup`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showAlert('backupAlert', `清理完成：删除了 ${data.data.deleted} 个旧备份`, 'success');
            await loadBackups();
        } else {
            showAlert('backupAlert', '清理失败: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('清理旧备份失败:', error);
        showAlert('backupAlert', '清理旧备份失败: ' + error.message, 'error');
    }
}

// ==================== 个人中心 ====================
async function loadProfile() {
    const contentEl = document.getElementById('profileContent');
    const alertEl = document.getElementById('profileAlert');
    
    if (!contentEl) return;
    
    try {
        // 获取当前用户信息
        const response = await apiFetch(`${API_BASE}/auth/me`);
        const data = await response.json();
        
        if (!data.success) {
            showAlert('profileAlert', '加载个人信息失败: ' + (data.message || '未知错误'), 'error');
            return;
        }
        
        const user = data.user;
        
        contentEl.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px;">
                <!-- 基本信息卡片 -->
                <div class="card">
                    <div class="card-title">基本信息</div>
                    <form id="profileInfoForm">
                        <div class="form-group">
                            <label>用户名</label>
                            <input type="text" value="${user.username || ''}" disabled style="background: #f5f5f5;">
                            <small style="color: #999;">用户名不可修改</small>
                        </div>
                        <div class="form-group">
                            <label>姓名</label>
                            <input type="text" value="${user.name || ''}" disabled style="background: #f5f5f5;">
                            <small style="color: #999;">姓名由管理员修改</small>
                        </div>
                        <div class="form-group">
                            <label>邮箱 <span style="color: #e74c3c;">*</span></label>
                            <input type="email" id="profileEmail" value="${user.email || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>电话</label>
                            <input type="text" id="profilePhone" value="${user.phone || ''}" placeholder="请输入联系电话">
                        </div>
                        <div class="form-group">
                            <label>角色</label>
                            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                                ${(user.roles || []).map(role => `
                                    <span style="background: #667eea; color: white; padding: 4px 12px; border-radius: 12px; font-size: 13px;">
                                        ${roleNames[role] || role}
                                    </span>
                                `).join('')}
                            </div>
                            <small style="color: #999;">角色由管理员分配</small>
                        </div>
                        <div class="action-buttons">
                            <button type="submit" class="btn-primary">保存信息</button>
                        </div>
                    </form>
                </div>
                
                <!-- 修改密码卡片 -->
                <div class="card">
                    <div class="card-title">修改密码</div>
                    <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 12px; margin-bottom: 16px; border-radius: 4px;">
                        <p style="margin: 0 0 8px 0; font-weight: 600; color: #1e40af;">密码要求</p>
                        <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: #1e3a8a;">
                            <li>长度要求：至少 8 位，最多 64 位</li>
                            <li>必须包含：<strong>大写字母</strong>（A-Z）</li>
                            <li>必须包含：<strong>小写字母</strong>（a-z）</li>
                            <li>必须包含：<strong>数字</strong>（0-9）</li>
                            <li>必须包含：<strong>特殊字符</strong>（如 !@#$%^&* 等）</li>
                        </ul>
                    </div>
                    <form id="profilePasswordForm">
                        <div class="form-group">
                            <label>当前密码 <span style="color: #e74c3c;">*</span></label>
                            <input type="password" id="profileOldPassword" required>
                        </div>
                        <div class="form-group">
                            <label>新密码 <span style="color: #e74c3c;">*</span></label>
                            <input type="password" id="profileNewPassword" required placeholder="请输入符合要求的新密码">
                            <div id="profilePwdHint" style="font-size: 12px; color: #64748b; margin-top: 4px;"></div>
                        </div>
                        <div class="form-group">
                            <label>确认新密码 <span style="color: #e74c3c;">*</span></label>
                            <input type="password" id="profileNewPasswordConfirm" required placeholder="请再次输入新密码">
                        </div>
                        <div class="action-buttons">
                            <button type="submit" class="btn-primary">修改密码</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        // 绑定表单提交事件
        const infoForm = document.getElementById('profileInfoForm');
        if (infoForm) {
            infoForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await updateProfileInfo();
            });
        }
        
        const passwordForm = document.getElementById('profilePasswordForm');
        if (passwordForm) {
            passwordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await updateProfilePassword();
            });
        }
        
        // 实时验证密码强度
        const newPwdInput = document.getElementById('profileNewPassword');
        const hintDiv = document.getElementById('profilePwdHint');
        if (newPwdInput && hintDiv) {
            newPwdInput.addEventListener('input', function() {
                const pwd = this.value;
                if (!pwd) {
                    hintDiv.innerHTML = '';
                    return;
                }
                
                const checks = {
                    length: pwd.length >= 8 && pwd.length <= 64,
                    upper: /[A-Z]/.test(pwd),
                    lower: /[a-z]/.test(pwd),
                    digit: /\d/.test(pwd),
                    special: /[^A-Za-z0-9]/.test(pwd)
                };
                
                let hintHtml = '<div style="margin-top: 4px;">';
                hintHtml += checks.length ? '✓ 长度符合要求' : '✗ 长度需8-64位';
                hintHtml += checks.upper ? ' ✓ 含大写字母' : ' ✗ 需含大写字母';
                hintHtml += checks.lower ? ' ✓ 含小写字母' : ' ✗ 需含小写字母';
                hintHtml += checks.digit ? ' ✓ 含数字' : ' ✗ 需含数字';
                hintHtml += checks.special ? ' ✓ 含特殊字符' : ' ✗ 需含特殊字符';
                hintHtml += '</div>';
                
                const allPass = Object.values(checks).every(v => v);
                hintDiv.innerHTML = hintHtml;
                hintDiv.style.color = allPass ? '#10b981' : '#64748b';
            });
        }
        
    } catch (error) {
        showAlert('profileAlert', '加载个人信息失败: ' + error.message, 'error');
    }
}

// 更新个人信息（邮箱、电话）
async function updateProfileInfo() {
    const alertEl = document.getElementById('profileAlert');
    const email = document.getElementById('profileEmail')?.value;
    const phone = document.getElementById('profilePhone')?.value;
    
    if (!email) {
        showAlert('profileAlert', '邮箱不能为空', 'error');
        return;
    }
    
    try {
        const response = await apiFetch(`${API_BASE}/auth/profile`, {
            method: 'PUT',
            body: JSON.stringify({ email, phone })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('profileAlert', '个人信息已更新', 'success');
            // 更新当前用户信息
            if (currentUser) {
                currentUser.email = data.data.email;
                currentUser.phone = data.data.phone;
            }
        } else {
            showAlert('profileAlert', data.message || '更新失败', 'error');
        }
    } catch (error) {
        showAlert('profileAlert', '更新失败: ' + error.message, 'error');
    }
}

// 更新密码
async function updateProfilePassword() {
    const alertEl = document.getElementById('profileAlert');
    const oldPassword = document.getElementById('profileOldPassword')?.value;
    const newPassword = document.getElementById('profileNewPassword')?.value;
    const newPasswordConfirm = document.getElementById('profileNewPasswordConfirm')?.value;
    
    if (!oldPassword || !newPassword || !newPasswordConfirm) {
        showAlert('profileAlert', '请填写所有密码字段', 'error');
        return;
    }
    
    if (newPassword !== newPasswordConfirm) {
        showAlert('profileAlert', '两次输入的新密码不一致', 'error');
        return;
    }
    
    const msg = passwordValidationMessage(newPassword);
    if (msg) {
        showAlert('profileAlert', msg, 'error');
        return;
    }
    
    try {
        const response = await apiFetch(`${API_BASE}/auth/change-password`, {
            method: 'POST',
            body: JSON.stringify({ oldPassword, newPassword })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('profileAlert', '密码已更新', 'success');
            // 清空表单
            document.getElementById('profilePasswordForm').reset();
            document.getElementById('profilePwdHint').innerHTML = '';
        } else {
            showAlert('profileAlert', data.message || '修改失败', 'error');
        }
    } catch (error) {
        showAlert('profileAlert', '修改失败: ' + error.message, 'error');
    }
}























