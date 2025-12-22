// Finance module - updated exports: prevPaymentRecordsProjectsPage, nextPaymentRecordsProjectsPage, prevInvoiceProjectsPage, nextInvoiceProjectsPage
import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, showAlert, getStatusText, getStatusBadgeClass, getBusinessTypeText, getRoleText, hasPermission } from '../core/utils.js';
import { API_BASE } from '../core/config.js';

// 缓存与分页状态（模块私有）
let receivablesCache = [];
let receivablePage = 1;

let paymentRecordsProjectsCache = [];
let paymentRecordsProjectsPage = 1;
let expandedPaymentProjectId = null;

let invoiceProjectsCache = [];
let invoiceProjectsPage = 1;
let expandedInvoiceProjectId = null;

// 角色判断
function isFinanceRole() {
    const roles = state.currentUser?.roles || [];
    return roles.includes('admin') || roles.includes('finance');
}

// ============ 应收对账 ============
export async function loadReceivables() {
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

    const res = await apiFetch(`/finance/receivables?${params.toString()}`);
    const data = await res.json();
    if (!data.success) {
        showAlert('receivablesList', data.message || '加载失败', 'error');
        return;
    }
    receivablesCache = data.data || [];
    receivablePage = 1;
    renderReceivables();
}

export function renderReceivables() {
    const pageSizeSel = document.getElementById('financePageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value || '10', 10) : 10;
    const totalPages = Math.max(1, Math.ceil(receivablesCache.length / pageSize));
    if (receivablePage > totalPages) receivablePage = totalPages;
    const start = (receivablePage - 1) * pageSize;
    const pageData = receivablesCache.slice(start, start + pageSize);

    const paymentStatusText = {
        unpaid: '未支付',
        partially_paid: '部分支付',
        paid: '已支付'
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
            <td><span class="badge ${paymentStatusBadge}">${paymentStatusText[paymentStatus] || paymentStatus}</span></td>
            <td>${r.hasInvoice ? `<span class="badge badge-info">已开票${r.invoiceCount > 0 ? `(${r.invoiceCount})` : ''}</span>` : '<span class="badge badge-secondary">未开票</span>'}</td>
            <td>${r.overdue ? '<span class="badge badge-danger">逾期</span>' : ''}</td>
        </tr>
    `;
    }).join('');

    document.getElementById('receivablesList').innerHTML = `
        <table class="table-sticky">
            <thead>
                <tr>
                    <th>项目编号</th><th>项目名称</th><th>客户</th><th>销售</th>
                    <th>项目金额</th><th>已回款</th><th>未回款</th><th>约定回款日</th>
                    <th>回款状态</th><th>发票状态</th><th>逾期</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="11" style="text-align:center;">暂无数据</td></tr>'}
            </tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${receivablePage<=1?'disabled':''} data-click="prevReceivablePage()">上一页</button>
            <span style="align-self:center;">${receivablePage} / ${totalPages}</span>
            <button class="btn-small" ${receivablePage>=totalPages?'disabled':''} data-click="nextReceivablePage()">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${receivablePage}" style="width:70px;padding:6px;" data-change="jumpReceivablePage(this.value, ${totalPages})">
        </div>
    `;
}

export function jumpReceivablePage(val, total) {
    const page = Math.min(Math.max(parseInt(val || 1, 10), 1), total);
    receivablePage = page;
    renderReceivables();
}

export function prevReceivablePage() {
    if (receivablePage > 1) {
        receivablePage = Math.max(1, receivablePage - 1);
        renderReceivables();
    }
}

export function nextReceivablePage() {
    const pageSizeSel = document.getElementById('financePageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value || '10', 10) : 10;
    const totalPages = Math.max(1, Math.ceil(receivablesCache.length / pageSize));
    if (receivablePage < totalPages) {
        receivablePage = Math.min(totalPages, receivablePage + 1);
        renderReceivables();
    }
}

export function exportReceivables() {
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

    apiFetch(`/finance/receivables/export?${params.toString()}`)
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
        .catch(error => showToast('导出失败: ' + error.message, 'error'));
}

// ============ 发票管理 ============
export async function loadInvoices() {
    const status = document.getElementById('invoiceStatus')?.value || '';
    const type = document.getElementById('invoiceTypeFilter')?.value || '';
    const projectId = document.getElementById('invoiceProjectId')?.value || '';
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    if (projectId) params.append('projectId', projectId);

    const res = await apiFetch(`/finance/invoice?${params.toString()}`);
    const data = await res.json();
    if (!data.success) {
        showAlert('invoiceList', data.message || '加载失败', 'error');
        return;
    }

    const projectMap = {};
    if (state.allProjectsCache?.length) {
        state.allProjectsCache.forEach(p => { projectMap[p._id] = p; });
    }

    const rows = (data.data || []).map(i => {
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
                    <th>发票号</th><th>项目</th><th>金额</th><th>开票日期</th>
                    <th>状态</th><th>类型</th><th>备注</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="7" style="text-align:center;">暂无发票</td></tr>'}
            </tbody>
        </table>
    `;
}

export async function addInvoice() {
    if (!isFinanceRole()) {
        showToast('无权限新增发票', 'error');
        return;
    }
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
        const projectRes = await apiFetch(`/projects/${projectId}`);
        const projectData = await projectRes.json();
        if (!projectData.success) {
            showToast('获取项目信息失败', 'error');
            return;
        }
        const project = projectData.data;
        const projectAmount = project.projectAmount || 0;

        const invoiceRes = await apiFetch(`/finance/invoice?projectId=${projectId}`);
        const invoiceData = await invoiceRes.json();

        if (invoiceData.success) {
            const existingInvoices = invoiceData.data || [];
            const totalInvoiceAmount = existingInvoices
                .filter(inv => inv.status !== 'void')
                .reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
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

        const res = await apiFetch(`/finance/invoice/${projectId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '新增失败', 'error');
            return;
        }
        document.getElementById('invoiceNumber').value = '';
        document.getElementById('invoiceAmount').value = '';
        document.getElementById('invoiceDate').value = '';
        document.getElementById('invoiceNote').value = '';
        loadInvoiceProjects();
        showToast('发票已新增', 'success');
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

// 在项目详情中新增发票
export async function addInvoiceForProject(e, projectId) {
    if (e && e.preventDefault) e.preventDefault();
    if (!isFinanceRole()) {
        showToast('无权限新增发票', 'error');
        return;
    }
    
    const invoiceNumber = document.getElementById(`invoiceNumber_${projectId}`)?.value;
    const amount = document.getElementById(`invoiceAmount_${projectId}`)?.value;
    const issueDate = document.getElementById(`invoiceDate_${projectId}`)?.value;
    const type = document.getElementById(`invoiceType_${projectId}`)?.value || 'vat';
    const note = document.getElementById(`invoiceNote_${projectId}`)?.value || '';
    
    if (!invoiceNumber || !amount || !issueDate) {
        showToast('请填写发票号、金额和开票日期', 'error');
        return;
    }
    
    const invoiceAmount = parseFloat(amount);
    if (isNaN(invoiceAmount) || invoiceAmount <= 0) {
        showToast('发票金额必须大于0', 'error');
        return;
    }

    try {
        const projectRes = await apiFetch(`/projects/${projectId}`);
        const projectData = await projectRes.json();
        if (!projectData.success) {
            showToast('获取项目信息失败', 'error');
            return;
        }
        const project = projectData.data;
        const projectAmount = project.projectAmount || 0;

        const invoiceRes = await apiFetch(`/finance/invoice?projectId=${projectId}`);
        const invoiceData = await invoiceRes.json();

        if (invoiceData.success) {
            const existingInvoices = invoiceData.data || [];
            const totalInvoiceAmount = existingInvoices
                .filter(inv => inv.status !== 'void')
                .reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
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
            type,
            note
        };

        const res = await apiFetch(`/finance/invoice/${projectId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '新增失败', 'error');
            return;
        }
        
        showToast('发票已新增', 'success');
        // 清空表单
        document.getElementById(`invoiceNumber_${projectId}`).value = '';
        document.getElementById(`invoiceAmount_${projectId}`).value = '';
        document.getElementById(`invoiceNote_${projectId}`).value = '';
        // 重新加载发票记录和项目列表
        await loadInvoiceRecordsForProject(projectId);
        loadInvoiceProjects();
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

// ============ 回款管理 ============
export async function addPaymentRecord() {
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
        const res = await apiFetch(`/finance/payment/${projectId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '新增失败', 'error');
            return;
        }
        showToast('回款已记录', 'success');
        document.getElementById('paymentAmount').value = '';
        document.getElementById('paymentReference').value = '';
        document.getElementById('paymentInvoiceNumber').value = '';
        loadReceivables();
        loadPaymentRecords(projectId);
        loadPaymentRecordsProjects();
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

// 在项目详情中新增回款记录
export async function addPaymentRecordForProject(e, projectId) {
    if (e && e.preventDefault) e.preventDefault();
    if (!isFinanceRole()) {
        showToast('无权限新增回款', 'error');
        return;
    }
    
    const amount = document.getElementById(`paymentAmount_${projectId}`)?.value;
    const receivedAt = document.getElementById(`paymentDate_${projectId}`)?.value;
    const method = document.getElementById(`paymentMethod_${projectId}`)?.value || 'bank';
    const reference = document.getElementById(`paymentReference_${projectId}`)?.value || '';
    const invoiceNumber = document.getElementById(`paymentInvoiceNumber_${projectId}`)?.value || '';

    if (!amount || !receivedAt) {
        showToast('请填写金额和回款日期', 'error');
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
        const res = await apiFetch(`/finance/payment/${projectId}`, {
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
        document.getElementById(`paymentAmount_${projectId}`).value = '';
        document.getElementById(`paymentReference_${projectId}`).value = '';
        document.getElementById(`paymentInvoiceNumber_${projectId}`).value = '';
        // 重新加载回款记录和项目列表
        await loadPaymentRecordsForProject(projectId);
        loadPaymentRecordsProjects();
        loadReceivables();
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

export async function loadPaymentRecords(projectId) {
    if (!projectId) {
        const container = document.getElementById('paymentRecords');
        if (container) container.innerHTML = '<div class="card-desc">请在上方选择项目后点击新增或刷新以查看回款记录</div>';
        return;
    }
    try {
        const paymentStatus = document.getElementById('paymentRecordStatus')?.value || '';
        const params = new URLSearchParams();
        if (paymentStatus) params.append('paymentStatus', paymentStatus);

        const res = await apiFetch(`/finance/payment/${projectId}?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
            showAlert('paymentRecords', data.message || '加载失败', 'error');
            return;
        }

        const projectRes = await apiFetch(`/projects/${projectId}`);
        const projectData = await projectRes.json();
        const project = projectData.success ? projectData.data : null;

        const paymentStatusText = {
            unpaid: '未支付',
            partially_paid: '部分支付',
            paid: '已支付'
        };

        const totalReceived = (data.data || []).reduce((sum, r) => sum + (r.amount || 0), 0);
        const projectAmount = project?.projectAmount || 0;
        const remainingAmount = Math.max(0, projectAmount - totalReceived);
        const projectPaymentStatus = project?.payment?.paymentStatus || 'unpaid';
        const currentFilterStatus = document.getElementById('paymentRecordStatus')?.value || '';
        const filterStatusText = currentFilterStatus === 'unpaid' ? '未支付' :
            currentFilterStatus === 'partially_paid' ? '部分支付' :
                currentFilterStatus === 'paid' ? '已支付' : '全部';

        if (!data.data || data.data.length === 0) {
            document.getElementById('paymentRecords').innerHTML = `
                ${project ? `
                <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
                    <div><div style="font-size: 12px; color: #666;">项目金额</div><div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div></div>
                    <div><div style="font-size: 12px; color: #666;">已回款</div><div style="font-size: 16px; font-weight: bold; color: #10b981;">¥0</div></div>
                    <div><div style="font-size: 12px; color: #666;">剩余应收</div><div style="font-size: 16px; font-weight: bold; color: #f59e0b;">¥${projectAmount.toLocaleString()}</div></div>
                    <div>
                        <div style="font-size: 12px; color: #666;">回款状态</div>
                        <div><span class="badge ${projectPaymentStatus === 'paid' ? 'badge-success' : projectPaymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">${paymentStatusText[projectPaymentStatus] || projectPaymentStatus}</span></div>
                    </div>
                </div>
                ` : ''}
                <div class="card-desc">${currentFilterStatus ? `没有${filterStatusText}状态的回款记录` : '暂无回款记录'}</div>
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
                ${canManageFinance ? `<td><button class="btn-small btn-danger" data-click="removePaymentRecord('${r._id}', '${projectId}')">删除</button></td>` : ''}
            </tr>
        `).join('');

        document.getElementById('paymentRecords').innerHTML = `
            ${project ? `
            <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px;">
                <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 8px;">
                    <div><div style="font-size: 12px; color: #666;">项目金额</div><div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div></div>
                    <div><div style="font-size: 12px; color: #666;">已回款</div><div style="font-size: 16px; font-weight: bold; color: #10b981;">¥${totalReceived.toLocaleString()}</div></div>
                    <div><div style="font-size: 12px; color: #666;">剩余应收</div><div style="font-size: 16px; font-weight: bold; color: ${remainingAmount > 0 ? '#f59e0b' : '#10b981'};">¥${remainingAmount.toLocaleString()}</div></div>
                    <div>
                        <div style="font-size: 12px; color: #666;">回款状态</div>
                        <div><span class="badge ${projectPaymentStatus === 'paid' ? 'badge-success' : projectPaymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">${paymentStatusText[projectPaymentStatus] || projectPaymentStatus}</span></div>
                    </div>
                </div>
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid #e0e7ff;">
                    <div style="font-size: 12px; color: #666;">筛选条件: <span style="color: #333; font-weight: 500;">${filterStatusText}</span></div>
                    <div style="font-size: 12px; color: #666;">显示结果: <span style="color: #333; font-weight: 500;">共 ${data.data.length} 条回款记录</span></div>
                    ${currentFilterStatus ? `<button class="btn-small" data-click="clearPaymentRecordFilter('${projectId}')" style="padding: 4px 8px; font-size: 12px;">清除筛选</button>` : ''}
                </div>
            </div>
            ` : ''}
            <table class="table-sticky">
                <thead>
                    <tr>
                        <th>回款日期</th><th>金额</th><th>支付方式</th><th>凭证号</th>
                        <th>关联发票号</th><th>记录人</th>${canManageFinance ? '<th>操作</th>' : ''}
                    </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="${canManageFinance ? 7 : 6}" style="text-align:center;">暂无回款记录</td></tr>`}</tbody>
            </table>
        `;
    } catch (error) {
        showAlert('paymentRecords', '加载失败: ' + error.message, 'error');
    }
}

export function clearPaymentRecordFilter(projectId) {
    const statusSelect = document.getElementById('paymentRecordStatus');
    if (statusSelect) {
        statusSelect.value = '';
        loadPaymentRecords(projectId);
    }
}

export async function removePaymentRecord(recordId, projectId) {
    if (!isFinanceRole()) {
        showToast('无权限删除回款记录', 'error');
        return;
    }
    if (!confirm('确定删除该回款记录？（不会自动回滚项目回款总额）')) return;
    try {
        const res = await apiFetch(`/finance/payment/${recordId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) {
            alert(data.message || '删除失败');
            return;
        }
        showToast('已删除回款记录', 'success');
        loadPaymentRecords(projectId);
        loadReceivables();
        loadPaymentRecordsProjects();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

export async function loadPaymentRecordsProjects() {
    const month = document.getElementById('paymentMonth')?.value || '';
    const startDate = document.getElementById('paymentStartDate')?.value || '';
    const endDate = document.getElementById('paymentEndDate')?.value || '';
    const status = document.getElementById('paymentStatusFilter')?.value || '';
    const paymentStatus = document.getElementById('paymentProjectPaymentStatus')?.value || '';
    const customerId = document.getElementById('paymentCustomer')?.value || '';
    // 销售角色不需要传递salesId，后端会自动过滤为自己创建的项目
    const salesId = isFinanceRole() ? (document.getElementById('paymentSales')?.value || '') : '';

    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (paymentStatus) params.append('paymentStatus', paymentStatus);
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
    // 只有财务/管理员才传递salesId参数
    if (salesId && isFinanceRole()) {
        params.append('salesId', salesId);
    }

    try {
        const res = await apiFetch(`/finance/receivables?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
            showAlert('paymentProjectsList', data.message || '加载失败', 'error');
            return;
        }
        paymentRecordsProjectsCache = data.data || [];
        paymentRecordsProjectsPage = 1;
        renderPaymentRecordsProjects();
    } catch (error) {
        console.error('[loadPaymentRecordsProjects] 加载失败:', error);
        showAlert('paymentProjectsList', '加载失败: ' + error.message, 'error');
    }
}

export function renderPaymentRecordsProjects() {
    const pageSizeSel = document.getElementById('paymentPageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value || '10', 10) : 10;
    const totalPages = Math.max(1, Math.ceil(paymentRecordsProjectsCache.length / pageSize));
    if (paymentRecordsProjectsPage > totalPages) paymentRecordsProjectsPage = totalPages;
    const start = (paymentRecordsProjectsPage - 1) * pageSize;
    const pageData = paymentRecordsProjectsCache.slice(start, start + pageSize);

    const paymentStatusText = { unpaid: '未支付', partially_paid: '部分支付', paid: '已支付' };

    const rows = pageData.map(r => {
        const paymentStatus = r.paymentStatus || 'unpaid';
        const paymentStatusBadge = paymentStatus === 'paid' ? 'badge-success' :
            paymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger';
        const projectId = r.id || r.projectId;
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
            <td><span class="badge ${paymentStatusBadge}">${paymentStatusText[paymentStatus] || paymentStatus}</span></td>
            <td><button class="btn-small" data-click="togglePaymentRecords('${projectId}')" style="padding: 4px 8px;">${isExpanded ? '收起' : '查看回款记录'}</button></td>
        </tr>
        ${isExpanded ? `
        <tr id="payment-records-${projectId}">
            <td colspan="10" style="padding: 0;">
                <div id="payment-records-detail-${projectId}" style="padding: 16px; background: #f9fafb;">
                    <div style="text-align: center; color: #666;">加载中...</div>
                </div>
            </td>
        </tr>` : ''}`;
    }).join('');

    const month = document.getElementById('paymentMonth')?.value || '';
    const status = document.getElementById('paymentStatusFilter')?.value || '';
    const paymentStatus = document.getElementById('paymentProjectPaymentStatus')?.value || '';
    const customerId = document.getElementById('paymentCustomer')?.value || '';
    const salesId = document.getElementById('paymentSales')?.value || '';

    const filters = [];
    if (month) filters.push(`月份: ${month}`);
    if (status) {
        const statusText = { pending: '待开始', in_progress: '进行中', completed: '已完成', cancelled: '已取消' };
        filters.push(`状态: ${statusText[status] || status}`);
    }
    if (paymentStatus) filters.push(`回款状态: ${paymentStatusText[paymentStatus] || paymentStatus}`);
    if (customerId) {
        const customer = state.allCustomers.find(c => c._id === customerId);
        if (customer) filters.push(`客户: ${customer.name}`);
    }
    if (salesId) {
        const sales = state.allUsers.find(u => u._id === salesId);
        if (sales) filters.push(`销售: ${sales.name}`);
    }

    document.getElementById('paymentProjectsList').innerHTML = `
        ${filters.length > 0 ? `
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px; background: #f0f9ff; border-radius: 4px; margin-bottom: 12px;">
            <div style="font-size: 12px; color: #666;">筛选条件: <span style="color: #333; font-weight: 500;">${filters.join(' | ')}</span></div>
            <div style="font-size: 12px; color: #666;">显示结果: <span style="color: #333; font-weight: 500;">共 ${paymentRecordsProjectsCache.length} 个项目</span></div>
            <button class="btn-small" data-click="clearPaymentRecordsFilters()" style="padding: 4px 8px; font-size: 12px;">清除筛选</button>
        </div>` : ''}
        <table class="table-sticky">
            <thead>
                <tr>
                    <th>项目编号</th><th>项目名称</th><th>客户</th><th>销售</th>
                    <th>项目金额</th><th>已回款</th><th>未回款</th><th>约定回款日</th><th>回款状态</th><th>操作</th>
                </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="10" style="text-align:center;">暂无数据</td></tr>'}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${paymentRecordsProjectsPage<=1?'disabled':''} data-click="prevPaymentRecordsProjectsPage()">上一页</button>
            <span style="align-self:center;">${paymentRecordsProjectsPage} / ${totalPages}</span>
            <button class="btn-small" ${paymentRecordsProjectsPage>=totalPages?'disabled':''} data-click="nextPaymentRecordsProjectsPage()">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${paymentRecordsProjectsPage}" style="width:70px;padding:6px;" data-change="jumpPaymentRecordsProjectsPage(this.value, ${totalPages})">
        </div>
    `;

    if (expandedPaymentProjectId) {
        setTimeout(() => loadPaymentRecordsForProject(expandedPaymentProjectId), 100);
    }
}

export function jumpPaymentRecordsProjectsPage(page, maxPage) {
    const p = Math.max(1, Math.min(maxPage, parseInt(page) || 1));
    paymentRecordsProjectsPage = p;
    renderPaymentRecordsProjects();
}

export function prevPaymentRecordsProjectsPage() {
    if (paymentRecordsProjectsPage > 1) {
        paymentRecordsProjectsPage = Math.max(1, paymentRecordsProjectsPage - 1);
        renderPaymentRecordsProjects();
    }
}

export function nextPaymentRecordsProjectsPage() {
    const pageSizeSel = document.getElementById('paymentPageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value || '10', 10) : 10;
    const totalPages = Math.max(1, Math.ceil(paymentRecordsProjectsCache.length / pageSize));
    if (paymentRecordsProjectsPage < totalPages) {
        paymentRecordsProjectsPage = Math.min(totalPages, paymentRecordsProjectsPage + 1);
        renderPaymentRecordsProjects();
    }
}

export function togglePaymentRecords(projectId) {
    const projectIdStr = String(projectId);
    if (expandedPaymentProjectId === projectIdStr) {
        expandedPaymentProjectId = null;
    } else {
        expandedPaymentProjectId = projectIdStr;
    }
    renderPaymentRecordsProjects();
}

export async function loadPaymentRecordsForProject(projectId) {
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

        const res = await apiFetch(`/finance/payment/${projectId}?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div style="text-align: center; color: #ef4444;">加载失败: ${data.message || '未知错误'}</div>`;
            return;
        }

        const projectRes = await apiFetch(`/projects/${projectId}`);
        const projectData = await projectRes.json();
        const project = projectData.success ? projectData.data : null;

        const paymentStatusText = { unpaid: '未支付', partially_paid: '部分支付', paid: '已支付' };
        const canManageFinance = isFinanceRole();

        // 如果没有回款记录，显示新增表单
        if (!data.data || data.data.length === 0) {
            const projectAmount = project?.projectAmount || 0;
            const projectPaymentStatus = project?.payment?.paymentStatus || 'unpaid';
            container.innerHTML = `
                <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
                    <div><div style="font-size: 12px; color: #666;">项目金额</div><div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div></div>
                    <div><div style="font-size: 12px; color: #666;">已回款</div><div style="font-size: 16px; font-weight: bold; color: #10b981;">¥0</div></div>
                    <div><div style="font-size: 12px; color: #666;">剩余应收</div><div style="font-size: 16px; font-weight: bold; color: #f59e0b;">¥${projectAmount.toLocaleString()}</div></div>
                    <div>
                        <div style="font-size: 12px; color: #666;">回款状态</div>
                        <div><span class="badge ${projectPaymentStatus === 'paid' ? 'badge-success' : projectPaymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">${paymentStatusText[projectPaymentStatus] || projectPaymentStatus}</span></div>
                    </div>
                </div>
                ${canManageFinance ? `
                <div class="card" style="margin-bottom: 12px; background: #f9fafb;">
                    <div class="card-title" style="font-size: 14px; margin-bottom: 8px;">新增回款记录</div>
                    <form id="addPaymentForm_${projectId}" data-submit="addPaymentRecordForProject(event, '${projectId}')" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">回款日期 <span style="color: #e74c3c;">*</span></label>
                            <input type="date" id="paymentDate_${projectId}" required style="padding: 6px; width: 100%;" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">金额 <span style="color: #e74c3c;">*</span></label>
                            <input type="number" step="0.01" id="paymentAmount_${projectId}" required style="padding: 6px; width: 100%;" placeholder="0.00">
                        </div>
                        <div style="flex: 1; min-width: 100px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">支付方式</label>
                            <select id="paymentMethod_${projectId}" style="padding: 6px; width: 100%;">
                                <option value="bank">银行转账</option>
                                <option value="cash">现金</option>
                                <option value="alipay">支付宝</option>
                                <option value="wechat">微信</option>
                            </select>
                        </div>
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">凭证号</label>
                            <input type="text" id="paymentReference_${projectId}" style="padding: 6px; width: 100%;" placeholder="可选">
                        </div>
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">关联发票号</label>
                            <input type="text" id="paymentInvoiceNumber_${projectId}" style="padding: 6px; width: 100%;" placeholder="可选">
                        </div>
                        <div>
                            <button type="submit" style="padding: 6px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">新增回款</button>
                        </div>
                    </form>
                </div>
                ` : ''}
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
                ${canManageFinance ? `<td><button class="btn-small btn-danger" data-click="removePaymentRecord('${r._id}', '${projectId}')">删除</button></td>` : ''}
            </tr>
        `).join('');

        const totalReceived = data.data.reduce((sum, r) => sum + (r.amount || 0), 0);
        const projectAmount = project?.projectAmount || 0;
        const remainingAmount = Math.max(0, projectAmount - totalReceived);
        const projectPaymentStatus = project?.payment?.paymentStatus || 'unpaid';

        container.innerHTML = `
            <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
                <div><div style="font-size: 12px; color: #666;">项目金额</div><div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div></div>
                <div><div style="font-size: 12px; color: #666;">已回款</div><div style="font-size: 16px; font-weight: bold; color: #10b981;">¥${totalReceived.toLocaleString()}</div></div>
                <div><div style="font-size: 12px; color: #666;">剩余应收</div><div style="font-size: 16px; font-weight: bold; color: ${remainingAmount > 0 ? '#f59e0b' : '#10b981'};">¥${remainingAmount.toLocaleString()}</div></div>
                <div>
                    <div style="font-size: 12px; color: #666;">回款状态</div>
                    <div><span class="badge ${projectPaymentStatus === 'paid' ? 'badge-success' : projectPaymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">${paymentStatusText[projectPaymentStatus] || projectPaymentStatus}</span></div>
                </div>
            </div>
            ${canManageFinance ? `
            <div class="card" style="margin-bottom: 12px; background: #f9fafb;">
                <div class="card-title" style="font-size: 14px; margin-bottom: 8px;">新增回款记录</div>
                <form id="addPaymentForm_${projectId}" data-submit="addPaymentRecordForProject(event, '${projectId}')" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">回款日期 <span style="color: #e74c3c;">*</span></label>
                        <input type="date" id="paymentDate_${projectId}" required style="padding: 6px; width: 100%;" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">金额 <span style="color: #e74c3c;">*</span></label>
                        <input type="number" step="0.01" id="paymentAmount_${projectId}" required style="padding: 6px; width: 100%;" placeholder="0.00">
                    </div>
                    <div style="flex: 1; min-width: 100px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">支付方式</label>
                        <select id="paymentMethod_${projectId}" style="padding: 6px; width: 100%;">
                            <option value="bank">银行转账</option>
                            <option value="cash">现金</option>
                            <option value="alipay">支付宝</option>
                            <option value="wechat">微信</option>
                        </select>
                    </div>
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">凭证号</label>
                        <input type="text" id="paymentReference_${projectId}" style="padding: 6px; width: 100%;" placeholder="可选">
                    </div>
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">关联发票号</label>
                        <input type="text" id="paymentInvoiceNumber_${projectId}" style="padding: 6px; width: 100%;" placeholder="可选">
                    </div>
                    <div>
                        <button type="submit" style="padding: 6px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">新增回款</button>
                    </div>
                </form>
            </div>
            ` : ''}
            <table class="table-sticky">
                <thead>
                    <tr>
                        <th>回款日期</th><th>金额</th><th>支付方式</th><th>凭证号</th>
                        <th>关联发票号</th><th>记录人</th>${canManageFinance ? '<th>操作</th>' : ''}
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div style="text-align: center; color: #ef4444;">加载失败: ${error.message}</div>`;
    }
}

export function clearPaymentRecordsFilters() {
    const ids = ['paymentMonth', 'paymentStartDate', 'paymentEndDate', 'paymentStatusFilter', 'paymentProjectPaymentStatus', 'paymentCustomer', 'paymentSales'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadPaymentRecordsProjects();
}

// ============ 发票项目列表（用于选择项目开票） ============
export async function loadInvoiceProjects() {
    const month = document.getElementById('invoiceMonth')?.value || '';
    const status = document.getElementById('invoiceStatusFilter')?.value || '';
    const type = document.getElementById('invoiceTypeFilter')?.value || '';
    const customerId = document.getElementById('invoiceCustomer')?.value || '';
    const salesId = isFinanceRole() ? (document.getElementById('invoiceSales')?.value || '') : (state.currentUser?._id || '');
    const params = new URLSearchParams();
    if (month) {
        const [y, m] = month.split('-');
        const end = new Date(y, m, 0).toISOString();
        params.append('dueBefore', end);
    }
    if (customerId) params.append('customerId', customerId);
    if (salesId) params.append('salesId', salesId);

    const res = await apiFetch(`/finance/receivables?${params.toString()}`);
    const data = await res.json();
    if (!data.success) {
        showAlert('invoiceProjectsList', data.message || '加载失败', 'error');
        return;
    }
    let projects = data.data || [];

    if (status || type) {
        const invoiceParams = new URLSearchParams();
        if (status) invoiceParams.append('status', status);
        if (type) invoiceParams.append('type', type);

        const invoiceRes = await apiFetch(`/finance/invoice?${invoiceParams.toString()}`);
        const invoiceData = await invoiceRes.json();

        if (invoiceData.success && invoiceData.data) {
            const projectIdsWithMatchingInvoices = new Set(
                invoiceData.data.map(inv => {
                    const pid = inv.projectId;
                    return String(pid?._id || pid || '');
                })
            );
            if (status === 'pending') {
                projects = projects.filter(p => !projectIdsWithMatchingInvoices.has(String(p.id || p.projectId)));
            } else {
                projects = projects.filter(p => projectIdsWithMatchingInvoices.has(String(p.id || p.projectId)));
            }
        } else if (status !== 'pending') {
            projects = [];
        }
    }

    invoiceProjectsCache = projects;
    invoiceProjectsPage = 1;
    renderInvoiceProjects();
}

export function renderInvoiceProjects() {
    const pageSizeSel = document.getElementById('invoicePageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value || '10', 10) : 10;
    const totalPages = Math.max(1, Math.ceil(invoiceProjectsCache.length / pageSize));
    if (invoiceProjectsPage > totalPages) invoiceProjectsPage = totalPages;
    const start = (invoiceProjectsPage - 1) * pageSize;
    const pageData = invoiceProjectsCache.slice(start, start + pageSize);

    const rows = pageData.map(r => {
        const projectId = r.id || r.projectId;
        const isExpanded = expandedInvoiceProjectId === projectId;
        return `
        <tr class="${r.overdue ? 'row-overdue' : ''}">
            <td>${r.projectNumber || '-'}</td>
            <td>${r.projectName}</td>
            <td>${r.customerName || ''}</td>
            <td>${r.salesName || ''}</td>
            <td>¥${(r.projectAmount || 0).toLocaleString()}</td>
            <td>${r.hasInvoice ? `<span class="badge badge-info">已开票${r.invoiceCount > 0 ? `(${r.invoiceCount})` : ''}</span>` : '<span class="badge badge-secondary">未开票</span>'}</td>
            <td><button class="btn-small" data-click="toggleInvoiceRecords('${projectId}')" style="padding: 4px 8px;">${isExpanded ? '收起' : '查看发票'}</button></td>
        </tr>
        ${isExpanded ? `
        <tr id="invoice-records-${projectId}">
            <td colspan="7" style="padding: 0;">
                <div id="invoice-records-detail-${projectId}" style="padding: 16px; background: #f9fafb;">
                    <div style="text-align: center; color: #666;">加载中...</div>
                </div>
            </td>
        </tr>` : ''}`;
    }).join('');

    const month = document.getElementById('invoiceMonth')?.value || '';
    const status = document.getElementById('invoiceStatusFilter')?.value || '';
    const type = document.getElementById('invoiceTypeFilter')?.value || '';
    const customerId = document.getElementById('invoiceCustomer')?.value || '';
    const salesId = document.getElementById('invoiceSales')?.value || '';

    const filters = [];
    if (month) filters.push(`月份: ${month}`);
    if (status) filters.push(`状态: ${status}`);
    if (type) filters.push(`类型: ${type}`);
    if (customerId) {
        const customer = state.allCustomers.find(c => c._id === customerId);
        if (customer) filters.push(`客户: ${customer.name}`);
    }
    if (salesId) {
        const sales = state.allUsers.find(u => u._id === salesId);
        if (sales) filters.push(`销售: ${sales.name}`);
    }

    document.getElementById('invoiceProjectsList').innerHTML = `
        ${filters.length > 0 ? `
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px; background: #f0f9ff; border-radius: 4px; margin-bottom: 12px;">
            <div style="font-size: 12px; color: #666;">筛选条件: <span style="color: #333; font-weight: 500;">${filters.join(' | ')}</span></div>
            <div style="font-size: 12px; color: #666;">显示结果: <span style="color: #333; font-weight: 500;">共 ${invoiceProjectsCache.length} 个项目</span></div>
        </div>` : ''}
        <table class="table-sticky">
            <thead>
                <tr>
                    <th>项目编号</th><th>项目名称</th><th>客户</th><th>销售</th><th>项目金额</th><th>发票状态</th><th>操作</th>
                </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="7" style="text-align:center;">暂无数据</td></tr>'}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${invoiceProjectsPage<=1?'disabled':''} data-click="prevInvoiceProjectsPage()">上一页</button>
            <span style="align-self:center;">${invoiceProjectsPage} / ${totalPages}</span>
            <button class="btn-small" ${invoiceProjectsPage>=totalPages?'disabled':''} data-click="nextInvoiceProjectsPage()">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${invoiceProjectsPage}" style="width:70px;padding:6px;" data-change="jumpInvoiceProjectsPage(this.value, ${totalPages})">
        </div>
    `;

    if (expandedInvoiceProjectId) {
        setTimeout(() => loadInvoiceRecordsForProject(expandedInvoiceProjectId), 100);
    }
}

export function jumpInvoiceProjectsPage(page, maxPage) {
    const p = Math.max(1, Math.min(maxPage, parseInt(page) || 1));
    invoiceProjectsPage = p;
    renderInvoiceProjects();
}

export function prevInvoiceProjectsPage() {
    if (invoiceProjectsPage > 1) {
        invoiceProjectsPage = Math.max(1, invoiceProjectsPage - 1);
        renderInvoiceProjects();
    }
}

export function nextInvoiceProjectsPage() {
    const pageSizeSel = document.getElementById('invoicePageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value || '10', 10) : 10;
    const totalPages = Math.max(1, Math.ceil(invoiceProjectsCache.length / pageSize));
    if (invoiceProjectsPage < totalPages) {
        invoiceProjectsPage = Math.min(totalPages, invoiceProjectsPage + 1);
        renderInvoiceProjects();
    }
}

export function toggleInvoiceRecords(projectId) {
    const projectIdStr = String(projectId);
    if (expandedInvoiceProjectId === projectIdStr) {
        expandedInvoiceProjectId = null;
    } else {
        expandedInvoiceProjectId = projectIdStr;
    }
    renderInvoiceProjects();
}

async function loadInvoiceRecordsForProject(projectId) {
    const containerId = `invoice-records-detail-${projectId}`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    try {
        const res = await apiFetch(`/finance/invoice?projectId=${projectId}`);
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div style="text-align:center;color:#ef4444;">加载失败: ${data.message || '未知错误'}</div>`;
            return;
        }

        // 获取项目信息以计算可开票金额
        const projectRes = await apiFetch(`/projects/${projectId}`);
        const projectData = await projectRes.json();
        const project = projectData.success ? projectData.data : null;
        const projectAmount = project?.projectAmount || 0;
        
        const existingInvoices = data.data || [];
        const totalInvoiceAmount = existingInvoices
            .filter(inv => inv.status !== 'void')
            .reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
        const remainingAmount = Math.max(0, projectAmount - totalInvoiceAmount);
        const canManageFinance = isFinanceRole();

        if (!data.data || data.data.length === 0) {
            container.innerHTML = `
                <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
                    <div><div style="font-size: 12px; color: #666;">项目金额</div><div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div></div>
                    <div><div style="font-size: 12px; color: #666;">已开票</div><div style="font-size: 16px; font-weight: bold; color: #10b981;">¥0</div></div>
                    <div><div style="font-size: 12px; color: #666;">可开票</div><div style="font-size: 16px; font-weight: bold; color: #f59e0b;">¥${projectAmount.toLocaleString()}</div></div>
                </div>
                ${canManageFinance ? `
                <div class="card" style="margin-bottom: 12px; background: #f9fafb;">
                    <div class="card-title" style="font-size: 14px; margin-bottom: 8px;">新增发票</div>
                    <form id="addInvoiceForm_${projectId}" data-submit="addInvoiceForProject(event, '${projectId}')" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">发票号 <span style="color: #e74c3c;">*</span></label>
                            <input type="text" id="invoiceNumber_${projectId}" required style="padding: 6px; width: 100%;" placeholder="请输入发票号">
                        </div>
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">金额 <span style="color: #e74c3c;">*</span></label>
                            <input type="number" step="0.01" id="invoiceAmount_${projectId}" required style="padding: 6px; width: 100%;" placeholder="0.00" max="${remainingAmount}">
                        </div>
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">开票日期 <span style="color: #e74c3c;">*</span></label>
                            <input type="date" id="invoiceDate_${projectId}" required style="padding: 6px; width: 100%;" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div style="flex: 1; min-width: 100px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">类型</label>
                            <select id="invoiceType_${projectId}" style="padding: 6px; width: 100%;">
                                <option value="vat">增值税</option>
                                <option value="normal">普通</option>
                                <option value="other">其他</option>
                            </select>
                        </div>
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">备注</label>
                            <input type="text" id="invoiceNote_${projectId}" style="padding: 6px; width: 100%;" placeholder="可选">
                        </div>
                        <div>
                            <button type="submit" style="padding: 6px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">新增发票</button>
                        </div>
                    </form>
                </div>
                ` : ''}
                <div class="card-desc">暂无发票记录</div>
            `;
            return;
        }

        const rows = data.data.map(i => {
            const statusBadge = i.status === 'paid' ? 'badge-success' :
                i.status === 'issued' ? 'badge-info' :
                    i.status === 'void' ? 'badge-danger' : 'badge-warning';
            const statusText = i.status === 'paid' ? '已支付' :
                i.status === 'issued' ? '已开' :
                    i.status === 'void' ? '作废' : '待开';
            const typeText = i.type === 'vat' ? '增值税' : i.type === 'normal' ? '普通' : i.type === 'other' ? '其他' : i.type || '-';
            return `
            <tr>
                <td>${i.invoiceNumber || '-'}</td>
                <td>¥${(i.amount || 0).toLocaleString()}</td>
                <td>${i.issueDate ? new Date(i.issueDate).toLocaleDateString() : '-'}</td>
                <td><span class="badge ${statusBadge}">${statusText}</span></td>
                <td>${typeText}</td>
                <td>${i.note || '-'}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
                <div><div style="font-size: 12px; color: #666;">项目金额</div><div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div></div>
                <div><div style="font-size: 12px; color: #666;">已开票</div><div style="font-size: 16px; font-weight: bold; color: #10b981;">¥${totalInvoiceAmount.toLocaleString()}</div></div>
                <div><div style="font-size: 12px; color: #666;">可开票</div><div style="font-size: 16px; font-weight: bold; color: ${remainingAmount > 0 ? '#f59e0b' : '#10b981'};">¥${remainingAmount.toLocaleString()}</div></div>
            </div>
            ${canManageFinance ? `
            <div class="card" style="margin-bottom: 12px; background: #f9fafb;">
                <div class="card-title" style="font-size: 14px; margin-bottom: 8px;">新增发票</div>
                <form id="addInvoiceForm_${projectId}" data-submit="addInvoiceForProject(event, '${projectId}')" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">发票号 <span style="color: #e74c3c;">*</span></label>
                        <input type="text" id="invoiceNumber_${projectId}" required style="padding: 6px; width: 100%;" placeholder="请输入发票号">
                    </div>
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">金额 <span style="color: #e74c3c;">*</span></label>
                        <input type="number" step="0.01" id="invoiceAmount_${projectId}" required style="padding: 6px; width: 100%;" placeholder="0.00" max="${remainingAmount}">
                    </div>
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">开票日期 <span style="color: #e74c3c;">*</span></label>
                        <input type="date" id="invoiceDate_${projectId}" required style="padding: 6px; width: 100%;" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div style="flex: 1; min-width: 100px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">类型</label>
                        <select id="invoiceType_${projectId}" style="padding: 6px; width: 100%;">
                            <option value="vat">增值税</option>
                            <option value="normal">普通</option>
                            <option value="other">其他</option>
                        </select>
                    </div>
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">备注</label>
                        <input type="text" id="invoiceNote_${projectId}" style="padding: 6px; width: 100%;" placeholder="可选">
                    </div>
                    <div>
                        <button type="submit" style="padding: 6px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">新增发票</button>
                    </div>
                </form>
            </div>
            ` : ''}
            <table class="table-sticky">
                <thead>
                    <tr>
                        <th>发票号</th><th>金额</th><th>开票日期</th><th>状态</th><th>类型</th><th>备注</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div style="text-align:center;color:#ef4444;">加载失败: ${error.message}</div>`;
    }
}
// Finance module placeholder

// 挂载到 window 供 HTML 调用
// ============ 财务模块导航与报表/对账/待办（补齐拆分遗漏） ============

export function showFinanceSection(sectionName) {
    // 检查用户是否有财务查看权限（如果没有权限，强制设置为销售视图）
    const hasFinanceView = hasPermission('finance.view');
    if (!hasFinanceView) {
        state.salesFinanceView = true;
    }
    
    // 销售只允许查看回款列表（由系统配置/状态控制）
    const isSalesView = state.salesFinanceView && !isFinanceRole();
    if (isSalesView) {
        sectionName = 'paymentRecords';
    }

    // 隐藏所有 finance 子区块
    document.querySelectorAll('.finance-section-content').forEach(el => {
        el.style.display = 'none';
    });

    // 根据权限显示/隐藏导航卡片（支持从Dashboard回款完成率跳转时隐藏）
    const financeNav = document.getElementById('financeNavCards');
    if (financeNav) {
        if (state.hideFinanceNav) {
            financeNav.style.display = 'none';
        } else {
            const navCards = financeNav.querySelectorAll('.finance-nav-card');
            navCards.forEach(card => {
                const cardSection = card.dataset.section;
                // 销售只能看到回款记录和我的发票申请，其他卡片都隐藏
                if (isSalesView) {
                    if (cardSection === 'paymentRecords' || cardSection === 'myInvoiceRequests') {
                        card.style.display = 'block';
                    } else {
                        card.style.display = 'none';
                    }
                } else {
                    // 财务/管理员可以看到所有卡片（除了我的发票申请）
                    if (cardSection === 'myInvoiceRequests') {
                        card.style.display = 'none';
                    } else {
                        card.style.display = 'block';
                    }
                }
            });
            financeNav.style.display = 'grid';
        }
    }

    // 激活当前卡片
    document.querySelectorAll('.finance-nav-card').forEach(card => {
        card.classList.toggle('active', card.dataset.section === sectionName);
    });

    // 显示目标区块（隐藏导航时只显示回款记录区域）
    const target = document.getElementById(`financeSection-${sectionName}`);
    if (target) target.style.display = 'block';

    const financeTitle = document.querySelector('#finance h2');
    if (financeTitle) {
        financeTitle.textContent = isSalesView ? '我的回款记录' : '财务管理';
    }

    // 销售视图：限制筛选条件（仅自己/自己的客户）
    const paymentSales = document.getElementById('paymentSales');
    const paymentCustomer = document.getElementById('paymentCustomer');
    const paymentFilterNotice = document.getElementById('paymentFilterNotice');
    const invoiceSales = document.getElementById('invoiceSales');
    const invoiceCustomer = document.getElementById('invoiceCustomer');

    if (!isFinanceRole()) {
        // sale角色只能查看自己项目的回款和发票
        if (paymentSales) paymentSales.disabled = true;
        if (paymentCustomer) paymentCustomer.disabled = true;
        if (paymentFilterNotice) paymentFilterNotice.style.display = 'block';
        if (invoiceSales) invoiceSales.disabled = true;
        if (invoiceCustomer) invoiceCustomer.disabled = true;
    } else {
        // 财务角色可以查看所有
        if (paymentSales) paymentSales.disabled = false;
        if (paymentCustomer) paymentCustomer.disabled = false;
        if (paymentFilterNotice) paymentFilterNotice.style.display = 'none';
        if (invoiceSales) invoiceSales.disabled = false;
        if (invoiceCustomer) invoiceCustomer.disabled = false;
    }

    if (isSalesView) {
        // salesFinanceView 由后端/系统配置决定，这里只做前端限制
        // 默认加载回款项目列表
        loadPaymentRecordsProjects();
        return;
    }

    // 根据权限显示/隐藏发票申请相关导航卡片
    updateInvoiceRequestNavVisibility();
    
    // 按区块触发加载
    switch (sectionName) {
        case 'receivables':
            loadReceivables();
            break;
        case 'paymentRecords':
            loadPaymentRecordsProjects();
            break;
        case 'addPayment':
            // 表单页无需立即拉取数据
            break;
        case 'invoices':
            loadInvoiceProjects();
            break;
        case 'addInvoice':
            // 表单页无需立即拉取数据
            break;
        case 'reconciliation':
            loadReconciliation();
            break;
        case 'pendingKpi':
            loadPendingKpi();
            break;
        case 'summary':
        case 'reports':
            // 初始化月份选择器（通过window访问main.js中的函数）
            setTimeout(() => {
                if (window.initReportMonthSelector) {
                    window.initReportMonthSelector();
                }
            }, 0);
            loadFinanceSummary();
            break;
        case 'invoiceRequests':
            loadInvoiceRequests();
            break;
        case 'myInvoiceRequests':
            loadMyInvoiceRequests();
            break;
        default:
            break;
    }
}

export function backToFinanceNav() {
    // 返回导航
    document.querySelectorAll('.finance-section-content').forEach(el => {
        el.style.display = 'none';
    });
    document.querySelectorAll('.finance-nav-card').forEach(card => {
        card.classList.remove('active');
    });

    const financeNav = document.getElementById('financeNavCards');
    if (financeNav) financeNav.style.display = 'grid';

    const financeTitle = document.querySelector('#finance h2');
    if (financeTitle) financeTitle.textContent = '财务管理';
}

// 财务报表汇总
export async function loadFinanceSummary() {
    try {
        const month = document.getElementById('reportMonth')?.value || '';
        const params = new URLSearchParams();
        if (month) params.append('month', month);

        const res = await apiFetch(`/finance/reports/summary?${params.toString()}`);
        const data = await res.json();

        if (!data.success) {
            showAlert('financeSummary', data.message || '加载失败', 'error');
            return;
        }

        const summary = data.data || {};
        const totalAmount = summary.totalAmount || 0;
        const totalProjects = summary.totalProjects || 0;
        const byCustomer = summary.byCustomer || {};
        const bySales = summary.bySales || {};
        const byBusinessType = summary.byBusinessType || {};
        const byStatus = summary.byStatus || {};

        // 关键指标卡片
        const statusText = {
            pending: '待开始',
            scheduled: '已排期',
            in_progress: '进行中',
            translation_done: '翻译完成',
            review_done: '审校完成',
            layout_done: '排版完成',
            completed: '已完成',
            cancelled: '已取消'
        };

        // 按金额排序
        const sortedCustomers = Object.entries(byCustomer)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right;">¥${Number(v || 0).toLocaleString()}</td></tr>`)
            .join('');

        const sortedSales = Object.entries(bySales)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right;">¥${Number(v || 0).toLocaleString()}</td></tr>`)
            .join('');

        const sortedBusinessTypes = Object.entries(byBusinessType)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `<tr><td>${getBusinessTypeText(k)}</td><td style="text-align:right;">¥${Number(v || 0).toLocaleString()}</td></tr>`)
            .join('');

        const sortedStatus = Object.entries(byStatus)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `<tr><td>${statusText[k] || k}</td><td style="text-align:right;">¥${Number(v || 0).toLocaleString()}</td></tr>`)
            .join('');

        // 计算平均项目金额
        const avgAmount = totalProjects > 0 ? (totalAmount / totalProjects).toFixed(2) : 0;

        document.getElementById('financeSummary').innerHTML = `
            <!-- 关键指标卡片 -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px;">
                <div class="card" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;">
                    <div style="font-size:14px;opacity:0.9;margin-bottom:8px;">总金额</div>
                    <div style="font-size:28px;font-weight:bold;">¥${Number(totalAmount).toLocaleString()}</div>
                </div>
                <div class="card" style="background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);color:white;">
                    <div style="font-size:14px;opacity:0.9;margin-bottom:8px;">项目总数</div>
                    <div style="font-size:28px;font-weight:bold;">${totalProjects}</div>
                </div>
                <div class="card" style="background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);color:white;">
                    <div style="font-size:14px;opacity:0.9;margin-bottom:8px;">平均项目金额</div>
                    <div style="font-size:28px;font-weight:bold;">¥${Number(avgAmount).toLocaleString()}</div>
                </div>
            </div>

            <!-- 汇总表格 -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
                <div class="card">
                    <div class="card-title">按客户汇总</div>
                    <div style="max-height:400px;overflow-y:auto;">
                        <table style="width:100%;">
                            <thead>
                                <tr>
                                    <th>客户</th>
                                    <th style="text-align:right;">金额</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sortedCustomers || '<tr><td colspan="2" style="text-align:center;padding:20px;">暂无数据</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="card">
                    <div class="card-title">按销售汇总</div>
                    <div style="max-height:400px;overflow-y:auto;">
                        <table style="width:100%;">
                            <thead>
                                <tr>
                                    <th>销售</th>
                                    <th style="text-align:right;">金额</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sortedSales || '<tr><td colspan="2" style="text-align:center;padding:20px;">暂无数据</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="card">
                    <div class="card-title">按业务类型汇总</div>
                    <div style="max-height:400px;overflow-y:auto;">
                        <table style="width:100%;">
                            <thead>
                                <tr>
                                    <th>业务类型</th>
                                    <th style="text-align:right;">金额</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sortedBusinessTypes || '<tr><td colspan="2" style="text-align:center;padding:20px;">暂无数据</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="card">
                    <div class="card-title">按项目状态汇总</div>
                    <div style="max-height:400px;overflow-y:auto;">
                        <table style="width:100%;">
                            <thead>
                                <tr>
                                    <th>状态</th>
                                    <th style="text-align:right;">金额</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sortedStatus || '<tr><td colspan="2" style="text-align:center;padding:20px;">暂无数据</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('加载财务汇总失败:', error);
        showToast(`加载失败: ${error.message}`, 'error');
    }
}

// 导出财务汇总报表
export async function exportFinanceSummary() {
    try {
        const month = document.getElementById('reportMonth')?.value || '';
        const params = new URLSearchParams();
        if (month) params.append('month', month);

        const res = await apiFetch(`/finance/reports/summary?${params.toString()}`);
        const data = await res.json();

        if (!data.success) {
            showToast(data.message || '导出失败', 'error');
            return;
        }

        const summary = data.data || {};
        const monthText = month || '全部';
        
        // 构建Excel数据
        const rows = [
            ['财务汇总报表', monthText],
            [''],
            ['总金额', `¥${Number(summary.totalAmount || 0).toLocaleString()}`],
            ['项目总数', summary.totalProjects || 0],
            ['平均项目金额', `¥${Number(summary.totalProjects > 0 ? (summary.totalAmount / summary.totalProjects) : 0).toFixed(2)}`],
            [''],
            ['按客户汇总'],
            ['客户', '金额']
        ];

        Object.entries(summary.byCustomer || {})
            .sort((a, b) => b[1] - a[1])
            .forEach(([k, v]) => {
                rows.push([k, `¥${Number(v).toLocaleString()}`]);
            });

        rows.push([''], ['按销售汇总'], ['销售', '金额']);
        Object.entries(summary.bySales || {})
            .sort((a, b) => b[1] - a[1])
            .forEach(([k, v]) => {
                rows.push([k, `¥${Number(v).toLocaleString()}`]);
            });

        rows.push([''], ['按业务类型汇总'], ['业务类型', '金额']);
        Object.entries(summary.byBusinessType || {})
            .sort((a, b) => b[1] - a[1])
            .forEach(([k, v]) => {
                rows.push([getBusinessTypeText(k), `¥${Number(v).toLocaleString()}`]);
            });

        rows.push([''], ['按项目状态汇总'], ['状态', '金额']);
        const statusText = {
            pending: '待开始',
            scheduled: '已排期',
            in_progress: '进行中',
            translation_done: '翻译完成',
            review_done: '审校完成',
            layout_done: '排版完成',
            completed: '已完成',
            cancelled: '已取消'
        };
        Object.entries(summary.byStatus || {})
            .sort((a, b) => b[1] - a[1])
            .forEach(([k, v]) => {
                rows.push([statusText[k] || k, `¥${Number(v).toLocaleString()}`]);
            });

        // 转换为CSV格式
        const csv = rows.map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        // 添加BOM以支持中文
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `财务汇总报表_${monthText || '全部'}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast('导出成功', 'success');
    } catch (error) {
        console.error('导出财务汇总失败:', error);
        showToast(`导出失败: ${error.message}`, 'error');
    }
}

// KPI 审核待办
export async function loadPendingKpi() {
    try {
        const month = document.getElementById('kpiPendingMonth')?.value || '';
        const params = new URLSearchParams();
        if (month) params.append('month', month);

        const res = await apiFetch(`/finance/kpi/pending?${params.toString()}`);
        const data = await res.json();

        if (!data.success) {
            showAlert('pendingKpiList', data.message || '加载失败', 'error');
            return;
        }

        const rows = (data.data || []).map(r => {
            // 兼职销售和兼职排版按金额计算（元），其他角色按分值计算（分）
            const roleStr = String(r.role || '').trim();
            const isPartTimeRole = roleStr === 'part_time_sales' || roleStr === 'layout';
            const unit = isPartTimeRole ? '元' : '分';
            const prefix = isPartTimeRole ? '¥' : '';
            return `
                <tr>
                    <td style="text-align: center;">
                        <input type="checkbox" class="kpi-record-checkbox" value="${r._id}" data-record-id="${r._id}">
                    </td>
                    <td>${r.userId?.username || r.userId?.name || 'N/A'}</td>
                    <td>${r.projectId?.projectName || 'N/A'}</td>
                    <td>${getRoleText(r.role)}</td>
                    <td>${prefix}${Number(r.kpiValue || 0).toLocaleString()} ${unit}</td>
                    <td>${r.month || ''}</td>
                    <td>
                        <button class="btn-small" data-click="reviewKpiRecord('${r._id}')" style="background: #10b981; color: white; margin-right: 5px;">通过</button>
                        <button class="btn-small" data-click="rejectKpiRecord('${r._id}')" style="background: #ef4444; color: white;">拒绝</button>
                    </td>
                </tr>
            `;
        }).join('');

        document.getElementById('pendingKpiList').innerHTML = `
            <div style="margin-bottom: 12px; display: flex; gap: 10px; align-items: center;">
                <button data-click="selectAllPendingKpi()" style="padding: 6px 12px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">全选</button>
                <button data-click="deselectAllPendingKpi()" style="padding: 6px 12px; background: #94a3b8; color: white; border: none; border-radius: 4px; cursor: pointer;">取消全选</button>
                <button data-click="batchReviewKpiRecords()" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">批量审核通过</button>
                <span id="selectedKpiCount" style="color: #666; font-size: 14px;">已选择 0 条</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 50px; text-align: center;">
                            <input type="checkbox" id="selectAllKpiCheckbox" data-change="toggleSelectAllPendingKpi()">
                        </th>
                        <th>用户</th>
                        <th>项目</th>
                        <th>角色</th>
                        <th>KPI</th>
                        <th>月份</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="7" style="text-align:center;">暂无待审核</td></tr>'}
                </tbody>
            </table>
        `;
        
        // 绑定复选框变化事件，更新选中数量
        setTimeout(() => {
            const checkboxes = document.querySelectorAll('.kpi-record-checkbox');
            const selectAllCheckbox = document.getElementById('selectAllKpiCheckbox');
            const updateSelectedCount = () => {
                const selected = document.querySelectorAll('.kpi-record-checkbox:checked');
                const countEl = document.getElementById('selectedKpiCount');
                if (countEl) {
                    countEl.textContent = `已选择 ${selected.length} 条`;
                }
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = checkboxes.length > 0 && selected.length === checkboxes.length;
                }
            };
            
            checkboxes.forEach(cb => {
                cb.addEventListener('change', updateSelectedCount);
            });
            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', (e) => {
                    checkboxes.forEach(cb => {
                        cb.checked = e.target.checked;
                    });
                    updateSelectedCount();
                });
            }
            updateSelectedCount();
        }, 0);
    } catch (error) {
        console.error('加载KPI待办失败:', error);
        showToast(`加载失败: ${error.message}`, 'error');
    }
}

