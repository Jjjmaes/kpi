// Seal Management Module
import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, showAlert } from '../core/utils.js';

// 模块私有状态
let sealListCache = [];
let sealPage = 1;
let sealPageSize = 20;
let currentTab = 'my'; // 'my' 或 'manage'

// 角色判断（基于当前选中的角色）
function isAdminStaff() {
    const currentRole = state.currentRole;
    return currentRole === 'admin' || currentRole === 'admin_staff';
}

// 状态文本
function getStatusText(status) {
    const map = {
        'pending': '待处理',
        'processing': '使用中',
        'returned': '已归还',
        'cancelled': '已取消'
    };
    return map[status] || status;
}

// 状态徽章样式
function getStatusBadgeClass(status) {
    const map = {
        'pending': 'badge-warning',
        'processing': 'badge-info',
        'returned': 'badge-success',
        'cancelled': 'badge-secondary'
    };
    return map[status] || 'badge-secondary';
}

// 更新界面显示（根据角色）
export function updateSealUI() {
    const isStaff = isAdminStaff();
    const manageTab = document.getElementById('sealManageTab');
    
    // 显示/隐藏"申请管理"标签
    if (manageTab) {
        manageTab.style.display = isStaff ? 'inline-block' : 'none';
    }
    
    // 如果不是综合岗，强制切换到"我的申请"
    if (!isStaff && currentTab === 'manage') {
        currentTab = 'my';
        const myTab = document.querySelector('.seal-tab[data-tab="my"]');
        if (myTab) myTab.classList.add('active');
        if (manageTab) manageTab.classList.remove('active');
    }
}

// 切换标签页
export function switchSealTab(tab) {
    // 如果不是综合岗，不允许切换到"申请管理"
    if (tab === 'manage' && !isAdminStaff()) {
        showToast('无权限访问', 'error');
        return;
    }
    
    currentTab = tab;
    const myTab = document.querySelector('.seal-tab[data-tab="my"]');
    const manageTab = document.querySelector('.seal-tab[data-tab="manage"]');
    
    if (myTab) myTab.classList.toggle('active', tab === 'my');
    if (manageTab) manageTab.classList.toggle('active', tab === 'manage');
    
    loadSealList();
}

// 加载章证使用申请列表
export async function loadSealList() {
    try {
        const status = document.getElementById('sealStatusFilter')?.value || '';
        const sealType = document.getElementById('sealTypeFilter')?.value || '';
        const pageSize = document.getElementById('sealPageSize')?.value || '20';
        
        const params = new URLSearchParams();
        params.append('tab', currentTab);
        if (status) params.append('status', status);
        if (sealType) params.append('sealType', sealType);
        params.append('page', sealPage);
        params.append('pageSize', pageSize);
        
        const res = await apiFetch(`/seal?${params.toString()}`);
        const data = await res.json();
        
        if (!data.success) {
            showAlert('sealList', data.message || '加载失败', 'error');
            return;
        }
        
        sealListCache = data.data || [];
        sealPageSize = parseInt(pageSize);
        
        // 更新分页信息
        if (data.pagination) {
            sealPage = data.pagination.page || 1;
            sealPageSize = data.pagination.pageSize || 20;
        }
        
        renderSealList(data.pagination);
        
        // 更新待处理数量徽章（行政综合岗）
        if (isAdminStaff()) {
            updatePendingCount();
        }
    } catch (error) {
        console.error('[loadSealList]', error);
        showAlert('sealList', '加载失败: ' + error.message, 'error');
    }
}

