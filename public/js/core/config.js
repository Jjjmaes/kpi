// Core configuration

// 动态获取 API Base
export const API_BASE = (function initAPIBase() {
    const urlParams = new URLSearchParams(window.location.search);
    const customApi = urlParams.get('api');
    if (customApi) {
        return customApi.endsWith('/api') ? customApi : `${customApi}/api`;
    }
    return `${window.location.origin}/api`;
})();

export const NOTIFICATION_POLL_INTERVAL = 60000;

export const ROLE_NAMES = {
    admin: '管理员',
    finance: '财务',
    pm: '项目经理',
    sales: '销售',
    part_time_sales: '兼职销售',
    translator: '翻译',
    reviewer: '审校',
    layout: '排版',
    admin_staff: '综合岗'
};

// 角色优先级
export const ROLE_PRIORITY = {
    admin: 100,
    finance: 90,
    pm: 80,
    admin_staff: 75,
    sales: 70,
    part_time_sales: 65,
    reviewer: 50,
    translator: 40,
    layout: 30
};

// 权限表
export const PERMISSIONS = {
    admin: { 'project.view': 'all', 'project.edit': true, 'project.create': true, 'kpi.view': 'all', 'finance.view': true, 'customer.view': true, 'customer.edit': true, 'user.manage': true, 'system.config': true },
    finance: { 'project.view': 'all', 'project.edit': false, 'project.create': false, 'kpi.view': 'all', 'finance.view': true, 'customer.view': true, 'customer.edit': true, 'user.manage': false, 'system.config': false },
    pm: { 'project.view': 'all', 'project.edit': true, 'project.create': true, 'kpi.view': 'self', 'finance.view': false, 'customer.view': true, 'customer.edit': true, 'user.manage': false, 'system.config': false },
    sales: { 'project.view': 'sales', 'project.edit': 'sales', 'project.create': true, 'kpi.view': 'self', 'finance.view': false, 'customer.view': true, 'customer.edit': true, 'user.manage': false, 'system.config': false },
    part_time_sales: { 'project.view': 'sales', 'project.edit': 'sales', 'project.create': true, 'kpi.view': 'self', 'finance.view': false, 'customer.view': true, 'customer.edit': false, 'user.manage': false, 'system.config': false },
    translator: { 'project.view': 'assigned', 'project.edit': false, 'project.create': false, 'kpi.view': 'self', 'finance.view': false, 'customer.view': false, 'customer.edit': false, 'user.manage': false, 'system.config': false },
    reviewer: { 'project.view': 'assigned', 'project.edit': false, 'project.create': false, 'kpi.view': 'self', 'finance.view': false, 'customer.view': false, 'customer.edit': false, 'user.manage': false, 'system.config': false },
    layout: { 'project.view': 'assigned', 'project.edit': false, 'project.create': false, 'kpi.view': 'self', 'finance.view': false, 'customer.view': false, 'customer.edit': false, 'user.manage': false, 'system.config': false },
    admin_staff: { 'project.view': 'all', 'project.edit': true, 'project.create': true, 'kpi.view': 'self', 'finance.view': false, 'customer.view': true, 'customer.edit': true, 'user.manage': false, 'system.config': false }
};

