import { ROLE_PRIORITY } from './config.js';

// 集中管理全局状态
export const state = {
    currentUser: null,
    token: localStorage.getItem('token') || null,
    currentRole: localStorage.getItem('currentRole') || null,

    // 缓存数据
    allUsers: [],
    allCustomers: [],
    allProjectsCache: [],
    notifications: [],
    unreadNotificationCount: 0,
    languagesCache: [],

    // UI状态
    projectPage: 1,
    projectFilterMonth: '',
    projectFilterDeliveryOverdue: false,
    projectFilterRecentDeliveryOverdue: false, // 近7天交付逾期
    projectFilterRecentCompleted: false,
    salesFinanceView: false,
    // 后端筛选条件（用于判断前端是否需要再次过滤）
    backendFilters: null
};

// Actions
export function setToken(token) {
    state.token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
}

export function setCurrentUser(user) {
    state.currentUser = user;
}

export function setCurrentRole(role) {
    state.currentRole = role;
    if (role) localStorage.setItem('currentRole', role);
}

