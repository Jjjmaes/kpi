// ============ 主入口文件 ============
// 导入核心模块
import { API_BASE } from './core/config.js';
import { state, setToken, setCurrentUser } from './core/state.js';
import { showToast, showAlert, hasPermission, getPermission } from './core/utils.js';
import { showSection, closeModal } from './core/ui.js';

// 导入业务模块
import { initAuth, checkAuth, showLogin, showMainApp, logout, bindAuthEvents, submitForcePasswordChange } from './modules/auth.js';
import { loadDashboard, navigateFromDashboardCard } from './modules/dashboard.js';
import { loadProjects, renderProjects, exportProjects, showCreateProjectModal, showEditProjectModal, viewProject, deleteProject, startProject, updateProjectStatus, addProjectPayment, addProjectInvoice, loadProjectPayments, loadProjectInvoices, loadRealtimeKPI, setRevision, setDelay, setComplaint, finishProject, deleteMember, addTargetLanguageRow, removeTargetLanguageRow, addEditTargetLanguageRow, removeEditTargetLanguageRow, showSetLayoutCostModal, exportProjectQuotation, createProject, updateProject, setLayoutCost, addMember, showAddMemberModal, showPaymentModalForProject, toggleProjectFields, calculateAmount, togglePartTimeSalesFields, calculatePartTimeSalesCommission, validateLayoutCost, jumpProjectPage, prevProjectPage, nextProjectPage, fillFinanceFilters, fillProjectCustomerFilter, showAddMemberModalForCreate, addMemberForCreate, removeCreateProjectMember, toggleCreateTranslatorFields, filterCreateUsersByRole, validateCreateMemberLayoutCost, updateCreateProjectMembersList, onMemberRoleChange, onCreateMemberRoleChange, toggleTranslatorFields, filterUsersByRole, validateAddMemberLayoutCost, closeAddMemberModalAndReturnToCreate, addInlineMemberForCreate, onInlineCreateMemberRoleChange, filterInlineCreateUsersByRole, validateInlineCreateMemberLayoutCost } from './modules/project.js';
import { loadCustomers, searchCustomers, showCreateCustomerModal, showCreateCustomerModalFromProject, editCustomer, deleteCustomer, createCustomer, updateCustomer, updateCustomerInfo, addCustomerContactRow, removeCustomerContactRow } from './modules/customer.js';
import { loadKPI, exportKPI, generateMonthlyKPI, showEvaluateModal, submitEvaluation } from './modules/kpi.js';
import { loadReceivables, renderReceivables, exportReceivables, loadInvoiceProjects, renderInvoiceProjects, addInvoice, addInvoiceForProject, loadPaymentRecordsProjects, renderPaymentRecordsProjects, addPaymentRecord, addPaymentRecordForProject, loadPaymentRecords, clearPaymentRecordFilter, showFinanceSection, loadFinanceSummary, exportFinanceSummary, loadPendingKpi, reviewKpiRecord, rejectKpiRecord, batchReviewKpiRecords, selectAllPendingKpi, deselectAllPendingKpi, toggleSelectAllPendingKpi, loadReconciliation, exportReconciliation, togglePaymentRecords, toggleInvoiceRecords, clearPaymentRecordsFilters, removePaymentRecord, jumpReceivablePage, prevReceivablePage, nextReceivablePage, jumpPaymentRecordsProjectsPage, prevPaymentRecordsProjectsPage, nextPaymentRecordsProjectsPage, jumpInvoiceProjectsPage, prevInvoiceProjectsPage, nextInvoiceProjectsPage, backToFinanceNav, showProjectSelector, filterProjectSelector, selectProject } from './modules/finance.js';
import { loadUsers, loadUsersForSelect, showCreateUserModal, editUser, deleteUser, resetUserPassword, copyPasswordToClipboard, createUser, updateUser, loadProfile, updateProfileInfo, updateProfilePassword } from './modules/user.js';
import { loadLanguages, showCreateLanguageModal, showEditLanguageModal, createLanguage, updateLanguage } from './modules/language.js';
import { loadBackups, createBackup, cleanupOldBackups, restoreBackup, deleteBackupFile } from './modules/backup.js';
import { loadConfig, loadConfigHistory, loadPermissionsConfig, savePermissionsConfig, loadOrgInfo, viewConfigChange } from './modules/system.js';
import { startNotificationPolling, stopNotificationPolling, toggleNotificationPanel, markAllNotificationsRead, initNotificationAudio } from './modules/notification.js';
import { loadPaymentCompletionDetail, renderPaymentCompletionDetail, pcdPrevPage, pcdNextPage, pcdJumpPage, pcdToggleProject, pcdToggleOverdue } from './modules/paymentDetail.js';

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
    // 显示服务器访问信息（开发调试用）
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        console.log('🌐 当前访问地址:', window.location.origin);
        console.log('🔗 API地址:', API_BASE);
    }
    
    // 加载机构信息（更新页面标题）
    await loadOrgInfo();
    
    // 绑定认证相关事件
    bindAuthEvents();

    // 绑定声明式事件（替代 HTML 内联 on*）
        
    // 初始化认证（检查 token 并验证）
    await initAuth();
    
    // 监听登录成功事件，加载初始数据
    window.addEventListener('app:login-success', async () => {
        await onLoginSuccess();
    });
    
    // 监听角色切换事件，刷新数据
    window.addEventListener('app:role-switched', async () => {
        await onRoleSwitched();
    });
    
    // 绑定声明式事件（data-click/data-change/data-submit）
    bindDeclarativeHandlers();
});

