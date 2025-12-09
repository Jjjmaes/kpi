// API基础URL
const API_BASE = 'http://localhost:3000/api';

// 全局状态
let currentUser = null;
let token = null;
let allUsers = []; // 缓存用户列表
let allCustomers = []; // 缓存客户列表
let currentProjectDetail = null; // 缓存当前项目详情
const isFinanceRole = () => (currentUser?.roles || []).some(r => r === 'admin' || r === 'finance');
let allProjectsCache = []; // 缓存项目列表
let receivablesCache = []; // 缓存应收结果
let projectPage = 1;
let receivablePage = 1;
let languagesCache = [];

// 初始化
    document.addEventListener('DOMContentLoaded', () => {
        token = localStorage.getItem('token');
        console.log('[Auth] DOMContentLoaded, token exists:', !!token);
        if (token) {
            checkAuth();
        } else {
            showLogin();
        }
    });

// 认证检查
async function checkAuth() {
    try {
        console.log('[Auth] checkAuth start');
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        console.log('[Auth] /auth/me result:', data);
        if (data.success) {
            currentUser = data.user;
            showMainApp();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('[Auth] checkAuth error:', error);
        showLogin();
    }
}

// 登录
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        console.log('[Auth] login start', { username });
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        console.log('[Auth] login result:', data);

        if (data.success) {
            token = data.token;
            currentUser = data.user;
            localStorage.setItem('token', token);
            showMainApp();
        } else {
            showAlert('loginAlert', data.message, 'error');
        }
    } catch (error) {
        console.error('[Auth] login error:', error);
        showAlert('loginAlert', '登录失败: ' + error.message, 'error');
    }
});

// 退出
function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('token');
    console.log('[Auth] logout -> redirect /');
    // 强制回到登录页（清除可能残留的 ? 查询）
    window.location.href = '/';
}

// 显示登录页
function showLogin() {
    console.log('[UI] showLogin');
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
}

// 显示主应用
function showMainApp() {
    console.log('[UI] showMainApp user:', currentUser?.username, 'roles:', currentUser?.roles);
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userName').textContent = currentUser.name;

    // 根据角色显示菜单
    const isAdmin = currentUser.roles.includes('admin');
    const isFinance = currentUser.roles.includes('finance');
    const isSales = currentUser.roles.includes('sales');
    const isPartTimeSales = currentUser.roles.includes('part_time_sales');

    if (isAdmin) {
        document.getElementById('configBtn').style.display = 'inline-block';
        document.getElementById('usersBtn').style.display = 'inline-block';
        document.getElementById('languagesBtn').style.display = 'inline-block';
        document.getElementById('createLanguageBtn').style.display = 'inline-block';
    }
    if (isAdmin || isFinance) {
        document.getElementById('financeBtn').style.display = 'inline-block';
    }

    if (isSales || isPartTimeSales || isAdmin) {
        document.getElementById('createProjectBtn').style.display = 'inline-block';
        document.getElementById('customersBtn').style.display = 'inline-block';
    }

    if (isAdmin || isFinance) {
        document.getElementById('kpiUserSelect').style.display = 'block';
        document.getElementById('exportKpiBtn').style.display = 'inline-block';
        document.getElementById('generateKpiBtn').style.display = 'inline-block';
        loadUsersForSelect();
    }

    // 先加载用户列表（用于下拉选择）
    if (isAdmin || isFinance) {
        loadUsersForSelect();
    }
    if (isAdmin) {
        loadUsers();
        loadConfig();
    }
    // 销售和兼职销售也需要加载用户列表（用于创建项目时选择成员）
    if (isSales || isPartTimeSales) {
        loadUsersForProjectMembers();
    }
    // 加载客户列表（销售、兼职销售和管理员需要）
    if (isSales || isPartTimeSales || isAdmin) {
        loadCustomers();
    }
    // 财务筛选下拉需要客户/销售
    if (isAdmin || isFinance) {
        loadCustomers().then(() => fillFinanceFilters());
        loadUsersForSelect().then(() => fillFinanceFilters());
    }
    // Dashboard 默认月份
    const dashboardMonthInput = document.getElementById('dashboardMonth');
    if (dashboardMonthInput && !dashboardMonthInput.value) {
        dashboardMonthInput.value = new Date().toISOString().slice(0, 7);
    }
    loadDashboard();
    loadProjects();
    loadKPI();
    if (isAdmin || isFinance) {
        const financeMonthInput = document.getElementById('financeMonth');
        if (financeMonthInput && !financeMonthInput.value) {
            financeMonthInput.value = new Date().toISOString().slice(0, 7);
        }
        loadReceivables();
        loadInvoices();
        loadPendingKpi();
        loadFinanceSummary();
    }
    if (isAdmin || isSales || isPartTimeSales || currentUser.roles.includes('pm')) {
        loadLanguages(true);
    }
}

// 切换section
function showSection(sectionId) {
    if (sectionId === 'finance' && !isFinanceRole()) {
        showToast('无权限访问财务模块', 'error');
        return;
    }
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    event.target.classList.add('active');
}

// ==================== 语种管理 ====================
async function loadLanguages(refresh) {
    try {
        const res = await fetch(`${API_BASE}/languages${refresh ? '' : '?active=true'}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) {
            showAlert('languagesList', data.message || '加载失败', 'error');
            return;
        }
        languagesCache = data.data || [];
        renderLanguages();
    } catch (error) {
        showAlert('languagesList', '加载失败: ' + error.message, 'error');
    }
}

function renderLanguages() {
    if (!document.getElementById('languagesList')) return;
    const rows = (languagesCache || []).map(lang => `
        <tr>
            <td>${lang.name}</td>
            <td>${lang.code}</td>
            <td>${lang.nativeName || '-'}</td>
            <td>${lang.isActive ? '<span class="badge badge-success">启用</span>' : '<span class="badge badge-danger">停用</span>'}</td>
            <td>
                <button class="btn-small" onclick="showEditLanguageModal('${lang._id}')">编辑</button>
            </td>
        </tr>
    `).join('');
    document.getElementById('languagesList').innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>语种名称</th>
                    <th>代码</th>
                    <th>本地名称</th>
                    <th>状态</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="5" style="text-align:center;">暂无语种</td></tr>'}
            </tbody>
        </table>
    `;
}

function showCreateLanguageModal() {
    const content = `
        <form id="createLangForm" onsubmit="createLanguage(event)">
            <div class="form-group">
                <label>语种名称 *</label>
                <input type="text" name="name" placeholder="如：中文、英文" required>
            </div>
            <div class="form-group">
                <label>语种代码 *</label>
                <input type="text" name="code" placeholder="如：ZH、EN" required style="text-transform: uppercase;">
                <small style="color: #666; font-size: 12px;">通常使用ISO 639-1标准代码（大写）</small>
            </div>
            <div class="form-group">
                <label>本地名称（可选）</label>
                <input type="text" name="nativeName" placeholder="如：中文、English">
            </div>
            <div class="action-buttons">
                <button type="submit">创建</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('新增语种', content);
}

async function createLanguage(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
        name: formData.get('name'),
        code: formData.get('code').toUpperCase(),
        nativeName: formData.get('nativeName') || undefined
    };
    try {
        const res = await fetch(`${API_BASE}/languages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '创建失败', 'error');
            return;
        }
        closeModal();
        loadLanguages(true);
        showToast('语种已创建', 'success');
    } catch (error) {
        showToast('创建失败: ' + error.message, 'error');
    }
}

function showEditLanguageModal(id) {
    const lang = languagesCache.find(l => l._id === id);
    if (!lang) return;
    const content = `
        <form id="editLangForm" onsubmit="updateLanguage(event, '${id}')">
            <div class="form-group">
                <label>语种名称 *</label>
                <input type="text" name="name" value="${lang.name}" required>
            </div>
            <div class="form-group">
                <label>语种代码 *</label>
                <input type="text" name="code" value="${lang.code}" required style="text-transform: uppercase;">
            </div>
            <div class="form-group">
                <label>本地名称（可选）</label>
                <input type="text" name="nativeName" value="${lang.nativeName || ''}">
            </div>
            <div class="form-group">
                <label>状态</label>
                <select name="isActive">
                    <option value="true" ${lang.isActive ? 'selected' : ''}>启用</option>
                    <option value="false" ${!lang.isActive ? 'selected' : ''}>停用</option>
                </select>
            </div>
            <div class="action-buttons">
                <button type="submit">保存</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('编辑语种', content);
}

async function updateLanguage(e, id) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
        name: formData.get('name'),
        code: formData.get('code').toUpperCase(),
        nativeName: formData.get('nativeName') || undefined,
        isActive: formData.get('isActive') === 'true'
    };
    try {
        const res = await fetch(`${API_BASE}/languages/${id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '更新失败', 'error');
            return;
        }
        closeModal();
        loadLanguages(true);
        showToast('语种已更新', 'success');
    } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
    }
}


// ==================== 模态框管理 ====================
function showModal(title, content) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

// ==================== 用户管理 ====================
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            allUsers = data.data;
            const html = `
                <table>
                    <thead>
                        <tr>
                            <th>姓名</th>
                            <th>用户名</th>
                            <th>邮箱</th>
                            <th>角色</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.data.map(u => `
                            <tr>
                                <td>${u.name}</td>
                                <td>${u.username}</td>
                                <td>${u.email}</td>
                                <td>${u.roles.map(r => getRoleText(r)).join(', ')}</td>
                                <td><span class="badge ${u.isActive ? 'badge-success' : 'badge-danger'}">${u.isActive ? '激活' : '禁用'}</span></td>
                                <td>
                                    <button class="btn-small" onclick="editUser('${u._id}')">编辑</button>
                                    <button class="btn-small btn-danger" onclick="deleteUser('${u._id}')">删除</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            document.getElementById('usersList').innerHTML = html;
        }
    } catch (error) {
        console.error('加载用户失败:', error);
        showAlert('usersList', '加载用户失败: ' + error.message, 'error');
    }
}

async function loadUsersForSelect() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            const select = document.getElementById('kpiUserSelect');
            select.innerHTML = '<option value="">全部用户</option>' +
                data.data.map(u => `<option value="${u._id}">${u.name}</option>`).join('');
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
    }
}

// 为项目成员选择加载用户列表
async function loadUsersForProjectMembers() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            allUsers = data.data;
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
    }
}

function showCreateUserModal() {
    const content = `
        <form id="createUserForm" onsubmit="createUser(event)">
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
                <label>角色 *</label>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">
                    ${['admin', 'finance', 'sales', 'pm', 'translator', 'reviewer', 'admin_staff', 'part_time_sales', 'layout'].map(role => `
                        <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                            <input type="checkbox" name="roles" value="${role}">
                            ${getRoleText(role)}
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="action-buttons">
                <button type="submit">创建</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('创建用户', content);
}

