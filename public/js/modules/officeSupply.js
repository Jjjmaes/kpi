// Office Supply Management Module
import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, showAlert } from '../core/utils.js';

// 模块私有状态
let officeSupplyListCache = [];
let officeSupplyPage = 1;
let officeSupplyPageSize = 20;
let currentTab = 'my'; // 'my' 或 'approve'

// 角色判断（基于当前选中的角色）
function isAdminStaff() {
    const currentRole = state.currentRole;
    return currentRole === 'admin' || currentRole === 'admin_staff';
}

function isFinance() {
    const currentRole = state.currentRole;
    return currentRole === 'admin' || currentRole === 'finance';
}

// 紧急程度文本
function getUrgencyText(urgency) {
    const map = {
        'normal': '普通',
        'urgent': '紧急',
        'very_urgent': '非常紧急'
    };
    return map[urgency] || urgency;
}

// 状态文本
function getStatusText(status) {
    const map = {
        'pending': '待审批',
        'approved': '已批准',
        'rejected': '已拒绝',
        'purchased': '已采购',
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
        'purchased': 'badge-info',
        'cancelled': 'badge-secondary'
    };
    return map[status] || 'badge-secondary';
}

// 更新界面显示（根据角色）
export function updateOfficeSupplyUI() {
    const isStaff = isAdminStaff();
    const isFinanceRole = isFinance();
    const approveTab = document.getElementById('officeSupplyApproveTab');
    
    // 财务岗显示"待审批"标签
    if (approveTab) {
        approveTab.style.display = isFinanceRole ? 'inline-block' : 'none';
    }
    
    // 如果不是财务岗，强制切换到"我的申请"
    if (!isFinanceRole && currentTab === 'approve') {
        currentTab = 'my';
        const myTab = document.querySelector('.office-supply-tab[data-tab="my"]');
        if (myTab) myTab.classList.add('active');
        if (approveTab) approveTab.classList.remove('active');
    }
}

// 切换标签页
export function switchOfficeSupplyTab(tab) {
    // 如果不是财务岗，不允许切换到"待审批"
    if (tab === 'approve' && !isFinance()) {
        showToast('无权限访问', 'error');
        return;
    }
    
    currentTab = tab;
    const myTab = document.querySelector('.office-supply-tab[data-tab="my"]');
    const approveTab = document.querySelector('.office-supply-tab[data-tab="approve"]');
    
    if (myTab) myTab.classList.toggle('active', tab === 'my');
    if (approveTab) approveTab.classList.toggle('active', tab === 'approve');
    
    loadOfficeSupplyList();
}

// 加载办公用品采购申请列表
export async function loadOfficeSupplyList() {
    try {
        const status = document.getElementById('officeSupplyStatusFilter')?.value || '';
        const pageSize = document.getElementById('officeSupplyPageSize')?.value || '20';
        
        const params = new URLSearchParams();
        params.append('tab', currentTab);
        if (status) params.append('status', status);
        params.append('page', officeSupplyPage);
        params.append('pageSize', pageSize);
        
        const res = await apiFetch(`/officeSupply?${params.toString()}`);
        const data = await res.json();
        
        if (!data.success) {
            showAlert('officeSupplyList', data.message || '加载失败', 'error');
            return;
        }
        
        officeSupplyListCache = data.data || [];
        officeSupplyPageSize = parseInt(pageSize);
        
        // 更新分页信息
        if (data.pagination) {
            officeSupplyPage = data.pagination.page || 1;
            officeSupplyPageSize = data.pagination.pageSize || 20;
        }
        
        renderOfficeSupplyList(data.pagination);
        
        // 更新待审批数量徽章（财务岗）
        if (isFinance()) {
            updatePendingCount();
        }
    } catch (error) {
        console.error('[loadOfficeSupplyList]', error);
        showAlert('officeSupplyList', '加载失败: ' + error.message, 'error');
    }
}

