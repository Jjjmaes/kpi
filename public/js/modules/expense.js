// Expense Management Module
import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast } from '../core/utils.js';

// 模块私有状态
let expenseListCache = [];
let expensePage = 1;
let expensePageSize = 20;
let currentTab = 'my'; // 'my' 或 'approve'

// 角色判断（基于当前选中的角色）
function isFinance() {
    const currentRole = state.currentRole;
    return currentRole === 'admin' || currentRole === 'finance';
}

// 费用类型文本
function getExpenseTypeText(type) {
    const map = {
        'travel': '差旅费',
        'meal': '餐费',
        'transport': '交通费',
        'office_supply': '办公用品',
        'communication': '通讯费',
        'other': '其他'
    };
    return map[type] || type;
}

// 状态文本
function getStatusText(status) {
    const map = {
        'pending': '待审批',
        'approved': '已批准',
        'rejected': '已拒绝',
        'paid': '已支付',
        'cancelled': '已取消'
    };
    return map[status] || status;
}

// 状态徽章样式
function getStatusBadgeClass(status) {
    const map = {
        'pending': 'badge-warning',
        'approved': 'badge-success',
        'rejected': 'badge-danger',
        'paid': 'badge-info',
        'cancelled': 'badge-secondary'
    };
    return map[status] || 'badge-secondary';
}

// 更新界面显示（根据角色）
export function updateExpenseUI() {
    const isFinanceRole = isFinance();
    const approveTab = document.getElementById('expenseApproveTab');
    
    // 财务/管理员显示"待审批"标签
    if (approveTab) {
        approveTab.style.display = isFinanceRole ? 'inline-block' : 'none';
    }
    
    // 如果不是财务/管理员，强制切换到"我的申请"
    if (!isFinanceRole && currentTab === 'approve') {
        currentTab = 'my';
        const myTab = document.querySelector('.expense-tab[data-tab="my"]');
        if (myTab) myTab.classList.add('active');
        if (approveTab) approveTab.classList.remove('active');
    }
}

// 切换标签页
export function switchExpenseTab(tab) {
    // 如果不是财务/管理员，不允许切换到"待审批"
    if (tab === 'approve' && !isFinance()) {
        showToast('无权限访问', 'error');
        return;
    }
    
    currentTab = tab;
    const myTab = document.querySelector('.expense-tab[data-tab="my"]');
    const approveTab = document.querySelector('.expense-tab[data-tab="approve"]');
    
    if (myTab) myTab.classList.toggle('active', tab === 'my');
    if (approveTab) approveTab.classList.toggle('active', tab === 'approve');
    
    loadExpenseList();
}

