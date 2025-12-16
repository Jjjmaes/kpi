import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, showAlert } from '../core/utils.js';

export async function loadCustomers() {
    try {
        const res = await apiFetch('/customers');
        const data = await res.json();
        if (data.success) {
            state.allCustomers = data.data;
            renderCustomersList(data.data);
            // 更新其他依赖客户列表的下拉
            window.fillFinanceFilters?.();
            window.fillProjectCustomerFilter?.();
        }
    } catch (error) {
        console.error('加载客户失败:', error);
        showAlert('customersList', '加载客户失败: ' + error.message, 'error');
    }
}

function renderCustomersList(customers) {
    // 基于当前选择的角色判断UI权限
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isAdmin = currentRole === 'admin';
    const html = `
        <table>
            <thead>
                <tr>
                    <th>客户名称</th>
                    <th>简称</th>
                    <th>联系人</th>
                    <th>联系电话</th>
                    <th>邮箱</th>
                    <th>状态</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${customers.length === 0 ? '<tr><td colspan="7" style="text-align: center;">暂无客户</td></tr>' : ''}
                ${customers.map(c => `
                    <tr>
                        <td>${c.name}</td>
                        <td>${c.shortName || '-'}</td>
                        <td>${c.contactPerson || '-'}</td>
                        <td>${c.phone || '-'}</td>
                        <td>${c.email || '-'}</td>
                        <td><span class="badge ${c.isActive ? 'badge-success' : 'badge-danger'}">${c.isActive ? '激活' : '禁用'}</span></td>
                        <td>
                            <button class="btn-small" data-click="editCustomer('${c._id}')">编辑</button>
                            ${isAdmin ? `<button class="btn-small btn-danger" data-click="deleteCustomer('${c._id}')">删除</button>` : ''}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    const el = document.getElementById('customersList');
    if (el) el.innerHTML = html;
}

export async function createCustomer(e, returnToProject = false) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // 收集联系人数据
    const contacts = [];
    const contactRows = document.querySelectorAll('.contact-row');
    console.log('找到联系人行数:', contactRows.length);
    
    contactRows.forEach((row, index) => {
        // 使用更精确的选择器 - 通过name属性包含特定字符串来查找
        const inputs = row.querySelectorAll('input');
        let nameInput = null;
        let phoneInput = null;
        let emailInput = null;
        let positionInput = null;
        let primaryCheckbox = null;
        
        inputs.forEach(input => {
            const name = input.getAttribute('name') || '';
            if (name.includes('contacts[') && name.includes('].name')) {
                nameInput = input;
            } else if (name.includes('contacts[') && name.includes('].phone')) {
                phoneInput = input;
            } else if (name.includes('contacts[') && name.includes('].email')) {
                emailInput = input;
            } else if (name.includes('contacts[') && name.includes('].position')) {
                positionInput = input;
            } else if (name.includes('contacts[') && name.includes('].isPrimary')) {
                primaryCheckbox = input;
            }
        });
        
        console.log(`联系人行 ${index}:`, {
            nameInput: nameInput?.value,
            phoneInput: phoneInput?.value,
            emailInput: emailInput?.value,
            positionInput: positionInput?.value,
            isPrimary: primaryCheckbox?.checked,
            nameAttr: nameInput?.getAttribute('name')
        });
        
        const name = nameInput?.value?.trim();
        if (name) {
            contacts.push({
                name: name,
                phone: phoneInput?.value?.trim() || '',
                email: emailInput?.value?.trim() || '',
                position: positionInput?.value?.trim() || '',
                isPrimary: primaryCheckbox?.checked || false
            });
        }
    });
    
    console.log('收集到的联系人:', contacts);
    
    // 验证至少有一个联系人
    if (contacts.length === 0) {
        alert('请至少添加一个联系人');
        return;
    }
    
    // 如果没有联系人，使用旧的单个联系人字段（兼容）
    const payload = {
        name: formData.get('name'),
        shortName: formData.get('shortName') || '',
        address: formData.get('address') || '',
        notes: formData.get('notes') || ''
    };
    
    // 确保至少有一个主要联系人
    if (!contacts.some(c => c.isPrimary)) {
        contacts[0].isPrimary = true;
    }
    
    payload.contacts = contacts;
    
    console.log('发送的payload:', payload);

    try {
        const res = await apiFetch('/customers', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        console.log('创建客户响应:', result);
        
        if (result.success) {
            closeModal();
            await loadCustomers();
            if (returnToProject) {
                // 如果是从创建项目界面调用的，重新打开创建项目界面并选中新创建的客户
                const { showCreateProjectModal } = await import('./project.js');
                showCreateProjectModal();
                // 等待模态框渲染完成后再设置选中值
                setTimeout(() => {
                    const select = document.getElementById('projectCustomerSelect');
                    if (select && result.data?._id) {
                        select.value = result.data._id;
                        // 触发change事件以更新客户信息
                        const event = new Event('change', { bubbles: true });
                        select.dispatchEvent(event);
                    }
                }, 100);
            } else {
                showAlert('customersList', '客户创建成功', 'success');
            }
        } else {
            alert(result.message || '创建失败');
        }
    } catch (error) {
        console.error('创建客户错误:', error);
        alert('创建失败: ' + (error.message || '未知错误'));
    }
}

