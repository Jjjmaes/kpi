import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, showAlert, getRoleText } from '../core/utils.js';

export async function loadUsers() {
    try {
        const res = await apiFetch('/users');
        const data = await res.json();
        if (data.success) {
            state.allUsers = data.data;
            const html = `
                <table>
                    <thead>
                        <tr>
                            <th>姓名</th><th>用户名</th><th>邮箱</th><th>电话</th>
                            <th>角色</th><th>专/兼职</th><th>状态</th><th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.data.map(u => `
                            <tr>
                                <td>${u.name || '-'}</td>
                                <td>${u.username || '-'}</td>
                                <td>${u.email || '-'}</td>
                                <td>${u.phone || '-'}</td>
                                <td>${(u.roles || []).map(r => getRoleText(r)).join(', ')}</td>
                                <td>${u.employmentType === 'part_time' ? '兼职' : '专职'}</td>
                                <td><span class="badge ${u.isActive ? 'badge-success' : 'badge-danger'}">${u.isActive ? '激活' : '禁用'}</span></td>
                                <td>
                                    <button class="btn-small" data-click="editUser('${u._id}')">编辑</button>
                                    <button class="btn-small" data-click="resetUserPassword('${u._id}', '${u.name}')" style="background: #f59e0b; color: white;">重置密码</button>
                                    <button class="btn-small btn-danger" data-click="deleteUser('${u._id}')">删除</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            const el = document.getElementById('usersList');
            if (el) el.innerHTML = html;
        }
    } catch (error) {
        console.error('加载用户失败:', error);
        showAlert('usersList', '加载用户失败: ' + error.message, 'error');
    }
}

export async function loadUsersForSelect() {
    try {
        const res = await apiFetch('/users');
        const data = await res.json();
        if (data.success) {
            state.allUsers = data.data;
            const select = document.getElementById('kpiUserSelect');
            if (select) {
                select.innerHTML = '<option value="">全部用户</option>' +
                    data.data.map(u => `<option value="${u._id}">${u.name}</option>`).join('');
            }
        }
        return data;
    } catch (error) {
        console.error('加载用户列表失败:', error);
        return { success: false };
    }
}