// ============ 登录成功后的初始化 ============
async function onLoginSuccess() {
    // 根据权限显示/隐藏导航按钮
    updateNavVisibility();
    
    // 加载初始数据（根据当前 section）
    const activeSection = document.querySelector('.section.active');
    if (activeSection) {
        const route = SECTION_ROUTES[activeSection.id];
        if (route?.onEnter) await route.onEnter();
    }
}

// ============ 角色切换后的处理 ============
async function onRoleSwitched() {
    console.log('[RoleSwitch] 角色切换，刷新数据');
    // 更新导航按钮可见性
    updateNavVisibility();
    
    // 重新加载当前 section 的数据
    const activeSection = document.querySelector('.section.active');
    if (activeSection) {
        const route = SECTION_ROUTES[activeSection.id];
        if (route?.onEnter) {
            console.log('[RoleSwitch] 重新加载当前 section:', activeSection.id);
            await route.onEnter();
            // 如果当前 section 是 dashboard，route.onEnter 已经调用了 loadDashboard，不需要再次调用
            return; // 直接返回，避免重复调用
        }
    }
}

// ============ 更新导航按钮可见性 ============
function updateNavVisibility() {
    // 客户管理
    const customersBtn = document.getElementById('customersBtn');
    if (customersBtn) {
        customersBtn.style.display = hasPermission('customer.view') ? 'inline-block' : 'none';
    }
    
    // 财务管理
    const financeBtn = document.getElementById('financeBtn');
    if (financeBtn) {
        financeBtn.style.display = hasPermission('finance.view') ? 'inline-block' : 'none';
    }
    
    // KPI配置
    const configBtn = document.getElementById('configBtn');
    if (configBtn) {
        configBtn.style.display = hasPermission('system.config') ? 'inline-block' : 'none';
    }
    
    // 用户管理
    const usersBtn = document.getElementById('usersBtn');
    if (usersBtn) {
        usersBtn.style.display = hasPermission('user.manage') ? 'inline-block' : 'none';
    }
    
    // 语种管理
    const languagesBtn = document.getElementById('languagesBtn');
    if (languagesBtn) {
        languagesBtn.style.display = hasPermission('system.config') ? 'inline-block' : 'none';
    }
    
    // 权限配置
    const permissionsBtn = document.getElementById('permissionsBtn');
    if (permissionsBtn) {
        permissionsBtn.style.display = hasPermission('system.config') ? 'inline-block' : 'none';
    }
    
    // 数据备份
    const backupBtn = document.getElementById('backupBtn');
    if (backupBtn) {
        backupBtn.style.display = hasPermission('system.config') ? 'inline-block' : 'none';
    }
    
    // 创建项目按钮
    const createProjectBtn = document.getElementById('createProjectBtn');
    if (createProjectBtn) {
        createProjectBtn.style.display = hasPermission('project.create') ? 'inline-block' : 'none';
    }
    
    // 个人中心按钮
    const profileHeaderBtn = document.getElementById('profileHeaderBtn');
    if (profileHeaderBtn) {
        profileHeaderBtn.style.display = state.currentUser ? 'inline-block' : 'none';
    }
    
    // 通知区域
    const notificationArea = document.getElementById('notificationArea');
    if (notificationArea) {
        notificationArea.style.display = state.currentUser ? 'block' : 'none';
    }
    
    // KPI相关按钮（仅当有查看所有KPI权限时显示）
    const kpiUserSelect = document.getElementById('kpiUserSelect');
    const exportKpiBtn = document.getElementById('exportKpiBtn');
    const generateKpiBtn = document.getElementById('generateKpiBtn');
    
    const kpiViewPerm = getPermission('kpi.view');
    const canViewAllKPI = kpiViewPerm === 'all';
    
    if (kpiUserSelect) {
        kpiUserSelect.style.display = canViewAllKPI ? 'block' : 'none';
    }
    if (exportKpiBtn) {
        exportKpiBtn.style.display = canViewAllKPI ? 'inline-block' : 'none';
    }
    if (generateKpiBtn) {
        generateKpiBtn.style.display = canViewAllKPI ? 'inline-block' : 'none';
    }
}