export function showCreateCustomerModal(returnToProject = false) {
    const content = `
        <form id="createCustomerForm" data-submit="createCustomer(event, ${returnToProject})">
            <div class="form-group">
                <label>客户名称 *</label>
                <input type="text" name="name" required>
            </div>
            <div class="form-group">
                <label>客户简称</label>
                <input type="text" name="shortName">
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <label style="margin-bottom: 0; font-weight: 600;">联系人列表 *</label>
                    <button type="button" class="btn-small" data-click="addCustomerContactRow()">+ 添加联系人</button>
                </div>
                <div id="contactsContainer" style="display: flex; flex-direction: column; gap: 10px;">
                    <!-- 联系人行将动态添加到这里 -->
                </div>
                <small style="color: #666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个联系人</small>
            </div>
            
            <div class="form-group">
                <label>地址</label>
                <input type="text" name="address">
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea name="notes" rows="3"></textarea>
            </div>
            <div class="action-buttons">
                <button type="submit">创建</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '创建客户', body: content });
    
    // 初始化时添加一个联系人行
    setTimeout(() => {
        addCustomerContactRow();
    }, 100);
}

// 从创建项目界面调用创建客户
export function showCreateCustomerModalFromProject() {
    closeModal();
    showCreateCustomerModal(true);
}

export async function editCustomer(id) {
    let customer = state.allCustomers.find(c => c._id === id);
    if (!customer) {
        await loadCustomers();
        customer = state.allCustomers.find(c => c._id === id);
        if (!customer) {
            alert('客户不存在');
            return;
        }
    }

    const isAdmin = (state.currentUser?.roles || []).includes('admin');
    
    // 获取联系人列表（优先使用 contacts 数组，兼容旧的单个联系人字段）
    const contacts = customer.contacts && customer.contacts.length > 0 
        ? customer.contacts 
        : (customer.contactPerson ? [{
            name: customer.contactPerson || '',
            phone: customer.phone || '',
            email: customer.email || '',
            position: '',
            isPrimary: true
        }] : []);
    
    const contactsHTML = contacts.length > 0 
        ? contacts.map((contact, index) => `
            <div class="contact-row" style="display: flex; gap: 10px; align-items: flex-start; padding: 10px; background: #f8f9fa; border-radius: 4px; flex-wrap: wrap; margin-bottom: 10px;">
                <div style="flex: 1; min-width: 150px;">
                    <label>姓名 *</label>
                    <input type="text" name="contacts[${index}].name" value="${(contact.name || '').replace(/"/g, '&quot;')}" required>
                </div>
                <div style="flex: 1; min-width: 150px;">
                    <label>电话</label>
                    <input type="text" name="contacts[${index}].phone" value="${(contact.phone || '').replace(/"/g, '&quot;')}">
                </div>
                <div style="flex: 1; min-width: 150px;">
                    <label>邮箱</label>
                    <input type="email" name="contacts[${index}].email" value="${(contact.email || '').replace(/"/g, '&quot;')}">
                </div>
                <div style="flex: 1; min-width: 150px;">
                    <label>职位</label>
                    <input type="text" name="contacts[${index}].position" value="${(contact.position || '').replace(/"/g, '&quot;')}">
                </div>
                <div style="display: flex; align-items: center; gap: 5px; margin-top: 20px;">
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; cursor: pointer;">
                        <input type="checkbox" name="contacts[${index}].isPrimary" ${contact.isPrimary ? 'checked' : ''}>
                        <span style="font-size: 12px;">主要联系人</span>
                    </label>
                </div>
                <div style="margin-top: 20px;">
                    <button type="button" class="btn-small btn-danger" data-click="removeCustomerContactRow(event)">删除</button>
                </div>
            </div>
        `).join('')
        : '';
    
    const content = `
        <form id="editCustomerForm" data-submit="updateCustomer(event, '${id}')">
            <div class="form-group">
                <label>客户名称 *</label>
                <input type="text" name="name" value="${customer.name.replace(/"/g, '&quot;')}" required>
            </div>
            <div class="form-group">
                <label>客户简称</label>
                <input type="text" name="shortName" value="${(customer.shortName || '').replace(/"/g, '&quot;')}">
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <label style="margin-bottom: 0; font-weight: 600;">联系人列表 *</label>
                    <button type="button" class="btn-small" data-click="addCustomerContactRow()">+ 添加联系人</button>
                </div>
                <div id="editContactsContainer" style="display: flex; flex-direction: column; gap: 10px;">
                    ${contactsHTML}
                </div>
                <small style="color: #666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个联系人</small>
            </div>
            
            <div class="form-group">
                <label>地址</label>
                <input type="text" name="address" value="${(customer.address || '').replace(/"/g, '&quot;')}">
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea name="notes" rows="3">${(customer.notes || '').replace(/"/g, '&quot;')}</textarea>
            </div>
            ${isAdmin ? `
                <div class="form-group">
                    <label>状态</label>
                    <select name="isActive">
                        <option value="true" ${customer.isActive ? 'selected' : ''}>激活</option>
                        <option value="false" ${!customer.isActive ? 'selected' : ''}>禁用</option>
                    </select>
                </div>
            ` : ''}
            <div class="action-buttons">
                <button type="submit">更新</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '编辑客户', body: content });
    
    // 如果没有联系人，添加一个空行
    setTimeout(() => {
        const container = document.getElementById('editContactsContainer');
        if (container && container.children.length === 0) {
            addCustomerContactRow();
        }
    }, 100);
}

