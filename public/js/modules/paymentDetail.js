import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showToast, showAlert } from '../core/utils.js';

let detailCache = [];
let detailPage = 1;
let expandedProjectId = null;
let showOverdueOnly = false;

function getPageSize() {
    const sel = document.getElementById('pcdPageSize');
    return sel ? parseInt(sel.value || '10', 10) : 10;
}

export async function loadPaymentCompletionDetail() {
    const month = document.getElementById('pcdMonth')?.value || '';
    const startDate = document.getElementById('pcdStartDate')?.value || '';
    const endDate = document.getElementById('pcdEndDate')?.value || '';
    const status = document.getElementById('pcdStatus')?.value || '';
    const paymentStatus = document.getElementById('pcdPaymentStatus')?.value || '';

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

    try {
        const res = await apiFetch(`/finance/receivables?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
            showAlert('paymentCompletionList', data.message || '加载失败', 'error');
            return;
        }
        detailCache = data.data || [];
        detailPage = 1;
        renderPaymentCompletionDetail();
    } catch (error) {
        console.error('[paymentDetail] 加载失败:', error);
        showAlert('paymentCompletionList', '加载失败: ' + error.message, 'error');
    }
}

export function renderPaymentCompletionDetail() {
    // 过滤数据（可选：仅看逾期）
    const dataForRender = showOverdueOnly ? (detailCache || []).filter(item => item.overdue) : (detailCache || []);

    const overdueCount = (detailCache || []).filter(item => item.overdue).length;
    const overdueOutstanding = (detailCache || []).filter(item => item.overdue).reduce((sum, item) => sum + (item.outstanding || 0), 0);

    const pageSize = getPageSize();
    const totalPages = Math.max(1, Math.ceil(dataForRender.length / pageSize));
    if (detailPage > totalPages) detailPage = totalPages;
    const start = (detailPage - 1) * pageSize;
    const pageData = dataForRender.slice(start, start + pageSize);

    const paymentStatusText = { unpaid: '未支付', partially_paid: '部分支付', paid: '已支付' };

    const rows = pageData.map(item => {
        const paymentStatus = item.paymentStatus || 'unpaid';
        const paymentStatusBadge = paymentStatus === 'paid' ? 'badge-success' :
            paymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger';
        const projectId = item.id || item.projectId;
        const rate = item.projectAmount ? Math.round((item.receivedAmount || 0) / item.projectAmount * 100) : 0;
        const isExpanded = expandedProjectId === String(projectId);

        return `
        <tr class="${item.overdue ? 'row-overdue' : ''}">
            <td>${item.projectNumber || '-'}</td>
            <td>${item.projectName || '-'}</td>
            <td>${item.customerName || '-'}</td>
            <td>${item.salesName || '-'}</td>
            <td>¥${(item.projectAmount || 0).toLocaleString()}</td>
            <td>¥${(item.receivedAmount || 0).toLocaleString()}</td>
            <td>¥${(item.outstanding || 0).toLocaleString()}</td>
            <td>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span class="badge ${paymentStatusBadge}">${paymentStatusText[paymentStatus] || paymentStatus}</span>
                    ${item.overdue ? '<span class="badge badge-danger" style="background:#f43f5e;">逾期</span>' : ''}
                </div>
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:6px;">
                    <div style="width:90px;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;">
                        <div style="width:${Math.min(100, Math.max(0, rate))}%;height:8px;background:#34d399;"></div>
                    </div>
                    <span style="font-size:12px;color:#555;">${rate}%</span>
                </div>
            </td>
            <td><button class="btn-small" data-click="pcdToggleProject('${projectId}')" style="padding:4px 8px;">${isExpanded ? '收起' : '查看回款'}</button></td>
        </tr>
        ${isExpanded ? `
        <tr>
            <td colspan="10" style="padding:0;">
                <div id="pcd-payments-${projectId}" style="padding:12px;background:#f9fafb;">加载中...</div>
            </td>
        </tr>` : ''}`;
    }).join('');

    document.getElementById('paymentCompletionList').innerHTML = `
        <div style="margin-bottom:12px;">
            ${overdueCount > 0 ? `
                <div style="padding:10px 12px;border:1px solid #fca5a5;background:#fef2f2;color:#b91c1c;border-radius:6px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                    <div style="font-weight:600;">逾期回款项目：${overdueCount} 个，未回款合计 ¥${overdueOutstanding.toLocaleString()}</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <span style="font-size:12px;color:#b91c1c;">请尽快跟进逾期项目</span>
                        <button class="btn-small" style="background:#b91c1c;color:white;border:none;" data-click="pcdToggleOverdue()">${showOverdueOnly ? '显示全部' : '仅看逾期'}</button>
                    </div>
                </div>
            ` : `
                <div style="padding:10px 12px;border:1px solid #bbf7d0;background:#f0fdf4;color:#15803d;border-radius:6px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                    <div style="font-weight:600;">暂无逾期回款项目</div>
                    <button class="btn-small" data-click="pcdToggleOverdue()" style="background:#15803d;color:white;border:none;">${showOverdueOnly ? '显示全部' : '仅看逾期'}</button>
                </div>
            `}
        </div>
        <table class="table-sticky">
            <thead>
                <tr>
                    <th>项目编号</th><th>项目名称</th><th>客户</th><th>销售</th>
                    <th>项目金额</th><th>已回款</th><th>未回款</th><th>回款/逾期状态</th><th>回款完成率</th><th>操作</th>
                </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="10" style="text-align:center;">暂无数据</td></tr>'}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${detailPage<=1?'disabled':''} data-click="pcdPrevPage()">上一页</button>
            <span style="align-self:center;">${detailPage} / ${totalPages}</span>
            <button class="btn-small" ${detailPage>=totalPages?'disabled':''} data-click="pcdNextPage()">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${detailPage}" style="width:70px;padding:6px;" data-change="pcdJumpPage(this.value, ${totalPages})">
        </div>
    `;

    if (expandedProjectId) {
        setTimeout(() => loadProjectPayments(expandedProjectId), 100);
    }
}

export function pcdPrevPage() {
    if (detailPage > 1) {
        detailPage = Math.max(1, detailPage - 1);
        renderPaymentCompletionDetail();
    }
}

export function pcdNextPage() {
    const totalPages = Math.max(1, Math.ceil(detailCache.length / getPageSize()));
    if (detailPage < totalPages) {
        detailPage = Math.min(totalPages, detailPage + 1);
        renderPaymentCompletionDetail();
    }
}

export function pcdJumpPage(page, maxPage) {
    const p = Math.max(1, Math.min(maxPage, parseInt(page) || 1));
    detailPage = p;
    renderPaymentCompletionDetail();
}

export function pcdToggleOverdue() {
    showOverdueOnly = !showOverdueOnly;
    detailPage = 1;
    renderPaymentCompletionDetail();
}

export function pcdToggleProject(projectId) {
    const idStr = String(projectId);
    expandedProjectId = expandedProjectId === idStr ? null : idStr;
    renderPaymentCompletionDetail();
}

async function loadProjectPayments(projectId) {
    const container = document.getElementById(`pcd-payments-${projectId}`);
    if (!container) return;
    try {
        const res = await apiFetch(`/finance/payment/${projectId}`);
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div style="color:#c00;">${data.message || '加载失败'}</div>`;
            return;
        }
        const records = data.data || [];
        if (records.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#666;">暂无回款记录</div>';
            return;
        }
        const rows = records.map(r => `
            <tr>
                <td>${r.amount ? '¥' + Number(r.amount || 0).toLocaleString() : '-'}</td>
                <td>${r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : '-'}</td>
                <td>${r.method || '-'}</td>
                <td>${r.reference || '-'}</td>
                <td>${r.invoiceNumber || '-'}</td>
            </tr>
        `).join('');
        container.innerHTML = `
            <table class="table-simple">
                <thead>
                    <tr><th>金额</th><th>回款日期</th><th>方式</th><th>凭证/备注</th><th>关联发票</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div style="color:#c00;">加载失败: ${error.message}</div>`;
    }
}