// ============ 初始化KPI月份选择器 ============
function initKpiMonthSelector() {
    const yearSelect = document.getElementById('kpiYear');
    const monthSelect = document.getElementById('kpiMonthSelect');
    const hiddenInput = document.getElementById('kpiMonth');
    
    if (!yearSelect || !monthSelect || !hiddenInput) return;
    
    // 生成年份选项（从2020年到当前年份+1年）
    const currentYear = new Date().getFullYear();
    const startYear = 2020;
    yearSelect.innerHTML = '';
    for (let year = currentYear + 1; year >= startYear; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year + '年';
        yearSelect.appendChild(option);
    }
    
    // 生成月份选项
    monthSelect.innerHTML = '';
    for (let month = 1; month <= 12; month++) {
        const option = document.createElement('option');
        option.value = String(month).padStart(2, '0');
        option.textContent = month + '月';
        monthSelect.appendChild(option);
    }
    
    // 设置当前月份为默认值
    const now = new Date();
    yearSelect.value = now.getFullYear();
    monthSelect.value = String(now.getMonth() + 1).padStart(2, '0');
    updateKpiMonth();
}

// ============ 更新KPI月份隐藏输入框 ============
function updateKpiMonth() {
    const yearSelect = document.getElementById('kpiYear');
    const monthSelect = document.getElementById('kpiMonthSelect');
    const hiddenInput = document.getElementById('kpiMonth');
    
    if (!yearSelect || !monthSelect || !hiddenInput) return;
    
    const year = yearSelect.value;
    const month = monthSelect.value;
    if (year && month) {
        hiddenInput.value = `${year}-${month}`;
        // 触发loadKPI
        loadKPI();
    }
}

// ============ 初始化财务汇总月份选择器 ============
function initReportMonthSelector() {
    const yearSelect = document.getElementById('reportYear');
    const monthSelect = document.getElementById('reportMonthSelect');
    const hiddenInput = document.getElementById('reportMonth');
    
    if (!yearSelect || !monthSelect || !hiddenInput) return;
    
    // 生成年份选项（从2020年到当前年份+1年）
    const currentYear = new Date().getFullYear();
    const startYear = 2020;
    yearSelect.innerHTML = '<option value="">全部</option>';
    for (let year = currentYear + 1; year >= startYear; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year + '年';
        yearSelect.appendChild(option);
    }
    
    // 生成月份选项，添加"全部"选项
    monthSelect.innerHTML = '<option value="">全部</option>';
    for (let month = 1; month <= 12; month++) {
        const option = document.createElement('option');
        option.value = String(month).padStart(2, '0');
        option.textContent = month + '月';
        monthSelect.appendChild(option);
    }
    
    // 默认不选择任何月份（显示全部）
    yearSelect.value = '';
    monthSelect.value = '';
    updateReportMonth();
}

// ============ 更新财务汇总月份隐藏输入框 ============
function updateReportMonth() {
    const yearSelect = document.getElementById('reportYear');
    const monthSelect = document.getElementById('reportMonthSelect');
    const hiddenInput = document.getElementById('reportMonth');
    
    if (!yearSelect || !monthSelect || !hiddenInput) return;
    
    const year = yearSelect.value;
    const month = monthSelect.value;
    if (year && month) {
        hiddenInput.value = `${year}-${month}`;
    } else {
        hiddenInput.value = '';
    }
}

// ============ 绑定 Section 切换事件 ============

// ============ 加载 Section 数据 ============

// ============ 导出到 Window（供 HTML 直接调用） ============
// 这些函数已经在各自的模块中导出到 window，这里只是确保可用
// 如果需要，可以在这里重新导出或添加全局辅助函数

// 确保 showSection 可用（已在 ui.js 中导出）
// 确保 logout 可用（已在 auth.js 中导出）