export async function loadUsersForProjectMembers() {
    try {
        const res = await apiFetch('/users');
        const data = await res.json();
        if (data.success) {
            state.allUsers = data.data;
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
    }
}

// 从角色表加载可用角色（仅加载一次，缓存在 state）
async function loadAvailableRolesForUser() {
    if (state.availableRoles && Array.isArray(state.availableRoles) && state.availableRoles.length > 0) {
        return state.availableRoles;
    }
    try {
        const res = await apiFetch('/roles');
        const data = await res.json();
        if (data.success) {
            // 仅保留启用状态的角色
            const roles = (data.data || []).filter(r => r.isActive);
            state.availableRoles = roles;
            return roles;
        }
    } catch (error) {
        console.error('加载角色列表失败:', error);
    }
    return [];
}

function buildRoleCheckboxesHtml(selectedRoles = []) {
    const roles = state.availableRoles || [];
    if (!roles.length) {
        return '<div style="color:#999;font-size:12px;">暂无可用角色，请先在“角色管理”中配置。</div>';
    }
    return roles.map(role => {
        const checked = selectedRoles.includes(role.code) ? 'checked' : '';
        const label = role.name || role.code;
        const description = role.description ? `（${role.description}）` : '';
        return `
            <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                <input type="checkbox" name="roles" value="${role.code}" ${checked}>
                <span>${label}${description}</span>
            </label>
        `;
    }).join('');
}

export async function showCreateUserModal() {
    console.log('showCreateUserModal 被调用');
    
    // 先加载角色列表
    await loadAvailableRolesForUser();

    const rolesHtml = buildRoleCheckboxesHtml();

    const content = `
        <form id="createUserForm" data-submit="createUser(event)">
            <div class="form-group">
                <label>用户名 *</label>
                <input type="text" name="username" required>
            </div>
            <div class="form-group">
                <label>密码 *</label>
                <input type="password" name="password" required>
            </div>
            <div class="form-group">
                <label>姓名 *</label>
                <input type="text" name="name" required>
            </div>
            <div class="form-group">
                <label>邮箱 *</label>
                <input type="email" name="email" required>
            </div>
            <div class="form-group">
                <label>电话</label>
                <input type="tel" name="phone" placeholder="请输入联系电话">
            </div>
            <div class="form-group">
                <label>专/兼职</label>
                <select name="employmentType">
                    <option value="full_time" selected>专职</option>
                    <option value="part_time">兼职</option>
                </select>
            </div>
            <div class="form-group">
                <label>角色 *</label>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">
                    ${rolesHtml}
                </div>
            </div>
            <div class="action-buttons">
                <button type="submit">创建</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    console.log('显示模态框，表单内容:', content.substring(0, 100) + '...');
    showModal({ title: '创建用户', body: content });
    
    // 确保表单在DOM中后，验证data-submit属性
    setTimeout(() => {
        const form = document.getElementById('createUserForm');
        if (form) {
            console.log('表单已创建，data-submit属性:', form.getAttribute('data-submit'));
            console.log('表单元素:', form);
        } else {
            console.error('表单未找到！');
        }
    }, 100);
}

export async function createUser(e) {
    console.log('createUser 被调用, event:', e);
    
    // 防御性检查
    if (!e) {
        console.error('createUser: 事件对象为空');
        showAlert('usersList', '表单提交失败：事件对象无效', 'error');
        return;
    }
    
    // 防止默认提交行为
    if (e.preventDefault) {
        e.preventDefault();
    }
    
    // 获取表单元素
    const form = e.target || (e.currentTarget && e.currentTarget.tagName === 'FORM' ? e.currentTarget : null) || document.getElementById('createUserForm');
    if (!form || form.tagName !== 'FORM') {
        console.error('createUser: 无法找到表单元素', { target: e.target, currentTarget: e.currentTarget });
        showAlert('usersList', '表单提交失败：无法找到表单', 'error');
        return;
    }
    
    console.log('createUser: 找到表单:', form.id);
    
    const formData = new FormData(form);
    const roles = Array.from(formData.getAll('roles'));
    if (roles.length === 0) {
        showAlert('usersList', '请至少选择一个角色', 'error');
        return;
    }
    const payload = {
        username: formData.get('username'),
        password: formData.get('password'),
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone') || '',
        roles,
        employmentType: formData.get('employmentType') || 'full_time'
    };
    
    // 验证必填字段
    if (!payload.username || !payload.password || !payload.name || !payload.email) {
        showAlert('usersList', '请填写所有必填字段', 'error');
        return;
    }
    
    try {
        console.log('创建用户请求:', payload);
        const res = await apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) });
        const result = await res.json();
        console.log('创建用户响应:', { status: res.status, ok: res.ok, result });
        
        // 检查HTTP状态码
        if (!res.ok) {
            const errorMsg = result.message || `创建失败 (状态码: ${res.status})`;
            console.error('创建用户失败:', result);
            showAlert('usersList', errorMsg, 'error');
            return;
        }
        
        if (result.success) {
            console.log('用户创建成功，刷新列表...');
            closeModal();
            // 等待列表刷新完成
            await loadUsers();
            console.log('列表刷新完成');
            showAlert('usersList', '用户创建成功', 'success');
        } else {
            const errorMsg = result.message || '创建失败，请检查输入信息';
            console.error('创建用户失败:', result);
            showAlert('usersList', errorMsg, 'error');
        }
    } catch (error) {
        console.error('创建用户异常:', error);
        showAlert('usersList', '创建失败: ' + (error.message || '网络错误'), 'error');
    }
}

export async function editUser(userId) {
    let user = (state.allUsers || []).find(u => u._id === userId);
    
    // 如果本地找不到用户数据，从服务器重新获取
    if (!user) {
        try {
            const res = await apiFetch(`/users/${userId}`);
            const data = await res.json();
            if (data.success && data.data) {
                user = data.data;
                // 更新本地缓存
                if (state.allUsers) {
                    const index = state.allUsers.findIndex(u => u._id === userId);
                    if (index >= 0) {
                        state.allUsers[index] = user;
                    } else {
                        state.allUsers.push(user);
                    }
                }
            } else {
                alert('无法加载用户信息');
                return;
            }
        } catch (error) {
            console.error('加载用户信息失败:', error);
            alert('加载用户信息失败: ' + (error.message || '网络错误'));
            return;
        }
    }

    // 确保角色列表已加载
    await loadAvailableRolesForUser();
    const rolesHtml = buildRoleCheckboxesHtml(user.roles || []);

    const content = `
        <form id="editUserForm" data-submit="updateUser(event, '${userId}')">
            <div class="form-group">
                <label>姓名 *</label>
                <input type="text" name="name" value="${user.name || ''}" required>
            </div>
            <div class="form-group">
                <label>邮箱 *</label>
                <input type="email" name="email" value="${user.email || ''}" required>
            </div>
            <div class="form-group">
                <label>电话</label>
                <input type="tel" name="phone" value="${user.phone || ''}" placeholder="请输入联系电话">
            </div>
            <div class="form-group">
                <label>角色 *</label>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">
                    ${rolesHtml}
                </div>
            </div>
            <div class="form-group">
                <label>状态</label>
                <select name="isActive">
                    <option value="true" ${user.isActive ? 'selected' : ''}>激活</option>
                    <option value="false" ${!user.isActive ? 'selected' : ''}>禁用</option>
                </select>
            </div>
            <div class="form-group">
                <label>专/兼职</label>
                <select name="employmentType">
                    <option value="full_time" ${user.employmentType !== 'part_time' ? 'selected' : ''}>专职</option>
                    <option value="part_time" ${user.employmentType === 'part_time' ? 'selected' : ''}>兼职</option>
                </select>
            </div>
            <div class="action-buttons">
                <button type="submit">更新</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '编辑用户', body: content });
}