// 加载报销申请列表
export async function loadExpenseList() {
    try {
        const status = document.getElementById('expenseStatusFilter')?.value || '';
        const expenseType = document.getElementById('expenseTypeFilter')?.value || '';
        const pageSize = document.getElementById('expensePageSize')?.value || '20';
        
        expensePageSize = parseInt(pageSize);
        
        const params = new URLSearchParams({
            page: expensePage,
            pageSize: expensePageSize,
            tab: currentTab
        });
        
        if (status) params.append('status', status);
        if (expenseType) params.append('expenseType', expenseType);
        
        const res = await apiFetch(`/expense?${params}`);
        const result = await res.json();
        
        if (result.success) {
            expenseListCache = result.data.requests || [];
            renderExpenseList(result.data);
        } else {
            showToast(result.message || '加载失败', 'error');
        }
    } catch (error) {
        console.error('加载报销申请列表失败:', error);
        showToast('加载失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 渲染报销申请列表
export function renderExpenseList(data) {
    const { requests, pagination } = data;
    const { page: currentPage, totalPages, total } = pagination;
    
    if (requests.length === 0) {
        document.getElementById('expenseList').innerHTML = '<div class="empty-state">暂无报销申请</div>';
        return;
    }
    
    const rows = requests.map(request => {
        const statusBadge = `<span class="badge ${getStatusBadgeClass(request.status)}">${getStatusText(request.status)}</span>`;
        const expenseTypeText = getExpenseTypeText(request.expenseType);
        const createdByName = request.createdBy?.name || '未知';
        const createdDate = new Date(request.createdAt).toLocaleDateString('zh-CN');
        
        let actions = '';
        if (currentTab === 'my') {
            // 我的申请：可以查看、取消（仅pending/rejected状态）
            if (request.status === 'pending' || request.status === 'rejected') {
                actions = `<button class="btn-small btn-danger" data-click="cancelExpense('${request._id}')">取消</button>`;
            }
            actions += `<button class="btn-small btn-primary" data-click="viewExpense('${request._id}')">查看</button>`;
        } else if (currentTab === 'approve' && request.status === 'pending') {
            // 待审批：可以批准、拒绝、查看
            actions = `
                <button class="btn-small btn-success" data-click="approveExpense('${request._id}')">批准</button>
                <button class="btn-small btn-danger" data-click="rejectExpense('${request._id}')">拒绝</button>
                <button class="btn-small btn-primary" data-click="viewExpense('${request._id}')">查看</button>
            `;
        } else {
            // 其他情况：只能查看
            actions = `<button class="btn-small btn-primary" data-click="viewExpense('${request._id}')">查看</button>`;
        }
        
        return `
            <tr>
                <td>${request.requestNumber}</td>
                <td>${expenseTypeText}</td>
                <td>¥${request.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>${createdByName}</td>
                <td>${createdDate}</td>
                <td>${statusBadge}</td>
                <td>${actions}</td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('expenseList').innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>申请编号</th>
                    <th>费用类型</th>
                    <th>总金额</th>
                    <th>申请人</th>
                    <th>申请日期</th>
                    <th>状态</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${currentPage<=1?'disabled':''} data-click="prevExpensePage()">上一页</button>
            <span style="align-self:center;">${currentPage} / ${totalPages}</span>
            <button class="btn-small" ${currentPage>=totalPages?'disabled':''} data-click="nextExpensePage()">下一页</button>
        </div>
    `;
}

// 分页函数
export function prevExpensePage() {
    if (expensePage > 1) {
        expensePage--;
        loadExpenseList();
    }
}

export function nextExpensePage() {
    expensePage++;
    loadExpenseList();
}

export function jumpExpensePage(page, total) {
    const pageNum = parseInt(page);
    if (pageNum >= 1 && pageNum <= total) {
        expensePage = pageNum;
        loadExpenseList();
    }
}

// 显示创建申请模态框
export function showCreateExpenseModal() {
    const content = `
        <form id="createExpenseForm" data-submit="createExpenseRequest(event)">
            <div class="form-group">
                <label>费用类型 <span style="color: #e74c3c;">*</span></label>
                <select id="expenseType" required style="width: 100%;">
                    <option value="">请选择</option>
                    <option value="travel">差旅费</option>
                    <option value="meal">餐费</option>
                    <option value="transport">交通费</option>
                    <option value="office_supply">办公用品</option>
                    <option value="communication">通讯费</option>
                    <option value="other">其他</option>
                </select>
            </div>
            <div id="expenseItems" style="margin-bottom: 20px;">
                <div class="form-group">
                    <label style="display:flex;justify-content:space-between;align-items:center;">
                        <span>费用明细 <span style="color: #e74c3c;">*</span></span>
                        <button type="button" class="btn-small btn-primary" data-click="addExpenseItem()">添加明细</button>
                    </label>
                </div>
                <div id="expenseItemsList"></div>
            </div>
            <div class="form-group">
                <label>总金额（元） <span style="color: #e74c3c;">*</span></label>
                <input type="number" id="expenseTotalAmount" required min="0" step="0.01" style="width: 100%;" readonly>
            </div>
            <div class="form-group">
                <label>申请说明 <span style="color: #e74c3c;">*</span></label>
                <textarea id="expenseReason" required rows="3" style="width: 100%;"></textarea>
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea id="expenseNote" rows="2" style="width: 100%;"></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-secondary" data-click="closeModal()">取消</button>
                <button type="submit" class="btn-primary">提交申请</button>
            </div>
        </form>
    `;
    
    showModal({
        title: '新建报销申请',
        body: content
    });
    
    // 初始化：添加第一条明细
    addExpenseItem();
}

// 添加费用明细行
export function addExpenseItem() {
    const container = document.getElementById('expenseItemsList');
    if (!container) return;
    
    const itemIndex = container.children.length;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'expense-item';
    itemDiv.style.cssText = 'border: 1px solid #e5e7eb; padding: 12px; margin-bottom: 10px; border-radius: 4px; background: #f9fafb;';
    itemDiv.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong>明细 ${itemIndex + 1}</strong>
            <button type="button" class="btn-small btn-danger" onclick="this.closest('.expense-item').remove(); calculateExpenseTotal();">删除</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
            <div>
                <label>费用日期 <span style="color: #e74c3c;">*</span></label>
                <input type="date" class="item-date" required style="width: 100%;" value="${new Date().toISOString().split('T')[0]}" onchange="calculateExpenseTotal()">
            </div>
            <div>
                <label>金额（元） <span style="color: #e74c3c;">*</span></label>
                <input type="number" class="item-amount" required min="0" step="0.01" style="width: 100%;" onchange="calculateExpenseTotal()">
            </div>
            <div>
                <label>费用说明 <span style="color: #e74c3c;">*</span></label>
                <input type="text" class="item-description" required style="width: 100%;">
            </div>
            <div>
                <label>发票号</label>
                <input type="text" class="item-invoice" style="width: 100%;">
            </div>
        </div>
        <div style="margin-top:8px;">
            <label>附件（发票照片等）</label>
            <input type="file" class="item-attachment" multiple accept="image/*,.pdf" style="width: 100%;">
            <small style="color: #666;">支持图片和PDF，可上传多个文件</small>
        </div>
    `;
    container.appendChild(itemDiv);
}

// 计算总金额
window.calculateExpenseTotal = function() {
    const items = document.querySelectorAll('.expense-item');
    let total = 0;
    
    items.forEach(item => {
        const amount = parseFloat(item.querySelector('.item-amount')?.value || 0);
        total += amount;
    });
    
    const totalInput = document.getElementById('expenseTotalAmount');
    if (totalInput) {
        totalInput.value = total.toFixed(2);
    }
};

// 创建报销申请
export async function createExpenseRequest(e) {
    if (e && e.preventDefault) e.preventDefault();
    
    const expenseType = document.getElementById('expenseType')?.value;
    if (!expenseType) {
        showToast('请选择费用类型', 'error');
        return;
    }
    
    const items = [];
    const itemDivs = document.querySelectorAll('.expense-item');
    
    // 收集所有附件（用于邮件发送）
    let allAttachments = [];
    
    for (const itemDiv of itemDivs) {
        const date = itemDiv.querySelector('.item-date')?.value;
        const amount = parseFloat(itemDiv.querySelector('.item-amount')?.value || '0');
        const description = itemDiv.querySelector('.item-description')?.value?.trim();
        
        if (!date || !amount || !description) {
            showToast('请填写完整的费用明细信息', 'error');
            return;
        }
        
        if (amount <= 0) {
            showToast('费用金额必须大于0', 'error');
            return;
        }
        
        // 处理附件：读取文件并转换为 base64
        const attachmentInput = itemDiv.querySelector('.item-attachment');
        let itemAttachments = [];
        if (attachmentInput && attachmentInput.files && attachmentInput.files.length > 0) {
            const files = Array.from(attachmentInput.files);
            const maxSize = 20 * 1024 * 1024; // 20MB
            let totalSize = 0;
            
            // 检查文件大小
            for (const file of files) {
                totalSize += file.size;
                if (file.size > maxSize) {
                    showToast(`文件 "${file.name}" 超过 20MB 限制`, 'error');
                    return;
                }
            }
            if (totalSize > maxSize) {
                showToast(`所有附件总大小超过 20MB 限制`, 'error');
                return;
            }
            
            // 转换为 base64
            try {
                const attachmentPromises = files.map(file => {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const base64 = reader.result.split(',')[1]; // 移除 data:type;base64, 前缀
                            resolve({
                                filename: file.name,
                                content: base64
                            });
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                });
                itemAttachments = await Promise.all(attachmentPromises);
                // 将所有附件添加到总附件列表（用于邮件发送）
                allAttachments.push(...itemAttachments);
            } catch (error) {
                console.error('读取附件失败:', error);
                showToast('读取附件失败，请重试', 'error');
                return;
            }
        }
        
        items.push({
            date,
            amount,
            description,
            invoice: itemDiv.querySelector('.item-invoice')?.value?.trim(),
            attachments: [] // 附件不保存到数据库，只通过邮件发送
        });
    }
    
    if (items.length === 0) {
        showToast('请至少添加一条费用明细', 'error');
        return;
    }
    
    const totalAmount = parseFloat(document.getElementById('expenseTotalAmount')?.value || '0');
    if (totalAmount <= 0) {
        showToast('总金额必须大于0', 'error');
        return;
    }
    
    const reason = document.getElementById('expenseReason')?.value?.trim();
    if (!reason) {
        showToast('请填写申请说明', 'error');
        return;
    }
    
    const note = document.getElementById('expenseNote')?.value?.trim();
    
    try {
        const requestData = {
            expenseType,
            items,
            totalAmount,
            reason: reason.trim(),
            note: note ? note.trim() : undefined,
            attachments: allAttachments.length > 0 ? allAttachments : undefined // 附件数据（base64）
        };
        
        const res = await apiFetch('/expense', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        const result = await res.json();
        
        if (result.success) {
            closeModal();
            showToast('报销申请已提交', 'success');
            expensePage = 1;
            loadExpenseList();
            updateExpensePendingCount();
        } else {
            showToast(result.message || '提交失败', 'error');
        }
    } catch (error) {
        console.error('提交报销申请失败:', error);
        showToast('提交失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 查看报销申请详情
export async function viewExpense(id) {
    try {
        const res = await apiFetch(`/expense/${id}`);
        const result = await res.json();
        
        if (result.success) {
            const request = result.data;
            const expenseTypeText = getExpenseTypeText(request.expenseType);
            const statusText = getStatusText(request.status);
            const createdByName = request.createdBy?.name || '未知';
            const createdDate = new Date(request.createdAt).toLocaleString('zh-CN');
            
            let statusInfo = '';
            if (request.status === 'approved' && request.approvedBy) {
                statusInfo = `
                    <div class="info-row">
                        <label>审批人：</label>
                        <span>${request.approvedBy?.name || '未知'}</span>
                    </div>
                    <div class="info-row">
                        <label>审批时间：</label>
                        <span>${new Date(request.approvedAt).toLocaleString('zh-CN')}</span>
                    </div>
                    ${request.approvalNote ? `
                    <div class="info-row">
                        <label>审批意见：</label>
                        <span>${request.approvalNote}</span>
                    </div>
                    ` : ''}
                `;
            } else if (request.status === 'rejected' && request.approvedBy) {
                statusInfo = `
                    <div class="info-row">
                        <label>审批人：</label>
                        <span>${request.approvedBy?.name || '未知'}</span>
                    </div>
                    <div class="info-row">
                        <label>拒绝时间：</label>
                        <span>${new Date(request.approvedAt).toLocaleString('zh-CN')}</span>
                    </div>
                    <div class="info-row">
                        <label>拒绝原因：</label>
                        <span style="color: #e74c3c;">${request.rejectReason || '无'}</span>
                    </div>
                `;
            } else if (request.status === 'paid' && request.payment) {
                statusInfo = `
                    <div class="info-row">
                        <label>支付人：</label>
                        <span>${request.payment.paidBy?.name || '未知'}</span>
                    </div>
                    <div class="info-row">
                        <label>支付时间：</label>
                        <span>${new Date(request.payment.paidAt).toLocaleString('zh-CN')}</span>
                    </div>
                    ${request.payment.paymentMethod ? `
                    <div class="info-row">
                        <label>支付方式：</label>
                        <span>${request.payment.paymentMethod}</span>
                    </div>
                    ` : ''}
                    ${request.payment.note ? `
                    <div class="info-row">
                        <label>支付备注：</label>
                        <span>${request.payment.note}</span>
                    </div>
                    ` : ''}
                `;
            }
            
            const itemsHtml = request.items.map((item, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${new Date(item.date).toLocaleDateString('zh-CN')}</td>
                    <td>¥${item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>${item.description}</td>
                    <td>${item.invoice || '-'}</td>
                </tr>
            `).join('');
            
            let actions = '';
            if (currentTab === 'my' && (request.status === 'pending' || request.status === 'rejected')) {
                actions = `<button class="btn-danger" data-click="cancelExpense('${request._id}')">取消申请</button>`;
            } else if (currentTab === 'approve' && request.status === 'pending' && isFinance()) {
                actions = `
                    <button class="btn-success" data-click="approveExpense('${request._id}')">批准</button>
                    <button class="btn-danger" data-click="rejectExpense('${request._id}')">拒绝</button>
                `;
            } else if (request.status === 'approved' && isFinance()) {
                actions = `<button class="btn-primary" data-click="markExpensePaid('${request._id}')">标记已支付</button>`;
            }
            
            const content = `
                <div class="expense-detail">
                    <div class="info-section">
                        <h3>基本信息</h3>
                        <div class="info-row">
                            <label>申请编号：</label>
                            <span>${request.requestNumber}</span>
                        </div>
                        <div class="info-row">
                            <label>费用类型：</label>
                            <span>${expenseTypeText}</span>
                        </div>
                        <div class="info-row">
                            <label>总金额：</label>
                            <span style="font-weight: bold; color: #e74c3c;">¥${request.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div class="info-row">
                            <label>申请人：</label>
                            <span>${createdByName}</span>
                        </div>
                        <div class="info-row">
                            <label>申请日期：</label>
                            <span>${createdDate}</span>
                        </div>
                        <div class="info-row">
                            <label>状态：</label>
                            <span class="badge ${getStatusBadgeClass(request.status)}">${statusText}</span>
                        </div>
                        <div class="info-row">
                            <label>申请说明：</label>
                            <span>${request.reason}</span>
                        </div>
                        ${request.note ? `
                        <div class="info-row">
                            <label>备注：</label>
                            <span>${request.note}</span>
                        </div>
                        ` : ''}
                    </div>
                    
                    ${statusInfo ? `
                    <div class="info-section">
                        <h3>审批信息</h3>
                        ${statusInfo}
                    </div>
                    ` : ''}
                    
                    <div class="info-section">
                        <h3>费用明细</h3>
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>序号</th>
                                    <th>日期</th>
                                    <th>金额</th>
                                    <th>说明</th>
                                    <th>发票号</th>
                                </tr>
                            </thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>
                    </div>
                    
                    ${actions ? `
                    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                        ${actions}
                    </div>
                    ` : ''}
                </div>
            `;
            
            showModal({
                title: '报销申请详情',
                body: content
            });
        } else {
            showToast(result.message || '加载失败', 'error');
        }
    } catch (error) {
        console.error('加载报销申请详情失败:', error);
        showToast('加载失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 批准报销申请
export async function approveExpense(id) {
    const approvalNote = prompt('请输入审批意见（可选）：');
    if (approvalNote === null) return; // 用户取消
    
    try {
        const res = await apiFetch(`/expense/${id}/approve`, {
            method: 'PUT',
            body: JSON.stringify({
                approvalNote: approvalNote.trim() || undefined
            })
        });
        
        const result = await res.json();
        
        if (result.success) {
            closeModal();
            showToast('报销申请已批准', 'success');
            loadExpenseList();
            updateExpensePendingCount();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('批准报销申请失败:', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 拒绝报销申请
export async function rejectExpense(id) {
    const rejectReason = prompt('请输入拒绝原因：');
    if (!rejectReason || !rejectReason.trim()) {
        showToast('请填写拒绝原因', 'error');
        return;
    }
    
    try {
        const res = await apiFetch(`/expense/${id}/reject`, {
            method: 'PUT',
            body: JSON.stringify({
                rejectReason: rejectReason.trim()
            })
        });
        
        const result = await res.json();
        
        if (result.success) {
            closeModal();
            showToast('报销申请已拒绝', 'success');
            loadExpenseList();
            updateExpensePendingCount();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('拒绝报销申请失败:', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 标记为已支付
export async function markExpensePaid(id) {
    const paymentMethod = prompt('请输入支付方式（可选）：');
    if (paymentMethod === null) return; // 用户取消
    
    const note = prompt('请输入支付备注（可选）：');
    
    try {
        const res = await apiFetch(`/expense/${id}/pay`, {
            method: 'PUT',
            body: JSON.stringify({
                paymentMethod: paymentMethod?.trim() || undefined,
                note: note?.trim() || undefined
            })
        });
        
        const result = await res.json();
        
        if (result.success) {
            closeModal();
            showToast('报销申请已标记为已支付', 'success');
            loadExpenseList();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('标记已支付失败:', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 取消报销申请
export async function cancelExpense(id) {
    const confirmed = confirm('确定要取消此报销申请吗？');
    if (!confirmed) return;
    
    const cancelReason = prompt('请输入取消原因（可选）：');
    
    try {
        const res = await apiFetch(`/expense/${id}/cancel`, {
            method: 'PUT',
            body: JSON.stringify({
                cancelReason: cancelReason?.trim() || undefined
            })
        });
        
        const result = await res.json();
        
        if (result.success) {
            closeModal();
            showToast('报销申请已取消', 'success');
            loadExpenseList();
            updateExpensePendingCount();
        } else {
            showToast(result.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('取消报销申请失败:', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 更新待审批数量
export async function updateExpensePendingCount() {
    if (!isFinance()) return;
    
    try {
        const res = await apiFetch('/expense/pending/count');
        const result = await res.json();
        
        if (result.success) {
            const badge = document.getElementById('expenseNavBadge');
            if (badge) {
                const count = result.data.count || 0;
                if (count > 0) {
                    badge.textContent = count;
                    badge.style.display = 'inline';
                } else {
                    badge.style.display = 'none';
                }
            }
        }
    } catch (error) {
        console.error('更新待审批数量失败:', error);
    }
}

