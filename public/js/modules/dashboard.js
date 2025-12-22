import { apiFetch } from '../core/api.js';
import { showSection } from '../core/ui.js';
import { loadPaymentCompletionDetail } from './paymentDetail.js';
import { showToast, showAlert, getStatusText, getBusinessTypeText, getRoleText, hasPermission } from '../core/utils.js';
import { state } from '../core/state.js';
import { loadProjects, renderProjects } from './project.js';

// Chart.js 实例列表，避免内存泄漏
let chartInstances = [];

function destroyCharts() {
    // 销毁所有图表实例
    chartInstances.forEach(chart => {
        try {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        } catch (err) {
            console.warn('[Dashboard] 销毁图表失败:', err);
        }
    });
    chartInstances = [];
    
    // 清理所有 canvas 元素上的 Chart.js 实例
    // Chart.js 会在 canvas 元素上存储图表实例，需要手动清理
    const canvases = document.querySelectorAll('#dashboardCharts canvas');
    canvases.forEach(canvas => {
        try {
            // Chart.js 会在 canvas 上存储图表实例
            const chart = Chart.getChart(canvas);
            if (chart) {
                chart.destroy();
            }
        } catch (err) {
            // 忽略错误，可能图表已经被销毁
        }
    });
}

// 防止重复加载的标记
let isLoadingDashboard = false;

export async function loadDashboard() {
    // 如果正在加载，直接返回
    if (isLoadingDashboard) {
        console.log('[Dashboard] 正在加载中，跳过重复调用');
        return;
    }
    
    try {
        isLoadingDashboard = true;
        destroyCharts();

        const month = document.getElementById('dashboardMonth')?.value || new Date().toISOString().slice(0, 7);
        const status = document.getElementById('dashboardStatus')?.value || '';
        const businessType = document.getElementById('dashboardBusinessType')?.value || '';
        // 注意：role 参数用于手动筛选特定角色的数据（如果有筛选器）
        // 但后端主要使用 X-Role header（当前角色）来过滤数据
        const role = document.getElementById('dashboardRole')?.value || '';

        const params = new URLSearchParams();
        if (month) params.append('month', month);
        if (status) params.append('status', status);
        if (businessType) params.append('businessType', businessType);
        if (role) params.append('role', role);
        
        // 添加调试日志，确认当前角色和请求参数
        console.log('[Dashboard] 加载看板数据');
        console.log('[Dashboard] 当前角色 (state.currentRole):', state.currentRole);
        console.log('[Dashboard] 筛选参数 - month:', month, 'status:', status, 'businessType:', businessType, 'role:', role || '(无)');
        console.log('[Dashboard] API 请求 URL:', `/kpi/dashboard?${params.toString()}`);

        const res = await apiFetch(`/kpi/dashboard?${params.toString()}`);
        const result = await res.json();

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
    } finally {
        // 确保无论成功还是失败，都重置加载标记
        isLoadingDashboard = false;
        console.log('[Dashboard] 加载完成，重置加载标记');
    }
}

// 统一判断当前角色是否可以查看金额（与项目列表/详情一致）
const canViewProjectAmount = () => {
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    if (!currentRole) return false;
    const allowed = ['admin', 'finance', 'sales', 'part_time_sales', 'admin_staff'];
    return allowed.includes(currentRole);
};

