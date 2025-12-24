// Express Management Module
import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, showAlert } from '../core/utils.js';

// 模块私有状态
let expressListCache = [];
let expressPage = 1;
let expressPageSize = 20;
let currentTab = 'my'; // 'my' 或 'manage'

// 角色判断（基于当前选中的角色，不是所有角色）
function isAdminStaff() {
    const currentRole = state.currentRole;
    return currentRole === 'admin' || currentRole === 'admin_staff';
}

// 内容类型文本
function getContentTypeText(type) {
    const map = {
        'promotion': '促销品',
        'document': '文件',
        'sample': '样品',
        'other': '其他'
    };
    return map[type] || type;
}

// 状态文本
function getStatusText(status) {
    const map = {
        'pending': '待处理',
        'processing': '处理中',
        'sent': '已发出',
        'cancelled': '已取消'
    };
    return map[status] || status;
}

// 状态徽章样式
function getStatusBadgeClass(status) {
    const map = {
        'pending': 'badge-warning',
        'processing': 'badge-info',
        'sent': 'badge-success',
        'cancelled': 'badge-secondary'
    };
    return map[status] || 'badge-secondary';
}

// 更新界面显示（根据角色）
export function updateExpressUI() {
    const isStaff = isAdminStaff();
    const manageTab = document.getElementById('expressManageTab');
    const createdByFilter = document.getElementById('expressCreatedByFilter');
    
    // 显示/隐藏"申请管理"标签
    if (manageTab) {
        manageTab.style.display = isStaff ? 'inline-block' : 'none';
    }
    
    // 如果不是综合岗，强制切换到"我的申请"
    if (!isStaff && currentTab === 'manage') {
        currentTab = 'my';
        const myTab = document.querySelector('.express-tab[data-tab="my"]');
        if (myTab) myTab.classList.add('active');
        if (manageTab) manageTab.classList.remove('active');
    }
    
    // 显示/隐藏筛选条件
    if (createdByFilter) {
        createdByFilter.style.display = (isStaff && currentTab === 'manage') ? 'block' : 'none';
    }
}

// 切换标签页
export function switchExpressTab(tab) {
    // 如果不是综合岗，不允许切换到"申请管理"
    if (tab === 'manage' && !isAdminStaff()) {
        showToast('无权限访问', 'error');
        return;
    }
    
    currentTab = tab;
    const myTab = document.querySelector('.express-tab[data-tab="my"]');
    const manageTab = document.querySelector('.express-tab[data-tab="manage"]');
    
    if (myTab) myTab.classList.toggle('active', tab === 'my');
    if (manageTab) manageTab.classList.toggle('active', tab === 'manage');
    
    // 显示/隐藏筛选条件
    const createdByFilter = document.getElementById('expressCreatedByFilter');
    if (createdByFilter) {
        createdByFilter.style.display = tab === 'manage' ? 'block' : 'none';
    }
    
    loadExpressList();
}

// 加载快递申请列表
export async function loadExpressList() {
    try {
        const status = document.getElementById('expressStatusFilter')?.value || '';
        const createdBy = document.getElementById('expressCreatedByFilter')?.value || '';
        const startDate = document.getElementById('expressStartDate')?.value || '';
        const endDate = document.getElementById('expressEndDate')?.value || '';
        const pageSize = document.getElementById('expressPageSize')?.value || '20';
        
        const params = new URLSearchParams();
        // 传递当前标签页，用于后端权限判断
        params.append('tab', currentTab);
        if (status) params.append('status', status);
        if (createdBy && currentTab === 'manage') params.append('createdBy', createdBy);
        if (startDate) params.append('startDate', startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            params.append('endDate', end.toISOString());
        }
        params.append('page', expressPage);
        params.append('pageSize', pageSize);
        
        const res = await apiFetch(`/express?${params.toString()}`);
        const data = await res.json();
        
        if (!data.success) {
            showAlert('expressList', data.message || '加载失败', 'error');
            return;
        }
        
        expressListCache = data.data || [];
        expressPageSize = parseInt(pageSize);
        
        // 更新分页信息
        if (data.pagination) {
            expressPage = data.pagination.page || 1;
            expressPageSize = data.pagination.pageSize || 20;
        }
        
        // 如果是综合岗，加载申请人列表
        if (isAdminStaff() && currentTab === 'manage') {
            await loadCreatedByOptions();
        }
        
        renderExpressList(data.pagination);
        
        // 更新待处理数量徽章
        if (isAdminStaff()) {
            updatePendingCount();
        }
    } catch (error) {
        console.error('[loadExpressList]', error);
        showAlert('expressList', '加载失败: ' + error.message, 'error');
    }
}