// 渲染章证使用申请列表
export function renderSealList(pagination) {
    const container = document.getElementById('sealList');
    if (!container) return;
    
    if (sealListCache.length === 0) {
        container.innerHTML = '<div class="card-desc">暂无章证使用申请</div>';
        return;
    }
    
    const totalPages = pagination ? pagination.totalPages : 1;
    const currentPage = pagination ? pagination.page : sealPage;
    
    const rows = sealListCache.map(req => {
        const statusBadge = getStatusBadgeClass(req.status);
        const statusText = getStatusText(req.status);
        
        let actions = '';
        if (isAdminStaff() && currentTab === 'manage') {
            if (req.status === 'pending') {
                actions = `<button class="btn-small btn-primary" data-click="processSeal('${req._id}')">确认使用</button>`;
            } else if (req.status === 'processing') {
                actions = `<button class="btn-small btn-success" data-click="returnSeal('${req._id}')">标记归还</button>`;
            }
        } else if (currentTab === 'my') {
            if (req.status === 'pending') {
                actions = `<button class="btn-small btn-danger" data-click="cancelSeal('${req._id}')">取消</button>`;
            }
        }
        
        const showCreatedBy = isAdminStaff() && currentTab === 'manage';
        
        return `
            <tr>
                <td>${req.requestNumber || '-'}</td>
                ${showCreatedBy ? `<td>${req.createdBy?.name || '-'}</td>` : ''}
                <td>${req.sealType || '-'}</td>
                <td>${req.purpose || '-'}</td>
                <td>${req.useDate ? new Date(req.useDate).toLocaleDateString() : '-'}</td>
                <td>${req.expectedReturnDate ? new Date(req.expectedReturnDate).toLocaleDateString() : '-'}</td>
                <td><span class="badge ${statusBadge}">${statusText}</span></td>
                <td>${req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '-'}</td>
                <td>
                    <button class="btn-small" data-click="viewSeal('${req._id}')">查看</button>
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
                    <th>章证类型</th>
                    <th>使用用途</th>
                    <th>使用日期</th>
                    <th>预计归还日期</th>
                    <th>状态</th>
                    <th>申请时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${currentPage<=1?'disabled':''} data-click="prevSealPage()">上一页</button>
            <span style="align-self:center;">${currentPage} / ${totalPages}</span>
            <button class="btn-small" ${currentPage>=totalPages?'disabled':''} data-click="nextSealPage()">下一页</button>
        </div>
    `;
}

// 分页函数
export function prevSealPage() {
    if (sealPage > 1) {
        sealPage--;
        loadSealList();
    }
}

export function nextSealPage() {
    sealPage++;
    loadSealList();
}

export function jumpSealPage(page, total) {
    const pageNum = parseInt(page);
    if (pageNum >= 1 && pageNum <= total) {
        sealPage = pageNum;
        loadSealList();
    }
}

// 显示创建申请模态框
export function showCreateSealModal() {
    const content = `
        <form id="createSealForm" data-submit="createSealRequest(event)">
            <div class="form-group">
                <label>章证类型 <span style="color: #e74c3c;">*</span></label>
                <select id="sealType" required style="width: 100%;">
                    <option value="">请选择</option>
                    <option value="公章">公章</option>
                    <option value="合同章">合同章</option>
                    <option value="法人章">法人章</option>
                    <option value="财务章">财务章</option>
                    <option value="营业执照及复印件">营业执照及复印件</option>
                </select>
            </div>
            <div class="form-group">
                <label>使用用途 <span style="color: #e74c3c;">*</span></label>
                <textarea id="sealPurpose" required rows="3" style="width: 100%;"></textarea>
            </div>
            <div class="form-group">
                <label>使用日期 <span style="color: #e74c3c;">*</span></label>
                <input type="date" id="sealUseDate" required style="width: 100%;" value="${new Date().toISOString().slice(0, 10)}">
            </div>
            <div class="form-group">
                <label>预计归还日期</label>
                <input type="date" id="sealExpectedReturnDate" style="width: 100%;">
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea id="sealNote" rows="2" style="width: 100%;"></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-secondary" data-click="closeModal()">取消</button>
                <button type="submit" class="btn-primary">提交申请</button>
            </div>
        </form>
    `;
    
    showModal({
        title: '新建章证使用申请',
        body: content
    });
}

// 创建章证使用申请
export async function createSealRequest(e) {
    if (e && e.preventDefault) e.preventDefault();
    
    const sealType = document.getElementById('sealType')?.value;
    const purpose = document.getElementById('sealPurpose')?.value?.trim();
    const useDate = document.getElementById('sealUseDate')?.value;
    const expectedReturnDate = document.getElementById('sealExpectedReturnDate')?.value;
    const note = document.getElementById('sealNote')?.value?.trim();
    
    if (!sealType) {
        showToast('请选择章证类型', 'error');
        return;
    }
    
    if (!purpose) {
        showToast('请填写使用用途', 'error');
        return;
    }
    
    if (!useDate) {
        showToast('请选择使用日期', 'error');
        return;
    }
    
    try {
        const res = await apiFetch('/seal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sealType, purpose, useDate, expectedReturnDate, note })
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
        
        showToast('章证使用申请已提交', 'success');
        closeModal();
        if (currentTab !== 'my') {
            switchSealTab('my');
        } else {
            sealPage = 1;
            loadSealList();
        }
    } catch (error) {
        console.error('[createSealRequest]', error);
        showToast('提交失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 查看申请详情
export async function viewSeal(id) {
    try {
        const res = await apiFetch(`/seal/${id}`);
        const data = await res.json();
        
        if (!data.success) {
            showToast(data.message || '加载失败', 'error');
            return;
        }
        
        const req = data.data;
        const isStaff = isAdminStaff();
        const isOwner = req.createdBy?._id?.toString() === state.currentUser?._id?.toString() || 
                       req.createdBy?._id?.toString() === state.currentUser?.id?.toString();
        
        const canProcess = isStaff && req.status === 'pending';
        const canReturn = isStaff && req.status === 'processing';
        const canCancel = isOwner && req.status === 'pending';
        
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
                    <div class="card-title">章证信息</div>
                    <div style="padding: 12px;">
                        <div style="margin-bottom: 8px;"><strong>章证类型：</strong>${req.sealType || '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>使用用途：</strong>${req.purpose || '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>使用日期：</strong>${req.useDate ? new Date(req.useDate).toLocaleDateString() : '-'}</div>
                        <div style="margin-bottom: 8px;"><strong>预计归还日期：</strong>${req.expectedReturnDate ? new Date(req.expectedReturnDate).toLocaleDateString() : '-'}</div>
                    </div>
                </div>
                
                ${req.processedBy ? `
                <div class="card">
                    <div class="card-title">处理信息</div>
                    <div style="padding: 12px;">
                        <div style="margin-bottom: 8px;"><strong>操作人：</strong>${req.processedBy?.name || '-'}</div>
                        ${req.useStartAt ? `<div style="margin-bottom: 8px;"><strong>使用开始时间：</strong>${new Date(req.useStartAt).toLocaleString()}</div>` : ''}
                        ${req.returnedAt ? `<div style="margin-bottom: 8px;"><strong>归还时间：</strong>${new Date(req.returnedAt).toLocaleString()}</div>` : ''}
                        ${req.returnNote ? `<div style="margin-bottom: 8px;"><strong>归还备注：</strong>${req.returnNote}</div>` : ''}
                    </div>
                </div>
                ` : ''}
                
                ${req.cancelReason ? `
                <div class="card">
                    <div class="card-title">取消信息</div>
                    <div style="padding: 12px;">
                        <div style="margin-bottom: 8px;"><strong>取消原因：</strong>${req.cancelReason}</div>
                    </div>
                </div>
                ` : ''}
            </div>
            
            ${canProcess || canReturn || canCancel ? `
            <div style="margin-top: 20px; padding: 12px; background: #f0f9ff; border-radius: 4px;">
                <div style="margin-bottom: 12px;"><strong>操作：</strong></div>
                ${canProcess ? `
                    <button class="btn-primary" data-click="processSeal('${req._id}')">确认使用</button>
                ` : ''}
                ${canReturn ? `
                    <button class="btn-success" data-click="returnSeal('${req._id}')">标记归还</button>
                ` : ''}
                ${canCancel ? `
                    <button class="btn-danger" data-click="cancelSeal('${req._id}')">取消申请</button>
                ` : ''}
            </div>
            ` : ''}
        `;
        
        showModal({
            title: `章证使用申请详情 - ${req.requestNumber}`,
            body: content,
            footer: `
                <button class="btn-secondary" data-click="closeModal()">关闭</button>
            `
        });
    } catch (error) {
        console.error('[viewSeal]', error);
        showToast('加载失败: ' + error.message, 'error');
    }
}

// 确认使用
export async function processSeal(id) {
    if (!confirm('确认该章证已使用？')) return;
    
    try {
        const res = await apiFetch(`/seal/${id}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
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
                loadSealList();
                return;
            }
            showToast('响应解析失败', 'error');
            return;
        }
        
        if (!res.ok || !data.success) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            return;
        }
        
        showToast('已确认使用', 'success');
        closeModal();
        loadSealList();
    } catch (error) {
        console.error('[processSeal]', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 标记归还
export function returnSeal(id) {
    const content = `
        <form id="returnSealForm" data-submit="submitReturnSeal(event, '${id}')">
            <div class="form-group">
                <label>归还备注</label>
                <textarea id="returnNote" rows="3" style="width: 100%;"></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button type="button" class="btn-secondary" data-click="closeModal()">取消</button>
                <button type="submit" class="btn-success">确认归还</button>
            </div>
        </form>
    `;
    
    showModal({
        title: '标记归还',
        body: content
    });
}

// 提交标记归还
export async function submitReturnSeal(e, id) {
    if (e && e.preventDefault) e.preventDefault();
    
    const returnNote = document.getElementById('returnNote')?.value?.trim();
    
    try {
        const res = await apiFetch(`/seal/${id}/return`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ returnNote })
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
                loadSealList();
                return;
            }
            showToast('响应解析失败', 'error');
            return;
        }
        
        if (!res.ok || !data.success) {
            showToast(data.message || data.error?.message || '操作失败', 'error');
            return;
        }
        
        showToast('已标记归还', 'success');
        closeModal();
        loadSealList();
    } catch (error) {
        console.error('[submitReturnSeal]', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 取消申请
export async function cancelSeal(id) {
    const cancelReason = prompt('请输入取消原因：');
    if (!cancelReason) return;
    
    try {
        const res = await apiFetch(`/seal/${id}/cancel`, {
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
                loadSealList();
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
        loadSealList();
    } catch (error) {
        console.error('[cancelSeal]', error);
        showToast('操作失败: ' + (error.message || '网络错误'), 'error');
    }
}

// 更新待处理数量
export async function updatePendingCount() {
    if (!isAdminStaff()) return;
    
    try {
        const res = await apiFetch('/seal/pending/count');
        const data = await res.json();
        
        if (data.success) {
            const badge = document.getElementById('sealPendingBadge');
            const navBadge = document.getElementById('sealNavBadge');
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