// 审核KPI记录
export async function reviewKpiRecord(recordId) {
    if (!recordId) {
        showToast('记录ID不能为空', 'error');
        return;
    }
    
    if (!confirm('确定要审核通过这条KPI记录吗？')) {
        return;
    }
    
    try {
        const res = await apiFetch(`/kpi/review/${recordId}`, {
            method: 'POST'
        });
        const data = await res.json();
        
        if (data.success) {
            showToast('KPI记录已审核通过', 'success');
            // 重新加载待审核列表
            loadPendingKpi();
        } else {
            showToast(data.message || '审核失败', 'error');
        }
    } catch (error) {
        console.error('审核KPI记录失败:', error);
        showToast(`审核失败: ${error.message}`, 'error');
    }
}

// 拒绝KPI记录
export async function rejectKpiRecord(recordId) {
    if (!recordId) {
        showToast('记录ID不能为空', 'error');
        return;
    }
    
    const reason = prompt('请输入拒绝原因（可选）：');
    if (reason === null) {
        // 用户取消了输入
        return;
    }
    
    if (!confirm('确定要拒绝这条KPI记录吗？拒绝后该记录将被删除。')) {
        return;
    }
    
    try {
        const res = await apiFetch(`/kpi/reject/${recordId}`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason || '' })
        });
        const data = await res.json();
        
        if (data.success) {
            showToast('KPI记录已拒绝', 'success');
            // 重新加载待审核列表
            loadPendingKpi();
        } else {
            showToast(data.message || '拒绝失败', 'error');
        }
    } catch (error) {
        console.error('拒绝KPI记录失败:', error);
        showToast(`拒绝失败: ${error.message}`, 'error');
    }
}