// 渲染快递申请列表
export function renderExpressList(pagination) {
    const container = document.getElementById('expressList');
    if (!container) return;
    
    if (expressListCache.length === 0) {
        container.innerHTML = '<div class="card-desc">暂无快递申请</div>';
        return;
    }
    
    const totalPages = pagination ? pagination.totalPages : 1;
    const currentPage = pagination ? pagination.page : expressPage;
    
    const rows = expressListCache.map(req => {
        const statusBadge = getStatusBadgeClass(req.status);
        const statusText = getStatusText(req.status);
        const contentTypeText = getContentTypeText(req.content?.type);
        
        let actions = '';
        if (isAdminStaff() && currentTab === 'manage') {
            if (req.status === 'pending') {
                actions = `<button class="btn-small btn-primary" data-click="processExpressRequest('${req._id}')">确认</button>`;
            } else if (req.status === 'processing') {
                actions = `<button class="btn-small btn-success" data-click="showSentExpressModal('${req._id}')">已发出</button>`;
            }
        } else if (currentTab === 'my') {
            if (req.status === 'pending' || req.status === 'processing') {
                actions = `<button class="btn-small btn-danger" data-click="cancelExpressRequest('${req._id}')">取消</button>`;
            }
        }
        
        const showCreatedBy = isAdminStaff() && currentTab === 'manage';
        
        return `
            <tr>
                <td>${req.requestNumber || '-'}</td>
                ${showCreatedBy ? `<td>${req.createdBy?.name || '-'}</td>` : ''}
                <td>${req.recipient?.name || '-'}</td>
                <td>${req.recipient?.phone || '-'}</td>
                <td>${contentTypeText}</td>
                <td>${req.content?.description || '-'}</td>
                <td><span class="badge ${statusBadge}">${statusText}</span></td>
                <td>${req.express?.trackingNumber || '-'}</td>
                <td>${req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '-'}</td>
                <td>
                    <button class="btn-small" data-click="viewExpressRequest('${req._id}')">查看</button>
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
                    ${isAdminStaff() && currentTab === 'manage' ? '<th>申请人</th>' : ''}
                    <th>收件人</th>
                    <th>电话</th>
                    <th>内容类型</th>
                    <th>内容描述</th>
                    <th>状态</th>
                    <th>快递单号</th>
                    <th>申请时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${currentPage<=1?'disabled':''} data-click="prevExpressPage()">上一页</button>
            <span style="align-self:center;">${currentPage} / ${totalPages}</span>
            <button class="btn-small" ${currentPage>=totalPages?'disabled':''} data-click="nextExpressPage()">下一页</button>
        </div>
    `;
}

// 分页函数
export function prevExpressPage() {
    if (expressPage > 1) {
        expressPage--;
        loadExpressList();
    }
}

export function nextExpressPage() {
    // 从后端获取总页数，这里先简单处理
    expressPage++;
    loadExpressList();
}

// 显示创建申请模态框
export function showCreateExpressModal() {
    const content = `
        <form id="createExpressForm" data-submit="createExpressRequest(event)">
            <div class="form-group">
                <label>收件人姓名 <span style="color: #e74c3c;">*</span></label>
                <input type="text" id="recipientName" required style="width: 100%;">
            </div>
            <div class="form-group">
                <label>收件人电话 <span style="color: #e74c3c;">*</span></label>
                <input type="text" id="recipientPhone" required style="width: 100%;">
            </div>
            <div class="form-group">
                <label>收件地址 <span style="color: #e74c3c;">*</span></label>
                <textarea id="recipientAddress" required rows="3" style="width: 100%;"></textarea>
            </div>
            <div class="form-group">
                <label>省份</label>
                <input type="text" id="recipientProvince" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>城市</label>
                <input type="text" id="recipientCity" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>区县</label>
                <input type="text" id="recipientDistrict" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>邮编</label>
                <input type="text" id="recipientPostalCode" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>内容类型 <span style="color: #e74c3c;">*</span></label>
                <select id="contentType" required style="width: 100%;">
                    <option value="promotion">促销品</option>
                    <option value="document">文件</option>
                    <option value="sample">样品</option>
                    <option value="other">其他</option>
                </select>
            </div>
            <div class="form-group">
                <label>内容描述 <span style="color: #e74c3c;">*</span></label>
                <textarea id="contentDescription" required rows="3" style="width: 100%;"></textarea>
            </div>
            <div class="form-group">
                <label>数量</label>
                <input type="number" id="contentQuantity" min="1" value="1" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>重量（kg）</label>
                <input type="number" id="contentWeight" min="0" step="0.1" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>预估价值（元）</label>
                <input type="number" id="contentEstimatedValue" min="0" step="0.01" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea id="expressNote" rows="2" style="width: 100%;"></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-secondary" data-click="closeModal()">取消</button>
                <button type="submit" class="btn-primary">提交申请</button>
            </div>
        </form>
    `;
    
    showModal({
        title: '新建快递申请',
        body: content
    });
}

// 创建快递申请
export async function createExpressRequest(e) {
    console.log('[createExpressRequest] 函数被调用', e);
    if (e && e.preventDefault) e.preventDefault();
    
    const recipient = {
        name: document.getElementById('recipientName')?.value?.trim(),
        phone: document.getElementById('recipientPhone')?.value?.trim(),
        address: document.getElementById('recipientAddress')?.value?.trim(),
        province: document.getElementById('recipientProvince')?.value?.trim(),
        city: document.getElementById('recipientCity')?.value?.trim(),
        district: document.getElementById('recipientDistrict')?.value?.trim(),
        postalCode: document.getElementById('recipientPostalCode')?.value?.trim()
    };
    
    const content = {
        type: document.getElementById('contentType')?.value,
        description: document.getElementById('contentDescription')?.value?.trim(),
        quantity: parseInt(document.getElementById('contentQuantity')?.value || '1'),
        weight: parseFloat(document.getElementById('contentWeight')?.value || '0') || undefined,
        estimatedValue: parseFloat(document.getElementById('contentEstimatedValue')?.value || '0') || undefined
    };
    
    const note = document.getElementById('expressNote')?.value?.trim();
    
    if (!recipient.name || !recipient.phone || !recipient.address) {
        showToast('请填写完整的收件人信息', 'error');
        return;
    }
    
    if (!content.type || !content.description) {
        showToast('请填写完整的邮寄内容信息', 'error');
        return;
    }
    
    try {
        const res = await apiFetch('/express', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ recipient, content, note })
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
            console.error('[createExpressRequest] API error:', res.status, errorData);
            return;
        }
        
        const data = await res.json();
        
        if (!data.success) {
            showToast(data.message || data.error?.message || '提交失败', 'error');
            console.error('[createExpressRequest] Response error:', data);
            return;
        }
        
        showToast('快递申请已提交', 'success');
        closeModal();
        // 确保切换到"我的申请"标签并刷新
        if (currentTab !== 'my') {
            switchExpressTab('my');
        } else {
            expressPage = 1; // 重置到第一页
            loadExpressList();
        }
    } catch (error) {
        console.error('[createExpressRequest] Exception:', error);
        showToast('提交失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 查看快递申请详情
export async function viewExpressRequest(id) {
    try {
        const res = await apiFetch(`/express/${id}`);
        const data = await res.json();
        
        if (!data.success) {
            showToast(data.message || '加载失败', 'error');
            return;
        }
        
        const req = data.data;
        const isStaff = isAdminStaff();
        const canProcess = isStaff && (req.status === 'pending' || req.status === 'processing');
        
        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                <div class="card">
                    <div class="card-title">申请信息</div>
                    <div style="padding: 12px;">
                        <div style="margin-bottom: 8px;"><strong>申请编号：</strong>${req.requestNumber || '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>申请人：</strong>${req.createdBy?.name || '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>申请时间：</strong>${req.createdAt ? new Date(req.createdAt).toLocaleString() : '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>状态：</strong><span class="badge ${getStatusBadgeClass(req.status)}">${getStatusText(req.status)}</span></div>
                        ${req.note ? `<div style="margin-bottom: 8px;"><strong>备注：</strong>${req.note}</div>` : ''}
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-title">收件人信息</div>
                    <div style="padding: 12px;">
                        <div style="margin-bottom: 8px;"><strong>姓名：</strong>${req.recipient?.name || '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>电话：</strong>${req.recipient?.phone || '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>地址：</strong>${req.recipient?.address || '-'}</div>
                        ${req.recipient?.province ? `<div style="margin-bottom: 8px;"><strong>省市区：</strong>${[req.recipient.province, req.recipient.city, req.recipient.district].filter(Boolean).join(' ')}</div>` : ''}
                        ${req.recipient?.postalCode ? `<div style="margin-bottom: 8px;"><strong>邮编：</strong>${req.recipient.postalCode}</div>` : ''}
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-title">邮寄内容</div>
                    <div style="padding: 12px;">
                        <div style="margin-bottom: 8px;"><strong>类型：</strong>${getContentTypeText(req.content?.type)}</div>
                        <div style="margin-bottom: 8px;"><strong>描述：</strong>${req.content?.description || '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>数量：</strong>${req.content?.quantity || 1}</div>
                        ${req.content?.weight ? `<div style="margin-bottom: 8px;"><strong>重量：</strong>${req.content.weight} kg</div>` : ''}
                        ${req.content?.estimatedValue ? `<div style="margin-bottom: 8px;"><strong>预估价值：</strong>¥${req.content.estimatedValue}</div>` : ''}
                    </div>
                </div>
                
                ${req.express?.trackingNumber || req.express?.company ? `
                <div class="card">
                    <div class="card-title">快递信息</div>
                    <div style="padding: 12px;">
                        ${req.express?.company ? `<div style="margin-bottom: 8px;"><strong>快递公司：</strong>${req.express.company}</div>` : ''}
                        ${req.express?.trackingNumber ? `<div style="margin-bottom: 8px;"><strong>快递单号：</strong>${req.express.trackingNumber}</div>` : ''}
                        ${req.express?.cost ? `<div style="margin-bottom: 8px;"><strong>快递费用：</strong>¥${req.express.cost}</div>` : ''}
                        ${req.express?.sentAt ? `<div style="margin-bottom: 8px;"><strong>发出时间：</strong>${new Date(req.express.sentAt).toLocaleString()}</div>` : ''}
                        ${req.processedBy ? `<div style="margin-bottom: 8px;"><strong>处理人：</strong>${req.processedBy?.name || '-'}</div>` : ''}
                    </div>
                </div>
                ` : ''}
            </div>
            
            ${canProcess ? `
            <div style="margin-top: 20px; padding: 12px; background: #f0f9ff; border-radius: 4px;">
                <div style="margin-bottom: 12px;"><strong>处理操作：</strong></div>
                ${req.status === 'pending' ? `
                    <button class="btn-primary" data-click="processExpressRequest('${req._id}')">确认</button>
                ` : ''}
                ${req.status === 'processing' ? `
                    <button class="btn-success" data-click="showSentExpressModal('${req._id}')">标记已发出</button>
                ` : ''}
            </div>
            ` : ''}
        `;
        
        showModal({
            title: `快递申请详情 - ${req.requestNumber}`,
            body: content,
            footer: `
                <button class="btn-secondary" data-click="closeModal()">关闭</button>
            `
        });
    } catch (error) {
        console.error('[viewExpressRequest]', error);
        showToast('加载失败: ' + error.message, 'error');
    }
}

// 处理申请（接单）
export async function processExpressRequest(id) {
    if (!confirm('确认处理该申请？')) return;
    
    try {
        console.log('[processExpressRequest] 开始处理申请:', id);
        const res = await apiFetch(`/express/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'processing' })
        });
        
        console.log('[processExpressRequest] 响应状态:', res.status, res.ok);
        
        let data;
        try {
            const responseText = await res.text();
            console.log('[processExpressRequest] 响应内容:', responseText);
            if (responseText) {
                data = JSON.parse(responseText);
            } else {
                data = { success: false, message: '响应为空' };
            }
        } catch (parseError) {
            console.error('[processExpressRequest] JSON 解析失败:', parseError);
            // 即使解析失败，如果状态码是 2xx，也认为可能成功
            if (res.ok) {
                console.log('[processExpressRequest] 响应解析失败但状态码为成功，尝试刷新列表');
                showToast('操作可能已成功，请刷新查看', 'info');
                closeModal();
                loadExpressList();
                return;
            }
            showToast('响应解析失败', 'error');
            return;
        }
        
        if (!res.ok) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            console.error('[processExpressRequest] API error:', res.status, data);
            return;
        }
        
        if (!data.success) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            console.error('[processExpressRequest] Response error:', data);
            return;
        }
        
        console.log('[processExpressRequest] 操作成功:', data);
        showToast('已确认', 'success');
        closeModal();
        loadExpressList();
    } catch (error) {
        console.error('[processExpressRequest] Exception:', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 显示已发出模态框
export function showSentExpressModal(id) {
    const content = `
        <form id="sentExpressForm" data-submit="markExpressSent(event, '${id}')">
            <div class="form-group">
                <label>快递公司 <span style="color: #e74c3c;">*</span></label>
                <select id="expressCompany" required style="width: 100%;">
                    <option value="">请选择</option>
                    <option value="顺丰">顺丰</option>
                    <option value="圆通">圆通</option>
                    <option value="中通">中通</option>
                    <option value="申通">申通</option>
                    <option value="韵达">韵达</option>
                    <option value="京东快递">京东快递</option>
                    <option value="EMS">EMS</option>
                    <option value="其他">其他</option>
                </select>
            </div>
            <div class="form-group">
                <label>快递单号 <span style="color: #e74c3c;">*</span></label>
                <input type="text" id="expressTrackingNumber" required style="width: 100%;">
            </div>
            <div class="form-group">
                <label>快递费用（元）</label>
                <input type="number" id="expressCost" min="0" step="0.01" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>发出时间</label>
                <input type="datetime-local" id="expressSentAt" style="width: 100%;" value="${new Date().toISOString().slice(0, 16)}">
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea id="expressSentNote" rows="2" style="width: 100%;"></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-secondary" data-click="closeModal()">取消</button>
                <button type="submit" class="btn-success">确认已发出</button>
            </div>
        </form>
    `;
    
    showModal({
        title: '标记已发出',
        body: content
    });
}

// 标记已发出
export async function markExpressSent(e, id) {
    console.log('[markExpressSent] 函数被调用', e, id);
    if (e && e.preventDefault) e.preventDefault();
    
    const company = document.getElementById('expressCompany')?.value?.trim();
    const trackingNumber = document.getElementById('expressTrackingNumber')?.value?.trim();
    const cost = parseFloat(document.getElementById('expressCost')?.value || '0') || undefined;
    const sentAt = document.getElementById('expressSentAt')?.value;
    const note = document.getElementById('expressSentNote')?.value?.trim();
    
    if (!company || !trackingNumber) {
        showToast('请填写快递公司和单号', 'error');
        return;
    }
    
    try {
        const express = {
            company,
            trackingNumber,
            cost,
            sentAt: sentAt ? new Date(sentAt).toISOString() : new Date().toISOString()
        };
        
        console.log('[markExpressSent] 开始标记已发出:', id, express);
        const res = await apiFetch(`/express/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'sent', express, note })
        });
        
        console.log('[markExpressSent] 响应状态:', res.status, res.ok);
        
        let data;
        try {
            const responseText = await res.text();
            console.log('[markExpressSent] 响应内容:', responseText);
            if (responseText) {
                data = JSON.parse(responseText);
            } else {
                data = { success: false, message: '响应为空' };
            }
        } catch (parseError) {
            console.error('[markExpressSent] JSON 解析失败:', parseError);
            // 即使解析失败，如果状态码是 2xx，也认为可能成功
            if (res.ok) {
                console.log('[markExpressSent] 响应解析失败但状态码为成功，尝试刷新列表');
                showToast('操作可能已成功，请刷新查看', 'info');
                closeModal();
                loadExpressList();
                return;
            }
            showToast('响应解析失败', 'error');
            return;
        }
        
        if (!res.ok) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            console.error('[markExpressSent] API error:', res.status, data);
            return;
        }
        
        if (!data.success) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            console.error('[markExpressSent] Response error:', data);
            return;
        }
        
        console.log('[markExpressSent] 操作成功:', data);
        showToast('已标记为已发出', 'success');
        closeModal();
        loadExpressList();
    } catch (error) {
        console.error('[markExpressSent] Exception:', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 取消申请
export async function cancelExpressRequest(id) {
    const reason = prompt('请输入取消原因：');
    if (!reason) return;
    
    try {
        console.log('[cancelExpressRequest] 开始取消申请:', id, reason);
        const res = await apiFetch(`/express/${id}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ cancelReason: reason })
        });
        
        console.log('[cancelExpressRequest] 响应状态:', res.status, res.ok);
        
        let data;
        try {
            const responseText = await res.text();
            console.log('[cancelExpressRequest] 响应内容:', responseText);
            if (responseText) {
                data = JSON.parse(responseText);
            } else {
                data = { success: false, message: '响应为空' };
            }
        } catch (parseError) {
            console.error('[cancelExpressRequest] JSON 解析失败:', parseError);
            // 即使解析失败，如果状态码是 2xx，也认为可能成功
            if (res.ok) {
                console.log('[cancelExpressRequest] 响应解析失败但状态码为成功，尝试刷新列表');
                showToast('操作可能已成功，请刷新查看', 'info');
                loadExpressList();
                return;
            }
            showToast('响应解析失败', 'error');
            return;
        }
        
        if (!res.ok) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            console.error('[cancelExpressRequest] API error:', res.status, data);
            return;
        }
        
        if (!data.success) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            console.error('[cancelExpressRequest] Response error:', data);
            return;
        }
        
        console.log('[cancelExpressRequest] 操作成功:', data);
        showToast('申请已取消', 'success');
        loadExpressList();
    } catch (error) {
        console.error('[cancelExpressRequest] Exception:', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 加载申请人选项（综合岗用）
async function loadCreatedByOptions() {
    try {
        const res = await apiFetch('/users');
        const data = await res.json();
        
        if (data.success && Array.isArray(data.data)) {
            const select = document.getElementById('expressCreatedByFilter');
            if (select) {
                const currentValue = select.value;
                select.innerHTML = '<option value="">全部申请人</option>' +
                    data.data
                        .filter(u => u.isActive)
                        .map(u => `<option value="${u._id}">${u.name || u.username}</option>`)
                        .join('');
                if (currentValue) {
                    select.value = currentValue;
                }
            }
        }
    } catch (error) {
        console.error('[loadCreatedByOptions]', error);
    }
}

// 更新待处理数量
export async function updatePendingCount() {
    if (!isAdminStaff()) return;
    
    try {
        const res = await apiFetch('/express/pending/count');
        const data = await res.json();
        
        if (data.success) {
            const badge = document.getElementById('expressPendingBadge');
            const navBadge = document.getElementById('expressNavBadge');
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