export async function updateCustomer(e, id) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // 收集联系人数据
    const contacts = [];
    const contactRows = document.querySelectorAll('.contact-row');
    contactRows.forEach(row => {
        const nameInput = row.querySelector('input[name*="contacts"][name*="name"]');
        const phoneInput = row.querySelector('input[name*="contacts"][name*="phone"]');
        const emailInput = row.querySelector('input[name*="contacts"][name*="email"]');
        const positionInput = row.querySelector('input[name*="contacts"][name*="position"]');
        const primaryCheckbox = row.querySelector('input[name*="contacts"][name*="isPrimary"]');
        
        const name = nameInput?.value?.trim();
        if (name) {
            contacts.push({
                name: name,
                phone: phoneInput?.value?.trim() || '',
                email: emailInput?.value?.trim() || '',
                position: positionInput?.value?.trim() || '',
                isPrimary: primaryCheckbox?.checked || false
            });
        }
    });
    
    const payload = {
        name: formData.get('name'),
        shortName: formData.get('shortName'),
        address: formData.get('address'),
        notes: formData.get('notes')
    };
    
    if (contacts.length > 0) {
        payload.contacts = contacts;
        // 确保至少有一个主要联系人
        if (!contacts.some(c => c.isPrimary)) {
            contacts[0].isPrimary = true;
        }
    } else {
        // 兼容旧字段
        payload.contactPerson = formData.get('contactPerson') || '';
        payload.phone = formData.get('phone') || '';
        payload.email = formData.get('email') || '';
    }

    if ((state.currentUser?.roles || []).includes('admin')) {
        payload.isActive = formData.get('isActive') === 'true';
    }

    try {
        const res = await apiFetch(`/customers/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadCustomers();
            showAlert('customersList', '客户更新成功', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('更新失败: ' + error.message);
    }
}

export async function deleteCustomer(id) {
    if (!confirm('确定要删除此客户吗？')) return;
    try {
        const res = await apiFetch(`/customers/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            loadCustomers();
            showAlert('customersList', '客户已删除', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

export async function searchCustomers() {
    const search = document.getElementById('customerSearch')?.value || '';
    try {
        const res = await apiFetch(`/customers?search=${encodeURIComponent(search)}`);
        const data = await res.json();
        if (data.success) {
            renderCustomersList(data.data);
        }
    } catch (error) {
        console.error('搜索客户失败:', error);
    }
}

export async function updateCustomerInfo() {
    const sel = document.getElementById('projectCustomerSelect');
    const customerId = sel?.value;
    const contactGroup = document.getElementById('projectContactGroup');
    const contactSelect = document.getElementById('projectContactSelect');
    
    if (!customerId) {
        if (contactGroup) contactGroup.style.display = 'none';
        if (contactSelect) contactSelect.innerHTML = '<option value="">请选择联系人（可选）</option>';
        return;
    }

    let customer = state.allCustomers.find(c => c._id === customerId);
    if (!customer) {
        // 如果缓存中没有，尝试刷新一次
        await loadCustomers();
        customer = state.allCustomers.find(c => c._id === customerId);
    }
    if (!customer) {
        if (contactGroup) contactGroup.style.display = 'none';
        return;
    }

    // 显示联系人选择下拉框
    if (contactGroup && contactSelect) {
        // 获取联系人列表（优先使用 contacts 数组，兼容旧的单个联系人字段）
        const contacts = customer.contacts && customer.contacts.length > 0 
            ? customer.contacts 
            : (customer.contactPerson ? [{
                name: customer.contactPerson || '',
                phone: customer.phone || '',
                email: customer.email || '',
                position: '',
                isPrimary: true
            }] : []);
        
        if (contacts.length > 0) {
            contactGroup.style.display = 'block';
            contactSelect.innerHTML = '<option value="">请选择联系人（可选）</option>' +
                contacts.map((contact, index) => {
                    const label = `${contact.name}${contact.position ? ' - ' + contact.position : ''}${contact.isPrimary ? ' (主要联系人)' : ''}`;
                    return `<option value="${index}">${label}</option>`;
                }).join('');
            
            // 如果有主要联系人，默认选中
            const primaryIndex = contacts.findIndex(c => c.isPrimary);
            if (primaryIndex >= 0) {
                contactSelect.value = primaryIndex.toString();
            }
        } else {
            contactGroup.style.display = 'none';
            contactSelect.innerHTML = '<option value="">请选择联系人（可选）</option>';
        }
    }

    // 同步项目表单的相关输入框（如果存在，兼容旧代码）
    const contactInput = document.getElementById('projectCustomerContact');
    const phoneInput = document.getElementById('projectCustomerPhone');
    const emailInput = document.getElementById('projectCustomerEmail');
    const addressInput = document.getElementById('projectCustomerAddress');
    const notesInput = document.getElementById('projectCustomerNotes');
    if (contactInput) contactInput.value = customer.contactPerson || '';
    if (phoneInput) phoneInput.value = customer.phone || '';
    if (emailInput) emailInput.value = customer.email || '';
    if (addressInput) addressInput.value = customer.address || '';
    if (notesInput) notesInput.value = customer.notes || '';
}

// 添加联系人行
export function addCustomerContactRow() {
    // 支持创建和编辑两种模式
    const container = document.getElementById('contactsContainer') || document.getElementById('editContactsContainer');
    if (!container) return;
    
    const index = container.children.length;
    const row = document.createElement('div');
    row.className = 'contact-row';
    row.style.cssText = 'display: flex; gap: 10px; align-items: flex-start; padding: 10px; background: #f8f9fa; border-radius: 4px; flex-wrap: wrap; margin-bottom: 10px;';
    
    row.innerHTML = `
        <div style="flex: 1; min-width: 150px;">
            <label>姓名 *</label>
            <input type="text" name="contacts[${index}].name" required>
        </div>
        <div style="flex: 1; min-width: 150px;">
            <label>电话</label>
            <input type="text" name="contacts[${index}].phone">
        </div>
        <div style="flex: 1; min-width: 150px;">
            <label>邮箱</label>
            <input type="email" name="contacts[${index}].email">
        </div>
        <div style="flex: 1; min-width: 150px;">
            <label>职位</label>
            <input type="text" name="contacts[${index}].position">
        </div>
        <div style="display: flex; align-items: center; gap: 5px; margin-top: 20px;">
            <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; cursor: pointer;">
                <input type="checkbox" name="contacts[${index}].isPrimary" ${index === 0 ? 'checked' : ''}>
                <span style="font-size: 12px;">主要联系人</span>
            </label>
        </div>
        <div style="margin-top: 20px;">
            <button type="button" class="btn-small btn-danger" data-click="removeCustomerContactRow(event)">删除</button>
        </div>
    `;
    
    container.appendChild(row);
    
    // 更新联系人行编号并确保主要联系人唯一
    updateContactRows();
}

// 删除联系人行
export function removeCustomerContactRow(e) {
    const row = e.target.closest('.contact-row');
    if (row) {
        const container = document.getElementById('contactsContainer') || document.getElementById('editContactsContainer');
        if (container && container.children.length > 1) {
            row.remove();
            // 重新编号并确保至少有一个主要联系人
            updateContactRows();
        } else {
            alert('至少需要保留一个联系人');
        }
    }
}

// 更新联系人行编号并确保主要联系人唯一
function updateContactRows() {
    const container = document.getElementById('contactsContainer') || document.getElementById('editContactsContainer');
    if (!container) return;
    
    const rows = container.querySelectorAll('.contact-row');
    let hasPrimary = false;
    
    rows.forEach((row, index) => {
        // 更新name属性
        const inputs = row.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            const name = input.getAttribute('name');
            if (name && name.includes('contacts[')) {
                const newName = name.replace(/contacts\[\d+\]/, `contacts[${index}]`);
                input.setAttribute('name', newName);
            }
        });
        
        // 检查主要联系人
        const primaryCheckbox = row.querySelector('input[name*="isPrimary"]');
        if (primaryCheckbox && primaryCheckbox.checked) {
            if (hasPrimary) {
                primaryCheckbox.checked = false;
            } else {
                hasPrimary = true;
            }
        }
    });
    
    // 如果没有主要联系人，将第一个设为主要联系人
    if (!hasPrimary && rows.length > 0) {
        const firstPrimary = rows[0].querySelector('input[name*="isPrimary"]');
        if (firstPrimary) {
            firstPrimary.checked = true;
        }
    }
}