// 全选待审核KPI记录
export function selectAllPendingKpi() {
    const checkboxes = document.querySelectorAll('.kpi-record-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = true;
    });
    const selectAllCheckbox = document.getElementById('selectAllKpiCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = true;
    }
    updateSelectedKpiCount();
}

// 取消全选待审核KPI记录
export function deselectAllPendingKpi() {
    const checkboxes = document.querySelectorAll('.kpi-record-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    const selectAllCheckbox = document.getElementById('selectAllKpiCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    updateSelectedKpiCount();
}

// 切换全选状态
export function toggleSelectAllPendingKpi() {
    const selectAllCheckbox = document.getElementById('selectAllKpiCheckbox');
    if (!selectAllCheckbox) return;
    
    const checkboxes = document.querySelectorAll('.kpi-record-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = selectAllCheckbox.checked;
    });
    updateSelectedKpiCount();
}

// 更新选中数量显示
function updateSelectedKpiCount() {
    const selected = document.querySelectorAll('.kpi-record-checkbox:checked');
    const countEl = document.getElementById('selectedKpiCount');
    if (countEl) {
        countEl.textContent = `已选择 ${selected.length} 条`;
    }
}

// 批量审核KPI记录
export async function batchReviewKpiRecords() {
    const selected = document.querySelectorAll('.kpi-record-checkbox:checked');
    const recordIds = Array.from(selected).map(cb => cb.value).filter(Boolean);
    
    if (recordIds.length === 0) {
        showToast('请至少选择一条记录', 'error');
        return;
    }
    
    if (!confirm(`确定要批量审核通过 ${recordIds.length} 条KPI记录吗？`)) {
        return;
    }
    
    try {
        const res = await apiFetch('/kpi/review/batch', {
            method: 'POST',
            body: JSON.stringify({ recordIds })
        });
        const data = await res.json();
        
        if (data.success) {
            showToast(`已批量审核 ${data.data.count} 条记录`, 'success');
            // 重新加载待审核列表
            loadPendingKpi();
        } else {
            showToast(data.message || '批量审核失败', 'error');
        }
    } catch (error) {
        console.error('批量审核KPI记录失败:', error);
        showToast(`批量审核失败: ${error.message}`, 'error');
    }
}