function renderDashboardTodayInfo(data) {
    // 基于当前选择的角色判断，而不是用户拥有的所有角色
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isSales = currentRole === 'sales' || currentRole === 'part_time_sales';
    const isAdmin = currentRole === 'admin';
    const isFinance = currentRole === 'finance';
    const isPM = currentRole === 'pm';
    const isWorker = currentRole === 'translator' || currentRole === 'reviewer' || currentRole === 'layout' || currentRole === 'part_time_translator';
    // 是否允许在看板卡片上显示金额
    const canViewAmount = canViewProjectAmount();
    const showSalesAmount = isSales && !isAdmin && !isFinance && canViewAmount;
    const showPMDelivery = isPM && !isAdmin && !isFinance;

    let todayInfoHtml = '';

    if (showSalesAmount) {
        todayInfoHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px;">
                ${data.todayDeals && canViewAmount ? `
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
                ${data.todayDelivery && canViewAmount ? `
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

    if (showPMDelivery && data.todayDelivery && canViewAmount) {
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
                                            <button data-click="viewProject('${p.projectId}')" class="dashboard-project-btn" style="background: rgba(255, 255, 255, 0.2); color: white; border: 1px solid rgba(255, 255, 255, 0.3); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s;">
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

    // 基于当前选择的角色判断，而不是用户拥有的所有角色
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isSales = currentRole === 'sales' || currentRole === 'part_time_sales';
    const isAdmin = currentRole === 'admin';
    const isFinance = currentRole === 'finance';
    const canViewAmount = canViewProjectAmount();
    const showSalesAmount = isSales && !isAdmin && !isFinance && canViewAmount;
    const showKPI = data.kpiTotal !== undefined || data.kpiByRole !== undefined;

    const cards = `
        <div class="card-grid">
            <div class="card stat-card stat-primary" data-click="navigateFromDashboardCard('projects')">
                <div class="stat-icon">📊</div>
                <div class="stat-content">
                    <div class="card-title">当月项目数</div>
                    <div class="card-value">${data.projectCount || 0}</div>
                    <div class="card-desc">月份：${data.month}</div>
                </div>
            </div>
            ${showSalesAmount && canViewAmount && data.totalProjectAmount !== undefined ? `
            <div class="card stat-card stat-success" data-click="navigateFromDashboardCard('projects')">
                <div class="stat-icon">💰</div>
                <div class="stat-content">
                    <div class="card-title">成交额合计</div>
                    <div class="card-value">¥${(data.totalProjectAmount || 0).toLocaleString()}</div>
                    <div class="card-desc">根据筛选条件汇总</div>
                </div>
            </div>
            ` : ''}
            ${!showSalesAmount && canViewAmount && data.totalProjectAmount !== undefined ? `
            <div class="card stat-card stat-success" data-click="navigateFromDashboardCard('projects')">
                <div class="stat-icon">💰</div>
                <div class="stat-content">
                    <div class="card-title">项目金额合计</div>
                    <div class="card-value">¥${(data.totalProjectAmount || 0).toLocaleString()}</div>
                    <div class="card-desc">可见范围内金额</div>
                </div>
            </div>
            ` : ''}
            ${showKPI ? `
            <div class="card stat-card stat-info" data-click="navigateFromDashboardCard('kpi')">
                <div class="stat-icon">📈</div>
                <div class="stat-content">
                    <div class="card-title">KPI合计</div>
                    <div class="card-value">${(data.kpiTotal || 0).toLocaleString()} 分</div>
                    <div class="card-desc">根据角色权限汇总（兼职岗位按元，专职岗位按分）</div>
                </div>
            </div>
            ` : ''}
            <div class="card stat-card stat-primary" data-click="navigateFromDashboardCard('projects', 'in_progress')">
                <div class="stat-icon">✅</div>
                <div class="stat-content">
                    <div class="card-title">完成率</div>
                    <div class="card-value">${completionRate}%</div>
                    <div class="subtext">完成/总项目：${completed}/${total}</div>
                </div>
            </div>
            <div class="card stat-card stat-warning" data-click="navigateFromDashboardCard('projects', 'in_progress')">
                <div class="stat-icon">🔄</div>
                <div class="stat-content">
                    <div class="card-title">进行中</div>
                    <div class="card-value">${inProgress}</div>
                    <div class="subtext">当前执行的项目</div>
                </div>
            </div>
            <div class="card stat-card stat-success" data-click="navigateFromDashboardCard('projects', 'completed')">
                <div class="stat-icon">✓</div>
                <div class="stat-content">
                    <div class="card-title">已完成</div>
                    <div class="card-value">${completed}</div>
                    <div class="subtext">本月完成项目</div>
                </div>
            </div>
            <div class="card stat-card stat-info" data-click="navigateFromDashboardCard('projects', 'pending')">
                <div class="stat-icon">⏳</div>
                <div class="stat-content">
                    <div class="card-title">待开始</div>
                    <div class="card-value">${pending}</div>
                    <div class="subtext">待排期项目</div>
                </div>
            </div>
            <div class="card stat-card stat-danger" data-click="navigateFromDashboardCard('paymentOverdue')">
                <div class="stat-icon">⚠️</div>
                <div class="stat-content">
                    <div class="card-title">回款预警</div>
                    <div class="card-value">${(data.paymentWarnings?.length || 0)}</div>
                    <div class="card-desc">逾期未回款项目</div>
                </div>
            </div>
            <div class="card stat-card stat-danger" data-click="navigateFromDashboardCard('deliveryOverdue')">
                <div class="stat-icon">🚨</div>
                <div class="stat-content">
                    <div class="card-title">交付逾期</div>
                    <div class="card-value">${(data.deliveryWarnings?.length || 0)}</div>
                    <div class="card-desc">截止已过未完成</div>
                </div>
            </div>
            ${paymentRate !== null ? `
            <div class="card stat-card stat-success" data-click="navigateFromDashboardCard('receivables')">
                <div class="stat-icon">💵</div>
                <div class="stat-content">
                    <div class="card-title">回款完成率</div>
                    <div class="card-value">${paymentRate}%</div>
                    <div class="subtext">已回款/项目金额</div>
                </div>
            </div>
            ` : ''}
            <div class="card stat-card stat-info" data-click="navigateFromDashboardCard('recentCompleted')">
                <div class="stat-icon">📅</div>
                <div class="stat-content">
                    <div class="card-title">近7天完成</div>
                    <div class="card-value">${recentCompleted}</div>
                    <div class="subtext">近7天完成项目数</div>
                </div>
            </div>
            <div class="card stat-card stat-danger" data-click="navigateFromDashboardCard('paymentOverdue')">
                <div class="stat-icon">⚠️</div>
                <div class="stat-content">
                    <div class="card-title">近7天回款预警</div>
                    <div class="card-value">${recentPaymentOverdue}</div>
                    <div class="card-desc">近7天逾期回款项目</div>
                </div>
            </div>
            <div class="card stat-card stat-danger" data-click="navigateFromDashboardCard('recentDeliveryOverdue')">
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

function renderDashboardCharts(data) {
    destroyCharts();

    // 基于当前选择的角色判断，而不是用户拥有的所有角色
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isSales = currentRole === 'sales' || currentRole === 'part_time_sales';
    const isAdmin = currentRole === 'admin';
    const isFinance = currentRole === 'finance';
    const canViewAmount = canViewProjectAmount();
    const showSalesAmount = isSales && !isAdmin && !isFinance && canViewAmount;

    const charts = [];
    let chartIndex = 0;

    // KPI按角色（销售/兼职销售不显示）
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
                    // 检查 canvas 是否已经被使用，如果是，先销毁旧图表
                    const existingChart = Chart.getChart(ctx);
                    if (existingChart) {
                        existingChart.destroy();
                    }
                    
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
                                        callback: (value) => value.toLocaleString()
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
                // 检查 canvas 是否已经被使用，如果是，先销毁旧图表
                const existingChart = Chart.getChart(ctx);
                if (existingChart) {
                    existingChart.destroy();
                }
                
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
                            legend: { position: 'bottom' },
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
                // 检查 canvas 是否已经被使用，如果是，先销毁旧图表
                const existingChart = Chart.getChart(ctx);
                if (existingChart) {
                    existingChart.destroy();
                }
                
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
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { stepSize: 1 }
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

    // 回款即将到期
    charts.push(`
        <div class="card" data-click="navigateFromDashboardCard('paymentDueSoon')" style="cursor:pointer;">
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

    // 交付逾期
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

    // 趋势
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
                // 检查 canvas 是否已经被使用，如果是，先销毁旧图表
                const existingChart = Chart.getChart(ctx);
                if (existingChart) {
                    existingChart.destroy();
                }
                
                const chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: trend.map(t => t.month),
                        datasets: [{
                            label: showSalesAmount ? (canViewAmount ? '成交额' : 'KPI') : 'KPI',
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
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (context) => {
                                        const value = (context.parsed.y || 0).toLocaleString();
                                        if (showSalesAmount && canViewAmount) {
                                            return `¥${value}`;
                                        }
                                        return `${value} 分`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { 
                                    callback: (value) => {
                                        const v = value.toLocaleString();
                                        if (showSalesAmount && canViewAmount) {
                                            return '¥' + v;
                                        }
                                        return v;
                                    }
                                },
                                grid: { color: 'rgba(0, 0, 0, 0.05)' }
                            },
                            x: { grid: { display: false } }
                        }
                    }
                });
                chartInstances.push(chart);
            }
        }, 100);
    }

    const el = document.getElementById('dashboardCharts');
    if (el) el.innerHTML = `<div class="chart-grid">${charts.join('')}</div>`;
}