// ============ 路由表：Section 切换与进入时加载（收敛 loadSectionData / showSection 调用） ============
const SECTION_ROUTES = {
    dashboard: { onEnter: async () => loadDashboard() },
    projects: { onEnter: async () => loadProjects() },
    customers: { onEnter: async () => loadCustomers() },
    kpi: { 
        onEnter: async () => {
            // 初始化月份选择器
            initKpiMonthSelector();
            
            // 加载用户列表（如果有权限查看所有KPI）
            const kpiViewPerm = getPermission('kpi.view');
            if (kpiViewPerm === 'all') {
                await loadUsersForSelect();
            }
            
            // 加载KPI数据
            await loadKPI();
        }
    },
    finance: {
        onEnter: async () => {
            const canViewFinance = hasPermission('finance.view');

            // 若来自回款完成率卡片，隐藏导航，直达回款记录
            if (state.hideFinanceNav) {
                state.salesFinanceView = true; // 即便有权限，也按照只看回款记录处理
                try {
                    const { showFinanceSection } = await import('./modules/finance.js');
                    showFinanceSection('paymentRecords');
                } catch (e) {
                    console.warn('showFinanceSection (hide nav) failed:', e);
                }
                return;
            }

            // 如果已经设置了salesFinanceView（比如从dashboard跳转），保持该状态
            if (state.salesFinanceView && !canViewFinance) {
                try {
                    const { showFinanceSection } = await import('./modules/finance.js');
                    showFinanceSection('paymentRecords');
                } catch (e) {
                    console.warn('showFinanceSection (sales view) failed:', e);
                }
                return;
            }
            
            // 销售只读视图：只允许查看自己的回款列表
            if (!canViewFinance) {
                state.salesFinanceView = true;
                try {
                    const { showFinanceSection } = await import('./modules/finance.js');
                    showFinanceSection('paymentRecords');
                } catch (e) {
                    console.warn('showFinanceSection (sales view) failed:', e);
                }
                return;
            }
            
            // 财务/管理员：预填充筛选（客户/项目/销售下拉等），并默认显示应收对账
            state.salesFinanceView = false;
            try {
                const { fillFinanceFilters } = await import('./modules/project.js');
                await fillFinanceFilters();
            } catch (e) {
                console.warn('fillFinanceFilters failed:', e);
            }
            try {
                const { showFinanceSection } = await import('./modules/finance.js');
                showFinanceSection('receivables');
            } catch (e) {
                console.warn('showFinanceSection failed:', e);
            }
        }
    },
    paymentDetail: { onEnter: async () => loadPaymentCompletionDetail() },
    config: { onEnter: async () => { if (hasPermission('system.config')) await loadConfig(); } },
    users: { onEnter: async () => { if (hasPermission('user.manage')) await loadUsers(); } },
    languages: { onEnter: async () => { if (hasPermission('system.config')) await loadLanguages(); } },
    permissions: { onEnter: async () => { if (hasPermission('system.config')) await loadPermissionsConfig(); } },
    backup: { onEnter: async () => { if (hasPermission('system.config')) await loadBackups(); } },
    profile: { onEnter: async () => { if (state.currentUser) await loadProfile(); } }
};

async function goToSection(sectionId) {
    // 财务模块入口权限校验
    if (sectionId === 'finance') {
        // 允许后续 onEnter 处理销售/财务视图
    } else {
        // 离开财务页时重置销售只读视图标记与导航显示
        if (state.salesFinanceView) state.salesFinanceView = false;
        if (state.hideFinanceNav) state.hideFinanceNav = false;
    }

    showSection(sectionId);
    const route = SECTION_ROUTES[sectionId];
    if (route?.onEnter) {
        try {
            await route.onEnter();
        } catch (error) {
            console.error(`进入 ${sectionId} 失败:`, error);
            showToast(`加载数据失败: ${error.message}`, 'error');
        }
    }
}