// 渲染办公用品采购申请列表
export function renderOfficeSupplyList(pagination) {
    const container = document.getElementById('officeSupplyList');
    if (!container) return;
    
    if (officeSupplyListCache.length === 0) {
        container.innerHTML = '<div class="card-desc">暂无采购申请</div>';
        return;
    }
    
    const totalPages = pagination ? pagination.totalPages : 1;
    const currentPage = pagination ? pagination.page : officeSupplyPage;
    
    const rows = officeSupplyListCache.map(req => {
        const statusBadge = getStatusBadgeClass(req.status);
        const statusText = getStatusText(req.status);
        const urgencyText = getUrgencyText(req.urgency);
        
        let actions = '';
        if (currentTab === 'approve' && req.status === 'pending') {
            // 财务岗：审批操作
            actions = `
                <button class="btn-small btn-success" data-click="approveOfficeSupply('${req._id}')">批准</button>
                <button class="btn-small btn-danger" data-click="rejectOfficeSupply('${req._id}')">拒绝</button>
            `;
        } else if (currentTab === 'my') {
            if (req.status === 'pending') {
                actions = `<button class="btn-small btn-danger" data-click="cancelOfficeSupply('${req._id}')">取消</button>`;
            } else if (req.status === 'approved' && isAdminStaff()) {
                actions = `<button class="btn-small btn-primary" data-click="markPurchased('${req._id}')">标记已采购</button>`;
            }
        }
        
        const showCreatedBy = currentTab === 'approve';
        
        return `
            <tr>
                <td>${req.requestNumber || '-'}</td>
                ${showCreatedBy ? `<td>${req.createdBy?.name || '-'}</td>` : ''}
                <td>${req.items?.length || 0} 项</td>
                <td>¥${req.totalAmount?.toFixed(2) || '0.00'}</td>
                <td>${urgencyText}</td>
                <td><span class="badge ${statusBadge}">${statusText}</span></td>
                <td>${req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '-'}</td>
                <td>
                    <button class="btn-small" data-click="viewOfficeSupply('${req._id}')">查看</button>
                    ${actions}
                </td>
            </tr>
        `;
    }).join('');
    
    container.innerHTML = `
        <table class="table-sticky">
            <thead>
                <tr>
                    <th>申请编号</th>
                    ${currentTab === 'approve' ? '<th>申请人</th>' : ''}
                    <th>物品数量</th>
                    <th>总金额</th>
                    <th>紧急程度</th>
                    <th>状态</th>
                    <th>申请时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${currentPage<=1?'disabled':''} data-click="prevOfficeSupplyPage()">上一页</button>
            <span style="align-self:center;">${currentPage} / ${totalPages}</span>
            <button class="btn-small" ${currentPage>=totalPages?'disabled':''} data-click="nextOfficeSupplyPage()">下一页</button>
        </div>
    `;
}

// 分页函数
export function prevOfficeSupplyPage() {
    if (officeSupplyPage > 1) {
        officeSupplyPage--;
        loadOfficeSupplyList();
    }
}

export function nextOfficeSupplyPage() {
    officeSupplyPage++;
    loadOfficeSupplyList();
}

export function jumpOfficeSupplyPage(page, total) {
    const pageNum = parseInt(page);
    if (pageNum >= 1 && pageNum <= total) {
        officeSupplyPage = pageNum;
        loadOfficeSupplyList();
    }
}

// 显示创建申请模态框
export function showCreateOfficeSupplyModal() {
    const content = `
        <form id="createOfficeSupplyForm" data-submit="createOfficeSupplyRequest(event)">
            <div id="officeSupplyItems" style="margin-bottom: 20px;">
                <div class="form-group">
                    <label style="display:flex;justify-content:space-between;align-items:center;">
                        <span>采购物品 <span style="color: #e74c3c;">*</span></span>
                        <button type="button" class="btn-small btn-primary" data-click="addOfficeSupplyItem()">添加物品</button>
                    </label>
                </div>
                <div id="officeSupplyItemsList"></div>
            </div>
            <div class="form-group">
                <label>申请用途/说明 <span style="color: #e74c3c;">*</span></label>
                <textarea id="officeSupplyPurpose" required rows="3" style="width: 100%;"></textarea>
            </div>
            <div class="form-group">
                <label>紧急程度</label>
                <select id="officeSupplyUrgency" style="width: 100%;">
                    <option value="normal">普通</option>
                    <option value="urgent">紧急</option>
                    <option value="very_urgent">非常紧急</option>
                </select>
            </div>
            <div class="form-group">
                <label>总金额（元） <span style="color: #e74c3c;">*</span></label>
                <input type="number" id="officeSupplyTotalAmount" required min="0" step="0.01" style="width: 100%;" readonly>
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea id="officeSupplyNote" rows="2" style="width: 100%;"></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-secondary" data-click="closeModal()">取消</button>
                <button type="submit" class="btn-primary">提交申请</button>
            </div>
        </form>
    `;
    
    showModal({
        title: '新建办公用品采购申请',
        body: content
    });
    
    // 初始化：添加第一个物品
    addOfficeSupplyItem();
}

