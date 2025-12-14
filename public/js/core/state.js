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
    salesFinanceView: false
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