// ============ Action Registry：替代 window.* 全局函数 ============
const ACTIONS = Object.freeze({
    // 通用/UI
    showSection: (sectionId) => goToSection(sectionId),
    closeModal: () => closeModal(),

    // 登录/账号
    logout: () => logout(),

    // 通知
    toggleNotificationPanel: () => toggleNotificationPanel(),
    markAllNotificationsRead: () => markAllNotificationsRead(),

    // Dashboard
    loadDashboard: () => loadDashboard(),
    navigateFromDashboardCard: (target, overrideStatus) => navigateFromDashboardCard(target, overrideStatus),
    loadPaymentCompletionDetail: () => loadPaymentCompletionDetail(),
    renderPaymentCompletionDetail: () => renderPaymentCompletionDetail(),

    // Projects（含列表渲染中动态按钮）
    loadProjects: () => loadProjects(),
    renderProjects: () => renderProjects(),
    exportProjects: () => exportProjects(),
    showCreateProjectModal: () => showCreateProjectModal(),
    showEditProjectModal: (id) => showEditProjectModal(id),
    viewProject: (id) => viewProject(id),
    deleteProject: (id) => deleteProject(id),
    startProject: (id) => startProject(id),
    updateProjectStatus: (id, status, confirmMessage) => updateProjectStatus(id, status, confirmMessage),
    addProjectPayment: (id) => addProjectPayment(id),
    addProjectInvoice: (id) => addProjectInvoice(id),
    loadProjectPayments: (id) => loadProjectPayments(id),
    loadProjectInvoices: (id) => loadProjectInvoices(id),
    loadRealtimeKPI: (id) => loadRealtimeKPI(id),
    setRevision: (id, count) => setRevision(id, count),
    setDelay: (id) => setDelay(id),
    setComplaint: (id) => setComplaint(id),
    finishProject: (id) => finishProject(id),
    deleteMember: (projectId, memberId) => deleteMember(projectId, memberId),
    exportProjectQuotation: (id) => exportProjectQuotation(id),
    showSetLayoutCostModal: (projectId) => showSetLayoutCostModal(projectId),

    // Project form rows
    addTargetLanguageRow: () => addTargetLanguageRow(),
    removeTargetLanguageRow: (idx) => removeTargetLanguageRow(idx),
    addEditTargetLanguageRow: () => addEditTargetLanguageRow(),
    removeEditTargetLanguageRow: (idx) => removeEditTargetLanguageRow(idx),

    // Project form handlers
    createProject: (event) => createProject(event),
    updateProject: (event, projectId) => updateProject(event, projectId),
    setLayoutCost: (event, projectId) => setLayoutCost(event, projectId),
    addMember: (event, projectId) => addMember(event, projectId),
    showAddMemberModal: (projectId) => showAddMemberModal(projectId),
    showPaymentModalForProject: (projectId) => showPaymentModalForProject(projectId),
    onMemberRoleChange: () => onMemberRoleChange(),
    toggleTranslatorFields: () => toggleTranslatorFields(),
    filterUsersByRole: () => filterUsersByRole(),
    validateAddMemberLayoutCost: () => validateAddMemberLayoutCost(),
    showAddMemberModalForCreate: () => showAddMemberModalForCreate(),
    addMemberForCreate: (event) => addMemberForCreate(event),
    removeCreateProjectMember: (index) => removeCreateProjectMember(index),
    toggleCreateTranslatorFields: () => toggleCreateTranslatorFields(),
    filterCreateUsersByRole: () => filterCreateUsersByRole(),
    onCreateMemberRoleChange: () => onCreateMemberRoleChange(),
    validateCreateMemberLayoutCost: () => validateCreateMemberLayoutCost(),
    closeAddMemberModalAndReturnToCreate: () => closeAddMemberModalAndReturnToCreate(),
    updateCreateProjectMembersList: () => updateCreateProjectMembersList(),
    // 内联添加成员相关函数
    addInlineMemberForCreate: () => addInlineMemberForCreate(),
    onInlineCreateMemberRoleChange: () => onInlineCreateMemberRoleChange(),
    filterInlineCreateUsersByRole: () => filterInlineCreateUsersByRole(),
    validateInlineCreateMemberLayoutCost: () => validateInlineCreateMemberLayoutCost(),
    toggleProjectFields: () => toggleProjectFields(),
    calculateAmount: () => calculateAmount(),
    togglePartTimeSalesFields: () => togglePartTimeSalesFields(),
    calculatePartTimeSalesCommission: () => calculatePartTimeSalesCommission(),
    validateLayoutCost: () => validateLayoutCost(),
    updateCustomerInfo: () => updateCustomerInfo(),
    jumpProjectPage: (val, total) => jumpProjectPage(val, total),
    prevProjectPage: () => prevProjectPage(),
    nextProjectPage: () => nextProjectPage(),
    fillFinanceFilters: () => fillFinanceFilters(),
    fillProjectCustomerFilter: () => fillProjectCustomerFilter(),
    backToFinanceNav: () => backToFinanceNav(),
    showProjectSelector: (type) => showProjectSelector(type),
    filterProjectSelector: () => filterProjectSelector(),
    selectProject: (projectId, projectNumber, projectName, customerName, type) => selectProject(projectId, projectNumber, projectName, customerName, type),

    // Customers
    loadCustomers: () => loadCustomers(),
    searchCustomers: () => searchCustomers(),
    showCreateCustomerModal: (returnToProject) => showCreateCustomerModal(returnToProject),
    showCreateCustomerModalFromProject: () => showCreateCustomerModalFromProject(),
    editCustomer: (id) => editCustomer(id),
    deleteCustomer: (id) => deleteCustomer(id),
    createCustomer: (event, returnToProject) => createCustomer(event, returnToProject),
    updateCustomer: (event, id) => updateCustomer(event, id),
    addCustomerContactRow: () => addCustomerContactRow(),
    removeCustomerContactRow: (event) => removeCustomerContactRow(event),

    // Users
    loadUsers: () => loadUsers(),
    showCreateUserModal: () => showCreateUserModal(),
    editUser: (id) => editUser(id),
    deleteUser: (id) => deleteUser(id),
    resetUserPassword: (id) => resetUserPassword(id),
    copyPasswordToClipboard: (pwd) => copyPasswordToClipboard(pwd),
    createUser: (event) => createUser(event),
    updateUser: (event, userId) => updateUser(event, userId),
    loadProfile: () => loadProfile(),
    updateProfileInfo: (event) => updateProfileInfo(event),
    updateProfilePassword: (event) => updateProfilePassword(event),
    submitForcePasswordChange: (event, defaultOldPwd) => submitForcePasswordChange(event, defaultOldPwd),

    // Languages
    loadLanguages: () => loadLanguages(),
    showCreateLanguageModal: () => showCreateLanguageModal(),
    showEditLanguageModal: (id) => showEditLanguageModal(id),
    createLanguage: (event) => createLanguage(event),
    updateLanguage: (event, id) => updateLanguage(event, id),

    // KPI
    loadKPI: () => loadKPI(),
    updateKpiMonth: () => updateKpiMonth(),
    updateReportMonth: () => updateReportMonth(),
    exportKPI: () => exportKPI(),
    generateMonthlyKPI: () => generateMonthlyKPI(),
    showEvaluateModal: (id, role, level) => showEvaluateModal(id, role, level),
    submitEvaluation: (event, recordId) => submitEvaluation(event, recordId),

    // Finance（含列表渲染中动态按钮）
    showFinanceSection: (name) => showFinanceSection(name),
    loadReceivables: () => loadReceivables(),
    renderReceivables: () => renderReceivables(),
    exportReceivables: () => exportReceivables(),
    loadPaymentRecordsProjects: () => loadPaymentRecordsProjects(),
    renderPaymentRecordsProjects: () => renderPaymentRecordsProjects(),
    addPaymentRecord: () => addPaymentRecord(),
    addPaymentRecordForProject: (event, projectId) => addPaymentRecordForProject(event, projectId),
    togglePaymentRecords: (projectId) => togglePaymentRecords(projectId),
    clearPaymentRecordsFilters: () => clearPaymentRecordsFilters(),
    clearPaymentRecordFilter: (projectId) => clearPaymentRecordFilter(projectId),
    removePaymentRecord: (recordId, projectId) => removePaymentRecord(recordId, projectId),

    loadInvoiceProjects: () => loadInvoiceProjects(),
    renderInvoiceProjects: () => renderInvoiceProjects(),
    addInvoice: () => addInvoice(),
    addInvoiceForProject: (event, projectId) => addInvoiceForProject(event, projectId),
    toggleInvoiceRecords: (projectId) => toggleInvoiceRecords(projectId),

    loadReconciliation: () => loadReconciliation(),
    exportReconciliation: () => exportReconciliation(),
    loadPendingKpi: () => loadPendingKpi(),
    reviewKpiRecord: (recordId) => reviewKpiRecord(recordId),
    rejectKpiRecord: (recordId) => rejectKpiRecord(recordId),
    batchReviewKpiRecords: () => batchReviewKpiRecords(),
    selectAllPendingKpi: () => selectAllPendingKpi(),
    deselectAllPendingKpi: () => deselectAllPendingKpi(),
    toggleSelectAllPendingKpi: () => toggleSelectAllPendingKpi(),
    loadFinanceSummary: () => loadFinanceSummary(),
    exportFinanceSummary: () => exportFinanceSummary(),
    jumpReceivablePage: (val, total) => jumpReceivablePage(val, total),
    prevReceivablePage: () => prevReceivablePage(),
    nextReceivablePage: () => nextReceivablePage(),
    jumpPaymentRecordsProjectsPage: (page, maxPage) => jumpPaymentRecordsProjectsPage(page, maxPage),
    prevPaymentRecordsProjectsPage: () => prevPaymentRecordsProjectsPage(),
    nextPaymentRecordsProjectsPage: () => nextPaymentRecordsProjectsPage(),
    pcdPrevPage: () => pcdPrevPage(),
    pcdNextPage: () => pcdNextPage(),
    pcdJumpPage: (page, total) => pcdJumpPage(page, total),
    pcdToggleProject: (projectId) => pcdToggleProject(projectId),
    pcdToggleOverdue: () => pcdToggleOverdue(),
    jumpInvoiceProjectsPage: (page, maxPage) => jumpInvoiceProjectsPage(page, maxPage),
    prevInvoiceProjectsPage: () => prevInvoiceProjectsPage(),
    nextInvoiceProjectsPage: () => nextInvoiceProjectsPage(),

    // System / Config
    loadConfigHistory: () => loadConfigHistory(),
    viewConfigChange: (id) => viewConfigChange(id),
    loadPermissionsConfig: () => loadPermissionsConfig(),
    savePermissionsConfig: () => savePermissionsConfig(),

    // Backup
    loadBackups: () => loadBackups(),
    createBackup: () => createBackup(),
    cleanupOldBackups: () => cleanupOldBackups(),
    restoreBackup: (filename) => restoreBackup(filename),
    deleteBackupFile: (filename) => deleteBackupFile(filename),

    // 特殊：阻止冒泡（兼容历史 HTML：event.stopPropagation()）
    "__event_stopPropagation__": (event) => {
        if (event?.stopPropagation) event.stopPropagation();
    }
});
// ============ Legacy Shim 已移除 ============
// 所有事件处理现在通过声明式属性（data-click/data-change/data-submit）统一处理
// 如果仍有内联事件处理器（onclick/onchange/onsubmit），它们会被自动转换为声明式处理