export async function updateUser(e, userId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const roles = Array.from(formData.getAll('roles'));
    if (roles.length === 0) {
        alert('请至少选择一个角色');
        return;
    }
    const payload = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone') || '',
        roles,
        isActive: formData.get('isActive') === 'true',
        employmentType: formData.get('employmentType') || 'full_time'
    };
    try {
        const res = await apiFetch(`/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadUsers();
            showAlert('usersList', '用户更新成功', 'success');
        } else {
            const errorMsg = result.error?.message || result.message || '更新失败，请检查输入信息';
            alert(errorMsg);
        }
    } catch (error) {
        console.error('更新用户失败:', error);
        alert('更新失败: ' + (error.message || '网络错误'));
    }
}

export async function resetUserPassword(userId, userName) {
    const resolvedName = userName || (state.allUsers || []).find(u => u._id === userId)?.name || '该用户';
    if (!confirm(`确定要重置用户 "${resolvedName}" 的密码吗？\n\n重置后，系统将生成一个新密码，用户首次登录时需要修改密码。`)) {
        return;
    }
    try {
        const res = await apiFetch(`/users/${userId}/reset-password`, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
            const newPassword = result.data.newPassword;
            const content = `
                <div style="padding: 20px;">
                    <p style="margin-bottom: 16px; color: #10b981; font-weight: 600;">密码重置成功！</p>
                    <div style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">新密码：</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="text" id="newPasswordDisplay" value="${newPassword}" readonly 
                                   style="flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; font-family: monospace; font-size: 14px; background: white;">
                            <button type="button" data-click="copyPasswordToClipboard('${newPassword}')" 
                                    style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                复制
                            </button>
                        </div>
                    </div>
                    <p style="font-size: 13px; color: #6b7280; margin-bottom: 16px;">
                        ⚠️ 请妥善保存并告知用户。用户首次登录时需要修改密码。
                    </p>
                    <div style="text-align: right;">
                        <button type="button" data-click="closeModal()" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            确定
                        </button>
                    </div>
                </div>
            `;
            showModal({ title: '密码重置成功', body: content });
            loadUsers();
            showAlert('usersList', '密码重置成功', 'success');
        } else {
            alert(result.message || '重置密码失败');
        }
    } catch (error) {
        alert('重置密码失败: ' + error.message);
    }
}

export async function deleteUser(userId) {
    if (!confirm('确定要删除此用户吗？')) return;
    try {
        const res = await apiFetch(`/users/${userId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            loadUsers();
            showAlert('usersList', '用户已删除', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// 个人中心
export async function loadProfile() {
    try {
        const res = await apiFetch('/auth/me');
        const data = await res.json();
        if (!data.success) {
            showAlert('profileAlert', data.message || '加载个人信息失败', 'error');
            return;
        }
        
        const user = data.user;
        const contentContainer = document.getElementById('profileContent');
        if (!contentContainer) {
            console.error('找不到 profileContent 元素');
            return;
        }

        // 获取角色显示文本
        const { ROLE_NAMES } = await import('../core/config.js');
        const roleTexts = (user.roles || []).map(r => ROLE_NAMES[r] || r).join(', ');

        contentContainer.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px;">
                <!-- 基本信息卡片 -->
                <div class="card">
                    <div class="card-title">基本信息</div>
                    <form id="profileInfoForm" data-submit="updateProfileInfo(event)">
                        <div class="form-group">
                            <label>用户名</label>
                            <input type="text" value="${user.username || ''}" disabled style="background: #f5f5f5;">
                            <small style="color: #999;">用户名不可修改</small>
                        </div>
                        <div class="form-group">
                            <label>姓名</label>
                            <input type="text" value="${user.name || ''}" disabled style="background: #f5f5f5;">
                            <small style="color: #999;">姓名由管理员修改</small>
                        </div>
                        <div class="form-group">
                            <label>邮箱 <span style="color: #e74c3c;">*</span></label>
                            <input type="email" name="email" id="profileEmail" value="${user.email || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>电话</label>
                            <input type="text" name="phone" id="profilePhone" value="${user.phone || ''}" placeholder="请输入联系电话">
                        </div>
                        <div class="form-group">
                            <label>角色</label>
                            <input type="text" value="${roleTexts}" disabled style="background: #f5f5f5;">
                            <small style="color: #999;">角色由管理员分配</small>
                        </div>
                        <div class="action-buttons">
                            <button type="submit">更新信息</button>
                        </div>
                    </form>
                </div>

                <!-- 修改密码卡片 -->
                <div class="card">
                    <div class="card-title">修改密码</div>
                    <form id="profilePasswordForm" data-submit="updateProfilePassword(event)">
                        <div class="form-group">
                            <label>当前密码 <span style="color: #e74c3c;">*</span></label>
                            <input type="password" name="currentPassword" id="profileOldPassword" required>
                        </div>
                        <div class="form-group">
                            <label>新密码 <span style="color: #e74c3c;">*</span></label>
                            <input type="password" name="newPassword" id="profileNewPassword" required placeholder="请输入符合要求的新密码">
                            <div id="profilePwdHint" style="font-size: 12px; color: #64748b; margin-top: 4px;"></div>
                        </div>
                        <div class="form-group">
                            <label>确认新密码 <span style="color: #e74c3c;">*</span></label>
                            <input type="password" name="confirmPassword" id="profileNewPasswordConfirm" required placeholder="请再次输入新密码">
                        </div>
                        <div class="action-buttons">
                            <button type="submit">修改密码</button>
                        </div>
                    </form>
                </div>

                <!-- 评价统计卡片 -->
                <div class="card">
                    <div class="card-title">评价统计</div>
                    <div style="padding: 20px;">
                        <p style="color: #6b7280; margin-bottom: 20px;">查看您收到的项目评价统计信息</p>
                        <button class="btn-small" data-click="showEvaluationStats()" style="background: #8b5cf6; color: white; width: 100%;">
                            📊 查看我的评价统计
                        </button>
                    </div>
                </div>
            </div>
        `;

        // 绑定新密码输入框的实时验证提示
        const newPwdInput = document.getElementById('profileNewPassword');
        const hintDiv = document.getElementById('profilePwdHint');
        if (newPwdInput && hintDiv) {
            newPwdInput.addEventListener('input', () => {
                const pwd = newPwdInput.value;
                if (pwd.length > 0 && pwd.length < 6) {
                    hintDiv.textContent = '密码长度至少6位';
                    hintDiv.style.color = '#e74c3c';
                } else if (pwd.length >= 6) {
                    hintDiv.textContent = '密码长度符合要求';
                    hintDiv.style.color = '#10b981';
                } else {
                    hintDiv.textContent = '';
                }
            });
        }
    } catch (error) {
        console.error('加载个人信息失败:', error);
        showAlert('profileAlert', '加载个人信息失败: ' + error.message, 'error');
    }
}

export async function updateProfileInfo(e) {
    if (e && e.preventDefault) e.preventDefault();
    const form = e?.target || document.getElementById('profileInfoForm');
    if (!form) return;
    
    const formData = new FormData(form);
    const payload = {
        email: formData.get('email'),
        phone: formData.get('phone') || ''
    };
    
    if (!payload.email) {
        showAlert('profileAlert', '邮箱不能为空', 'error');
        return;
    }
    
    try {
        const res = await apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
            showAlert('profileAlert', '个人信息已更新', 'success');
            await loadProfile();
        } else {
            showAlert('profileAlert', data.message || '更新失败', 'error');
        }
    } catch (error) {
        showAlert('profileAlert', '更新失败: ' + error.message, 'error');
    }
}

export async function updateProfilePassword(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
        currentPassword: formData.get('currentPassword'),
        newPassword: formData.get('newPassword'),
        confirmPassword: formData.get('confirmPassword')
    };
    if (payload.newPassword !== payload.confirmPassword) {
        showToast('两次输入的新密码不一致', 'error');
        return;
    }
    try {
        const res = await apiFetch('/auth/profile/password', { method: 'PUT', body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
            showToast('密码已更新', 'success');
            e.target.reset();
        } else {
            showToast(data.message || '更新失败', 'error');
        }
    } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
    }
}

// 工具：复制密码
export function copyPasswordToClipboard(password) {
    navigator.clipboard.writeText(password).then(() => {
        const btn = event?.target;
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '已复制';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '#667eea';
            }, 2000);
        }
    }).catch(() => {
        const input = document.getElementById('newPasswordDisplay');
        if (input) {
            input.select();
            input.setSelectionRange(0, 99999);
            alert('请手动复制密码（已选中）');
        }
    });
}

// 挂载
// User module placeholder