// 添加物品行
export function addOfficeSupplyItem() {
    const container = document.getElementById('officeSupplyItemsList');
    if (!container) return;
    
    const itemIndex = container.children.length;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'office-supply-item';
    itemDiv.style.cssText = 'border: 1px solid #e5e7eb; padding: 12px; margin-bottom: 10px; border-radius: 4px; background: #f9fafb;';
    itemDiv.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong>物品 ${itemIndex + 1}</strong>
            <button type="button" class="btn-small btn-danger" onclick="this.closest('.office-supply-item').remove(); calculateOfficeSupplyTotal();">删除</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
            <div>
                <label>物品名称 <span style="color: #e74c3c;">*</span></label>
                <input type="text" class="item-name" required style="width: 100%;">
            </div>
            <div>
                <label>规格型号</label>
                <input type="text" class="item-specification" style="width: 100%;">
            </div>
            <div>
                <label>数量 <span style="color: #e74c3c;">*</span></label>
                <input type="number" class="item-quantity" required min="1" value="1" style="width: 100%;" onchange="calculateOfficeSupplyTotal()">
            </div>
            <div>
                <label>单位</label>
                <input type="text" class="item-unit" value="件" style="width: 100%;">
            </div>
            <div>
                <label>单价（元）</label>
                <input type="number" class="item-unit-price" min="0" step="0.01" style="width: 100%;" onchange="calculateOfficeSupplyTotal()">
            </div>
            <div>
                <label>小计（元）</label>
                <input type="number" class="item-total-price" min="0" step="0.01" readonly style="width: 100%; background: #f3f4f6;">
            </div>
            <div>
                <label>品牌</label>
                <input type="text" class="item-brand" style="width: 100%;">
            </div>
            <div>
                <label>供应商</label>
                <input type="text" class="item-supplier" style="width: 100%;">
            </div>
        </div>
        <div style="margin-top:8px;">
            <label>备注</label>
            <input type="text" class="item-note" style="width: 100%;">
        </div>
    `;
    container.appendChild(itemDiv);
}

// 计算总金额
window.calculateOfficeSupplyTotal = function() {
    const items = document.querySelectorAll('.office-supply-item');
    let total = 0;
    
    items.forEach(item => {
        const quantity = parseFloat(item.querySelector('.item-quantity')?.value || 0);
        const unitPrice = parseFloat(item.querySelector('.item-unit-price')?.value || 0);
        const itemTotal = quantity * unitPrice;
        
        const totalInput = item.querySelector('.item-total-price');
        if (totalInput) {
            totalInput.value = itemTotal.toFixed(2);
        }
        
        total += itemTotal;
    });
    
    const totalInput = document.getElementById('officeSupplyTotalAmount');
    if (totalInput) {
        totalInput.value = total.toFixed(2);
    }
};

// 创建办公用品采购申请
export async function createOfficeSupplyRequest(e) {
    if (e && e.preventDefault) e.preventDefault();
    
    const items = [];
    const itemDivs = document.querySelectorAll('.office-supply-item');
    
    for (const itemDiv of itemDivs) {
        const name = itemDiv.querySelector('.item-name')?.value?.trim();
        const quantity = parseInt(itemDiv.querySelector('.item-quantity')?.value || '0');
        
        if (!name || quantity <= 0) {
            showToast('请填写完整的物品信息', 'error');
            return;
        }
        
        const unitPrice = parseFloat(itemDiv.querySelector('.item-unit-price')?.value || '0');
        const totalPrice = parseFloat(itemDiv.querySelector('.item-total-price')?.value || '0');
        
        items.push({
            name,
            specification: itemDiv.querySelector('.item-specification')?.value?.trim(),
            quantity,
            unit: itemDiv.querySelector('.item-unit')?.value?.trim() || '件',
            unitPrice: unitPrice || undefined,
            totalPrice: totalPrice || undefined,
            brand: itemDiv.querySelector('.item-brand')?.value?.trim(),
            supplier: itemDiv.querySelector('.item-supplier')?.value?.trim(),
            note: itemDiv.querySelector('.item-note')?.value?.trim()
        });
    }
    
    if (items.length === 0) {
        showToast('请至少添加一个采购物品', 'error');
        return;
    }
    
    const totalAmount = parseFloat(document.getElementById('officeSupplyTotalAmount')?.value || '0');
    const purpose = document.getElementById('officeSupplyPurpose')?.value?.trim();
    const urgency = document.getElementById('officeSupplyUrgency')?.value || 'normal';
    const note = document.getElementById('officeSupplyNote')?.value?.trim();
    
    if (!purpose) {
        showToast('请填写申请用途', 'error');
        return;
    }
    
    if (totalAmount <= 0) {
        showToast('总金额必须大于0', 'error');
        return;
    }
    
    try {
        const res = await apiFetch('/officeSupply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ items, totalAmount, purpose, urgency, note })
        });
        
        if (!res.ok) {
            const errorText = await res.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { message: errorText || '提交失败' };
            }
            showToast(errorData.message || errorData.error?.message || '提交失败', 'error');
            return;
        }
        
        const data = await res.json();
        
        if (!data.success) {
            showToast(data.message || data.error?.message || '提交失败', 'error');
            return;
        }
        
        showToast('采购申请已提交', 'success');
        closeModal();
        if (currentTab !== 'my') {
            switchOfficeSupplyTab('my');
        } else {
            officeSupplyPage = 1;
            loadOfficeSupplyList();
        }
    } catch (error) {
        console.error('[createOfficeSupplyRequest]', error);
        showToast('提交失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 查看申请详情
export async function viewOfficeSupply(id) {
    try {
        const res = await apiFetch(`/officeSupply/${id}`);
        const data = await res.json();
        
        if (!data.success) {
            showToast(data.message || '加载失败', 'error');
            return;
        }
        
        const req = data.data;
        const isStaff = isAdminStaff();
        const isFinanceRole = isFinance();
        const isOwner = req.createdBy?._id?.toString() === state.currentUser?._id?.toString() || 
                       req.createdBy?._id?.toString() === state.currentUser?.id?.toString();
        
        const canApprove = isFinanceRole && req.status === 'pending';
        const canPurchase = isStaff && req.status === 'approved';
        const canCancel = isOwner && req.status === 'pending';
        
        const itemsHtml = req.items?.map((item, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${item.name || '-'}</td>
                <td>${item.specification || '-'}</td>
                <td>${item.quantity || 0}</td>
                <td>${item.unit || '件'}</td>
                <td>${item.unitPrice ? '¥' + item.unitPrice.toFixed(2) : '-'}</td>
                <td>${item.totalPrice ? '¥' + item.totalPrice.toFixed(2) : '-'}</td>
                <td>${item.brand || '-'}</td>
                <td>${item.supplier || '-'}</td>
                <td>${item.note || '-'}</td>
            </tr>
        `).join('') || '';
        
        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px;">
                <div class="card">
                    <div class="card-title">申请信息</div>
                    <div style="padding: 12px;">
                        <div style="margin-bottom: 8px;"><strong>申请编号：</strong>${req.requestNumber || '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>申请人：</strong>${req.createdBy?.name || '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>申请时间：</strong>${req.createdAt ? new Date(req.createdAt).toLocaleString() : '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>状态：</strong><span class="badge ${getStatusBadgeClass(req.status)}">${getStatusText(req.status)}</span></div>
                        <div style="margin-bottom: 8px;"><strong>紧急程度：</strong>${getUrgencyText(req.urgency)}</div>
                        <div style="margin-bottom: 8px;"><strong>总金额：</strong>¥${req.totalAmount?.toFixed(2) || '0.00'}</div>
                        ${req.note ? `<div style="margin-bottom: 8px;"><strong>备注：</strong>${req.note}</div>` : ''}
                    </div>
                </div>
                
                ${req.approvedBy ? `
                <div class="card">
                    <div class="card-title">审批信息</div>
                    <div style="padding: 12px;">
                        <div style="margin-bottom: 8px;"><strong>审批人：</strong>${req.approvedBy?.name || '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>审批时间：</strong>${req.approvedAt ? new Date(req.approvedAt).toLocaleString() : '-'}</div>
                        ${req.approvalNote ? `<div style="margin-bottom: 8px;"><strong>审批意见：</strong>${req.approvalNote}</div>` : ''}
                        ${req.rejectReason ? `<div style="margin-bottom: 8px;"><strong>拒绝原因：</strong>${req.rejectReason}</div>` : ''}
                    </div>
                </div>
                ` : ''}
                
                ${req.purchase?.supplier ? `
                <div class="card">
                    <div class="card-title">采购信息</div>
                    <div style="padding: 12px;">
                        <div style="margin-bottom: 8px;"><strong>供应商：</strong>${req.purchase.supplier}</div>
                        ${req.purchase.purchaseDate ? `<div style="margin-bottom: 8px;"><strong>采购日期：</strong>${new Date(req.purchase.purchaseDate).toLocaleDateString()}</div>` : ''}
                        ${req.purchase.invoiceNumber ? `<div style="margin-bottom: 8px;"><strong>发票号：</strong>${req.purchase.invoiceNumber}</div>` : ''}
                        ${req.purchase.actualAmount ? `<div style="margin-bottom: 8px;"><strong>实际金额：</strong>¥${req.purchase.actualAmount.toFixed(2)}</div>` : ''}
                        ${req.purchase.note ? `<div style="margin-bottom: 8px;"><strong>备注：</strong>${req.purchase.note}</div>` : ''}
                    </div>
                </div>
                ` : ''}
            </div>
            
            <div class="card">
                <div class="card-title">申请用途</div>
                <div style="padding: 12px;">${req.purpose || '-'}</div>
            </div>
            
            <div class="card" style="margin-top: 20px;">
                <div class="card-title">采购物品清单</div>
                <div style="padding: 12px; overflow-x: auto;">
                    <table class="table-sticky" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>序号</th>
                                <th>物品名称</th>
                                <th>规格型号</th>
                                <th>数量</th>
                                <th>单位</th>
                                <th>单价</th>
                                <th>小计</th>
                                <th>品牌</th>
                                <th>供应商</th>
                                <th>备注</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                </div>
            </div>
            
            ${canApprove || canPurchase || canCancel ? `
            <div style="margin-top: 20px; padding: 12px; background: #f0f9ff; border-radius: 4px;">
                <div style="margin-bottom: 12px;"><strong>操作：</strong></div>
                ${canApprove ? `
                    <button class="btn-success" data-click="approveOfficeSupply('${req._id}')" style="margin-right: 8px;">批准</button>
                    <button class="btn-danger" data-click="rejectOfficeSupply('${req._id}')">拒绝</button>
                ` : ''}
                ${canPurchase ? `
                    <button class="btn-primary" data-click="markPurchased('${req._id}')">标记已采购</button>
                ` : ''}
                ${canCancel ? `
                    <button class="btn-danger" data-click="cancelOfficeSupply('${req._id}')">取消申请</button>
                ` : ''}
            </div>
            ` : ''}
        `;
        
        showModal({
            title: `办公用品采购申请详情 - ${req.requestNumber}`,
            body: content,
            footer: `
                <button class="btn-secondary" data-click="closeModal()">关闭</button>
            `
        });
    } catch (error) {
        console.error('[viewOfficeSupply]', error);
        showToast('加载失败: ' + error.message, 'error');
    }
}

// 批准申请
export async function approveOfficeSupply(id) {
    const approvalNote = prompt('请输入审批意见（可选）：');
    if (approvalNote === null) return; // 用户取消
    
    try {
        const res = await apiFetch(`/officeSupply/${id}/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ approvalNote: approvalNote || undefined })
        });
        
        let data;
        try {
            const responseText = await res.text();
            if (responseText) {
                data = JSON.parse(responseText);
            } else {
                data = { success: false, message: '响应为空' };
            }
        } catch (parseError) {
            if (res.ok) {
                showToast('操作可能已成功，请刷新查看', 'info');
                closeModal();
                loadOfficeSupplyList();
                return;
            }
            showToast('响应解析失败', 'error');
            return;
        }
        
        if (!res.ok || !data.success) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            return;
        }
        
        showToast('申请已批准', 'success');
        closeModal();
        loadOfficeSupplyList();
    } catch (error) {
        console.error('[approveOfficeSupply]', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 拒绝申请
export async function rejectOfficeSupply(id) {
    const rejectReason = prompt('请输入拒绝原因：');
    if (!rejectReason || !rejectReason.trim()) return;
    
    try {
        const res = await apiFetch(`/officeSupply/${id}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rejectReason: rejectReason.trim() })
        });
        
        let data;
        try {
            const responseText = await res.text();
            if (responseText) {
                data = JSON.parse(responseText);
            } else {
                data = { success: false, message: '响应为空' };
            }
        } catch (parseError) {
            if (res.ok) {
                showToast('操作可能已成功，请刷新查看', 'info');
                closeModal();
                loadOfficeSupplyList();
                return;
            }
            showToast('响应解析失败', 'error');
            return;
        }
        
        if (!res.ok || !data.success) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            return;
        }
        
        showToast('申请已拒绝', 'success');
        closeModal();
        loadOfficeSupplyList();
    } catch (error) {
        console.error('[rejectOfficeSupply]', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 标记已采购
export function markPurchased(id) {
    const content = `
        <form id="markPurchasedForm" data-submit="submitMarkPurchased(event, '${id}')">
            <div class="form-group">
                <label>供应商</label>
                <input type="text" id="purchaseSupplier" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>采购日期</label>
                <input type="date" id="purchaseDate" style="width: 100%;" value="${new Date().toISOString().slice(0, 10)}">
            </div>
            <div class="form-group">
                <label>发票号</label>
                <input type="text" id="purchaseInvoiceNumber" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>实际金额（元）</label>
                <input type="number" id="purchaseActualAmount" min="0" step="0.01" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea id="purchaseNote" rows="2" style="width: 100%;"></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-secondary" data-click="closeModal()">取消</button>
                <button type="submit" class="btn-primary">确认</button>
            </div>
        </form>
    `;
    
    showModal({
        title: '标记已采购',
        body: content
    });
}

// 提交标记已采购
export async function submitMarkPurchased(e, id) {
    if (e && e.preventDefault) e.preventDefault();
    
    const supplier = document.getElementById('purchaseSupplier')?.value?.trim();
    const purchaseDate = document.getElementById('purchaseDate')?.value;
    const invoiceNumber = document.getElementById('purchaseInvoiceNumber')?.value?.trim();
    const actualAmount = parseFloat(document.getElementById('purchaseActualAmount')?.value || '0') || undefined;
    const note = document.getElementById('purchaseNote')?.value?.trim();
    
    try {
        const res = await apiFetch(`/officeSupply/${id}/purchase`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ supplier, purchaseDate, invoiceNumber, actualAmount, note })
        });
        
        let data;
        try {
            const responseText = await res.text();
            if (responseText) {
                data = JSON.parse(responseText);
            } else {
                data = { success: false, message: '响应为空' };
            }
        } catch (parseError) {
            if (res.ok) {
                showToast('操作可能已成功，请刷新查看', 'info');
                closeModal();
                loadOfficeSupplyList();
                return;
            }
            showToast('响应解析失败', 'error');
            return;
        }
        
        if (!res.ok || !data.success) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            return;
        }
        
        showToast('已标记为已采购', 'success');
        closeModal();
        loadOfficeSupplyList();
    } catch (error) {
        console.error('[submitMarkPurchased]', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 取消申请
export async function cancelOfficeSupply(id) {
    const cancelReason = prompt('请输入取消原因：');
    if (!cancelReason) return;
    
    try {
        const res = await apiFetch(`/officeSupply/${id}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ cancelReason: cancelReason.trim() })
        });
        
        let data;
        try {
            const responseText = await res.text();
            if (responseText) {
                data = JSON.parse(responseText);
            } else {
                data = { success: false, message: '响应为空' };
            }
        } catch (parseError) {
            if (res.ok) {
                showToast('操作可能已成功，请刷新查看', 'info');
                loadOfficeSupplyList();
                return;
            }
            showToast('响应解析失败', 'error');
            return;
        }
        
        if (!res.ok || !data.success) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            return;
        }
        
        showToast('申请已取消', 'success');
        loadOfficeSupplyList();
    } catch (error) {
        console.error('[cancelOfficeSupply]', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 更新待审批数量
export async function updatePendingCount() {
    if (!isFinance()) return;
    
    try {
        const res = await apiFetch('/officeSupply/pending/count');
        const data = await res.json();
        
        if (data.success) {
            const badge = document.getElementById('officeSupplyPendingBadge');
            const navBadge = document.getElementById('officeSupplyNavBadge');
            const count = data.data?.count || 0;
            
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline' : 'none';
            }
            
            if (navBadge) {
                navBadge.textContent = count;
                navBadge.style.display = count > 0 ? 'inline' : 'none';
            }
        }
    } catch (error) {
        console.error('[updatePendingCount]', error);
    }
}


