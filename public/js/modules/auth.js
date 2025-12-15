import { apiFetch } from '../core/api.js';
import { state, setToken, setCurrentUser, setCurrentRole } from '../core/state.js';
import { ROLE_PRIORITY, PERMISSIONS, ROLE_NAMES } from '../core/config.js';
import { showToast, showAlert } from '../core/utils.js';
import { showSection, showModal, closeModal } from '../core/ui.js';
import { startNotificationPolling, stopNotificationPolling, initNotificationAudio } from './notification.js';

// 初始化认证
export async function initAuth() {
    if (state.token) {
        await checkAuth();
    } else {
        showLogin();
    }
}

export async function checkAuth() {
    try {
        const res = await apiFetch('/auth/me');
        const data = await res.json();
        if (data.success) {
            setCurrentUser(data.user);
            initCurrentRole();
            showMainApp();
        } else {
            // 清除无效token
            setToken(null);
            showLogin();
        }
    } catch (e) {
        // 清除无效token
        setToken(null);
        showLogin();
    }
}

function initCurrentRole() {
    if (!state.currentUser?.roles?.length) return;

    // 尝试恢复之前的角色，或者使用默认高优先级角色
    let role = localStorage.getItem('currentRole');
    if (!role || !state.currentUser.roles.includes(role)) {
        // 排序找到优先级最高的
        const sorted = state.currentUser.roles.sort((a, b) => (ROLE_PRIORITY[b] || 0) - (ROLE_PRIORITY[a] || 0));
        role = sorted[0];
    }
    setCurrentRole(role);
}

function updateCurrentRoleTag() {
    const tag = document.getElementById('currentRoleTag');
    if (tag) {
        tag.textContent = ROLE_NAMES[state.currentRole] || state.currentRole;
        tag.style.display = 'inline-flex';
    }
}

// 切换角色
export function switchRole(newRole) {
    if (!state.currentUser || !state.currentUser.roles?.includes(newRole)) {
        console.error('用户不拥有该角色:', newRole);
        return;
    }
    setCurrentRole(newRole);
    updateCurrentRoleTag();

    // 重新启动通知轮询（不同角色可能未读不同）
    startNotificationPolling();

    // 如果主界面可见，刷新核心数据
    const mainApp = document.getElementById('mainApp');
    if (mainApp && mainApp.style.display !== 'none') {
        window.loadDashboard?.();
        window.loadProjects?.();
        window.loadKPI?.();
        if (window.hasPermission?.('finance.view') || PERMISSIONS[newRole]?.['finance.view']) {
            window.loadReceivables?.();
            window.loadPaymentRecordsProjects?.();
            window.loadInvoiceProjects?.();
        }
    }

    // 保持下拉选中状态
    const select = document.getElementById('roleSwitcher');
    if (select && select.value !== newRole) {
        select.value = newRole;
    }
}

// 初始化角色切换器（头部下拉）
export function initRoleSwitcher() {
    const container = document.getElementById('roleSwitcherContainer');
    if (!container) return;

    // 如果用户只有一个角色，不显示切换器
    if (!state.currentUser || !state.currentUser.roles || state.currentUser.roles.length <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'inline-flex';
    const select = document.createElement('select');
    select.id = 'roleSwitcher';
    select.style.cssText = 'padding: 6px 10px; border: 1px solid #dfe3f0; border-radius: 8px; background: rgba(255,255,255,0.96); color: #333;';
    select.onchange = (e) => switchRole(e.target.value);

    state.currentUser.roles.forEach(role => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = ROLE_NAMES[role] || role;
        if (role === state.currentRole) option.selected = true;
        select.appendChild(option);
    });

    container.innerHTML = '';
    container.appendChild(select);
}

export function showLogin() {
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
}

export function showMainApp() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userName').textContent = state.currentUser.name;

    // 更新角色标签 & 切换器
    updateCurrentRoleTag();
    initRoleSwitcher();

    // 关键：首屏强制切到业务看板（避免首次登录不显示 dashboard，需点别的再回来才显示）
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            showSection('dashboard'); // 映射到 dashboard-section

            // 再触发数据加载 (通过事件或直接调用，这里简化为触发自定义事件)
            window.dispatchEvent(new CustomEvent('app:login-success'));
        });
    });

    startNotificationPolling();
    // 初始化通知音频（尝试在登录后立即初始化）
    initNotificationAudio();
}

export function logout() {
    setToken(null);
    setCurrentUser(null);
    stopNotificationPolling();
    window.location.href = '/';
}

// 密码验证提示
function passwordValidationMessage(pwd) {
    if (!pwd || pwd.length < 8) return '密码长度至少 8 位';
    if (pwd.length > 64) return '密码长度不能超过 64 位';
    if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/\d/.test(pwd) || !/[^A-Za-z0-9]/.test(pwd)) {
        return '密码需包含大写字母、小写字母、数字和特殊字符';
    }
    return '';
}