export async function navigateFromDashboardCard(target, overrideStatus) {
    const dashMonth = document.getElementById('dashboardMonth')?.value || '';
    const dashStatus = document.getElementById('dashboardStatus')?.value || '';
    const dashBiz = document.getElementById('dashboardBusinessType')?.value || '';
    const dashRole = document.getElementById('dashboardRole')?.value || '';

    const applyProjectFilters = async () => {
        console.log('[Dashboard→Projects] applyProjectFilters params', { dashMonth, dashStatus, dashBiz, dashRole, overrideStatus, target });
        state.projectFilterMonth = dashMonth || '';
        // 重置项目列表页码与搜索条件，避免之前的搜索导致空结果
        state.projectPage = 1;
        const searchInput = document.getElementById('projectSearch');
        if (searchInput) searchInput.value = '';

        const statusSel = document.getElementById('projectStatusFilter');
        const bizSel = document.getElementById('projectBizFilter');
        // 如果overrideStatus有值，优先使用overrideStatus；否则使用dashStatus
        const finalStatus = overrideStatus !== undefined && overrideStatus !== null ? overrideStatus : dashStatus;
        if (statusSel && finalStatus !== undefined && finalStatus !== '') {
            statusSel.value = finalStatus;
        } else if (statusSel && overrideStatus !== undefined && overrideStatus !== null) {
            // 即使finalStatus是空字符串，如果overrideStatus明确传递了值，也要设置
            statusSel.value = overrideStatus;
        }
        if (bizSel && dashBiz !== undefined) bizSel.value = dashBiz;

        console.log('[Dashboard→Projects] state flags before render', {
            projectFilterMonth: state.projectFilterMonth,
            projectFilterDeliveryOverdue: state.projectFilterDeliveryOverdue,
            projectFilterRecentCompleted: state.projectFilterRecentCompleted,
            finalStatus
        });

        // 构建与 dashboard 相同的筛选条件
        const filters = {};
        if (dashMonth) filters.month = dashMonth;
        // 优先使用overrideStatus，如果overrideStatus没有值，再使用dashStatus
        if (overrideStatus !== undefined && overrideStatus !== null && overrideStatus !== '') {
            filters.status = overrideStatus;
        } else if (dashStatus) {
            filters.status = dashStatus;
        }
        if (dashBiz) filters.businessType = dashBiz;
        if (dashRole) filters.role = dashRole;

        // 始终重新加载项目，使用与 dashboard 相同的筛选条件
        console.log('[Dashboard→Projects] loading projects with filters', filters);
        try {
            await loadProjects(filters);
            renderProjects();
        } catch (err) {
            console.error('[Dashboard→Projects] loadProjects failed', err);
        }
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
            // 默认从看板跳转时关闭特殊过滤
            state.projectFilterDeliveryOverdue = false;
            state.projectFilterRecentCompleted = false;
            applyProjectFilters();
            break;
        case 'recentCompleted':
            showSection('projects');
            state.projectFilterDeliveryOverdue = false;
            state.projectFilterRecentCompleted = true;
            {
                const statusSel = document.getElementById('projectStatusFilter');
                if (statusSel) statusSel.value = 'completed';
            }
            applyProjectFilters();
            break;
        case 'paymentOverdue':
            state.salesFinanceView = true;
            showSection('finance');
            window.showFinanceSection?.('paymentRecords');
            applyFinanceMonth('paymentMonth');
            window.loadPaymentRecordsProjects?.();
            break;
        case 'paymentDueSoon':
            state.salesFinanceView = true;
            showSection('finance');
            window.showFinanceSection?.('paymentRecords');
            applyFinanceMonth('paymentMonth');
            window.loadPaymentRecordsProjects?.();
            break;
        case 'receivables':
            // 跳转到独立的回款完成率详情页（不依赖财务导航）
            state.hideFinanceNav = false;
            state.salesFinanceView = false;
            showSection('paymentDetail');
            setTimeout(() => loadPaymentCompletionDetail(), 0);
            break;
        case 'deliveryOverdue':
            showSection('projects');
            {
                const statusSel = document.getElementById('projectStatusFilter');
                if (statusSel) statusSel.value = overrideStatus || dashStatus || 'in_progress';
            }
            state.projectFilterDeliveryOverdue = true;
            state.projectFilterRecentDeliveryOverdue = false; // 不使用近7天限制
            state.projectFilterRecentCompleted = false;
            applyProjectFilters();
            break;
        case 'recentDeliveryOverdue':
            showSection('projects');
            state.projectFilterDeliveryOverdue = false; // 不使用全部交付逾期
            state.projectFilterRecentDeliveryOverdue = true; // 使用近7天交付逾期
            state.projectFilterRecentCompleted = false;
            {
                const statusSel = document.getElementById('projectStatusFilter');
                if (statusSel) statusSel.value = '';
            }
            applyProjectFilters();
            break;
        case 'kpi':
            showSection('kpi');
            break;
        default:
            showSection('dashboard');
    }
}

// 挂载到 Window 供 HTML 调用