// ============ 声明式事件绑定（data-click/data-change/data-submit） ============
// 说明：
// 1) HTML 中不再直接调用 window.xxx。
// 2) 事件分发器只允许调用 ACTIONS 注册表中的动作。
// 3) 兼容旧写法：event.stopPropagation()

function parseActionExpr(expr) {
    if (!expr) return null;
    const trimmed = String(expr).trim();

    if (trimmed === 'event.stopPropagation()') {
        return { fnName: "__event_stopPropagation__", args: [] };
    }

    const m = trimmed.match(/^([a-zA-Z_$][\w$]*)(?:\((.*)\))?$/);
    if (!m) {
        console.warn('parseActionExpr: regex match failed for:', trimmed);
        return null;
    }

    const fnName = m[1];
    const argsRaw = m[2];

    if (!(fnName in ACTIONS)) {
        console.warn('Blocked action (not registered):', fnName, 'Available:', Object.keys(ACTIONS).slice(0, 10));
        return null;
    }
    if (argsRaw == null || argsRaw === undefined) {
        // 没有参数，如 showCreateProjectModal()
        return { fnName, args: [] };
    }

    let safe = argsRaw.trim();
    if (safe === '') {
        // 空参数，如 showCreateProjectModal()
        return { fnName, args: [] };
    }

    // 特殊处理：如果参数是 "event"，标记为需要传递事件对象
    if (safe === 'event') {
        return { fnName, args: [{ __passEvent: true }] };
    }

    // 安全限制：拒绝对象/数组/模板字符串等复杂表达式
    if (/[{}\[\]`]/.test(safe)) {
        console.warn('Blocked complex args for action:', trimmed);
        return null;
    }

    // 将单引号字符串替换为双引号字符串（尽量保守）
    safe = safe.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (all, inner) => {
        const jsonEscaped = inner.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${jsonEscaped}"`;
    });

    // 允许逗号分隔多个参数（只支持：字符串/数字/true/false/null）
    const parts = safe.split(',').map(s => s.trim()).filter(Boolean);
    try {
        const args = parts.map(p => {
            // 如果参数是 "event"（带或不带引号），标记为需要传递事件对象
            const unquoted = p.replace(/^["']|["']$/g, '');
            if (unquoted === 'event') {
                return { __passEvent: true };
            }
            // 尝试解析 JSON
            try {
                return JSON.parse(p);
            } catch (parseErr) {
                // 如果解析失败，可能是未引用的字符串，尝试作为字符串处理
                // 移除可能的引号
                return unquoted;
            }
        });
        return { fnName, args };
    } catch (e) {
        console.warn('Blocked args (JSON parse failed):', trimmed, 'Error:', e);
        return null;
    }
}

async function dispatchAction(expr, event, element) {
    if (!expr) return;
    
    // 调试信息 - 添加 createUser 相关的调试
    if (expr.includes('createUser') || expr.includes('showCreateProjectModal') || expr.includes('viewProject') || expr.includes('showFinanceSection')) {
        console.log('dispatchAction called with expr:', expr, 'event:', event);
    }
    
    const parsed = parseActionExpr(expr);
    if (!parsed) {
        console.warn('Failed to parse action:', expr);
        return;
    }

    const { fnName, args } = parsed;
    
    // 检查是否有需要传递event的参数
    const hasEventArg = args.some(arg => arg && arg.__passEvent === true);
    
    // 调试信息 - 添加 createUser 相关的调试
    if (fnName === 'createUser' || fnName === 'showCreateProjectModal' || fnName === 'viewProject' || fnName === 'showFinanceSection') {
        console.log('Parsed action:', { fnName, args, hasEventArg });
    }
    
    const fn = ACTIONS[fnName];
    if (!fn) {
        console.warn('Action not found in ACTIONS:', fnName, 'Available actions:', Object.keys(ACTIONS).filter(k => k.includes('view') || k.includes('Project') || k.includes('Create') || k.includes('User')));
        return;
    }

    try {
        // 处理args中包含__passEvent标记的情况
        const processedArgs = args.map(arg => {
            if (arg && arg.__passEvent === true) {
                return event;
            }
            return arg;
        });

        // 调试信息 - 添加 createUser 相关的调试
        if (fnName === 'createUser' || fnName === 'viewProject' || fnName === 'showCreateProjectModal' || fnName === 'showFinanceSection' || fnName === 'addPaymentRecordForProject' || fnName === 'addInvoiceForProject') {
            console.log('Calling', fnName, 'with args:', processedArgs);
        }

        // 约定：只传递解析出的参数，不传递 event 和 element（除非是特殊动作）
        if (fnName === "__event_stopPropagation__") {
            fn(event, element);
        } else {
            const ret = fn(...processedArgs);
            if (ret && typeof ret.then === 'function') await ret;
        }
    } catch (err) {
        console.error('Action failed:', expr, 'Function:', fnName, 'Args:', args, 'Error:', err, err.stack);
        showToast(`操作失败: ${err.message}`, 'error');
    }
}

function bindDeclarativeHandlers() {
    // click - 支持 data-click 和 onclick（自动转换）
    document.addEventListener('click', async (e) => {
        // 在用户首次点击时初始化通知音频（浏览器要求用户交互后才能播放声音）
        await initNotificationAudio();
        
        let el = e.target?.closest?.('[data-click]');
        if (el) {
            const expr = el.getAttribute('data-click');
            if (expr) {
                // 调试信息
                if (expr.includes('showCreateProjectModal') || expr.includes('viewProject') || expr.includes('showFinanceSection')) {
                    console.log('Click detected on element with data-click:', expr, 'Element:', el);
                }
                dispatchAction(expr, e, el);
            }
            return;
        }
        // 兼容 onclick 属性
        el = e.target?.closest?.('[onclick]');
        if (el) {
            const onclickAttr = el.getAttribute('onclick');
            if (onclickAttr && onclickAttr.trim()) {
                // 移除 onclick 属性，转换为 data-click
                el.removeAttribute('onclick');
                el.setAttribute('data-click', onclickAttr);
                dispatchAction(onclickAttr, e, el);
            }
        }
    });

    // change - 支持 data-change 和 onchange（自动转换）
    document.addEventListener('change', (e) => {
        let el = e.target?.closest?.('[data-change]');
        if (el) {
            const expr = el.getAttribute('data-change');
            dispatchAction(expr, e, el);
            return;
        }
        // 兼容 onchange 属性
        el = e.target?.closest?.('[onchange]');
        if (el) {
            const onchangeAttr = el.getAttribute('onchange');
            if (onchangeAttr && onchangeAttr.trim()) {
                // 移除 onchange 属性，转换为 data-change
                el.removeAttribute('onchange');
                el.setAttribute('data-change', onchangeAttr);
                dispatchAction(onchangeAttr, e, el);
            }
        }
    });

    // submit - 支持 data-submit 和 onsubmit
    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (!form || form.tagName !== 'FORM') return;
        
        // 优先使用 data-submit
        const dataSubmit = form.getAttribute('data-submit');
        if (dataSubmit) {
            e.preventDefault();
            console.log('Form submit detected, data-submit:', dataSubmit, 'form:', form.id);
            dispatchAction(dataSubmit, e, form);
            return;
        }
        
        // 兼容 onsubmit 属性（如 onsubmit="createProject(event)"）
        const onsubmitAttr = form.getAttribute('onsubmit');
        if (onsubmitAttr) {
            e.preventDefault();
            // 解析 onsubmit 属性值，如 "createProject(event)"
            const match = onsubmitAttr.match(/^(\w+)\((.*)\)$/);
            if (match) {
                const fnName = match[1];
                const argsStr = match[2].trim();
                // 如果参数是 "event"，传递事件对象
                if (argsStr === 'event' || argsStr === '') {
                    const fn = ACTIONS[fnName];
                    if (fn) {
                        dispatchAction(`${fnName}(event)`, e, form);
                        return;
                    }
                } else {
                    // 其他参数情况
                    dispatchAction(onsubmitAttr, e, form);
                    return;
                }
            }
        }
    });

    // keyup - 支持 data-keyup 和 onkeyup（自动转换）
    document.addEventListener('keyup', (e) => {
        let el = e.target?.closest?.('[data-keyup]');
        if (el) {
            const expr = el.getAttribute('data-keyup');
            dispatchAction(expr, e, el);
            return;
        }
        // 兼容 onkeyup 属性
        el = e.target?.closest?.('[onkeyup]');
        if (el) {
            const onkeyupAttr = el.getAttribute('onkeyup');
            if (onkeyupAttr && onkeyupAttr.trim()) {
                el.removeAttribute('onkeyup');
                el.setAttribute('data-keyup', onkeyupAttr);
                dispatchAction(onkeyupAttr, e, el);
            }
        }
    });

    // focus - 支持 data-focus 和 onfocus（自动转换）
    document.addEventListener('focus', (e) => {
        let el = e.target?.closest?.('[data-focus]');
        if (el) {
            const expr = el.getAttribute('data-focus');
            dispatchAction(expr, e, el);
            return;
        }
        // 兼容 onfocus 属性
        el = e.target?.closest?.('[onfocus]');
        if (el) {
            const onfocusAttr = el.getAttribute('onfocus');
            if (onfocusAttr && onfocusAttr.trim()) {
                el.removeAttribute('onfocus');
                el.setAttribute('data-focus', onfocusAttr);
                dispatchAction(onfocusAttr, e, el);
            }
        }
    }, true); // use capture phase

    console.log('✅ Declarative handlers ready - 支持声明式属性（data-*）和自动转换遗留内联事件（on*）');
}

// 导出到window供其他模块使用
window.initReportMonthSelector = initReportMonthSelector;
window.updateReportMonth = updateReportMonth;

console.log('✅ main.js 已加载');