// 显示强制修改密码模态框
function showForcePasswordChangeModal(defaultOldPwd = '') {
    const content = `
        <div id="forcePwdAlert"></div>
        <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 12px; margin-bottom: 16px; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-weight: 600; color: #1e40af;">首次登录需修改密码</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e3a8a;">为了账户安全，请设置一个强密码。密码要求如下：</p>
            <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: #1e3a8a;">
                <li>长度要求：至少 8 位，最多 64 位</li>
                <li>必须包含：<strong>大写字母</strong>（A-Z）</li>
                <li>必须包含：<strong>小写字母</strong>（a-z）</li>
                <li>必须包含：<strong>数字</strong>（0-9）</li>
                <li>必须包含：<strong>特殊字符</strong>（如 !@#$%^&* 等）</li>
            </ul>
            <p style="margin: 8px 0 0 0; font-size: 13px; color: #64748b;">示例：MyP@ssw0rd、Abc123!@#</p>
        </div>
        <form id="forcePwdForm" data-submit="submitForcePasswordChange(event, '${defaultOldPwd}')">
            <div class="form-group">
                <label>旧密码</label>
                <input type="password" id="forceOldPwd" value="${defaultOldPwd || ''}" required>
            </div>
            <div class="form-group">
                <label>新密码</label>
                <input type="password" id="forceNewPwd" required placeholder="请输入符合要求的新密码">
                <div id="forcePwdHint" style="font-size: 12px; color: #64748b; margin-top: 4px;"></div>
            </div>
            <div class="form-group">
                <label>确认新密码</label>
                <input type="password" id="forceNewPwdConfirm" required placeholder="请再次输入新密码">
            </div>
            <div class="action-buttons">
                <button type="submit">提交</button>
            </div>
        </form>
    `;
    showModal({ title: '修改密码', body: content, closable: false });
    
    // 实时验证密码强度
    setTimeout(() => {
        const newPwdInput = document.getElementById('forceNewPwd');
        const hintDiv = document.getElementById('forcePwdHint');
        if (newPwdInput && hintDiv) {
            newPwdInput.addEventListener('input', () => {
                const pwd = newPwdInput.value;
                if (pwd.length > 0 && pwd.length < 8) {
                    hintDiv.textContent = '密码长度至少 8 位';
                    hintDiv.style.color = '#e74c3c';
                } else if (pwd.length >= 8) {
                    const msg = passwordValidationMessage(pwd);
                    if (msg) {
                        hintDiv.textContent = msg;
                        hintDiv.style.color = '#e74c3c';
                    } else {
                        hintDiv.textContent = '密码强度符合要求';
                        hintDiv.style.color = '#10b981';
                    }
                } else {
                    hintDiv.textContent = '';
                }
            });
        }
    }, 100);
}

// 提交强制修改密码
export async function submitForcePasswordChange(e, defaultOldPwd) {
    if (e && e.preventDefault) e.preventDefault();
    
    const oldPwd = document.getElementById('forceOldPwd')?.value || defaultOldPwd;
    const newPwd = document.getElementById('forceNewPwd')?.value;
    const newPwdConfirm = document.getElementById('forceNewPwdConfirm')?.value;

    if (!oldPwd || !newPwd || !newPwdConfirm) {
        showAlert('forcePwdAlert', '请填写所有字段', 'error');
        return;
    }

    if (newPwd !== newPwdConfirm) {
        showAlert('forcePwdAlert', '两次输入的新密码不一致', 'error');
        return;
    }

    const msg = passwordValidationMessage(newPwd);
    if (msg) {
        showAlert('forcePwdAlert', msg, 'error');
        return;
    }

    try {
        const res = await apiFetch('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
        });
        const result = await res.json();
        if (result.success) {
            showAlert('forcePwdAlert', '密码更新成功，请继续使用系统', 'success');
            // 更新用户状态
            if (state.currentUser) {
                state.currentUser.passwordMustChange = false;
            }
            setTimeout(() => {
                closeModal();
                showMainApp();
            }, 500);
        } else {
            showAlert('forcePwdAlert', result.message || '修改失败', 'error');
        }
    } catch (err) {
        showAlert('forcePwdAlert', '请求失败: ' + err.message, 'error');
    }
}

// 绑定登录表单事件
export function bindAuthEvents() {
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const res = await fetch(`${import.meta.env ? '' : window.location.origin}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                setToken(data.token);
                setCurrentUser(data.user);
                initCurrentRole();
                // 检查是否需要强制修改密码
                if (data.user.passwordMustChange) {
                    showForcePasswordChangeModal(password);
                } else {
                    showMainApp();
                }
            } else {
                showAlert('loginAlert', data.message, 'error');
            }
        } catch (err) {
            showAlert('loginAlert', '登录失败', 'error');
        }
    });
}