async function createUser(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const roles = Array.from(formData.getAll('roles'));
    
    if (roles.length === 0) {
        alert('请至少选择一个角色');
        return;
    }

    const data = {
        username: formData.get('username'),
        password: formData.get('password'),
        name: formData.get('name'),
        email: formData.get('email'),
        roles
    };

    try {
        const response = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadUsers();
            showAlert('usersList', '用户创建成功', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('创建失败: ' + error.message);
    }
}

async function editUser(userId) {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;

    const content = `
        <form id="editUserForm" onsubmit="updateUser(event, '${userId}')">
            <div class="form-group">
                <label>姓名 *</label>
                <input type="text" name="name" value="${user.name}" required>
            </div>
            <div class="form-group">
                <label>邮箱 *</label>
                <input type="email" name="email" value="${user.email}" required>
            </div>
            <div class="form-group">
                <label>角色 *</label>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">
                    ${['admin', 'finance', 'sales', 'pm', 'translator', 'reviewer', 'admin_staff', 'part_time_sales', 'layout'].map(role => `
                        <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                            <input type="checkbox" name="roles" value="${role}" ${user.roles.includes(role) ? 'checked' : ''}>
                            ${getRoleText(role)}
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label>状态</label>
                <select name="isActive">
                    <option value="true" ${user.isActive ? 'selected' : ''}>激活</option>
                    <option value="false" ${!user.isActive ? 'selected' : ''}>禁用</option>
                </select>
            </div>
            <div class="action-buttons">
                <button type="submit">更新</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('编辑用户', content);
}

async function updateUser(e, userId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const roles = Array.from(formData.getAll('roles'));
    
    if (roles.length === 0) {
        alert('请至少选择一个角色');
        return;
    }

    const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        roles,
        isActive: formData.get('isActive') === 'true'
    };

    try {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadUsers();
            showAlert('usersList', '用户更新成功', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('更新失败: ' + error.message);
    }
}

async function deleteUser(userId) {
    if (!confirm('确定要删除此用户吗？')) return;

    try {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
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

// ==================== 客户管理 ====================
async function loadCustomers() {
    try {
        const response = await fetch(`${API_BASE}/customers`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            allCustomers = data.data;
            renderCustomersList(data.data);
            fillFinanceFilters();
            fillProjectCustomerFilter();
        }
    } catch (error) {
        console.error('加载客户失败:', error);
        showAlert('customersList', '加载客户失败: ' + error.message, 'error');
    }
}

function renderCustomersList(customers) {
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
                            <button class="btn-small" onclick="editCustomer('${c._id}')">编辑</button>
                            ${currentUser.roles.includes('admin') ? `<button class="btn-small btn-danger" onclick="deleteCustomer('${c._id}')">删除</button>` : ''}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    document.getElementById('customersList').innerHTML = html;
}

async function searchCustomers() {
    const search = document.getElementById('customerSearch').value;
    try {
        const response = await fetch(`${API_BASE}/customers?search=${encodeURIComponent(search)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            renderCustomersList(data.data);
        }
    } catch (error) {
        console.error('搜索客户失败:', error);
    }
}

function showCreateCustomerModal() {
    const content = `
        <form id="createCustomerForm" onsubmit="createCustomer(event)">
            <div class="form-group">
                <label>客户名称 *</label>
                <input type="text" name="name" required>
            </div>
            <div class="form-group">
                <label>客户简称</label>
                <input type="text" name="shortName">
            </div>
            <div class="form-group">
                <label>联系人</label>
                <input type="text" name="contactPerson">
            </div>
            <div class="form-group">
                <label>联系电话</label>
                <input type="text" name="phone">
            </div>
            <div class="form-group">
                <label>邮箱</label>
                <input type="email" name="email">
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
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('创建客户', content);
}

async function createCustomer(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        shortName: formData.get('shortName'),
        contactPerson: formData.get('contactPerson'),
        phone: formData.get('phone'),
        email: formData.get('email'),
        address: formData.get('address'),
        notes: formData.get('notes')
    };

    try {
        const response = await fetch(`${API_BASE}/customers`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadCustomers();
            showAlert('customersList', '客户创建成功', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('创建失败: ' + error.message);
    }
}

async function editCustomer(customerId) {
    const customer = allCustomers.find(c => c._id === customerId);
    if (!customer) {
        await loadCustomers();
        const updated = allCustomers.find(c => c._id === customerId);
        if (!updated) {
            alert('客户不存在');
            return;
        }
    }

    const c = customer || allCustomers.find(c => c._id === customerId);
    const content = `
        <form id="editCustomerForm" onsubmit="updateCustomer(event, '${customerId}')">
            <div class="form-group">
                <label>客户名称 *</label>
                <input type="text" name="name" value="${c.name}" required>
            </div>
            <div class="form-group">
                <label>客户简称</label>
                <input type="text" name="shortName" value="${c.shortName || ''}">
            </div>
            <div class="form-group">
                <label>联系人</label>
                <input type="text" name="contactPerson" value="${c.contactPerson || ''}">
            </div>
            <div class="form-group">
                <label>联系电话</label>
                <input type="text" name="phone" value="${c.phone || ''}">
            </div>
            <div class="form-group">
                <label>邮箱</label>
                <input type="email" name="email" value="${c.email || ''}">
            </div>
            <div class="form-group">
                <label>地址</label>
                <input type="text" name="address" value="${c.address || ''}">
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea name="notes" rows="3">${c.notes || ''}</textarea>
            </div>
            ${currentUser.roles.includes('admin') ? `
                <div class="form-group">
                    <label>状态</label>
                    <select name="isActive">
                        <option value="true" ${c.isActive ? 'selected' : ''}>激活</option>
                        <option value="false" ${!c.isActive ? 'selected' : ''}>禁用</option>
                    </select>
                </div>
            ` : ''}
            <div class="action-buttons">
                <button type="submit">更新</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('编辑客户', content);
}

async function updateCustomer(e, customerId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        shortName: formData.get('shortName'),
        contactPerson: formData.get('contactPerson'),
        phone: formData.get('phone'),
        email: formData.get('email'),
        address: formData.get('address'),
        notes: formData.get('notes')
    };

    if (currentUser.roles.includes('admin')) {
        data.isActive = formData.get('isActive') === 'true';
    }

    try {
        const response = await fetch(`${API_BASE}/customers/${customerId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
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

async function deleteCustomer(customerId) {
    if (!confirm('确定要删除此客户吗？')) return;

    try {
        const response = await fetch(`${API_BASE}/customers/${customerId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
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

// ==================== 项目管理 ====================
async function loadProjects() {
    try {
        const response = await fetch(`${API_BASE}/projects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            allProjectsCache = data.data || [];
            renderProjects();
            fillFinanceProjectSelects();
        }
    } catch (error) {
        console.error('加载项目失败:', error);
        showAlert('projectsList', '加载项目失败: ' + error.message, 'error');
    }
}

function renderProjects() {
    const search = document.getElementById('projectSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('projectStatusFilter')?.value || '';
    const biz = document.getElementById('projectBizFilter')?.value || '';
    const cust = document.getElementById('projectCustomerFilter')?.value || '';
    const pageSizeSel = document.getElementById('projectPageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value, 10) || 10 : 10;
    const filtered = allProjectsCache.filter(p => {
        const matchesSearch = !search || (p.projectName?.toLowerCase().includes(search)) || (p.projectNumber?.toLowerCase().includes(search)) || ((p.customerId?.name || p.clientName || '').toLowerCase().includes(search));
        const matchesStatus = !status || p.status === status;
        const matchesBiz = !biz || p.businessType === biz;
        const matchesCust = !cust || (p.customerId && p.customerId._id === cust);
        return matchesSearch && matchesStatus && matchesBiz && matchesCust;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (projectPage > totalPages) projectPage = totalPages;
    const start = (projectPage - 1) * pageSize;
    const pageData = filtered.slice(start, start + pageSize);
    document.getElementById('projectsList').innerHTML = `
        <table class="table-sticky">
                    <thead>
                        <tr>
                            <th>项目编号</th>
                            <th>项目名称</th>
                            <th>客户名称</th>
                            <th>业务类型</th>
                            <th>项目金额</th>
                            <th>交付时间</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                ${(pageData.length ? pageData : []).map(p => `
                    <tr class="row-striped">
                                <td>${p.projectNumber || '-'}</td>
                                <td>${p.projectName}</td>
                                <td>${p.customerId?.name || p.clientName}</td>
                                <td>${getBusinessTypeText(p.businessType)}</td>
                                <td>¥${p.projectAmount.toLocaleString()}</td>
                                <td>${new Date(p.deadline).toLocaleDateString()}</td>
                                <td><span class="badge ${getStatusBadgeClass(p.status)}">${getStatusText(p.status)}</span></td>
                        <td><button class="btn-small" onclick="viewProject('${p._id}')">查看</button></td>
                            </tr>
                `).join('') || '<tr><td colspan="8" style="text-align:center;">暂无项目</td></tr>'}
                    </tbody>
                </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${projectPage<=1?'disabled':''} onclick="projectPage=Math.max(1, projectPage-1);renderProjects();">上一页</button>
            <span style="align-self:center;">${projectPage} / ${totalPages}</span>
            <button class="btn-small" ${projectPage>=totalPages?'disabled':''} onclick="projectPage=Math.min(${totalPages}, projectPage+1);renderProjects();">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${projectPage}" style="width:70px;padding:6px;" onchange="jumpProjectPage(this.value, ${totalPages})">
        </div>
    `;
}

function jumpProjectPage(val, total) {
    const page = Math.min(Math.max(parseInt(val || 1, 10), 1), total);
    projectPage = page;
    renderProjects();
}
function exportProjects() {
    const search = document.getElementById('projectSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('projectStatusFilter')?.value || '';
    const biz = document.getElementById('projectBizFilter')?.value || '';
    const cust = document.getElementById('projectCustomerFilter')?.value || '';
    const rows = allProjectsCache.filter(p => {
        const matchesSearch = !search || (p.projectName?.toLowerCase().includes(search)) || (p.projectNumber?.toLowerCase().includes(search)) || ((p.customerId?.name || p.clientName || '').toLowerCase().includes(search));
        const matchesStatus = !status || p.status === status;
        const matchesBiz = !biz || p.businessType === biz;
        const matchesCust = !cust || (p.customerId && p.customerId._id === cust);
        return matchesSearch && matchesStatus && matchesBiz && matchesCust;
    }).map(p => [
        p.projectNumber || '-',
        p.projectName,
        p.customerId?.name || p.clientName,
        getBusinessTypeText(p.businessType),
        p.projectAmount,
        new Date(p.deadline).toLocaleDateString(),
        getStatusText(p.status)
    ]);
    const header = ['项目编号','项目名称','客户','业务类型','项目金额','交付时间','状态'];
    const csv = [header, ...rows].map(r => r.map(v => `"${(v ?? '').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'projects.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function fillProjectCustomerFilter() {
    const sel = document.getElementById('projectCustomerFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="">全部客户</option>' + (allCustomers || []).map(c => `<option value="${c._id}">${c.name}</option>`).join('');
}

function fillFinanceFilters() {
    const custSel = document.getElementById('financeCustomer');
    if (custSel) {
        custSel.innerHTML = '<option value="">全部客户</option>' + (allCustomers || []).map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    }
    const salesSel = document.getElementById('financeSales');
    if (salesSel && allUsers?.length) {
        const sales = allUsers.filter(u => (u.roles || []).includes('sales'));
        salesSel.innerHTML = '<option value="">全部销售</option>' + sales.map(s => `<option value="${s._id}">${s.name}</option>`).join('');
    }
}

function fillFinanceProjectSelects() {
    const paymentSel = document.getElementById('paymentProjectId');
    const invoiceSel = document.getElementById('invoiceProjectId');
    const options = (allProjectsCache || []).map(p => `<option value="${p._id}">${p.projectNumber || p.projectName}</option>`).join('');
    if (paymentSel) paymentSel.innerHTML = '<option value="">选择项目</option>' + options;
    if (invoiceSel) invoiceSel.innerHTML = '<option value="">选择项目</option>' + options;
}

async function showCreateProjectModal() {
    // 确保客户列表已加载
    if (allCustomers.length === 0) {
        await loadCustomers();
    }
    
    // 确保用户列表已加载（用于成员选择）
    if (allUsers.length === 0) {
        try {
            const response = await fetch(`${API_BASE}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                allUsers = data.data;
            }
        } catch (error) {
            console.error('加载用户列表失败:', error);
        }
    }

    // 确保语种列表已加载
    if (languagesCache.length === 0) {
        await loadLanguages();
    }

    const languageOptions = languagesCache
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}">${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');

    const content = `
        <form id="createProjectForm" onsubmit="createProject(event)">
            <div class="form-group">
                <label>项目编号（留空自动生成）</label>
                <input type="text" name="projectNumber" placeholder="如：PRJ2024010001">
            </div>
            <div class="form-group">
                <label>项目名称 *</label>
                <input type="text" name="projectName" required>
            </div>
            <div class="form-group">
                <label>选择客户 *</label>
                <select name="customerId" id="projectCustomerSelect" required onchange="updateCustomerInfo()">
                    <option value="">请选择客户</option>
                    ${allCustomers.filter(c => c.isActive).map(c => 
                        `<option value="${c._id}">${c.name}${c.shortName ? ' (' + c.shortName + ')' : ''}</option>`
                    ).join('')}
                </select>
                <button type="button" class="btn-small" onclick="closeModal(); showCreateCustomerModal();" style="margin-top: 5px;">创建新客户</button>
            </div>
            <div class="form-group">
                <label>业务类型 *</label>
                <select name="businessType" id="businessType" required onchange="toggleProjectFields()">
                    <option value="translation">笔译</option>
                    <option value="interpretation">口译</option>
                    <option value="transcription">转录</option>
                    <option value="localization">本地化</option>
                    <option value="other">其他</option>
                </select>
            </div>
            <div class="form-group" id="projectTypeGroup">
                <label>项目类型（笔译项目）</label>
                <select name="projectType">
                    <option value="mtpe">MTPE</option>
                    <option value="deepedit">深度编辑</option>
                    <option value="review">审校项目</option>
                    <option value="mixed">混合类型</option>
                </select>
            </div>
            <div class="form-group">
                <label>源语种 *</label>
                <select name="sourceLanguage" id="sourceLanguageSelect" required>
                    <option value="">请选择源语种</option>
                    ${languageOptions}
                </select>
            </div>
            <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin-bottom: 0;">目标语言 *</label>
                    <button type="button" class="btn-small" onclick="addTargetLanguageRow()">+ 添加目标语种</button>
                </div>
                <div id="targetLanguagesContainer" style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- 目标语种行将动态添加到这里 -->
                </div>
                <small style="color:#666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个目标语种，支持一对多翻译</small>
                <div style="margin-top:8px;font-size:12px;color:#667eea;">
                    如需新增语种，请在"语种管理"中添加。
                </div>
            </div>
            <div class="form-group" id="wordCountGroup">
                <label>字数（笔译项目）</label>
                <input type="number" name="wordCount" id="wordCount" min="0" step="1" onchange="calculateAmount()">
            </div>
            <div class="form-group" id="unitPriceGroup">
                <label>单价（每千字，元）</label>
                <input type="number" name="unitPrice" id="unitPrice" min="0" step="0.01" onchange="calculateAmount()">
            </div>
            <div class="form-group">
                <label>项目总金额 *</label>
                <input type="number" name="projectAmount" id="projectAmount" step="0.01" min="0" required onchange="calculatePartTimeSalesCommission(); validateLayoutCost();">
                <small style="color: #666; font-size: 12px;">笔译项目：字数×单价/1000；其他项目：手动输入</small>
            </div>
            <div class="form-group">
                <label>交付时间 *</label>
                <input type="date" name="deadline" required>
            </div>
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">其他信息（可选）</h4>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="isTaxIncluded">
                        是否含税
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="needInvoice">
                        需要发票
                    </label>
                </div>
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职销售（可选）</h4>
                <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" name="partTimeSales.isPartTime" id="partTimeSalesEnabled" onchange="togglePartTimeSalesFields()">
                    启用兼职销售
                </label>
                <div id="partTimeSalesFields" style="display: none; padding-left: 20px; border-left: 2px solid #667eea;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>公司应收金额（元）</label>
                        <input type="number" name="partTimeSales.companyReceivable" id="companyReceivable" step="0.01" min="0" onchange="calculatePartTimeSalesCommission()" style="width: 100%;">
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>税率（%）</label>
                        <input type="number" name="partTimeSales.taxRate" id="taxRate" step="0.01" min="0" max="100" value="10" onchange="calculatePartTimeSalesCommission()" style="width: 100%;">
                        <small style="color: #666; font-size: 12px;">例如：10 表示 10%</small>
                    </div>
                    <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <label style="font-weight: 600; color: #0369a1;">返还佣金（自动计算）</label>
                        <div id="partTimeSalesCommissionDisplay" style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                            ¥0.00
                        </div>
                        <small style="color: #666; font-size: 12px; display: block; margin-top: 5px;">公式：成交额 - 公司应收 - 税费</small>
                    </div>
                </div>
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职排版（可选）</h4>
                <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" name="partTimeLayout.isPartTime" id="partTimeLayoutEnabled" onchange="togglePartTimeLayoutFields()">
                    启用兼职排版
                </label>
                <div id="partTimeLayoutFields" style="display: none; padding-left: 20px; border-left: 2px solid #667eea;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>选择排版员</label>
                        <select name="partTimeLayout.layoutAssignedTo" id="layoutAssignedTo" style="width: 100%;">
                            <option value="">请选择排版员</option>
                            ${allUsers.filter(u => u.isActive).map(u => 
                                `<option value="${u._id}">${u.name} (${u.username})</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>排版费用（元）</label>
                        <input type="number" name="partTimeLayout.layoutCost" id="layoutCost" step="0.01" min="0" onchange="validateLayoutCost()" style="width: 100%;">
                        <small style="color: #666; font-size: 12px;">排版费用不能超过项目总金额的5%</small>
                    </div>
                    <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <label style="font-weight: 600; color: #0369a1;">费用占比（自动计算）</label>
                        <div id="layoutCostPercentageDisplay" style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                            0%
                        </div>
                        <div id="layoutCostValidation" style="margin-top: 5px;"></div>
                    </div>
                </div>
            </div>
            <div class="form-group">
                <label>特殊要求</label>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; margin-top: 5px;">
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="specialRequirements.terminology">
                        术语表
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="specialRequirements.nda">
                        保密协议
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="specialRequirements.referenceFiles">
                        参考文件
                    </label>
                </div>
                <textarea name="specialRequirements.notes" rows="2" placeholder="其他特殊要求备注" style="margin-top: 10px;"></textarea>
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <label style="margin-bottom: 0;">项目成员（可选，创建后也可添加）</label>
                    <button type="button" class="btn-small" onclick="addMemberRow()">+ 添加项目经理</button>
                </div>
                <div id="membersContainer" style="max-height: 300px; overflow-y: auto;">
                    <!-- 成员行将动态添加到这里 -->
                </div>
                <small style="color: #666; font-size: 12px;">提示：销售创建项目时只能添加项目经理，翻译、审校、排版等成员由项目经理在项目详情中添加</small>
            </div>
            
            <div class="action-buttons">
                <button type="submit">创建</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('创建项目', content);
    // 重置成员容器和目标语种容器
    document.getElementById('membersContainer').innerHTML = '';
    document.getElementById('targetLanguagesContainer').innerHTML = '';
    // 添加第一个目标语种行
    addTargetLanguageRow();
}

let targetLanguageRowIndex = 0;

function addTargetLanguageRow() {
    // 确保语种列表已加载
    if (languagesCache.length === 0) {
        showToast('请先等待语种列表加载完成', 'error');
        return;
    }
    
    targetLanguageRowIndex++;
    const container = document.getElementById('targetLanguagesContainer');
    if (!container) return;
    
    const languageOptions = languagesCache
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}">${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    
    const row = document.createElement('div');
    row.className = 'target-language-row';
    row.id = `targetLanguageRow${targetLanguageRowIndex}`;
    row.style.cssText = 'display: flex; gap: 10px; align-items: flex-end; padding: 8px; background: #f8f9fa; border-radius: 4px;';
    
    row.innerHTML = `
        <div style="flex: 1;">
            <label style="font-size: 12px; display: block; margin-bottom: 4px;">目标语种 ${targetLanguageRowIndex}</label>
            <select class="target-language-select" required style="width: 100%; padding: 6px;">
                <option value="">请选择目标语种</option>
                ${languageOptions}
            </select>
        </div>
        <div style="flex: 0 0 auto;">
            <button type="button" class="btn-small btn-danger" onclick="removeTargetLanguageRow('targetLanguageRow${targetLanguageRowIndex}')" style="margin-bottom: 0;">删除</button>
        </div>
    `;
    container.appendChild(row);
}

function removeTargetLanguageRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        // 重新编号
        const container = document.getElementById('targetLanguagesContainer');
        if (container) {
            const rows = container.querySelectorAll('.target-language-row');
            rows.forEach((r, index) => {
                const label = r.querySelector('label');
                if (label) {
                    label.textContent = `目标语种 ${index + 1}`;
                }
            });
        }
    }
}

function addEditTargetLanguageRow(selectedValue = '') {
    // 确保语种列表已加载
    if (languagesCache.length === 0) {
        showToast('请先等待语种列表加载完成', 'error');
        return;
    }
    
    targetLanguageRowIndex++;
    const container = document.getElementById('editTargetLanguagesContainer');
    if (!container) return;
    
    const languageOptions = languagesCache
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}" ${selectedValue === lang.name ? 'selected' : ''}>${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    
    const row = document.createElement('div');
    row.className = 'target-language-row';
    row.id = `targetLanguageRow${targetLanguageRowIndex}`;
    row.style.cssText = 'display: flex; gap: 10px; align-items: flex-end; padding: 8px; background: #f8f9fa; border-radius: 4px;';
    
    const rowNumber = container.querySelectorAll('.target-language-row').length + 1;
    row.innerHTML = `
        <div style="flex: 1;">
            <label style="font-size: 12px; display: block; margin-bottom: 4px;">目标语种 ${rowNumber}</label>
            <select class="target-language-select" required style="width: 100%; padding: 6px;">
                <option value="">请选择目标语种</option>
                ${languageOptions}
            </select>
        </div>
        <div style="flex: 0 0 auto;">
            <button type="button" class="btn-small btn-danger" onclick="removeEditTargetLanguageRow('targetLanguageRow${targetLanguageRowIndex}')" style="margin-bottom: 0;">删除</button>
        </div>
    `;
    container.appendChild(row);
}

function removeEditTargetLanguageRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        // 重新编号
        const container = document.getElementById('editTargetLanguagesContainer');
        if (container) {
            const rows = container.querySelectorAll('.target-language-row');
            rows.forEach((r, index) => {
                const label = r.querySelector('label');
                if (label) {
                    label.textContent = `目标语种 ${index + 1}`;
                }
            });
        }
    }
}

let memberRowIndex = 0;

async function addMemberRow() {
    // 确保用户列表已加载
    if (allUsers.length === 0) {
        try {
            const response = await fetch(`${API_BASE}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                allUsers = data.data;
            } else {
                alert('无法加载用户列表: ' + (data.message || '未知错误'));
                return;
            }
        } catch (error) {
            alert('加载用户列表失败: ' + error.message);
            return;
        }
    }
    
    // 判断当前用户是否是销售或兼职销售（创建项目时只能添加项目经理）
    const isSales = currentUser?.roles?.includes('sales') || currentUser?.roles?.includes('part_time_sales');
    
    memberRowIndex++;
    const container = document.getElementById('membersContainer');
    const row = document.createElement('div');
    row.className = 'member-row';
    row.id = `memberRow${memberRowIndex}`;
    row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; align-items: flex-end;';
    
    // 如果是销售创建项目，只能选择项目经理
    const roleOptions = isSales ? `
                <option value="">请选择</option>
                <option value="pm">项目经理</option>
    ` : `
                <option value="">请选择</option>
                <option value="translator">翻译</option>
                <option value="reviewer">审校</option>
                <option value="pm">项目经理</option>
                <option value="sales">销售</option>
                <option value="admin_staff">综合岗</option>
                <option value="part_time_sales">兼职销售</option>
                <option value="layout">兼职排版</option>
    `;
    
    row.innerHTML = `
        <div style="flex: 2;">
            <label style="font-size: 12px;">选择用户</label>
            <select name="memberUserId" class="member-user-select" required>
                <option value="">请选择</option>
                ${allUsers.filter(u => u.isActive).map(u => 
                    `<option value="${u._id}">${u.name} (${u.username})</option>`
                ).join('')}
            </select>
        </div>
        <div style="flex: 1.5;">
            <label style="font-size: 12px;">角色</label>
            <select name="memberRole" class="member-role-select" required onchange="toggleMemberFields(this)">
                ${roleOptions}
            </select>
        </div>
        <div class="member-translator-group" style="flex: 1; display: none;">
            <label style="font-size: 12px;">翻译类型</label>
            <select name="memberTranslatorType">
                <option value="mtpe">MTPE</option>
                <option value="deepedit">深度编辑</option>
            </select>
        </div>
        <div class="member-wordratio-group" style="flex: 1; display: none;">
            <label style="font-size: 12px;">字数占比</label>
            <input type="number" name="memberWordRatio" step="0.01" min="0" max="1" value="1.0" style="width: 100%;">
        </div>
        <div style="flex: 0.5;">
            <button type="button" class="btn-small btn-danger" onclick="removeMemberRow('memberRow${memberRowIndex}')">删除</button>
        </div>
    `;
    container.appendChild(row);
}

function removeMemberRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
    }
}

function toggleMemberFields(selectElement) {
    const row = selectElement.closest('.member-row');
    const role = selectElement.value;
    const translatorGroup = row.querySelector('.member-translator-group');
    const wordRatioGroup = row.querySelector('.member-wordratio-group');
    
    if (role === 'translator') {
        translatorGroup.style.display = 'block';
        wordRatioGroup.style.display = 'block';
    } else {
        translatorGroup.style.display = 'none';
        wordRatioGroup.style.display = 'none';
    }
}

function toggleProjectFields() {
    const businessType = document.getElementById('businessType').value;
    const wordCountGroup = document.getElementById('wordCountGroup');
    const unitPriceGroup = document.getElementById('unitPriceGroup');
    const projectTypeGroup = document.getElementById('projectTypeGroup');
    
    if (businessType === 'translation') {
        wordCountGroup.style.display = 'block';
        unitPriceGroup.style.display = 'block';
        projectTypeGroup.style.display = 'block';
    } else {
        wordCountGroup.style.display = 'none';
        unitPriceGroup.style.display = 'none';
        projectTypeGroup.style.display = 'none';
        document.getElementById('wordCount').value = '';
        document.getElementById('unitPrice').value = '';
    }
}

function calculateAmount() {
    const businessType = document.getElementById('businessType')?.value;
    const wordCount = parseFloat(document.getElementById('wordCount')?.value || 0);
    const unitPrice = parseFloat(document.getElementById('unitPrice')?.value || 0);
    const amountInput = document.getElementById('projectAmount');
    
    if (businessType === 'translation' && wordCount > 0 && unitPrice > 0) {
        const amount = (wordCount / 1000) * unitPrice;
        if (amountInput) {
            amountInput.value = amount.toFixed(2);
        }
    }
    
    // 重新计算兼职销售佣金和排版费用校验
    calculatePartTimeSalesCommission();
    validateLayoutCost();
}

// 切换兼职销售字段显示
function togglePartTimeSalesFields() {
    const enabled = document.getElementById('partTimeSalesEnabled')?.checked;
    const fields = document.getElementById('partTimeSalesFields');
    if (fields) {
        fields.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            calculatePartTimeSalesCommission();
        }
    }
}

// 计算兼职销售佣金
function calculatePartTimeSalesCommission() {
    const enabled = document.getElementById('partTimeSalesEnabled')?.checked;
    if (!enabled) {
        const display = document.getElementById('partTimeSalesCommissionDisplay');
        if (display) display.textContent = '¥0.00';
        return;
    }
    
    const totalAmount = parseFloat(document.getElementById('projectAmount')?.value || 0);
    const companyReceivable = parseFloat(document.getElementById('companyReceivable')?.value || 0);
    const taxRatePercent = parseFloat(document.getElementById('taxRate')?.value || 0);
    const taxRate = taxRatePercent / 100; // 转换为小数
    
    if (totalAmount <= 0) {
        const display = document.getElementById('partTimeSalesCommissionDisplay');
        if (display) display.textContent = '¥0.00';
        return;
    }
    
    // 计算应收金额
    const receivableAmount = totalAmount - companyReceivable;
    
    // 计算税费
    const taxAmount = receivableAmount * taxRate;
    
    // 计算税后金额（返还佣金）
    const commission = receivableAmount - taxAmount;
    const finalCommission = Math.max(0, Math.round(commission * 100) / 100);
    
    const display = document.getElementById('partTimeSalesCommissionDisplay');
    if (display) {
        display.textContent = `¥${finalCommission.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

// 切换兼职排版字段显示
function togglePartTimeLayoutFields() {
    const enabled = document.getElementById('partTimeLayoutEnabled')?.checked;
    const fields = document.getElementById('partTimeLayoutFields');
    if (fields) {
        fields.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            validateLayoutCost();
        }
    }
}

// 编辑表单：切换兼职销售字段显示
function toggleEditPartTimeSalesFields() {
    const enabled = document.getElementById('editPartTimeSalesEnabled')?.checked;
    const fields = document.getElementById('editPartTimeSalesFields');
    if (fields) {
        fields.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            calculateEditPartTimeSalesCommission();
        }
    }
}

// 编辑表单：计算兼职销售佣金
function calculateEditPartTimeSalesCommission() {
    const enabled = document.getElementById('editPartTimeSalesEnabled')?.checked;
    if (!enabled) {
        const display = document.getElementById('editPartTimeSalesCommissionDisplay');
        if (display) display.textContent = '¥0.00';
        return;
    }
    
    const totalAmount = parseFloat(document.querySelector('#editProjectForm [name="projectAmount"]')?.value || 0);
    const companyReceivable = parseFloat(document.getElementById('editCompanyReceivable')?.value || 0);
    const taxRatePercent = parseFloat(document.getElementById('editTaxRate')?.value || 0);
    const taxRate = taxRatePercent / 100;
    
    if (totalAmount <= 0) {
        const display = document.getElementById('editPartTimeSalesCommissionDisplay');
        if (display) display.textContent = '¥0.00';
        return;
    }
    
    const receivableAmount = totalAmount - companyReceivable;
    const taxAmount = receivableAmount * taxRate;
    const commission = receivableAmount - taxAmount;
    const finalCommission = Math.max(0, Math.round(commission * 100) / 100);
    
    const display = document.getElementById('editPartTimeSalesCommissionDisplay');
    if (display) {
        display.textContent = `¥${finalCommission.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

// 编辑表单：切换兼职排版字段显示
function toggleEditPartTimeLayoutFields() {
    const enabled = document.getElementById('editPartTimeLayoutEnabled')?.checked;
    const fields = document.getElementById('editPartTimeLayoutFields');
    if (fields) {
        fields.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            validateEditLayoutCost();
        }
    }
}

// 编辑表单：校验排版费用
function validateEditLayoutCost() {
    const enabled = document.getElementById('editPartTimeLayoutEnabled')?.checked;
    if (!enabled) {
        const display = document.getElementById('editLayoutCostPercentageDisplay');
        const validation = document.getElementById('editLayoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '';
        return;
    }
    
    const projectAmount = parseFloat(document.querySelector('#editProjectForm [name="projectAmount"]')?.value || 0);
    const layoutCost = parseFloat(document.getElementById('editLayoutCost')?.value || 0);
    
    if (projectAmount <= 0) {
        const display = document.getElementById('editLayoutCostPercentageDisplay');
        const validation = document.getElementById('editLayoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '<small style="color: #999;">请输入项目总金额</small>';
        return;
    }
    
    if (layoutCost <= 0) {
        const display = document.getElementById('editLayoutCostPercentageDisplay');
        const validation = document.getElementById('editLayoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '';
        return;
    }
    
    const percentage = (layoutCost / projectAmount) * 100;
    const roundedPercentage = Math.round(percentage * 100) / 100;
    
    const display = document.getElementById('editLayoutCostPercentageDisplay');
    const validation = document.getElementById('editLayoutCostValidation');
    
    if (display) {
        display.textContent = `${roundedPercentage}%`;
        if (roundedPercentage > 5) {
            display.style.color = '#dc2626';
        } else {
            display.style.color = '#0369a1';
        }
    }
    
    if (validation) {
        if (roundedPercentage > 5) {
            validation.innerHTML = `<small style="color: #dc2626; font-weight: 600;">⚠️ 排版费用超过项目总金额的5%，请调整费用</small>`;
        } else if (roundedPercentage > 4.5) {
            validation.innerHTML = `<small style="color: #f59e0b;">⚠️ 接近5%限制，请注意</small>`;
        } else {
            validation.innerHTML = `<small style="color: #059669;">✓ 费用在允许范围内</small>`;
        }
    }
}

// 校验排版费用
function validateLayoutCost() {
    const enabled = document.getElementById('partTimeLayoutEnabled')?.checked;
    if (!enabled) {
        const display = document.getElementById('layoutCostPercentageDisplay');
        const validation = document.getElementById('layoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '';
        return;
    }
    
    const projectAmount = parseFloat(document.getElementById('projectAmount')?.value || 0);
    const layoutCost = parseFloat(document.getElementById('layoutCost')?.value || 0);
    
    if (projectAmount <= 0) {
        const display = document.getElementById('layoutCostPercentageDisplay');
        const validation = document.getElementById('layoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '<small style="color: #999;">请输入项目总金额</small>';
        return;
    }
    
    if (layoutCost <= 0) {
        const display = document.getElementById('layoutCostPercentageDisplay');
        const validation = document.getElementById('layoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '';
        return;
    }
    
    // 计算百分比
    const percentage = (layoutCost / projectAmount) * 100;
    const roundedPercentage = Math.round(percentage * 100) / 100;
    
    const display = document.getElementById('layoutCostPercentageDisplay');
    const validation = document.getElementById('layoutCostValidation');
    
    if (display) {
        display.textContent = `${roundedPercentage}%`;
        if (roundedPercentage > 5) {
            display.style.color = '#dc2626';
        } else {
            display.style.color = '#0369a1';
        }
    }
    
    if (validation) {
        if (roundedPercentage > 5) {
            validation.innerHTML = `<small style="color: #dc2626; font-weight: 600;">⚠️ 排版费用超过项目总金额的5%，请调整费用</small>`;
        } else if (roundedPercentage > 4.5) {
            validation.innerHTML = `<small style="color: #f59e0b;">⚠️ 接近5%限制，请注意</small>`;
        } else {
            validation.innerHTML = `<small style="color: #059669;">✓ 费用在允许范围内</small>`;
        }
    }
}

function updateCustomerInfo() {
    // 可以在这里显示客户信息，但不需要修改表单
}

async function createProject(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // 收集成员信息
    const members = [];
    const memberRows = document.querySelectorAll('.member-row');
    memberRows.forEach(row => {
        const userId = row.querySelector('.member-user-select')?.value;
        const role = row.querySelector('.member-role-select')?.value;
        if (userId && role) {
            const member = {
                userId,
                role,
                translatorType: role === 'translator' ? (row.querySelector('[name="memberTranslatorType"]')?.value || 'mtpe') : undefined,
                wordRatio: role === 'translator' ? parseFloat(row.querySelector('[name="memberWordRatio"]')?.value || '1.0') : undefined
            };
            members.push(member);
        }
    });
    
    // 收集特殊要求
    const specialRequirements = {
        terminology: formData.get('specialRequirements.terminology') === 'on',
        nda: formData.get('specialRequirements.nda') === 'on',
        referenceFiles: formData.get('specialRequirements.referenceFiles') === 'on',
        notes: formData.get('specialRequirements.notes') || undefined
    };
    
    // 收集目标语言
    const targetLanguageRows = document.querySelectorAll('.target-language-select');
    const targetLanguages = Array.from(targetLanguageRows)
        .map(select => select.value)
        .filter(value => value && value.trim() !== '');
    
    if (targetLanguages.length === 0) {
        alert('请至少添加并选择一个目标语种');
        return;
    }

    // 收集兼职销售信息
    const partTimeSalesEnabled = formData.get('partTimeSales.isPartTime') === 'on';
    const partTimeSales = partTimeSalesEnabled ? {
        isPartTime: true,
        companyReceivable: parseFloat(formData.get('partTimeSales.companyReceivable') || 0),
        taxRate: parseFloat(formData.get('partTimeSales.taxRate') || 0) / 100 // 转换为小数
    } : undefined;
    
    // 收集兼职排版信息
    const partTimeLayoutEnabled = formData.get('partTimeLayout.isPartTime') === 'on';
    const layoutCost = parseFloat(formData.get('partTimeLayout.layoutCost') || 0);
    const layoutAssignedTo = formData.get('partTimeLayout.layoutAssignedTo');
    
    // 校验排版费用
    if (partTimeLayoutEnabled && layoutCost > 0) {
        const projectAmount = parseFloat(formData.get('projectAmount'));
        const percentage = (layoutCost / projectAmount) * 100;
        if (percentage > 5) {
            alert(`排版费用(${layoutCost})不能超过项目总金额(${projectAmount})的5%，当前占比为${percentage.toFixed(2)}%`);
            return;
        }
        if (!layoutAssignedTo) {
            alert('请选择排版员');
            return;
        }
    }
    
    const partTimeLayout = partTimeLayoutEnabled ? {
        isPartTime: true,
        layoutCost: layoutCost,
        layoutAssignedTo: layoutAssignedTo || undefined
    } : undefined;

    const data = {
        projectNumber: formData.get('projectNumber') || undefined,
        projectName: formData.get('projectName'),
        customerId: formData.get('customerId'),
        businessType: formData.get('businessType'),
        projectType: formData.get('projectType') || undefined,
        sourceLanguage: formData.get('sourceLanguage'),
        targetLanguages: targetLanguages,
        wordCount: formData.get('wordCount') ? parseFloat(formData.get('wordCount')) : undefined,
        unitPrice: formData.get('unitPrice') ? parseFloat(formData.get('unitPrice')) : undefined,
        projectAmount: parseFloat(formData.get('projectAmount')),
        deadline: formData.get('deadline'),
        isTaxIncluded: formData.get('isTaxIncluded') === 'on',
        needInvoice: formData.get('needInvoice') === 'on',
        specialRequirements: Object.keys(specialRequirements).some(k => specialRequirements[k]) ? specialRequirements : undefined,
        members: members.length > 0 ? members : undefined,
        partTimeSales: partTimeSales,
        partTimeLayout: partTimeLayout
    };

    try {
        const response = await fetch(`${API_BASE}/projects/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadProjects();
            showAlert('projectsList', '项目创建成功' + (members.length > 0 ? `，已添加 ${members.length} 名成员` : ''), 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('创建失败: ' + error.message);
    }
}

async function viewProject(projectId) {
    try {
        const response = await fetch(`${API_BASE}/projects/${projectId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const project = data.data;
            currentProjectDetail = project;
            const canModify = currentUser.roles.includes('admin') || 
                            currentUser.roles.includes('pm') ||
                            project.createdBy._id === currentUser._id;
            const canFinance = isFinanceRole();

            const canManagePayment = currentUser.roles.includes('admin') || 
                                    currentUser.roles.includes('finance') ||
                            project.createdBy._id === currentUser._id;

            const content = `
                <div class="project-detail">
                    <div class="detail-section">
                        <h4>基本信息</h4>
                        <div class="detail-row">
                            <div class="detail-label">项目编号:</div>
                            <div class="detail-value">${project.projectNumber || '-'}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">项目名称:</div>
                            <div class="detail-value">${project.projectName}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">客户名称:</div>
                            <div class="detail-value">${project.customerId?.name || project.clientName}</div>
                        </div>
                        ${project.customerId ? `
                            <div class="detail-row">
                                <div class="detail-label">客户联系人:</div>
                                <div class="detail-value">${project.customerId.contactPerson || '-'}</div>
                            </div>
                            <div class="detail-row">
                                <div class="detail-label">客户电话:</div>
                                <div class="detail-value">${project.customerId.phone || '-'}</div>
                            </div>
                            <div class="detail-row">
                                <div class="detail-label">客户邮箱:</div>
                                <div class="detail-value">${project.customerId.email || '-'}</div>
                            </div>
                        ` : ''}
                        <div class="detail-row">
                            <div class="detail-label">业务类型:</div>
                            <div class="detail-value">${getBusinessTypeText(project.businessType)}</div>
                        </div>
                        ${project.projectType ? `
                            <div class="detail-row">
                                <div class="detail-label">项目类型:</div>
                                <div class="detail-value">${getProjectTypeText(project.projectType)}</div>
                            </div>
                        ` : ''}
                        ${project.sourceLanguage ? `
                            <div class="detail-row">
                                <div class="detail-label">源语种:</div>
                                <div class="detail-value">${project.sourceLanguage}</div>
                            </div>
                        ` : ''}
                        ${project.targetLanguages && project.targetLanguages.length > 0 ? `
                            <div class="detail-row">
                                <div class="detail-label">目标语言:</div>
                                <div class="detail-value">${project.targetLanguages.join(', ')}</div>
                            </div>
                        ` : ''}
                        ${project.businessType === 'translation' && project.wordCount > 0 ? `
                            <div class="detail-row">
                                <div class="detail-label">字数:</div>
                                <div class="detail-value">${project.wordCount.toLocaleString()}</div>
                            </div>
                            <div class="detail-row">
                                <div class="detail-label">单价（每千字）:</div>
                                <div class="detail-value">¥${project.unitPrice ? project.unitPrice.toLocaleString() : '-'}</div>
                            </div>
                        ` : ''}
                        <div class="detail-row">
                            <div class="detail-label">项目金额:</div>
                            <div class="detail-value">¥${project.projectAmount.toLocaleString()}${project.isTaxIncluded ? '（含税）' : ''}</div>
                        </div>
                        ${project.needInvoice ? `
                            <div class="detail-row">
                                <div class="detail-label">发票:</div>
                                <div class="detail-value"><span class="badge badge-info">需要发票</span></div>
                            </div>
                        ` : ''}
                        ${project.partTimeSales?.isPartTime ? `
                            <div class="detail-row" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                                <div class="detail-label" style="font-weight: 600; color: #0369a1;">兼职销售信息:</div>
                                <div class="detail-value" style="color: #0369a1;">
                                    <div>公司应收金额: ¥${(project.partTimeSales.companyReceivable || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    <div>税率: ${((project.partTimeSales.taxRate || 0) * 100).toFixed(2)}%</div>
                                    <div style="font-weight: bold; margin-top: 5px;">返还佣金: ¥${(project.partTimeSales.partTimeSalesCommission || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                            </div>
                        ` : ''}
                        ${project.partTimeLayout?.isPartTime ? `
                            <div class="detail-row" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                                <div class="detail-label" style="font-weight: 600; color: #0369a1;">兼职排版信息:</div>
                                <div class="detail-value" style="color: #0369a1;">
                                    <div>排版员: ${project.partTimeLayout.layoutAssignedTo?.name || project.partTimeLayout.layoutAssignedTo || '-'}</div>
                                    <div>排版费用: ¥${(project.partTimeLayout.layoutCost || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    <div>费用占比: ${(project.partTimeLayout.layoutCostPercentage || 0).toFixed(2)}%</div>
                                </div>
                            </div>
                        ` : ''}
                        ${project.specialRequirements && (project.specialRequirements.terminology || project.specialRequirements.nda || project.specialRequirements.referenceFiles) ? `
                            <div class="detail-row">
                                <div class="detail-label">特殊要求:</div>
                                <div class="detail-value">
                                    ${project.specialRequirements.terminology ? '<span class="badge badge-info">术语表</span>' : ''}
                                    ${project.specialRequirements.nda ? '<span class="badge badge-info">保密协议</span>' : ''}
                                    ${project.specialRequirements.referenceFiles ? '<span class="badge badge-info">参考文件</span>' : ''}
                                    ${project.specialRequirements.notes ? '<br><small>' + project.specialRequirements.notes + '</small>' : ''}
                                </div>
                            </div>
                        ` : ''}
                        <div class="detail-row">
                            <div class="detail-label">交付时间:</div>
                            <div class="detail-value">${new Date(project.deadline).toLocaleString()}</div>
                        </div>
                        ${project.startedAt ? `
                            <div class="detail-row">
                                <div class="detail-label">开始时间:</div>
                                <div class="detail-value">${new Date(project.startedAt).toLocaleString()}</div>
                            </div>
                        ` : ''}
                        <div class="detail-row">
                            <div class="detail-label">状态:</div>
                            <div class="detail-value"><span class="badge ${getStatusBadgeClass(project.status)}">${getStatusText(project.status)}</span></div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">返修次数:</div>
                            <div class="detail-value">${project.revisionCount}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">是否延期:</div>
                            <div class="detail-value">${project.isDelayed ? '<span class="badge badge-warning">是</span>' : '<span class="badge badge-success">否</span>'}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">客户投诉:</div>
                            <div class="detail-value">${project.hasComplaint ? '<span class="badge badge-danger">是</span>' : '<span class="badge badge-success">否</span>'}</div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h4>回款信息</h4>
                            ${canManagePayment ? `<button class="btn-small" onclick="closeModal(); setTimeout(() => showPaymentModal('${projectId}'), 100)">更新回款</button>` : ''}
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">合同约定回款日:</div>
                            <div class="detail-value">${project.payment?.expectedAt ? new Date(project.payment.expectedAt).toLocaleDateString() : '-'}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">已回款金额:</div>
                            <div class="detail-value">¥${(project.payment?.receivedAmount || 0).toLocaleString()}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">回款日期:</div>
                            <div class="detail-value">${project.payment?.receivedAt ? new Date(project.payment.receivedAt).toLocaleDateString() : '-'}</div>
                        </div>
                        <div class="detail-row">
                            <div class="detail-label">是否回款完成:</div>
                            <div class="detail-value">${project.payment?.isFullyPaid ? '<span class="badge badge-success">是</span>' : '<span class="badge badge-warning">否</span>'}</div>
                        </div>
                    </div>

                    <div class="detail-section">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h4>项目成员</h4>
                            ${canModify ? '<button class="btn-small" onclick="closeModal(); setTimeout(() => showAddMemberModal(\'' + projectId + '\'), 100)">添加成员</button>' : ''}
                        </div>
                        <div id="projectMembers">
                            ${project.members && project.members.length > 0 ? project.members.map(m => `
                                <div class="member-item">
                                    <div class="member-info">
                                        <strong>${m.userId.name}</strong> - ${getRoleText(m.role)}
                                        ${m.role === 'translator' ? ` (${m.translatorType === 'deepedit' ? '深度编辑' : 'MTPE'}, 字数占比: ${(m.wordRatio * 100).toFixed(0)}%)` : ''}
                                    </div>
                                    ${canModify ? `
                                        <div class="member-actions">
                                            <button class="btn-small btn-danger" onclick="deleteMember('${projectId}', '${m._id}')">删除</button>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('') : '<p>暂无成员</p>'}
                        </div>
                    </div>

                    <div class="detail-section" id="realtimeKpiSection">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h4>预估KPI（金额）</h4>
                            <button class="btn-small" onclick="loadRealtimeKPI('${projectId}')">刷新</button>
                        </div>
                        <div id="realtimeKpiContent"><div class="card-desc">加载中...</div></div>
                    </div>

                    ${canFinance ? `
                    <div class="detail-section">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <h4>回款管理</h4>
                        </div>
                        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                            <input type="number" id="projectPaymentAmount" placeholder="回款金额" style="padding:6px; width:140px;">
                            <input type="date" id="projectPaymentDate" style="padding:6px;">
                            <input type="text" id="projectPaymentRef" placeholder="凭证号/备注" style="padding:6px; min-width:160px;">
                            <button class="btn-small" onclick="addProjectPayment('${projectId}')">新增回款</button>
                        </div>
                        <div id="projectPaymentList"><div class="card-desc">加载中...</div></div>
                    </div>

                    <div class="detail-section">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <h4>发票管理</h4>
                        </div>
                        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                            <input type="text" id="projectInvoiceNumber" placeholder="发票号" style="padding:6px; min-width:120px;">
                            <input type="number" id="projectInvoiceAmount" placeholder="金额" style="padding:6px; width:120px;">
                            <input type="date" id="projectInvoiceDate" style="padding:6px;">
                            <select id="projectInvoiceType" style="padding:6px;">
                                <option value="vat">专票/增值税</option>
                                <option value="normal">普票</option>
                                <option value="other">其他</option>
                            </select>
                            <button class="btn-small" onclick="addProjectInvoice('${projectId}')">新增发票</button>
                        </div>
                        <div id="projectInvoiceList"><div class="card-desc">加载中...</div></div>
                    </div>
                    ` : ''}

                    ${canModify && project.status !== 'completed' ? `
                        <div class="detail-section">
                            <h4>项目管理</h4>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                ${project.status === 'pending' ? `
                                    <button class="btn-small btn-success" onclick="startProject('${projectId}')">开始项目</button>
                                ` : ''}
                                ${project.status === 'in_progress' ? `
                                    <button class="btn-small" onclick="setRevision('${projectId}', ${project.revisionCount})">标记返修</button>
                                    <button class="btn-small" onclick="setDelay('${projectId}')">标记延期</button>
                                    <button class="btn-small" onclick="setComplaint('${projectId}')">标记客诉</button>
                                    <button class="btn-small btn-success" onclick="finishProject('${projectId}')">完成项目</button>
                                ` : ''}
                                <button class="btn-small" onclick="showEditProjectModal()">编辑项目</button>
                                <button class="btn-small btn-danger" onclick="deleteProject('${projectId}')">删除项目</button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
            showModal('项目详情', content);
            loadRealtimeKPI(projectId);
            if (canFinance) {
                loadProjectPayments(projectId);
                loadProjectInvoices(projectId);
            }
        }
    } catch (error) {
        alert('加载项目详情失败: ' + error.message);
    }
}

async function showAddMemberModal(projectId) {
    // 确保用户列表已加载
    if (allUsers.length === 0) {
        try {
            const response = await fetch(`${API_BASE}/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                allUsers = data.data;
            } else {
                alert('加载用户列表失败: ' + (data.message || '未知错误'));
                return;
            }
        } catch (error) {
            alert('加载用户列表失败: ' + error.message);
            return;
        }
    }

    // 过滤出激活的用户
    const activeUsers = allUsers.filter(u => u.isActive);

    const content = `
        <form id="addMemberForm" onsubmit="addMember(event, '${projectId}')">
            <div class="form-group">
                <label>选择用户 *</label>
                <select name="userId" required>
                    <option value="">请选择</option>
                    ${activeUsers.length === 0 ? '<option value="" disabled>暂无可用用户</option>' : ''}
                    ${activeUsers.map(u => `<option value="${u._id}">${u.name} (${u.username})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>角色 *</label>
                <select name="role" id="memberRole" onchange="toggleTranslatorFields()" required>
                    <option value="">请选择</option>
                    <option value="translator">翻译</option>
                    <option value="reviewer">审校</option>
                    <option value="pm">项目经理</option>
                    <option value="sales">销售</option>
                    <option value="admin_staff">综合岗</option>
                    <option value="part_time_sales">兼职销售</option>
                    <option value="layout">兼职排版</option>
                </select>
            </div>
            <div class="form-group" id="translatorTypeGroup" style="display: none;">
                <label>翻译类型</label>
                <select name="translatorType">
                    <option value="mtpe">MTPE</option>
                    <option value="deepedit">深度编辑</option>
                </select>
            </div>
            <div class="form-group" id="wordRatioGroup" style="display: none;">
                <label>字数占比 (0-1，多个翻译时使用)</label>
                <input type="number" name="wordRatio" step="0.01" min="0" max="1" value="1.0">
            </div>
            <div class="action-buttons">
                <button type="submit">添加</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('添加项目成员', content);
}

function toggleTranslatorFields() {
    const role = document.getElementById('memberRole').value;
    const translatorGroup = document.getElementById('translatorTypeGroup');
    const wordRatioGroup = document.getElementById('wordRatioGroup');
    
    if (role === 'translator') {
        translatorGroup.style.display = 'block';
        wordRatioGroup.style.display = 'block';
    } else {
        translatorGroup.style.display = 'none';
        wordRatioGroup.style.display = 'none';
    }
}

async function addMember(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        userId: formData.get('userId'),
        role: formData.get('role'),
        translatorType: formData.get('translatorType'),
        wordRatio: parseFloat(formData.get('wordRatio') || '1.0')
    };

    try {
        const response = await fetch(`${API_BASE}/projects/${projectId}/add-member`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            // 重新加载项目列表
            loadProjects();
            // 如果项目详情模态框是打开的，重新加载
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
            showToast('成员添加成功', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('添加失败: ' + error.message, 'error');
    }
}

async function deleteMember(projectId, memberId) {
    if (!confirm('确定要删除此成员吗？')) return;

    try {
        const response = await fetch(`${API_BASE}/projects/${projectId}/member/${memberId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (result.success) {
            // 重新加载项目列表
            loadProjects();
            // 如果项目详情模态框是打开的，重新加载
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
            showToast('成员已删除', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

async function setRevision(projectId, currentCount) {
    const count = prompt('请输入返修次数:', currentCount + 1);
    if (count === null) return;

    try {
        const response = await fetch(`${API_BASE}/projects/${projectId}/set-revision`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ count: parseInt(count) })
        });
        const result = await response.json();
        
        if (result.success) {
            loadProjects();
            // 如果项目详情模态框是打开的，重新加载
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

async function setDelay(projectId) {
    if (!confirm('确定要标记为延期吗？')) return;

    try {
        const response = await fetch(`${API_BASE}/projects/${projectId}/set-delay`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (result.success) {
            loadProjects();
            // 如果项目详情模态框是打开的，重新加载
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

async function setComplaint(projectId) {
    if (!confirm('确定要标记为客户投诉吗？')) return;

    try {
        const response = await fetch(`${API_BASE}/projects/${projectId}/set-complaint`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (result.success) {
            loadProjects();
            // 如果项目详情模态框是打开的，重新加载
            if (document.getElementById('modalOverlay').classList.contains('active')) {
                viewProject(projectId);
            }
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

async function finishProject(projectId) {
    if (!confirm('确定要完成此项目吗？完成后将无法修改。')) return;

    try {
        const response = await fetch(`${API_BASE}/projects/${projectId}/finish`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadProjects();
            showToast('项目已完成', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

async function showEditProjectModal() {
    const p = currentProjectDetail;
    if (!p) return;
    
    // 确保语种列表已加载
    if (languagesCache.length === 0) {
        await loadLanguages();
    }
    
    const targetLanguagesArray = Array.isArray(p.targetLanguages) ? p.targetLanguages : (p.targetLanguages ? [p.targetLanguages] : []);
    
    const languageOptions = languagesCache
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}">${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    
    const sourceLanguageOptions = languagesCache
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}" ${p.sourceLanguage === lang.name ? 'selected' : ''}>${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    
    const content = `
        <form id="editProjectForm" onsubmit="updateProject(event, '${p._id}')">
            <div class="form-group">
                <label>项目名称 *</label>
                <input type="text" name="projectName" value="${p.projectName || ''}" required>
            </div>
            <div class="form-group">
                <label>业务类型</label>
                <select name="businessType">
                    <option value="translation" ${p.businessType === 'translation' ? 'selected' : ''}>笔译</option>
                    <option value="interpretation" ${p.businessType === 'interpretation' ? 'selected' : ''}>口译</option>
                    <option value="transcription" ${p.businessType === 'transcription' ? 'selected' : ''}>转录</option>
                    <option value="localization" ${p.businessType === 'localization' ? 'selected' : ''}>本地化</option>
                    <option value="other" ${p.businessType === 'other' ? 'selected' : ''}>其他</option>
                </select>
            </div>
            <div class="form-group">
                <label>项目类型</label>
                <select name="projectType">
                    <option value="mtpe" ${p.projectType === 'mtpe' ? 'selected' : ''}>MTPE</option>
                    <option value="deepedit" ${p.projectType === 'deepedit' ? 'selected' : ''}>深度编辑</option>
                    <option value="review" ${p.projectType === 'review' ? 'selected' : ''}>审校项目</option>
                    <option value="mixed" ${p.projectType === 'mixed' ? 'selected' : ''}>混合类型</option>
                </select>
            </div>
            <div class="form-group">
                <label>源语种 *</label>
                <select name="sourceLanguage" id="editSourceLanguageSelect" required>
                    <option value="">请选择源语种</option>
                    ${sourceLanguageOptions}
                </select>
            </div>
            <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin-bottom: 0;">目标语言 *</label>
                    <button type="button" class="btn-small" onclick="addEditTargetLanguageRow()">+ 添加目标语种</button>
                </div>
                <div id="editTargetLanguagesContainer" style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- 目标语种行将动态添加到这里 -->
                </div>
                <small style="color:#666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个目标语种，支持一对多翻译</small>
            </div>
            <div class="form-group">
                <label>字数（笔译）</label>
                <input type="number" name="wordCount" value="${p.wordCount || ''}" min="0" step="1">
            </div>
            <div class="form-group">
                <label>单价（每千字）</label>
                <input type="number" name="unitPrice" value="${p.unitPrice || ''}" min="0" step="0.01">
            </div>
            <div class="form-group">
                <label>项目金额 *</label>
                <input type="number" name="projectAmount" value="${p.projectAmount || ''}" min="0" step="0.01" required onchange="calculateEditPartTimeSalesCommission(); validateEditLayoutCost();">
            </div>
            <div class="form-group">
                <label>交付时间 *</label>
                <input type="date" name="deadline" value="${p.deadline ? new Date(p.deadline).toISOString().slice(0,10) : ''}" required>
            </div>
            <div class="form-group" style="display:flex;gap:12px;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                    <input type="checkbox" name="isTaxIncluded" ${p.isTaxIncluded ? 'checked' : ''}> 含税
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                    <input type="checkbox" name="needInvoice" ${p.needInvoice ? 'checked' : ''}> 需要发票
                </label>
            </div>
            <div class="form-group">
                <label>特殊要求备注</label>
                <textarea name="specialRequirements.notes" rows="3">${p.specialRequirements?.notes || ''}</textarea>
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职销售（可选）</h4>
                <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" name="partTimeSales.isPartTime" id="editPartTimeSalesEnabled" ${p.partTimeSales?.isPartTime ? 'checked' : ''} onchange="toggleEditPartTimeSalesFields()">
                    启用兼职销售
                </label>
                <div id="editPartTimeSalesFields" style="display: ${p.partTimeSales?.isPartTime ? 'block' : 'none'}; padding-left: 20px; border-left: 2px solid #667eea;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>公司应收金额（元）</label>
                        <input type="number" name="partTimeSales.companyReceivable" id="editCompanyReceivable" step="0.01" min="0" value="${p.partTimeSales?.companyReceivable || 0}" onchange="calculateEditPartTimeSalesCommission()" style="width: 100%;">
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>税率（%）</label>
                        <input type="number" name="partTimeSales.taxRate" id="editTaxRate" step="0.01" min="0" max="100" value="${(p.partTimeSales?.taxRate || 0) * 100}" onchange="calculateEditPartTimeSalesCommission()" style="width: 100%;">
                        <small style="color: #666; font-size: 12px;">例如：10 表示 10%</small>
                    </div>
                    <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <label style="font-weight: 600; color: #0369a1;">返还佣金（自动计算）</label>
                        <div id="editPartTimeSalesCommissionDisplay" style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                            ¥${(p.partTimeSales?.partTimeSalesCommission || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <small style="color: #666; font-size: 12px; display: block; margin-top: 5px;">公式：成交额 - 公司应收 - 税费</small>
                    </div>
                </div>
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职排版（可选）</h4>
                <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" name="partTimeLayout.isPartTime" id="editPartTimeLayoutEnabled" ${p.partTimeLayout?.isPartTime ? 'checked' : ''} onchange="toggleEditPartTimeLayoutFields()">
                    启用兼职排版
                </label>
                <div id="editPartTimeLayoutFields" style="display: ${p.partTimeLayout?.isPartTime ? 'block' : 'none'}; padding-left: 20px; border-left: 2px solid #667eea;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>选择排版员</label>
                        <select name="partTimeLayout.layoutAssignedTo" id="editLayoutAssignedTo" style="width: 100%;">
                            <option value="">请选择排版员</option>
                            ${allUsers.filter(u => u.isActive).map(u => 
                                `<option value="${u._id}" ${p.partTimeLayout?.layoutAssignedTo?._id === u._id || p.partTimeLayout?.layoutAssignedTo === u._id ? 'selected' : ''}>${u.name} (${u.username})</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>排版费用（元）</label>
                        <input type="number" name="partTimeLayout.layoutCost" id="editLayoutCost" step="0.01" min="0" value="${p.partTimeLayout?.layoutCost || 0}" onchange="validateEditLayoutCost()" style="width: 100%;">
                        <small style="color: #666; font-size: 12px;">排版费用不能超过项目总金额的5%</small>
                    </div>
                    <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <label style="font-weight: 600; color: #0369a1;">费用占比（自动计算）</label>
                        <div id="editLayoutCostPercentageDisplay" style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                            ${(p.partTimeLayout?.layoutCostPercentage || 0).toFixed(2)}%
                        </div>
                        <div id="editLayoutCostValidation" style="margin-top: 5px;"></div>
                    </div>
                </div>
            </div>
            
            <div class="action-buttons">
                <button type="submit">保存</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal('编辑项目', content);
    
    // 初始化计算
    setTimeout(() => {
        calculateEditPartTimeSalesCommission();
        validateEditLayoutCost();
    }, 100);
    
    // 初始化已有的目标语种
    const container = document.getElementById('editTargetLanguagesContainer');
    if (container) {
        container.innerHTML = '';
        const targetLanguagesArray = Array.isArray(p.targetLanguages) ? p.targetLanguages : (p.targetLanguages ? [p.targetLanguages] : []);
        if (targetLanguagesArray.length > 0) {
            targetLanguagesArray.forEach(lang => {
                addEditTargetLanguageRow(lang);
            });
        } else {
            // 如果没有目标语种，至少添加一个空行
            addEditTargetLanguageRow();
        }
    }
}

async function updateProject(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // 收集目标语言
    const targetLanguageRows = document.querySelectorAll('#editTargetLanguagesContainer .target-language-select');
    const targetLanguages = Array.from(targetLanguageRows)
        .map(select => select.value)
        .filter(value => value && value.trim() !== '');
    
    if (targetLanguages.length === 0) {
        alert('请至少添加并选择一个目标语种');
        return;
    }
    
    // 收集兼职销售信息
    const editPartTimeSalesEnabled = formData.get('partTimeSales.isPartTime') === 'on';
    const editPartTimeSales = editPartTimeSalesEnabled ? {
        isPartTime: true,
        companyReceivable: parseFloat(formData.get('partTimeSales.companyReceivable') || 0),
        taxRate: parseFloat(formData.get('partTimeSales.taxRate') || 0) / 100 // 转换为小数
    } : { isPartTime: false, companyReceivable: 0, taxRate: 0 };
    
    // 收集兼职排版信息
    const editPartTimeLayoutEnabled = formData.get('partTimeLayout.isPartTime') === 'on';
    const editLayoutCost = parseFloat(formData.get('partTimeLayout.layoutCost') || 0);
    const editLayoutAssignedTo = formData.get('partTimeLayout.layoutAssignedTo');
    
    // 校验排版费用
    if (editPartTimeLayoutEnabled && editLayoutCost > 0) {
        const projectAmount = parseFloat(formData.get('projectAmount'));
        const percentage = (editLayoutCost / projectAmount) * 100;
        if (percentage > 5) {
            alert(`排版费用(${editLayoutCost})不能超过项目总金额(${projectAmount})的5%，当前占比为${percentage.toFixed(2)}%`);
            return;
        }
        if (!editLayoutAssignedTo) {
            alert('请选择排版员');
            return;
        }
    }
    
    const editPartTimeLayout = editPartTimeLayoutEnabled ? {
        isPartTime: true,
        layoutCost: editLayoutCost,
        layoutAssignedTo: editLayoutAssignedTo || undefined
    } : { isPartTime: false, layoutCost: 0, layoutAssignedTo: null };
    
    const payload = {
        projectName: formData.get('projectName'),
        businessType: formData.get('businessType'),
        projectType: formData.get('projectType'),
        sourceLanguage: formData.get('sourceLanguage'),
        targetLanguages: targetLanguages,
        wordCount: formData.get('wordCount') ? parseFloat(formData.get('wordCount')) : undefined,
        unitPrice: formData.get('unitPrice') ? parseFloat(formData.get('unitPrice')) : undefined,
        projectAmount: formData.get('projectAmount') ? parseFloat(formData.get('projectAmount')) : undefined,
        deadline: formData.get('deadline'),
        isTaxIncluded: formData.get('isTaxIncluded') === 'on',
        needInvoice: formData.get('needInvoice') === 'on',
        specialRequirements: {
            notes: formData.get('specialRequirements.notes') || undefined
        },
        partTimeSales: editPartTimeSales,
        partTimeLayout: editPartTimeLayout
    };

    try {
        const res = await fetch(`${API_BASE}/projects/${projectId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadProjects();
            viewProject(projectId);
            showToast('项目已更新', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
    }
}

async function deleteProject(projectId) {
    if (!confirm('确定要删除/取消此项目吗？已完成项目不可删除。')) return;
    try {
        const res = await fetch(`${API_BASE}/projects/${projectId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadProjects();
            showToast('项目已取消', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

async function showPaymentModal(projectId) {
    try {
        // 读取最新项目数据以填充默认值
        const response = await fetch(`${API_BASE}/projects/${projectId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!data.success) {
            alert(data.message || '加载项目失败');
            return;
        }

        const payment = data.data.payment || {};
        const content = `
            <form id="paymentForm" onsubmit="updatePayment(event, '${projectId}')">
                <div class="form-group">
                    <label>合同约定回款日期</label>
                    <input type="date" name="expectedAt" value="${payment.expectedAt ? new Date(payment.expectedAt).toISOString().slice(0,10) : ''}">
                </div>
                <div class="form-group">
                    <label>已回款金额</label>
                    <input type="number" name="receivedAmount" step="0.01" min="0" value="${payment.receivedAmount || 0}">
                </div>
                <div class="form-group">
                    <label>回款日期</label>
                    <input type="date" name="receivedAt" value="${payment.receivedAt ? new Date(payment.receivedAt).toISOString().slice(0,10) : ''}">
                </div>
                <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="isFullyPaid" name="isFullyPaid" ${payment.isFullyPaid ? 'checked' : ''}>
                    <label for="isFullyPaid" style="margin: 0;">回款完成</label>
                </div>
                <div class="action-buttons">
                    <button type="submit">保存</button>
                    <button type="button" onclick="closeModal()">取消</button>
                </div>
            </form>
        `;
        showModal('更新回款', content);
    } catch (error) {
        alert('加载回款信息失败: ' + error.message);
    }
}

async function updatePayment(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
        expectedAt: formData.get('expectedAt') || undefined,
        receivedAmount: formData.get('receivedAmount') ? parseFloat(formData.get('receivedAmount')) : 0,
        receivedAt: formData.get('receivedAt') || undefined,
        isFullyPaid: formData.get('isFullyPaid') === 'on'
    };

    try {
        const response = await fetch(`${API_BASE}/projects/${projectId}/payment`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.success) {
            closeModal();
            loadProjects();
            showAlert('projectsList', '回款信息已更新', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('更新失败: ' + error.message);
    }
}

// ==================== KPI管理 ====================
async function loadKPI() {
    const month = document.getElementById('kpiMonth').value || 
        new Date().toISOString().slice(0, 7);
    const userId = document.getElementById('kpiUserSelect').value || currentUser._id;

    try {
        const response = await fetch(`${API_BASE}/kpi/user/${userId}?month=${month}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const user = allUsers.find(u => u._id === userId) || currentUser;
            
            // 使用后端返回的canViewAmount字段，如果后端没有返回，则根据角色判断
            const canViewAmount = data.data.canViewAmount !== false;
            const userRoles = currentUser.roles || [];
            const isSensitiveRole = userRoles.includes('pm') || 
                                   userRoles.includes('translator') || 
                                   userRoles.includes('reviewer');
            // 如果后端明确返回false，或者用户是敏感角色且不是管理员/财务，则隐藏金额
            const shouldHideAmount = !canViewAmount || (isSensitiveRole && !userRoles.includes('admin') && !userRoles.includes('finance'));
            
            const html = `
                <h3>${user.name} 的KPI - ${month}</h3>
                <p><strong>总计: ¥${data.data.total.toLocaleString()}</strong></p>
                ${data.data.records.length === 0 ? '<p>该月暂无KPI记录</p>' : `
                    <table>
                        <thead>
                            <tr>
                                <th>项目名称</th>
                                <th>客户名称</th>
                                ${shouldHideAmount ? '' : '<th>项目金额</th>'}
                                <th>角色</th>
                                <th>KPI数值</th>
                                <th>计算公式</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.data.records.map(r => `
                                <tr>
                                    <td>${r.projectId?.projectName || 'N/A'}</td>
                                    <td>${r.projectId?.clientName || 'N/A'}</td>
                                    ${shouldHideAmount ? '' : `<td>${r.projectId?.projectAmount ? '¥' + r.projectId.projectAmount.toLocaleString() : '-'}</td>`}
                                    <td>${getRoleText(r.role)}</td>
                                    <td>¥${r.kpiValue.toLocaleString()}</td>
                                    <td style="font-size: 12px;">${r.calculationDetails?.formula || ''}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}
            `;
            document.getElementById('kpiResults').innerHTML = html;
        } else {
            // 如果查询失败，显示错误信息
            let errorMsg = data.message || '加载KPI失败';
            if (errorMsg.includes('无权')) {
                errorMsg = '您只能查看自己的KPI';
            }
            document.getElementById('kpiResults').innerHTML = `<div class="alert alert-error">${errorMsg}</div>`;
        }
    } catch (error) {
        console.error('加载KPI失败:', error);
        showAlert('kpiResults', '加载KPI失败: ' + error.message, 'error');
    }
}

async function generateMonthlyKPI() {
    const month = document.getElementById('kpiMonth').value || 
        new Date().toISOString().slice(0, 7);
    
    if (!month) {
        alert('请先选择月份');
        return;
    }

    if (!confirm(`确定要生成 ${month} 的月度KPI吗？`)) return;

    try {
        const response = await fetch(`${API_BASE}/kpi/generate-monthly`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ month })
        });
        const result = await response.json();
        
        if (result.success) {
            alert(`月度KPI生成成功！共生成 ${result.data.count} 条记录`);
            loadKPI();
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('生成失败: ' + error.message);
    }
}

async function exportKPI() {
    const month = document.getElementById('kpiMonth').value || 
        new Date().toISOString().slice(0, 7);
    const userId = document.getElementById('kpiUserSelect').value;

    if (userId) {
        // 导出单个用户
        window.open(`${API_BASE}/kpi/export/user/${userId}?month=${month}`, '_blank');
    } else {
        // 导出月度汇总
        window.open(`${API_BASE}/kpi/export/month/${month}`, '_blank');
    }
}

// ==================== 配置管理 ====================
async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/config`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const config = data.data;
            const html = `
                <form id="configUpdateForm">
                    <div class="form-group">
                        <label>翻译（MTPE）系数</label>
                        <input type="number" step="0.001" value="${config.translator_ratio_mtpe}" 
                               name="translator_ratio_mtpe" required>
                    </div>
                    <div class="form-group">
                        <label>翻译（深度编辑）系数</label>
                        <input type="number" step="0.001" value="${config.translator_ratio_deepedit}" 
                               name="translator_ratio_deepedit" required>
                    </div>
                    <div class="form-group">
                        <label>审校系数</label>
                        <input type="number" step="0.001" value="${config.reviewer_ratio}" 
                               name="reviewer_ratio" required>
                    </div>
                    <div class="form-group">
                        <label>PM系数</label>
                        <input type="number" step="0.001" value="${config.pm_ratio}" 
                               name="pm_ratio" required>
                    </div>
                    <div class="form-group">
                        <label>销售金额奖励系数</label>
                        <input type="number" step="0.001" value="${config.sales_bonus_ratio}" 
                               name="sales_bonus_ratio" required>
                    </div>
                    <div class="form-group">
                        <label>销售回款系数</label>
                        <input type="number" step="0.001" value="${config.sales_commission_ratio}" 
                               name="sales_commission_ratio" required>
                    </div>
                    <div class="form-group">
                        <label>综合岗系数</label>
                        <input type="number" step="0.001" value="${config.admin_ratio}" 
                               name="admin_ratio" required>
                    </div>
                    <div class="form-group">
                        <label>完成系数（基础值）</label>
                        <input type="number" step="0.001" value="${config.completion_factor}" 
                               name="completion_factor" required>
                    </div>
                    <div class="form-group">
                        <label>变更原因</label>
                        <textarea name="reason" rows="3" placeholder="请说明变更原因"></textarea>
                    </div>
                    <div class="action-buttons">
                        <button type="submit">更新配置</button>
                    </div>
                </form>
            `;
            document.getElementById('configForm').innerHTML = html;
            
            document.getElementById('configUpdateForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);
                Object.keys(data).forEach(k => {
                    if (k !== 'reason' && data[k]) data[k] = parseFloat(data[k]);
                });

                try {
                    const response = await fetch(`${API_BASE}/config/update`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });
                    const result = await response.json();
                    if (result.success) {
                        showAlert('configAlert', '配置更新成功', 'success');
                        loadConfig();
                    } else {
                        showAlert('configAlert', result.message, 'error');
                    }
                } catch (error) {
                    showAlert('configAlert', '更新失败: ' + error.message, 'error');
                }
            });
        }
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

async function loadConfigHistory() {
    try {
        const response = await fetch(`${API_BASE}/config/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const html = `
                <h4>配置变更历史</h4>
                <table>
                    <thead>
                        <tr>
                            <th>变更时间</th>
                            <th>变更人</th>
                            <th>变更原因</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.data.map((h, idx) => `
                            <tr>
                                <td>${new Date(h.changedAt).toLocaleString()}</td>
                                <td>${h.changedByUser?.name || '未知'}</td>
                                <td>${h.reason || '无'}</td>
                                <td><button class="btn-small" onclick="viewConfigChange(${idx})">查看详情</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            document.getElementById('configHistory').innerHTML = html;
        }
    } catch (error) {
        console.error('加载历史失败:', error);
    }
}

// ==================== 工具函数 ====================
function showAlert(elementId, message, type) {
    const element = document.getElementById(elementId);
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    element.insertBefore(alertDiv, element.firstChild);
    setTimeout(() => alertDiv.remove(), 3000);
}

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    // 强制回流以启用过渡
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

function getStatusText(status) {
    const statusMap = {
        'pending': '待开始',
        'in_progress': '进行中',
        'completed': '已完成',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

function getStatusBadgeClass(status) {
    const classMap = {
        'pending': 'badge-warning',
        'in_progress': 'badge-info',
        'completed': 'badge-success',
        'cancelled': 'badge-danger'
    };
    return classMap[status] || 'badge-info';
}

function getRoleText(role) {
    const roleMap = {
        'admin': '管理员',
        'finance': '财务',
        'sales': '销售',
        'pm': '项目经理',
        'translator': '翻译',
        'reviewer': '审校',
        'admin_staff': '综合岗',
        'part_time_sales': '兼职销售',
        'layout': '兼职排版'
    };
    return roleMap[role] || role;
}

function getBusinessTypeText(type) {
    const typeMap = {
        'translation': '笔译',
        'interpretation': '口译',
        'transcription': '转录',
        'localization': '本地化',
        'other': '其他'
    };
    return typeMap[type] || type;
}

function getProjectTypeText(type) {
    const typeMap = {
        'mtpe': 'MTPE',
        'deepedit': '深度编辑',
        'review': '审校项目',
        'mixed': '混合类型'
    };
    return typeMap[type] || type;
}

// ==================== Dashboard ====================
async function loadDashboard() {
    try {
        // 销毁之前的图表
        destroyCharts();
        
        const month = document.getElementById('dashboardMonth')?.value || new Date().toISOString().slice(0, 7);
        const status = document.getElementById('dashboardStatus')?.value || '';
        const businessType = document.getElementById('dashboardBusinessType')?.value || '';
        const role = document.getElementById('dashboardRole')?.value || '';

        const params = new URLSearchParams();
        if (month) params.append('month', month);
        if (status) params.append('status', status);
        if (businessType) params.append('businessType', businessType);
        if (role) params.append('role', role);

        const response = await fetch(`${API_BASE}/kpi/dashboard?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (!result.success) {
            showAlert('dashboardCards', result.message || '加载失败', 'error');
            return;
        }

        const data = result.data;
        renderDashboardCards(data);
        renderDashboardCharts(data);
    } catch (error) {
        showAlert('dashboardCards', '加载业务看板失败: ' + error.message, 'error');
    }
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
    
    // 判断是否是销售或兼职销售
    const isSales = currentUser?.roles?.includes('sales') || currentUser?.roles?.includes('part_time_sales');
    const isAdmin = currentUser?.roles?.includes('admin');
    const isFinance = currentUser?.roles?.includes('finance');
    
    // 销售和兼职销售显示成交额，其他角色显示KPI
    const showSalesAmount = isSales && !isAdmin && !isFinance;
    
    const cards = `
        <div class="card-grid">
            <div class="card stat-card stat-primary">
                <div class="stat-icon">📊</div>
                <div class="stat-content">
                    <div class="card-title">当月项目数</div>
                    <div class="card-value">${data.projectCount || 0}</div>
                    <div class="card-desc">月份：${data.month}</div>
                </div>
            </div>
            ${showSalesAmount && data.totalProjectAmount !== undefined ? `
            <div class="card stat-card stat-success">
                <div class="stat-icon">💰</div>
                <div class="stat-content">
                    <div class="card-title">成交额合计</div>
                    <div class="card-value">¥${(data.totalProjectAmount || 0).toLocaleString()}</div>
                    <div class="card-desc">根据筛选条件汇总</div>
                </div>
            </div>
            ` : ''}
            ${!showSalesAmount ? `
            ${data.totalProjectAmount !== undefined ? `
            <div class="card stat-card stat-success">
                <div class="stat-icon">💰</div>
                <div class="stat-content">
                    <div class="card-title">项目金额合计</div>
                    <div class="card-value">¥${(data.totalProjectAmount || 0).toLocaleString()}</div>
                    <div class="card-desc">可见范围内金额</div>
                </div>
            </div>
            ` : ''}
            <div class="card stat-card stat-info">
                <div class="stat-icon">📈</div>
                <div class="stat-content">
                    <div class="card-title">KPI合计</div>
                    <div class="card-value">¥${(data.kpiTotal || 0).toLocaleString()}</div>
                    <div class="card-desc">根据角色权限汇总</div>
                </div>
            </div>
            ` : ''}
            <div class="card stat-card stat-primary">
                <div class="stat-icon">✅</div>
                <div class="stat-content">
                    <div class="card-title">完成率</div>
                    <div class="card-value">${completionRate}%</div>
                    <div class="subtext">完成/总项目：${completed}/${total}</div>
                </div>
            </div>
            <div class="card stat-card stat-warning">
                <div class="stat-icon">🔄</div>
                <div class="stat-content">
                    <div class="card-title">进行中</div>
                    <div class="card-value">${inProgress}</div>
                    <div class="subtext">当前执行的项目</div>
                </div>
            </div>
            <div class="card stat-card stat-success">
                <div class="stat-icon">✓</div>
                <div class="stat-content">
                    <div class="card-title">已完成</div>
                    <div class="card-value">${completed}</div>
                    <div class="subtext">本月完成项目</div>
                </div>
            </div>
            <div class="card stat-card stat-info">
                <div class="stat-icon">⏳</div>
                <div class="stat-content">
                    <div class="card-title">待开始</div>
                    <div class="card-value">${pending}</div>
                    <div class="subtext">待排期项目</div>
                </div>
            </div>
            <div class="card stat-card stat-danger">
                <div class="stat-icon">⚠️</div>
                <div class="stat-content">
                    <div class="card-title">回款预警</div>
                    <div class="card-value">${(data.paymentWarnings?.length || 0)}</div>
                    <div class="card-desc">逾期未回款项目</div>
                </div>
            </div>
            <div class="card stat-card stat-danger">
                <div class="stat-icon">🚨</div>
                <div class="stat-content">
                    <div class="card-title">交付逾期</div>
                    <div class="card-value">${(data.deliveryWarnings?.length || 0)}</div>
                    <div class="card-desc">截止已过未完成</div>
                </div>
            </div>
            ${paymentRate !== null ? `
            <div class="card stat-card stat-success">
                <div class="stat-icon">💵</div>
                <div class="stat-content">
                    <div class="card-title">回款完成率</div>
                    <div class="card-value">${paymentRate}%</div>
                    <div class="subtext">已回款/项目金额</div>
                </div>
            </div>
            ` : ''}
            <div class="card stat-card stat-info">
                <div class="stat-icon">📅</div>
                <div class="stat-content">
                    <div class="card-title">近7天完成</div>
                    <div class="card-value">${recentCompleted}</div>
                    <div class="subtext">近7天完成项目数</div>
                </div>
            </div>
            <div class="card stat-card stat-danger">
                <div class="stat-icon">⚠️</div>
                <div class="stat-content">
                    <div class="card-title">近7天回款预警</div>
                    <div class="card-value">${recentPaymentOverdue}</div>
                    <div class="card-desc">近7天逾期回款项目</div>
                </div>
            </div>
            <div class="card stat-card stat-danger">
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

// ==================== 财务管理 ====================
async function loadReceivables() {
    const month = document.getElementById('financeMonth')?.value || '';
    const status = document.getElementById('financeStatus')?.value || '';
    const customerId = document.getElementById('financeCustomer')?.value || '';
    const salesId = document.getElementById('financeSales')?.value || '';
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    // month 可用于到期过滤
    if (month) {
        const [y, m] = month.split('-');
        const end = new Date(y, m, 0).toISOString();
        params.append('dueBefore', end);
    }
    if (customerId) params.append('customerId', customerId);
    if (salesId) params.append('salesId', salesId);
    const res = await fetch(`${API_BASE}/finance/receivables?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) {
        showAlert('receivablesList', data.message || '加载失败', 'error');
        return;
    }
    receivablesCache = data.data || [];
    receivablePage = 1;
    renderReceivables();
}

function exportReceivables() {
    const rows = receivablesCache.map(r => [
        r.projectNumber || '-',
        r.projectName,
        r.customerName || '',
        r.salesName || '',
        r.projectAmount || 0,
        r.receivedAmount || 0,
        r.outstanding || 0,
        r.expectedAt ? new Date(r.expectedAt).toLocaleDateString() : '',
        r.isFullyPaid ? '已回款' : (r.overdue ? '逾期' : '未回款')
    ]);
    const header = ['项目编号','项目名称','客户','销售','项目金额','已回款','未回款','约定回款日','状态'];
    const csv = [header, ...rows].map(r => r.map(v => `"${(v ?? '').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'receivables.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function renderReceivables() {
    const pageSizeSel = document.getElementById('financePageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value || '10', 10) : 10;
    const totalPages = Math.max(1, Math.ceil(receivablesCache.length / pageSize));
    if (receivablePage > totalPages) receivablePage = totalPages;
    const start = (receivablePage - 1) * pageSize;
    const pageData = receivablesCache.slice(start, start + pageSize);
    const rows = pageData.map(r => `
        <tr class="${r.overdue ? 'row-overdue' : ''}">
            <td>${r.projectNumber || '-'}</td>
            <td>${r.projectName}</td>
            <td>${r.customerName || ''}</td>
            <td>${r.salesName || ''}</td>
            <td>¥${(r.projectAmount || 0).toLocaleString()}</td>
            <td>¥${(r.receivedAmount || 0).toLocaleString()}</td>
            <td>¥${(r.outstanding || 0).toLocaleString()}</td>
            <td>${r.expectedAt ? new Date(r.expectedAt).toLocaleDateString() : '-'}</td>
            <td>${r.isFullyPaid ? '<span class="badge badge-success">已回款</span>' : (r.overdue ? '<span class="badge badge-danger">逾期</span>' : '<span class="badge badge-warning">未回款</span>')}</td>
        </tr>
    `).join('');
    document.getElementById('receivablesList').innerHTML = `
        <table class="table-sticky">
            <thead>
                <tr>
                    <th>项目编号</th>
                    <th>项目名称</th>
                    <th>客户</th>
                    <th>销售</th>
                    <th>项目金额</th>
                    <th>已回款</th>
                    <th>未回款</th>
                    <th>约定回款日</th>
                    <th>状态</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="7" style="text-align:center;">暂无数据</td></tr>'}
            </tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${receivablePage<=1?'disabled':''} onclick="receivablePage=Math.max(1, receivablePage-1);renderReceivables();">上一页</button>
            <span style="align-self:center;">${receivablePage} / ${totalPages}</span>
            <button class="btn-small" ${receivablePage>=totalPages?'disabled':''} onclick="receivablePage=Math.min(${totalPages}, receivablePage+1);renderReceivables();">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${receivablePage}" style="width:70px;padding:6px;" onchange="jumpReceivablePage(this.value, ${totalPages})">
        </div>
    `;
}

function jumpReceivablePage(val, total) {
    const page = Math.min(Math.max(parseInt(val || 1, 10), 1), total);
    receivablePage = page;
    renderReceivables();
}

async function loadInvoices() {
    const status = document.getElementById('invoiceStatus')?.value || '';
    const projectId = document.getElementById('invoiceProjectId')?.value || '';
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (projectId) params.append('projectId', projectId);
    const res = await fetch(`${API_BASE}/finance/invoice?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) {
            showAlert('invoiceList', data.message || '加载失败', 'error');
        return;
    }
    const rows = data.data.map(i => `
        <tr>
            <td>${i.invoiceNumber}</td>
            <td>${i.projectId || ''}</td>
            <td>¥${(i.amount || 0).toLocaleString()}</td>
            <td>${i.issueDate ? new Date(i.issueDate).toLocaleDateString() : '-'}</td>
            <td>${i.status}</td>
            <td>${i.type || '-'}</td>
            <td>${i.note || ''}</td>
        </tr>
    `).join('');
    document.getElementById('invoiceList').innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>发票号</th>
                    <th>项目ID</th>
                    <th>金额</th>
                    <th>开票日期</th>
                    <th>状态</th>
                    <th>类型</th>
                    <th>备注</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="7" style="text-align:center;">暂无发票</td></tr>'}
            </tbody>
        </table>
    `;
}

async function addInvoice() {
    const projectId = document.getElementById('invoiceProjectId')?.value;
    const invoiceNumber = document.getElementById('invoiceNumber')?.value;
    const amount = document.getElementById('invoiceAmount')?.value;
    const issueDate = document.getElementById('invoiceDate')?.value;
    if (!projectId || !invoiceNumber || !amount || !issueDate) {
        alert('请填写项目ID、发票号、金额、开票日期');
        return;
    }
    const payload = {
        invoiceNumber,
        amount: parseFloat(amount),
        issueDate,
        status: document.getElementById('invoiceStatus')?.value || 'issued'
    };
    try {
        const res = await fetch(`${API_BASE}/finance/invoice/${projectId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '新增失败', 'error');
            return;
        }
        loadInvoices();
        showToast('发票已新增', 'success');
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

async function addPaymentRecord() {
    const projectId = document.getElementById('paymentProjectId')?.value;
    const amount = document.getElementById('paymentAmount')?.value;
    const receivedAt = document.getElementById('paymentDate')?.value;
    if (!projectId || !amount || !receivedAt) {
        alert('请填写项目ID、金额、回款日期');
        return;
    }
    const payload = {
        amount: parseFloat(amount),
        receivedAt
    };
    try {
        const res = await fetch(`${API_BASE}/finance/payment/${projectId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '新增失败', 'error');
            return;
        }
        showToast('回款已记录', 'success');
        // 重新加载应收与回款列表
        loadReceivables();
        loadPaymentRecords(projectId);
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

async function loadPaymentRecords(projectId) {
    if (!projectId) {
        document.getElementById('paymentRecords').innerHTML = '<div class="card-desc">请在上方填写项目ID后点击新增或刷新应收以查看</div>';
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/finance/payment/${projectId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) {
            showAlert('paymentRecords', data.message || '加载失败', 'error');
            return;
        }
        const rows = data.data.map(r => `
            <tr>
                <td>${new Date(r.receivedAt).toLocaleDateString()}</td>
                <td>¥${(r.amount || 0).toLocaleString()}</td>
                <td>${r.method || '-'}</td>
                <td>${r.reference || ''}</td>
                <td>${r.note || ''}</td>
                <td>${r.recordedBy || ''}</td>
                <td><button class="btn-small btn-danger" onclick="removePaymentRecord('${r._id}', '${projectId}')">删除</button></td>
            </tr>
        `).join('');
        document.getElementById('paymentRecords').innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>回款日期</th>
                        <th>金额</th>
                        <th>方式</th>
                        <th>凭证</th>
                        <th>备注</th>
                        <th>记录人</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="7" style="text-align:center;">暂无回款记录</td></tr>'}
                </tbody>
            </table>
        `;
    } catch (error) {
        showAlert('paymentRecords', '加载失败: ' + error.message, 'error');
    }
}

async function removePaymentRecord(recordId, projectId) {
    if (!confirm('确定删除该回款记录？（不会自动回滚项目回款总额）')) return;
    try {
        const res = await fetch(`${API_BASE}/finance/payment/${recordId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.message || '删除失败');
            return;
        }
        showToast('已删除回款记录', 'success');
        loadPaymentRecords(projectId);
        loadReceivables();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// 项目内回款
async function loadProjectPayments(projectId) {
    const container = document.getElementById('projectPaymentList');
    if (!container) return;
    try {
        const res = await fetch(`${API_BASE}/finance/payment/${projectId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div class="alert alert-error">${data.message || '加载失败'}</div>`;
            return;
        }
        const rows = data.data.map(r => `
            <tr>
                <td>${new Date(r.receivedAt).toLocaleDateString()}</td>
                <td>¥${(r.amount || 0).toLocaleString()}</td>
                <td>${r.method || '-'}</td>
                <td>${r.reference || ''}</td>
                <td>${r.note || ''}</td>
            </tr>
        `).join('');
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>回款日期</th>
                        <th>金额</th>
                        <th>方式</th>
                        <th>凭证</th>
                        <th>备注</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="5" style="text-align:center;">暂无回款</td></tr>'}
                </tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">加载失败: ${error.message}</div>`;
    }
}

async function addProjectPayment(projectId) {
    const amount = document.getElementById('projectPaymentAmount')?.value;
    const receivedAt = document.getElementById('projectPaymentDate')?.value;
    const reference = document.getElementById('projectPaymentRef')?.value;
    if (!amount || !receivedAt) {
        alert('请填写金额和回款日期');
        return;
    }
    const payload = {
        amount: parseFloat(amount),
        receivedAt,
        reference
    };
    try {
        const res = await fetch(`${API_BASE}/finance/payment/${projectId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.message || '新增失败');
            return;
        }
        loadProjectPayments(projectId);
        loadReceivables();
        showAlert('projectPaymentList', '回款已记录', 'success');
    } catch (error) {
        alert('新增失败: ' + error.message);
    }
}

// 项目内发票
async function loadProjectInvoices(projectId) {
    const container = document.getElementById('projectInvoiceList');
    if (!container) return;
    try {
        const res = await fetch(`${API_BASE}/finance/invoice?projectId=${projectId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div class="alert alert-error">${data.message || '加载失败'}</div>`;
            return;
        }
        const rows = data.data.map(i => `
            <tr>
                <td>${i.invoiceNumber}</td>
                <td>¥${(i.amount || 0).toLocaleString()}</td>
                <td>${i.issueDate ? new Date(i.issueDate).toLocaleDateString() : '-'}</td>
                <td>${i.status}</td>
                <td>${i.type || '-'}</td>
                <td>${i.note || ''}</td>
            </tr>
        `).join('');
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>发票号</th>
                        <th>金额</th>
                        <th>开票日期</th>
                        <th>状态</th>
                        <th>类型</th>
                        <th>备注</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="6" style="text-align:center;">暂无发票</td></tr>'}
                </tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">加载失败: ${error.message}</div>`;
    }
}

async function addProjectInvoice(projectId) {
    const invoiceNumber = document.getElementById('projectInvoiceNumber')?.value;
    const amount = document.getElementById('projectInvoiceAmount')?.value;
    const issueDate = document.getElementById('projectInvoiceDate')?.value;
    const type = document.getElementById('projectInvoiceType')?.value || 'vat';
    if (!invoiceNumber || !amount || !issueDate) {
        alert('请填写发票号、金额、日期');
        return;
    }
    const payload = {
        invoiceNumber,
        amount: parseFloat(amount),
        issueDate,
        type
    };
    try {
        const res = await fetch(`${API_BASE}/finance/invoice/${projectId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '新增失败', 'error');
            return;
        }
        loadProjectInvoices(projectId);
        showToast('发票已新增', 'success');
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

async function loadPendingKpi() {
    const month = document.getElementById('kpiPendingMonth')?.value || '';
    const params = new URLSearchParams();
    if (month) params.append('month', month);
    const res = await fetch(`${API_BASE}/finance/kpi/pending?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) {
        showAlert('pendingKpiList', data.message || '加载失败', 'error');
        return;
    }
    const rows = data.data.map(r => `
        <tr>
            <td>${r.userId?.name || 'N/A'}</td>
            <td>${r.projectId?.projectName || 'N/A'}</td>
            <td>${r.role}</td>
            <td>¥${(r.kpiValue || 0).toLocaleString()}</td>
            <td>${r.month}</td>
        </tr>
    `).join('');
    document.getElementById('pendingKpiList').innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>用户</th>
                    <th>项目</th>
                    <th>角色</th>
                    <th>KPI</th>
                    <th>月份</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="5" style="text-align:center;">暂无待审核</td></tr>'}
            </tbody>
        </table>
    `;
}

async function loadFinanceSummary() {
    const month = document.getElementById('reportMonth')?.value || '';
    const params = new URLSearchParams();
    if (month) params.append('month', month);
    const res = await fetch(`${API_BASE}/finance/reports/summary?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) {
        showAlert('financeSummary', data.message || '加载失败', 'error');
        return;
    }
    const custRows = Object.entries(data.data.byCustomer || {}).map(([k, v]) =>
        `<tr><td>${k}</td><td>¥${v.toLocaleString()}</td></tr>`
    ).join('');
    const salesRows = Object.entries(data.data.bySales || {}).map(([k, v]) =>
        `<tr><td>${k}</td><td>¥${v.toLocaleString()}</td></tr>`
    ).join('');
    document.getElementById('financeSummary').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
            <div class="card">
                <div class="card-title">按客户汇总</div>
                <table>
                    <thead><tr><th>客户</th><th>金额</th></tr></thead>
                    <tbody>${custRows || '<tr><td colspan="2" style="text-align:center;">暂无</td></tr>'}</tbody>
                </table>
            </div>
            <div class="card">
                <div class="card-title">按销售汇总</div>
                <table>
                    <thead><tr><th>销售</th><th>金额</th></tr></thead>
                    <tbody>${salesRows || '<tr><td colspan="2" style="text-align:center;">暂无</td></tr>'}</tbody>
                </table>
            </div>
        </div>
    `;
}
// 存储图表实例
let chartInstances = [];

function destroyCharts() {
    chartInstances.forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances = [];
}

function renderDashboardCharts(data) {
    // 销毁之前的图表
    destroyCharts();
    
    // 判断是否是销售或兼职销售
    const isSales = currentUser?.roles?.includes('sales') || currentUser?.roles?.includes('part_time_sales');
    const isAdmin = currentUser?.roles?.includes('admin');
    const isFinance = currentUser?.roles?.includes('finance');
    const showSalesAmount = isSales && !isAdmin && !isFinance;
    
    const charts = [];
    let chartIndex = 0;

    // KPI按角色（销售和兼职销售不显示）
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
                    const chart = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: kpiEntries.map(([k]) => getRoleText(k)),
                            datasets: [{
                                label: 'KPI金额',
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
                                        label: (context) => `¥${(context.parsed.y || 0).toLocaleString()}`
                                    }
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: (value) => '¥' + value.toLocaleString()
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
                            legend: {
                                position: 'bottom'
                            },
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
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    stepSize: 1
                                }
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

    // 交付逾期预警
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

    // KPI/成交额趋势 - 折线图
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
                const chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: trend.map(t => t.month),
                        datasets: [{
                            label: showSalesAmount ? '成交额' : 'KPI',
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
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: (context) => `¥${(context.parsed.y || 0).toLocaleString()}`
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: (value) => '¥' + value.toLocaleString()
                                },
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.05)'
                                }
                            },
                            x: {
                                grid: {
                                    display: false
                                }
                            }
                        }
                    }
                });
                chartInstances.push(chart);
            }
        }, 100);
    }

    const el = document.getElementById('dashboardCharts');
    if (el) {
        el.innerHTML = `<div class="chart-grid">${charts.join('')}</div>`;
        // 确保图表在DOM更新后渲染
        setTimeout(() => {
            chartIndex = 0;
        }, 200);
    }
}

// 实时KPI
async function loadRealtimeKPI(projectId) {
    const container = document.getElementById('realtimeKpiContent');
    if (container) container.innerHTML = '<div class="card-desc">加载中...</div>';
    try {
        const res = await fetch(`${API_BASE}/kpi/project/${projectId}/realtime`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) {
            if (container) container.innerHTML = `<div class="alert alert-error">${data.message || '获取失败'}</div>`;
            return;
        }
        const results = data.data.results || [];
        if (results.length === 0) {
            container.innerHTML = '<div class="card-desc">暂无成员或无法计算</div>';
            return;
        }
        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table>
                    <thead>
                        <tr>
                            <th>成员</th>
                            <th>角色</th>
                            <th>金额奖励</th>
                            <th>回款奖励</th>
                            <th>金额</th>
                            <th>公式</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map(r => `
                            <tr>
                                <td>${r.userName}</td>
                                <td>${getRoleText(r.role)}</td>
                                <td>${r.details?.salesBonus !== undefined ? '¥' + (r.details.salesBonus || 0).toLocaleString() : '-'}</td>
                                <td>${r.details?.salesCommission !== undefined ? '¥' + (r.details.salesCommission || 0).toLocaleString() : '-'}</td>
                                <td>¥${(r.kpiValue || 0).toLocaleString()}</td>
                                <td style="font-size:12px;">${r.formula || ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        if (container) container.innerHTML = `<div class="alert alert-error">获取失败: ${error.message}</div>`;
    }
}

async function startProject(projectId) {
    if (!confirm('确定要开始执行此项目吗？开始后项目状态将变为"进行中"。')) return;

    try {
        const response = await fetch(`${API_BASE}/projects/${projectId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadProjects();
            showAlert('projectsList', '项目已开始执行', 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('操作失败: ' + error.message);
    }
}