// 对账表（展示）
export async function loadReconciliation() {
    const startDate = document.getElementById('reconciliationStartDate')?.value || '';
    const endDate = document.getElementById('reconciliationEndDate')?.value || '';
    
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    try {
        const res = await apiFetch(`/finance/reconciliation?${params.toString()}`);
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

// 对账表导出（CSV）
export function exportReconciliation() {
    const startDate = document.getElementById('reconciliationStartDate')?.value || '';
    const endDate = document.getElementById('reconciliationEndDate')?.value || '';

    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    fetch(`${API_BASE}/finance/reconciliation/export?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${state.token || ''}` }
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

// ============ 项目选择器（用于回款和发票） ============
let projectSelectorCache = [];
let currentProjectSelectorType = null;

export async function showProjectSelector(type) {
    // 确保项目列表已加载
    if (projectSelectorCache.length === 0) {
        try {
            const response = await apiFetch('/projects');
            const data = await response.json();
            if (data.success) {
                projectSelectorCache = data.data || [];
            }
        } catch (error) {
            showToast('加载项目列表失败: ' + error.message, 'error');
            return;
        }
    }
    
    currentProjectSelectorType = type;
    
    const content = `
        <div style="max-width: 800px; width: 90vw;">
            <div style="margin-bottom: 16px;">
                <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
                    <input type="text" id="projectSelectorSearch" placeholder="搜索项目编号、名称或客户..." 
                           style="flex: 1; min-width: 200px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                           data-keyup="filterProjectSelector()">
                    <select id="projectSelectorStatus" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;" data-change="filterProjectSelector()">
                        <option value="">全部状态</option>
                        <option value="pending">待开始</option>
                        <option value="in_progress">进行中</option>
                        <option value="completed">已完成</option>
                        <option value="cancelled">已取消</option>
                    </select>
                    <select id="projectSelectorBusinessType" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;" data-change="filterProjectSelector()">
                        <option value="">全部业务</option>
                        <option value="translation">笔译</option>
                        <option value="interpretation">口译</option>
                        <option value="transcription">转录</option>
                        <option value="localization">本地化</option>
                        <option value="other">其他</option>
                    </select>
                </div>
                <div style="font-size: 12px; color: #666;">
                    共 ${projectSelectorCache.length} 个项目，使用搜索和筛选快速找到目标项目
                </div>
            </div>
            <div id="projectSelectorList" style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">
                ${renderProjectSelectorList(projectSelectorCache, type)}
            </div>
        </div>
    `;
    
    showModal({ title: '选择项目', body: content });
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
                ${projects.map(p => {
                    const projectId = p._id || p.id;
                    const projectNumber = (p.projectNumber || '').replace(/'/g, "\\'");
                    const projectName = (p.projectName || '').replace(/'/g, "\\'");
                    const customerName = ((p.customerId?.name || p.clientName || '')).replace(/'/g, "\\'");
                    return `
                    <tr class="project-selector-row" style="border-bottom: 1px solid #eee; cursor: pointer;" 
                        data-click="selectProject('${projectId}', '${projectNumber}', '${projectName}', '${customerName}', '${type}')">
                        <td style="padding: 10px;">${p.projectNumber || '-'}</td>
                        <td style="padding: 10px;">${p.projectName || '-'}</td>
                        <td style="padding: 10px;">${p.customerId?.name || p.clientName || '-'}</td>
                        <td style="padding: 10px;">${getBusinessTypeText(p.businessType)}</td>
                        <td style="padding: 10px;"><span class="badge ${getStatusBadgeClass(p.status)}">${getStatusText(p.status)}</span></td>
                        <td style="padding: 10px;">¥${(p.projectAmount || 0).toLocaleString()}</td>
                        <td style="padding: 10px;">
                            <button class="btn-small" data-click="selectProject('${projectId}', '${projectNumber}', '${projectName}', '${customerName}', '${type}')">选择</button>
                        </td>
                    </tr>
                `;
                }).join('')}
            </tbody>
        </table>
    `;
}

export function filterProjectSelector() {
    const search = document.getElementById('projectSelectorSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('projectSelectorStatus')?.value || '';
    const businessType = document.getElementById('projectSelectorBusinessType')?.value || '';
    const type = currentProjectSelectorType || 'payment';
    
    const filtered = projectSelectorCache.filter(p => {
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

export function selectProject(projectId, projectNumber, projectName, customerName, type) {
    const displayName = projectNumber ? `${projectNumber} - ${projectName}` : projectName;
    const fullDisplay = `${displayName} - ${customerName}`;
    
    if (type === 'payment') {
        const projectIdInput = document.getElementById('paymentProjectId');
        const projectSearchInput = document.getElementById('paymentProjectSearch');
        const projectInfoDiv = document.getElementById('paymentProjectInfo');
        
        if (projectIdInput) projectIdInput.value = projectId;
        if (projectSearchInput) projectSearchInput.value = fullDisplay;
        if (projectInfoDiv) projectInfoDiv.textContent = `已选择：${displayName}`;
    } else if (type === 'invoice') {
        const projectIdInput = document.getElementById('invoiceProjectId');
        const projectSearchInput = document.getElementById('invoiceProjectSearch');
        const projectInfoDiv = document.getElementById('invoiceProjectInfo');
        
        if (projectIdInput) projectIdInput.value = projectId;
        if (projectSearchInput) projectSearchInput.value = fullDisplay;
        if (projectInfoDiv) projectInfoDiv.textContent = `已选择：${displayName}`;
    }
    closeModal();
}

// 导出验证：确保所有分页函数都已导出
// prevPaymentRecordsProjectsPage, nextPaymentRecordsProjectsPage 已在第631和638行导出

// ============ 发票申请功能 ============

// 发票申请缓存和分页
let invoiceRequestsCache = [];
let invoiceRequestPage = 1;

let myInvoiceRequestsCache = [];
let myInvoiceRequestPage = 1;

// 根据权限更新导航卡片可见性
function updateInvoiceRequestNavVisibility() {
    const invoiceRequestsCard = document.getElementById('invoiceRequestsNavCard');
    const myInvoiceRequestsCard = document.getElementById('myInvoiceRequestsNavCard');
    
    if (isFinanceRole()) {
        // 财务/管理员：显示"发票申请审批"
        if (invoiceRequestsCard) invoiceRequestsCard.style.display = 'block';
        if (myInvoiceRequestsCard) myInvoiceRequestsCard.style.display = 'none';
    } else if (state.currentUser?.roles?.some(r => ['sales', 'part_time_sales'].includes(r))) {
        // 销售/兼职销售：显示"我的发票申请"
        if (invoiceRequestsCard) invoiceRequestsCard.style.display = 'none';
        if (myInvoiceRequestsCard) myInvoiceRequestsCard.style.display = 'block';
    } else {
        // 其他角色：隐藏
        if (invoiceRequestsCard) invoiceRequestsCard.style.display = 'none';
        if (myInvoiceRequestsCard) myInvoiceRequestsCard.style.display = 'none';
    }
}

// 加载发票申请列表（财务侧）
export async function loadInvoiceRequests() {
    try {
        const status = document.getElementById('invoiceRequestStatusFilter')?.value || '';
        const createdBy = document.getElementById('invoiceRequestCreatedByFilter')?.value || '';
        const customerId = document.getElementById('invoiceRequestCustomerFilter')?.value || '';
        const pageSize = document.getElementById('invoiceRequestPageSize')?.value || '20';
        
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (createdBy) params.append('createdBy', createdBy);
        if (customerId) params.append('customerId', customerId);
        params.append('page', invoiceRequestPage);
        params.append('pageSize', pageSize);
        
        const url = `/invoice-requests?${params.toString()}`;
        console.log('[Finance] 加载发票申请列表:', url);
        
        const res = await apiFetch(url);
        const data = await res.json();
        
        console.log('[Finance] 发票申请列表响应:', {
            success: data.success,
            count: data.data?.length || 0,
            pagination: data.pagination,
            firstItem: data.data?.[0]
        });
        
        if (!data.success) {
            showAlert('invoiceRequestsList', data.error?.message || data.message || '加载失败', 'error');
            return;
        }
        
        invoiceRequestsCache = data.data || [];
        renderInvoiceRequests(data.pagination);
    } catch (error) {
        console.error('[Finance] 加载发票申请列表失败:', error);
        showAlert('invoiceRequestsList', '加载失败: ' + error.message, 'error');
    }
}

// 渲染发票申请列表（财务侧）
export function renderInvoiceRequests(pagination) {
    const container = document.getElementById('invoiceRequestsList');
    if (!container) return;
    
    if (invoiceRequestsCache.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#666;padding:20px;">暂无发票申请</div>';
        return;
    }
    
    const statusText = {
        pending: '待审批',
        approved: '已批准',
        rejected: '已拒绝'
    };
    
    const statusBadge = {
        pending: 'badge-warning',
        approved: 'badge-success',
        rejected: 'badge-danger'
    };
    
    const invoiceTypeText = {
        vat: '增值税发票',
        normal: '普通发票',
        other: '其他'
    };
    
    const rows = invoiceRequestsCache.map(req => {
        const projectsList = req.projects?.map(p => 
            `${p.projectNumber || '-'} ${p.projectName || '-'} (¥${(p.projectAmount || 0).toLocaleString()})`
        ).join('<br>') || '-';
        
        const approveBtn = req.status === 'pending' ? `
            <button class="btn-small" data-click="approveInvoiceRequest('${req._id}')" style="background:#10b981;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;margin-right:4px;">批准</button>
            <button class="btn-small" data-click="rejectInvoiceRequest('${req._id}')" style="background:#ef4444;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">拒绝</button>
        ` : '';
        
        const rejectReason = req.status === 'rejected' && req.rejectReason ? 
            `<div style="color:#ef4444;font-size:12px;margin-top:4px;">拒绝原因：${req.rejectReason}</div>` : '';
        
        const linkedInvoice = req.linkedInvoiceId ? 
            `<div style="font-size:12px;color:#10b981;margin-top:4px;">已创建发票：${req.linkedInvoiceId.invoiceNumber || req.linkedInvoiceId}</div>` : '';
        
        return `
            <tr>
                <td>${new Date(req.createdAt).toLocaleString('zh-CN')}</td>
                <td>${req.createdBy?.name || req.createdBy?.username || '-'}</td>
                <td>${req.customerId?.name || '-'}</td>
                <td style="max-width:300px;">${projectsList}</td>
                <td>¥${(req.amount || 0).toLocaleString()}</td>
                <td>${invoiceTypeText[req.invoiceType] || req.invoiceType}</td>
                <td>${req.invoiceInfo?.title || '-'}</td>
                <td><span class="badge ${statusBadge[req.status]}">${statusText[req.status]}</span></td>
                <td>${req.approvedBy ? (req.approvedBy.name || req.approvedBy.username) : '-'}</td>
                <td>${req.approvedAt ? new Date(req.approvedAt).toLocaleString('zh-CN') : '-'}</td>
                <td>
                    ${approveBtn}
                    <button class="btn-small" data-click="viewInvoiceRequest('${req._id}')" style="background:#667eea;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">详情</button>
                    ${rejectReason}
                    ${linkedInvoice}
                </td>
            </tr>
        `;
    }).join('');
    
    const paginationHtml = pagination ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">
            <div>共 ${pagination.total} 条，第 ${pagination.page}/${pagination.totalPages} 页</div>
            <div style="display:flex;gap:8px;">
                <button data-click="jumpInvoiceRequestPage(1, ${pagination.totalPages})" ${invoiceRequestPage <= 1 ? 'disabled' : ''} style="padding:4px 8px;">首页</button>
                <button data-click="prevInvoiceRequestPage()" ${invoiceRequestPage <= 1 ? 'disabled' : ''} style="padding:4px 8px;">上一页</button>
                <button data-click="nextInvoiceRequestPage()" ${invoiceRequestPage >= pagination.totalPages ? 'disabled' : ''} style="padding:4px 8px;">下一页</button>
                <button data-click="jumpInvoiceRequestPage(${pagination.totalPages}, ${pagination.totalPages})" ${invoiceRequestPage >= pagination.totalPages ? 'disabled' : ''} style="padding:4px 8px;">末页</button>
            </div>
        </div>
    ` : '';
    
    container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>申请时间</th>
                    <th>申请人</th>
                    <th>客户</th>
                    <th>项目</th>
                    <th>申请金额</th>
                    <th>发票类型</th>
                    <th>发票抬头</th>
                    <th>状态</th>
                    <th>审批人</th>
                    <th>审批时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        ${paginationHtml}
    `;
}

// 加载我的发票申请列表（销售侧）
export async function loadMyInvoiceRequests() {
    try {
        const status = document.getElementById('myInvoiceRequestStatusFilter')?.value || '';
        const pageSize = document.getElementById('myInvoiceRequestPageSize')?.value || '20';
        
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        params.append('page', myInvoiceRequestPage);
        params.append('pageSize', pageSize);
        
        const res = await apiFetch(`/invoice-requests/my?${params.toString()}`);
        const data = await res.json();
        
        if (!data.success) {
            showAlert('myInvoiceRequestsList', data.error?.message || data.message || '加载失败', 'error');
            return;
        }
        
        myInvoiceRequestsCache = data.data || [];
        renderMyInvoiceRequests(data.pagination);
    } catch (error) {
        showAlert('myInvoiceRequestsList', '加载失败: ' + error.message, 'error');
    }
}

// 渲染我的发票申请列表（销售侧）
export function renderMyInvoiceRequests(pagination) {
    const container = document.getElementById('myInvoiceRequestsList');
    if (!container) return;
    
    if (myInvoiceRequestsCache.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#666;padding:20px;">暂无发票申请</div>';
        return;
    }
    
    const statusText = {
        pending: '待审批',
        approved: '已批准',
        rejected: '已拒绝'
    };
    
    const statusBadge = {
        pending: 'badge-warning',
        approved: 'badge-success',
        rejected: 'badge-danger'
    };
    
    const invoiceTypeText = {
        vat: '增值税发票',
        normal: '普通发票',
        other: '其他'
    };
    
    const rows = myInvoiceRequestsCache.map(req => {
        const projectsList = req.projects?.map(p => 
            `${p.projectNumber || '-'} ${p.projectName || '-'} (¥${(p.projectAmount || 0).toLocaleString()})`
        ).join('<br>') || '-';
        
        const rejectReason = req.status === 'rejected' && req.rejectReason ? 
            `<div style="color:#ef4444;font-size:12px;margin-top:4px;">拒绝原因：${req.rejectReason}</div>` : '';
        
        const linkedInvoice = req.linkedInvoiceId ? 
            `<div style="font-size:12px;color:#10b981;margin-top:4px;">已创建发票：${req.linkedInvoiceId.invoiceNumber || req.linkedInvoiceId}</div>` : '';
        
        const deleteBtn = req.status === 'pending' ? 
            `<button class="btn-small" data-click="deleteInvoiceRequest('${req._id}')" style="background:#ef4444;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;margin-left:4px;">删除</button>` : '';
        
        return `
            <tr>
                <td>${new Date(req.createdAt).toLocaleString('zh-CN')}</td>
                <td>${req.customerId?.name || '-'}</td>
                <td style="max-width:300px;">${projectsList}</td>
                <td>¥${(req.amount || 0).toLocaleString()}</td>
                <td>${invoiceTypeText[req.invoiceType] || req.invoiceType}</td>
                <td>${req.invoiceInfo?.title || '-'}</td>
                <td><span class="badge ${statusBadge[req.status]}">${statusText[req.status]}</span></td>
                <td>${req.approvedBy ? (req.approvedBy.name || req.approvedBy.username) : '-'}</td>
                <td>${req.approvedAt ? new Date(req.approvedAt).toLocaleString('zh-CN') : '-'}</td>
                <td>
                    <button class="btn-small" data-click="viewInvoiceRequest('${req._id}')" style="background:#667eea;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">详情</button>
                    ${deleteBtn}
                    ${rejectReason}
                    ${linkedInvoice}
                </td>
            </tr>
        `;
    }).join('');
    
    const paginationHtml = pagination ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">
            <div>共 ${pagination.total} 条，第 ${pagination.page}/${pagination.totalPages} 页</div>
            <div style="display:flex;gap:8px;">
                <button data-click="jumpMyInvoiceRequestPage(1, ${pagination.totalPages})" ${myInvoiceRequestPage <= 1 ? 'disabled' : ''} style="padding:4px 8px;">首页</button>
                <button data-click="prevMyInvoiceRequestPage()" ${myInvoiceRequestPage <= 1 ? 'disabled' : ''} style="padding:4px 8px;">上一页</button>
                <button data-click="nextMyInvoiceRequestPage()" ${myInvoiceRequestPage >= pagination.totalPages ? 'disabled' : ''} style="padding:4px 8px;">下一页</button>
                <button data-click="jumpMyInvoiceRequestPage(${pagination.totalPages}, ${pagination.totalPages})" ${myInvoiceRequestPage >= pagination.totalPages ? 'disabled' : ''} style="padding:4px 8px;">末页</button>
            </div>
        </div>
    ` : '';
    
    container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>申请时间</th>
                    <th>客户</th>
                    <th>项目</th>
                    <th>申请金额</th>
                    <th>发票类型</th>
                    <th>发票抬头</th>
                    <th>状态</th>
                    <th>审批人</th>
                    <th>审批时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        ${paginationHtml}
    `;
}

// 分页函数 - 发票申请（财务侧）
export function jumpInvoiceRequestPage(page, maxPage) {
    invoiceRequestPage = Math.max(1, Math.min(parseInt(page), maxPage));
    loadInvoiceRequests();
}

export function prevInvoiceRequestPage() {
    if (invoiceRequestPage > 1) {
        invoiceRequestPage--;
        loadInvoiceRequests();
    }
}

export function nextInvoiceRequestPage() {
    invoiceRequestPage++;
    loadInvoiceRequests();
}

// 分页函数 - 我的发票申请（销售侧）
export function jumpMyInvoiceRequestPage(page, maxPage) {
    myInvoiceRequestPage = Math.max(1, Math.min(parseInt(page), maxPage));
    loadMyInvoiceRequests();
}

export function prevMyInvoiceRequestPage() {
    if (myInvoiceRequestPage > 1) {
        myInvoiceRequestPage--;
        loadMyInvoiceRequests();
    }
}

export function nextMyInvoiceRequestPage() {
    myInvoiceRequestPage++;
    loadMyInvoiceRequests();
}

// 查看发票申请详情
export async function viewInvoiceRequest(requestId) {
    try {
        const res = await apiFetch(`/invoice-requests/${requestId}`);
        const data = await res.json();
        
        if (!data.success) {
            showToast(data.error?.message || data.message || '加载失败', 'error');
            return;
        }
        
        const req = data.data;
        const projectsList = req.projects?.map(p => 
            `<div style="margin-bottom:8px;">
                <strong>${p.projectNumber || '-'}</strong> ${p.projectName || '-'}<br>
                <span style="color:#666;font-size:12px;">金额：¥${(p.projectAmount || 0).toLocaleString()}</span>
            </div>`
        ).join('') || '-';
        
        const statusText = {
            pending: '待审批',
            approved: '已批准',
            rejected: '已拒绝'
        };
        
        const invoiceTypeText = {
            vat: '增值税发票',
            normal: '普通发票',
            other: '其他'
        };
        
        const modalContent = `
            <div style="padding:20px;">
                <h3 style="margin-bottom:16px;">发票申请详情</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                    <div>
                        <strong>申请时间：</strong>${new Date(req.createdAt).toLocaleString('zh-CN')}
                    </div>
                    <div>
                        <strong>申请人：</strong>${req.createdBy?.name || req.createdBy?.username || '-'}
                    </div>
                    <div>
                        <strong>客户：</strong>${req.customerId?.name || '-'}
                    </div>
                    <div>
                        <strong>状态：</strong><span class="badge ${req.status === 'pending' ? 'badge-warning' : req.status === 'approved' ? 'badge-success' : 'badge-danger'}">${statusText[req.status]}</span>
                    </div>
                    <div>
                        <strong>申请金额：</strong>¥${(req.amount || 0).toLocaleString()}
                    </div>
                    <div>
                        <strong>发票类型：</strong>${invoiceTypeText[req.invoiceType] || req.invoiceType}
                    </div>
                </div>
                <div style="margin-bottom:16px;">
                    <strong>关联项目：</strong>
                    <div style="margin-top:8px;padding:12px;background:#f5f5f5;border-radius:4px;">
                        ${projectsList}
                    </div>
                </div>
                <div style="margin-bottom:16px;">
                    <strong>开票信息：</strong>
                    <div style="margin-top:8px;padding:12px;background:#f5f5f5;border-radius:4px;">
                        <div><strong>发票抬头：</strong>${req.invoiceInfo?.title || '-'}</div>
                        ${req.invoiceInfo?.taxNumber ? `<div><strong>税号：</strong>${req.invoiceInfo.taxNumber}</div>` : ''}
                        ${req.invoiceInfo?.address ? `<div><strong>地址：</strong>${req.invoiceInfo.address}</div>` : ''}
                        ${req.invoiceInfo?.phone ? `<div><strong>电话：</strong>${req.invoiceInfo.phone}</div>` : ''}
                        ${req.invoiceInfo?.bank ? `<div><strong>开户银行：</strong>${req.invoiceInfo.bank}</div>` : ''}
                        ${req.invoiceInfo?.bankAccount ? `<div><strong>银行账号：</strong>${req.invoiceInfo.bankAccount}</div>` : ''}
                    </div>
                </div>
                ${req.note ? `<div style="margin-bottom:16px;"><strong>备注：</strong>${req.note}</div>` : ''}
                ${req.status === 'rejected' && req.rejectReason ? `
                    <div style="margin-bottom:16px;padding:12px;background:#fee;border-left:4px solid #ef4444;">
                        <strong>拒绝原因：</strong>${req.rejectReason}
                    </div>
                ` : ''}
                ${req.approvedBy ? `
                    <div style="margin-bottom:16px;">
                        <strong>审批人：</strong>${req.approvedBy.name || req.approvedBy.username || '-'}<br>
                        <strong>审批时间：</strong>${req.approvedAt ? new Date(req.approvedAt).toLocaleString('zh-CN') : '-'}
                    </div>
                ` : ''}
                ${req.linkedInvoiceId ? `
                    <div style="margin-bottom:16px;padding:12px;background:#efe;border-left:4px solid #10b981;">
                        <strong>已创建发票：</strong>${req.linkedInvoiceId.invoiceNumber || req.linkedInvoiceId}<br>
                        <span style="font-size:12px;color:#666;">金额：¥${(req.linkedInvoiceId.amount || 0).toLocaleString()}，开票日期：${req.linkedInvoiceId.issueDate ? new Date(req.linkedInvoiceId.issueDate).toLocaleDateString() : '-'}</span>
                    </div>
                ` : ''}
            </div>
        `;
        
        showModal({ title: '发票申请详情', body: modalContent });
    } catch (error) {
        showToast('加载失败: ' + error.message, 'error');
    }
}

// 审批通过发票申请
export async function approveInvoiceRequest(requestId) {
    try {
        // 先获取申请详情
        const detailRes = await apiFetch(`/invoice-requests/${requestId}`);
        const detailData = await detailRes.json();
        
        if (!detailData.success) {
            showToast(detailData.error?.message || '加载申请详情失败', 'error');
            return;
        }
        
        const request = detailData.data;
        
        // 如果只有一个项目，直接创建发票
        if (request.projects.length === 1) {
            const project = request.projects[0];
            const modalContent = `
                <div style="padding:20px;">
                    <form id="approveInvoiceRequestForm">
                        <div class="form-group">
                            <label>项目：</label>
                            <input type="text" value="${project.projectNumber || '-'} ${project.projectName || '-'}" readonly style="background:#f5f5f5;">
                            <input type="hidden" id="approveProjectId" value="${project._id}">
                        </div>
                        <div class="form-group">
                            <label>发票号 <span style="color:red;">*</span>：</label>
                            <input type="text" id="approveInvoiceNumber" required style="width:100%;padding:8px;">
                        </div>
                        <div class="form-group">
                            <label>开票日期 <span style="color:red;">*</span>：</label>
                            <input type="date" id="approveIssueDate" required style="width:100%;padding:8px;" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label>申请金额：</label>
                            <input type="text" value="¥${(request.amount || 0).toLocaleString()}" readonly style="background:#f5f5f5;">
                        </div>
                        <div class="form-group">
                            <label>备注：</label>
                            <textarea id="approveInvoiceNote" style="width:100%;padding:8px;min-height:60px;">${request.note || ''}</textarea>
                        </div>
                        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                            <button type="button" data-click="closeModal()" style="padding:8px 16px;background:#ccc;color:white;border:none;border-radius:4px;cursor:pointer;">取消</button>
                            <button type="submit" style="padding:8px 16px;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;">批准并创建发票</button>
                        </div>
                    </form>
                </div>
            `;
            
            showModal({ title: '批准发票申请', body: modalContent });
            
            // 绑定表单提交
            const form = document.getElementById('approveInvoiceRequestForm');
            if (form) {
                form.onsubmit = async (e) => {
                    e.preventDefault();
                    await submitApproveInvoiceRequest(requestId);
                };
            }
        } else {
            // 多个项目，只批准不创建发票
            if (confirm('该申请包含多个项目，批准后将不会自动创建发票。是否批准？')) {
                const res = await apiFetch(`/invoice-requests/${requestId}/approve`, {
                    method: 'POST',
                    body: JSON.stringify({})
                });
                const data = await res.json();
                
                if (data.success) {
                    showToast('申请已批准', 'success');
                    closeModal();
                    loadInvoiceRequests();
                    await refreshProjectsList();
                } else {
                    showToast(data.error?.message || data.message || '批准失败', 'error');
                }
            }
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

// 提交批准申请
async function submitApproveInvoiceRequest(requestId) {
    try {
        const projectId = document.getElementById('approveProjectId')?.value;
        const invoiceNumber = document.getElementById('approveInvoiceNumber')?.value;
        const issueDate = document.getElementById('approveIssueDate')?.value;
        const note = document.getElementById('approveInvoiceNote')?.value || '';
        
        if (!invoiceNumber || !issueDate) {
            showToast('请填写发票号和开票日期', 'error');
            return;
        }
        
        const res = await apiFetch(`/invoice-requests/${requestId}/approve`, {
            method: 'POST',
            body: JSON.stringify({
                projectId,
                invoiceNumber,
                issueDate,
                note
            })
        });
        const data = await res.json();
        
        if (data.success) {
            showToast('申请已批准，发票已创建', 'success');
            closeModal();
            loadInvoiceRequests();
            await refreshProjectsList();
        } else {
            showToast(data.error?.message || data.message || '批准失败', 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

// 拒绝发票申请
export async function rejectInvoiceRequest(requestId) {
    const modalContent = `
        <div style="padding:20px;">
            <form id="rejectInvoiceRequestForm">
                <div class="form-group">
                    <label>拒绝原因 <span style="color:red;">*</span>：</label>
                    <textarea id="rejectReason" required style="width:100%;padding:8px;min-height:100px;" placeholder="请填写拒绝原因..."></textarea>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                    <button type="button" data-click="closeModal()" style="padding:8px 16px;background:#ccc;color:white;border:none;border-radius:4px;cursor:pointer;">取消</button>
                    <button type="submit" style="padding:8px 16px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">确认拒绝</button>
                </div>
            </form>
        </div>
    `;
    
    showModal({ title: '拒绝发票申请', body: modalContent });
    
    const form = document.getElementById('rejectInvoiceRequestForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const rejectReason = document.getElementById('rejectReason')?.value;
            if (!rejectReason || !rejectReason.trim()) {
                showToast('请填写拒绝原因', 'error');
                return;
            }
            
            try {
                const res = await apiFetch(`/invoice-requests/${requestId}/reject`, {
                    method: 'POST',
                    body: JSON.stringify({ rejectReason: rejectReason.trim() })
                });
                const data = await res.json();
                
                if (data.success) {
                    showToast('申请已拒绝', 'success');
                    closeModal();
                    loadInvoiceRequests();
                    await refreshProjectsList();
                } else {
                    showToast(data.error?.message || data.message || '拒绝失败', 'error');
                }
            } catch (error) {
                showToast('操作失败: ' + error.message, 'error');
            }
        };
    }
}

// 刷新项目列表（重新加载发票申请状态）
async function refreshProjectsList() {
    try {
        const { loadProjects } = await import('./project.js');
        if (loadProjects) {
            const filters = {};
            const statusFilter = document.getElementById('projectStatusFilter')?.value;
            const bizFilter = document.getElementById('projectBizFilter')?.value;
            if (statusFilter) filters.status = statusFilter;
            if (bizFilter) filters.businessType = bizFilter;
            await loadProjects(filters);
        }
    } catch (error) {
        console.warn('[Finance] 刷新项目列表失败:', error);
    }
}

// 删除发票申请
export async function deleteInvoiceRequest(requestId) {
    if (!confirm('确定要删除此申请吗？')) return;
    
    try {
        const res = await apiFetch(`/invoice-requests/${requestId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        
        if (data.success) {
            showToast('申请已删除', 'success');
            loadMyInvoiceRequests();
            // 如果当前在财务审批页面，也刷新财务列表
            const invoiceRequestsSection = document.getElementById('financeSection-invoiceRequests');
            if (invoiceRequestsSection && invoiceRequestsSection.style.display !== 'none') {
                loadInvoiceRequests();
            }
            // 刷新项目列表
            await refreshProjectsList();
        } else {
            showToast(data.error?.message || data.message || '删除失败', 'error');
        }
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

// 显示创建发票申请模态框
export async function showCreateInvoiceRequestModal() {
    // 先加载用户的项目列表
    // 注意：后端不支持多个status值，所以不传status参数，在前端过滤
    try {
        const res = await apiFetch('/projects?pageSize=100');
        const data = await res.json();
        
        if (!data.success) {
            showToast('加载项目列表失败', 'error');
            return;
        }
        
        // 先过滤状态：只排除已取消的项目，其余状态都允许申请发票
        const eligibleProjects = (data.data || []).filter(p => 
            p.status !== 'cancelled' && p.status !== 'canceled'
        );
        
        // 后端已按照角色返回可见项目，这里不再按创建者二次过滤，避免因前端缓存缺失导致空列表
        const projects = eligibleProjects;
        
        if (projects.length === 0) {
            showToast('您没有可申请开票的项目', 'error');
            return;
        }
        
        const projectsOptions = projects.map(p => {
            const projectId = (p._id?.toString() || p._id || '').toString();
            // 检查是否有待预选的项目（支持多种ID格式匹配）
            const shouldPreselect = window.pendingSelectedProjectsForInvoice && 
                (window.pendingSelectedProjectsForInvoice.has(projectId) || 
                 window.pendingSelectedProjectsForInvoice.has(p._id) ||
                 Array.from(window.pendingSelectedProjectsForInvoice).some(id => {
                     const idStr = id?.toString() || id;
                     return idStr === projectId || idStr === p._id?.toString() || idStr === p._id;
                 }));
            
            if (window.pendingSelectedProjectsForInvoice && window.pendingSelectedProjectsForInvoice.size > 0) {
                console.log('[Finance] 项目选项检查:', {
                    projectId,
                    projectName: p.projectName,
                    shouldPreselect,
                    pendingSelectedIds: Array.from(window.pendingSelectedProjectsForInvoice)
                });
            }
            
            return `<option value="${projectId}" data-amount="${p.projectAmount || 0}" data-customer="${p.customerId || ''}" ${shouldPreselect ? 'selected' : ''}>${p.projectNumber || '-'} ${p.projectName || '-'} (¥${(p.projectAmount || 0).toLocaleString()})</option>`;
        }).join('');
        
        const modalContent = `
            <div style="padding:20px;max-width:600px;">
                <div style="background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;padding:8px 10px;border-radius:6px;font-size:12px;margin-bottom:12px;">
                    仅非取消项目可申请开票；金额请与回款、项目金额保持一致，回款金额会影响销售回款系数。
                </div>
                <form id="createInvoiceRequestForm">
                    <div class="form-group">
                        <label>选择项目 <span style="color:red;">*</span>（可多选）：</label>
                        <select id="invoiceRequestProjects" multiple required style="width:100%;padding:8px;min-height:120px;">
                            ${projectsOptions}
                        </select>
                        <div style="font-size:12px;color:#666;margin-top:4px;">按住 Ctrl/Cmd 键可多选</div>
                    </div>
                    <div class="form-group">
                        <label>申请金额 <span style="color:red;">*</span>：</label>
                        <input type="number" id="invoiceRequestAmount" step="0.01" min="0" required style="width:100%;padding:8px;" placeholder="请输入申请开票金额">
                        <div id="invoiceRequestAmountHint" style="font-size:12px;color:#666;margin-top:4px;"></div>
                    </div>
                    <div class="form-group">
                        <label>发票类型 <span style="color:red;">*</span>：</label>
                        <select id="invoiceRequestType" required style="width:100%;padding:8px;">
                            <option value="vat">增值税发票</option>
                            <option value="normal">普通发票</option>
                            <option value="other">其他</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>发票抬头 <span style="color:red;">*</span>：</label>
                        <input type="text" id="invoiceRequestTitle" required style="width:100%;padding:8px;" placeholder="请输入发票抬头">
                    </div>
                    <div class="form-group">
                        <label>税号：</label>
                        <input type="text" id="invoiceRequestTaxNumber" style="width:100%;padding:8px;" placeholder="请输入税号">
                    </div>
                    <div class="form-group">
                        <label>地址：</label>
                        <input type="text" id="invoiceRequestAddress" style="width:100%;padding:8px;" placeholder="请输入地址">
                    </div>
                    <div class="form-group">
                        <label>电话：</label>
                        <input type="text" id="invoiceRequestPhone" style="width:100%;padding:8px;" placeholder="请输入电话">
                    </div>
                    <div class="form-group">
                        <label>开户银行：</label>
                        <input type="text" id="invoiceRequestBank" style="width:100%;padding:8px;" placeholder="请输入开户银行">
                    </div>
                    <div class="form-group">
                        <label>银行账号：</label>
                        <input type="text" id="invoiceRequestBankAccount" style="width:100%;padding:8px;" placeholder="请输入银行账号">
                    </div>
                    <div class="form-group">
                        <label>备注：</label>
                        <textarea id="invoiceRequestNote" style="width:100%;padding:8px;min-height:60px;" placeholder="请输入备注"></textarea>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                        <button type="button" data-click="closeModal()" style="padding:8px 16px;background:#ccc;color:white;border:none;border-radius:4px;cursor:pointer;">取消</button>
                        <button type="submit" style="padding:8px 16px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;">提交申请</button>
                    </div>
                </form>
            </div>
        `;
        
        showModal({ title: '申请开票', body: modalContent });
        
        // 绑定项目选择变化事件，自动计算最大金额
        const projectsSelect = document.getElementById('invoiceRequestProjects');
        const amountInput = document.getElementById('invoiceRequestAmount');
        const amountHint = document.getElementById('invoiceRequestAmountHint');
        
        if (projectsSelect && amountInput && amountHint) {
            // 如果有预选的项目，自动计算总金额
            const selectedOptions = Array.from(projectsSelect.selectedOptions);
            if (selectedOptions.length > 0) {
                const totalAmount = selectedOptions.reduce((sum, opt) => {
                    return sum + (parseFloat(opt.dataset.amount) || 0);
                }, 0);
                amountHint.textContent = `所选项目总金额：¥${totalAmount.toLocaleString()}，申请金额不能超过此金额`;
                if (totalAmount > 0) {
                    amountInput.value = totalAmount;
                }
            }
            
            projectsSelect.onchange = () => {
                const selected = Array.from(projectsSelect.selectedOptions);
                const totalAmount = selected.reduce((sum, opt) => {
                    return sum + (parseFloat(opt.dataset.amount) || 0);
                }, 0);
                amountHint.textContent = `所选项目总金额：¥${totalAmount.toLocaleString()}，申请金额不能超过此金额`;
            };
        }
        
        // 清空临时变量
        if (window.pendingSelectedProjectsForInvoice) {
            delete window.pendingSelectedProjectsForInvoice;
        }
        
        // 绑定表单提交（仅绑定一次，避免重复提交）
        const form = document.getElementById('createInvoiceRequestForm');
        if (form) {
            console.log('[Finance] 绑定表单提交事件');
            form.onsubmit = async (e) => {
                e.preventDefault();
                console.log('[Finance] 表单提交事件触发');
                await submitCreateInvoiceRequest();
            };
        } else {
            console.warn('[Finance] 未找到表单元素 createInvoiceRequestForm');
        }
    } catch (error) {
        showToast('加载失败: ' + error.message, 'error');
    }
}

// 提交创建发票申请
async function submitCreateInvoiceRequest() {
    console.log('[Finance] submitCreateInvoiceRequest 函数被调用');
    try {
        const projectsSelect = document.getElementById('invoiceRequestProjects');
        if (!projectsSelect) {
            console.error('[Finance] 未找到项目选择框');
            showToast('表单元素未找到，请刷新页面重试', 'error');
            return;
        }
        
        const selectedProjects = Array.from(projectsSelect.selectedOptions).map(opt => opt.value);
        console.log('[Finance] 选中的项目:', selectedProjects);
        
        if (selectedProjects.length === 0) {
            showToast('请至少选择一个项目', 'error');
            return;
        }
        
        const amount = parseFloat(document.getElementById('invoiceRequestAmount')?.value);
        console.log('[Finance] 申请金额:', amount);
        
        if (!amount || amount <= 0) {
            showToast('申请金额必须大于0', 'error');
            return;
        }
        
        const invoiceType = document.getElementById('invoiceRequestType')?.value;
        const title = document.getElementById('invoiceRequestTitle')?.value?.trim();
        
        if (!title) {
            showToast('请填写发票抬头', 'error');
            return;
        }
        
        const invoiceInfo = {
            title,
            taxNumber: document.getElementById('invoiceRequestTaxNumber')?.value?.trim() || '',
            address: document.getElementById('invoiceRequestAddress')?.value?.trim() || '',
            phone: document.getElementById('invoiceRequestPhone')?.value?.trim() || '',
            bank: document.getElementById('invoiceRequestBank')?.value?.trim() || '',
            bankAccount: document.getElementById('invoiceRequestBankAccount')?.value?.trim() || ''
        };
        
        const note = document.getElementById('invoiceRequestNote')?.value?.trim() || '';
        
        const requestData = {
            projects: selectedProjects,
            amount,
            invoiceType,
            invoiceInfo,
            note
        };
        
        console.log('[Finance] 提交发票申请数据:', requestData);
        
        const res = await apiFetch('/invoice-requests', {
            method: 'POST',
            body: JSON.stringify(requestData)
        });
        
        console.log('[Finance] API 响应状态:', res.status, res.statusText);
        
        const data = await res.json();
        console.log('[Finance] 提交发票申请响应:', data);
        
        if (data.success) {
            showToast('发票申请已提交', 'success');
            closeModal();
            // 刷新销售自己的列表
            loadMyInvoiceRequests();
            // 如果当前在财务审批页面，也刷新财务列表
            const invoiceRequestsSection = document.getElementById('financeSection-invoiceRequests');
            if (invoiceRequestsSection && invoiceRequestsSection.style.display !== 'none') {
                console.log('[Finance] 刷新财务审批列表');
                loadInvoiceRequests();
            }
            // 刷新项目列表
            await refreshProjectsList();
        } else {
            const errorMsg = data.error?.message || data.message || '提交失败';
            console.error('[Finance] 提交失败:', errorMsg);
            showToast(errorMsg, 'error');
        }
    } catch (error) {
        console.error('[Finance] 提交发票申请异常:', error);
        showToast('提交失败: ' + error.message, 'error');
    }
}

