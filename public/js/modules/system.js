import { apiFetch } from '../core/api.js';
import { showAlert, showToast, hasPermission } from '../core/utils.js';
import { showModal } from '../core/ui.js';
import { state, setSystemConfig } from '../core/state.js';

// 缓存配置历史
let configHistoryCache = [];
let orgInfo = {
    companyName: '语家',
    companyAddress: '',
    companyContact: '',
    companyPhone: '',
    companyEmail: ''
};

// 机构信息（公开读取，用于展示名称）
export async function loadOrgInfo() {
    try {
        const res = await fetch(`/api/config/public`);
        const data = await res.json();
        if (data.success && data.data) {
            orgInfo = data.data;
        }
    } catch (e) {
        console.warn('加载机构信息失败，使用默认值', e);
    }
    const baseName = orgInfo.companyName || '语家';
    const titleText = `${baseName} OA 系统`;
    document.title = titleText;
    const loginTitle = document.getElementById('loginTitle');
    if (loginTitle) loginTitle.textContent = titleText;
    const mainTitle = document.getElementById('mainTitle');
    if (mainTitle) mainTitle.textContent = titleText;
}

// 加载系统配置（用于客户经理佣金计算等，所有用户都需要）
export async function loadSystemConfig() {
    try {
        const response = await apiFetch('/config');
        const data = await response.json();
        if (data.success && data.data) {
            const config = data.data;
            // 更新 state.systemConfig
            setSystemConfig(config);
            console.log('[System] 系统配置已加载:', config);
        }
    } catch (error) {
        console.error('[System] 加载系统配置失败:', error);
        // 失败时使用默认值
        const defaultConfig = { part_time_sales_tax_rate: 0.1 };
        setSystemConfig(defaultConfig);
    }
}

export async function loadConfig() {
    try {
        const response = await apiFetch('/config');
        const data = await response.json();
        if (!data.success) return;

        const config = data.data || {};
        const html = `
            <form id="configUpdateForm">
                <h3 style="margin-bottom: 10px;">机构信息</h3>
                <div class="form-group">
                    <label>公司名称</label>
                    <input type="text" name="companyName" value="${config.companyName || ''}" placeholder="请输入公司名称">
                </div>
                <div class="form-group">
                    <label>公司地址</label>
                    <input type="text" name="companyAddress" value="${config.companyAddress || ''}" placeholder="请输入公司地址">
                </div>
                <div class="form-group">
                    <label>联系人</label>
                    <input type="text" name="companyContact" value="${config.companyContact || ''}" placeholder="请输入联系人">
                </div>
                <div class="form-group">
                    <label>联系电话</label>
                    <input type="text" name="companyPhone" value="${config.companyPhone || ''}" placeholder="请输入联系电话">
                </div>
                <div class="form-group">
                    <label>联系邮箱</label>
                    <input type="text" name="companyEmail" value="${config.companyEmail || ''}" placeholder="请输入联系邮箱">
                </div>

                <h3 style="margin: 16px 0 10px;">系统设置</h3>
                <div class="form-group">
                    <label>项目编号前缀</label>
                    <input type="text" name="projectNumberPrefix" value="${config.projectNumberPrefix || 'PRJ'}" placeholder="如：PRJ" maxlength="10" pattern="[A-Za-z0-9]+" title="只能包含字母和数字，长度1-10个字符">
                    <small style="color: #666; font-size: 12px; display: block; margin-top: 4px;">
                        项目编号格式：前缀 + 年份(4位) + 月份(2位) + 序号(4位)，例如：PRJ2024010001
                    </small>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" name="allow_self_assignment" ${config.allow_self_assignment ? 'checked' : ''} style="width: auto;">
                        <span>允许一人多角色时自己分配给自己</span>
                    </label>
                    <small style="color: #666; font-size: 12px; display: block; margin-top: 4px;">
                        开启后，允许项目经理将自己同时分配为翻译或审校，允许销售将自己分配为项目经理（适用于只有一个人的情况）
                    </small>
                </div>

                <h3 style="margin: 16px 0 10px;">KPI 系数</h3>
                <div class="form-group">
                    <label>翻译（MTPE）系数</label>
                    <input type="number" step="0.001" value="${config.translator_ratio_mtpe}" name="translator_ratio_mtpe" required>
                </div>
                <div class="form-group">
                    <label>翻译（深度编辑）系数</label>
                    <input type="number" step="0.001" value="${config.translator_ratio_deepedit}" name="translator_ratio_deepedit" required>
                </div>
                <div class="form-group">
                    <label>审校系数</label>
                    <input type="number" step="0.001" value="${config.reviewer_ratio}" name="reviewer_ratio" required>
                </div>
                <div class="form-group">
                    <label>PM系数</label>
                    <input type="number" step="0.001" value="${config.pm_ratio}" name="pm_ratio" required>
                </div>
                <div class="form-group">
                    <label>销售金额奖励系数</label>
                    <input type="number" step="0.001" value="${config.sales_bonus_ratio}" name="sales_bonus_ratio" required>
                </div>
                <div class="form-group">
                    <label>销售回款系数</label>
                    <input type="number" step="0.001" value="${config.sales_commission_ratio}" name="sales_commission_ratio" required>
                </div>
                <div class="form-group">
                    <label>综合岗系数</label>
                    <input type="number" step="0.001" value="${config.admin_ratio}" name="admin_ratio" required>
                </div>
                <div class="form-group">
                    <label>完成系数（基础值）</label>
                    <input type="number" step="0.001" value="${config.completion_factor}" name="completion_factor" required>
                </div>
                <div class="form-group">
                    <label>客户经理佣金税率（%）</label>
                    <input type="number" step="0.01" min="0" max="100" value="${(config.part_time_sales_tax_rate || 0) * 100}" name="part_time_sales_tax_rate" required>
                    <small style="color: #666; font-size: 12px;">用于计算客户经理佣金：佣金 = (项目总金额 - 公司应收金额) × (1 - 税率)</small>
                </div>
                
                <h3 style="margin: 20px 0 10px; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 8px;">角色KPI系数配置</h3>
                <p style="color: #666; font-size: 14px; margin-bottom: 12px; background: #f0f4ff; padding: 10px; border-radius: 4px; border-left: 4px solid #667eea;">
                    <strong>说明：</strong>为可用于KPI的角色配置系数。固定角色的系数（翻译、审校、PM、销售、综合岗、财务）在上面已配置，这里可以配置新增角色的系数。
                </p>
                <div id="roleRatiosConfig" style="margin-bottom: 16px; min-height: 100px; border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px; background: #fafafa;">
                    <div style="color: #999; font-style: italic; text-align: center; padding: 20px;">正在加载角色列表...</div>
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
        const container = document.getElementById('configForm');
        if (!container) {
            console.error('[System] configForm 容器不存在');
            return;
        }
        
        container.innerHTML = html;

        // 等待DOM更新后再加载角色系数配置
        setTimeout(async () => {
            try {
                await loadRoleRatiosConfig(config);
            } catch (error) {
                console.error('[System] 加载角色系数配置失败:', error);
                const roleRatiosContainer = document.getElementById('roleRatiosConfig');
                if (roleRatiosContainer) {
                    roleRatiosContainer.innerHTML = 
                        '<div style="color: #f44336; padding: 12px; background: #ffebee; border-radius: 4px;">加载失败: ' + error.message + '</div>';
                }
            }
        }, 100);

        const form = document.getElementById('configUpdateForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const payload = Object.fromEntries(formData);
                const numberFields = ['translator_ratio_mtpe','translator_ratio_deepedit','reviewer_ratio','pm_ratio','sales_bonus_ratio','sales_commission_ratio','admin_ratio','completion_factor'];
                Object.keys(payload).forEach(k => {
                    if (numberFields.includes(k) && payload[k]) payload[k] = parseFloat(payload[k]);
                });
                // 客户经理税率单独处理：前端以百分比展示，提交时转换为 0-1 小数
                if (payload.part_time_sales_tax_rate !== undefined && payload.part_time_sales_tax_rate !== '') {
                    const ratePercent = parseFloat(payload.part_time_sales_tax_rate);
                    if (!isNaN(ratePercent)) {
                        payload.part_time_sales_tax_rate = ratePercent / 100;
                    }
                }
                // 处理 checkbox：如果选中则为 true，否则为 false
                payload.allow_self_assignment = formData.has('allow_self_assignment');
                
                // 收集动态角色系数配置
                const roleRatios = {};
                const roleRatioInputs = document.querySelectorAll('input[data-role-ratio]');
                roleRatioInputs.forEach(input => {
                    const roleCode = input.getAttribute('data-role-ratio');
                    const value = parseFloat(input.value);
                    if (roleCode && !isNaN(value) && value >= 0) {
                        roleRatios[roleCode] = { base: value };
                    }
                });
                if (Object.keys(roleRatios).length > 0) {
                    payload.roleRatios = roleRatios;
                }
                
                try {
                    const res = await apiFetch('/config/update', { method: 'POST', body: JSON.stringify(payload) });
                    const result = await res.json();
                    if (result.success) {
                        showAlert('configAlert', '配置更新成功', 'success');
                        loadConfig();
                        // 如果有机构信息展示，可刷新
                        window.loadOrgInfo?.();
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

export async function loadConfigHistory() {
    try {
        const response = await apiFetch('/config/history');
        const data = await response.json();
        if (!data.success) return;
        configHistoryCache = data.data || [];
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
                    ${configHistoryCache.map((h, idx) => `
                        <tr>
                            <td>${h.changedAt ? new Date(h.changedAt).toLocaleString() : '-'}</td>
                            <td>${h.changedByUser?.name || '未知'}</td>
                            <td>${h.reason || '无'}</td>
                            <td><button class="btn-small" data-click="viewConfigChange(${idx})">查看详情</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        const container = document.getElementById('configHistory');
        if (container) container.innerHTML = html;
    } catch (error) {
        console.error('加载历史失败:', error);
    }
}

export function viewConfigChange(idx) {
    const item = configHistoryCache[idx];
    if (!item) return;
    const content = `
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
            <div><strong>变更时间：</strong>${item.changedAt ? new Date(item.changedAt).toLocaleString() : '-'}</div>
            <div><strong>变更人：</strong>${item.changedByUser?.name || '未知'}</div>
            <div><strong>变更原因：</strong>${item.reason || '无'}</div>
            <div><strong>配置详情：</strong></div>
            <pre style="white-space:pre-wrap;background:#f5f5f5;padding:8px;border-radius:4px;max-height:300px;overflow:auto;">${JSON.stringify(item.config || {}, null, 2)}</pre>
        </div>
    `;
    showModal({ title: '配置详情', body: content });
}

// 权限配置（可编辑）
export async function loadPermissionsConfig() {
    try {
        // 从后端获取权限配置
        const res = await apiFetch('/config/permissions');
        const data = await res.json();
        
        if (!data.success) {
            showAlert('permissionsAlert', data.message || '加载权限配置失败', 'error');
            return;
        }

        const PERMISSIONS = data.data?.permissions || {};
        const ROLE_NAMES = data.data?.roleNames || {};
        
        if (!PERMISSIONS || typeof PERMISSIONS !== 'object') {
            console.error('[System] 权限配置数据格式错误:', data.data);
            showAlert('permissionsAlert', '权限配置数据格式错误', 'error');
            return;
        }
        
        const roles = Object.keys(PERMISSIONS);
        
        if (roles.length === 0) {
            showAlert('permissionsAlert', '未找到任何角色配置', 'error');
            return;
        }
        
        const permissionKeys = [
            'project.view', 'project.edit', 'project.create', 'project.delete', 'project.member.manage',
            'kpi.view', 'kpi.view.self', 'kpi.config',
            'finance.view', 'finance.edit',
            'customer.view', 'customer.edit',
            'user.manage', 'system.config'
        ];
        const permissionLabels = {
            'project.view': '查看项目',
            'project.edit': '编辑项目',
            'project.create': '创建项目',
            'project.delete': '删除项目',
            'project.member.manage': '管理项目成员',
            'kpi.view': '查看KPI',
            'kpi.view.self': '查看自己的KPI',
            'kpi.config': 'KPI配置',
            'finance.view': '查看财务',
            'finance.edit': '编辑财务',
            'customer.view': '查看客户',
            'customer.edit': '编辑客户',
            'user.manage': '用户管理',
            'system.config': '系统配置'
        };

        // 检查是否为管理员
        const isAdmin = hasPermission('system.config');

        const html = `
            <div style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                ${isAdmin ? `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <p style="color: #666; margin: 0;">
                            管理员可以编辑权限配置。修改后需要重启服务器才能生效。
                        </p>
                        <div style="display: flex; gap: 10px;">
                            <button data-click="savePermissionsConfig()" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">保存权限配置</button>
                            <button data-click="loadPermissionsConfig()" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">刷新</button>
                        </div>
                    </div>
                ` : `
                    <p style="color: #666; margin-bottom: 20px;">
                        注意：权限配置为只读模式。只有管理员可以修改权限配置。
                    </p>
                `}
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 12px; text-align: left; border: 1px solid #ddd; min-width: 120px;">权限</th>
                                ${roles.map(role => `
                                    <th style="padding: 12px; text-align: center; border: 1px solid #ddd; min-width: 100px;">
                                        ${ROLE_NAMES[role] || role}
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${permissionKeys.map(permKey => `
                                <tr>
                                    <td style="padding: 12px; border: 1px solid #ddd; font-weight: 500;">
                                        ${permissionLabels[permKey] || permKey}
                                    </td>
                                    ${roles.map(role => {
                                        const permValue = PERMISSIONS[role]?.[permKey];
                                        const cellId = `perm_${role}_${permKey}`;
                                        
                                        // 根据权限类型决定可选项
                                        let options = '';
                                        if (permKey === 'project.view' || permKey === 'project.edit') {
                                            // 项目查看/编辑：false, 'all', 'sales', 'assigned'
                                            options = `
                                                <option value="false" ${permValue === false ? 'selected' : ''}>❌ 否</option>
                                                <option value="all" ${permValue === 'all' ? 'selected' : ''}>全部</option>
                                                <option value="sales" ${permValue === 'sales' ? 'selected' : ''}>自己的</option>
                                                <option value="assigned" ${permValue === 'assigned' ? 'selected' : ''}>分配的</option>
                                            `;
                                        } else if (permKey === 'kpi.view') {
                                            // KPI查看：false, 'all', 'self'
                                            options = `
                                                <option value="false" ${permValue === false ? 'selected' : ''}>❌ 否</option>
                                                <option value="all" ${permValue === 'all' ? 'selected' : ''}>全部</option>
                                                <option value="self" ${permValue === 'self' ? 'selected' : ''}>自己的</option>
                                            `;
                                        } else if (permKey === 'customer.view' || permKey === 'customer.edit') {
                                            // 客户查看/编辑：false, 'all', 'self'
                                            options = `
                                                <option value="false" ${permValue === false ? 'selected' : ''}>❌ 否</option>
                                                <option value="all" ${permValue === 'all' ? 'selected' : ''}>全部</option>
                                                <option value="self" ${permValue === 'self' ? 'selected' : ''}>自己的</option>
                                            `;
                                        } else {
                                            // 其他权限：true/false
                                            options = `
                                                <option value="false" ${permValue === false ? 'selected' : ''}>❌ 否</option>
                                                <option value="true" ${permValue === true ? 'selected' : ''}>✅ 是</option>
                                            `;
                                        }

                                        return `
                                            <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">
                                                ${isAdmin ? `
                                                    <select id="${cellId}" data-role="${role}" data-perm="${permKey}" 
                                                            style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 100%; min-width: 80px;">
                                                        ${options}
                                                    </select>
                                                ` : (() => {
                                                    let displayValue = '';
                                                    let bgColor = '#fff';
                                                    if (permValue === true) {
                                                        displayValue = '✅ 是';
                                                        bgColor = '#e8f5e9';
                                                    } else if (permValue === false) {
                                                        displayValue = '❌ 否';
                                                        bgColor = '#ffebee';
                                                    } else if (permValue === 'all') {
                                                        displayValue = '全部';
                                                        bgColor = '#e3f2fd';
                                                    } else if (permValue === 'sales') {
                                                        displayValue = '自己的';
                                                        bgColor = '#fff3e0';
                                                    } else if (permValue === 'assigned') {
                                                        displayValue = '分配的';
                                                        bgColor = '#f3e5f5';
                                                    } else if (permValue === 'self') {
                                                        displayValue = '自己的';
                                                        bgColor = '#fff3e0';
                                                    } else {
                                                        displayValue = '❌ 否';
                                                        bgColor = '#ffebee';
                                                    }
                                                    return `<div style="background: ${bgColor}; padding: 8px;">${displayValue}</div>`;
                                                })()}
                                            </td>
                                        `;
                                    }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const container = document.getElementById('permissionsConfig');
        if (container) container.innerHTML = html;
    } catch (error) {
        console.error('加载权限配置失败:', error);
        showAlert('permissionsAlert', '加载权限配置失败: ' + error.message, 'error');
    }
}

// 保存权限配置
export async function savePermissionsConfig() {
    try {
        // 收集所有权限值
        const selects = document.querySelectorAll('select[data-role][data-perm]');
        const permissions = {};
        
        selects.forEach(select => {
            const role = select.getAttribute('data-role');
            const perm = select.getAttribute('data-perm');
            const value = select.value;
            
            if (!permissions[role]) {
                permissions[role] = {};
            }
            
            // 转换字符串值为正确类型
            if (value === 'true') {
                permissions[role][perm] = true;
            } else if (value === 'false') {
                permissions[role][perm] = false;
            } else {
                permissions[role][perm] = value; // 'all', 'sales', 'assigned', 'self'
            }
        });

        // 询问更新原因
        const reason = prompt('请输入更新权限配置的原因：');
        if (reason === null) {
            return; // 用户取消
        }

        // 发送到后端
        const res = await apiFetch('/config/permissions', {
            method: 'PUT',
            body: JSON.stringify({ permissions, reason: reason || '未提供原因' })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showToast('权限配置保存成功！请重启服务器使配置生效。', 'success');
            // 重新加载配置
            await loadPermissionsConfig();
        } else {
            showToast(data.message || '保存失败', 'error');
        }
    } catch (error) {
        console.error('保存权限配置失败:', error);
        showToast('保存失败: ' + error.message, 'error');
    }
}

// 加载角色系数配置
async function loadRoleRatiosConfig(config) {
    const container = document.getElementById('roleRatiosConfig');
    if (!container) {
        console.error('[System] roleRatiosConfig 容器不存在');
        return;
    }
    
    try {
        console.log('[System] 开始加载角色系数配置...');
        const res = await apiFetch('/config/kpi-roles');
        const data = await res.json();
        
        console.log('[System] 角色列表API响应:', data);
        
        if (!data.success || !Array.isArray(data.data)) {
            container.innerHTML = 
                '<div style="color: #f44336; padding: 12px; background: #ffebee; border-radius: 4px;">加载角色列表失败: ' + (data.message || '未知错误') + '</div>';
            return;
        }
        
        const roles = data.data;
        const roleRatios = config.roleRatios || {};
        
        console.log('[System] 获取到角色数量:', roles.length);
        console.log('[System] 当前角色系数配置:', roleRatios);
        
        // 使用Role模型的字段动态判断（替代硬编码列表）
        // 固定角色（isFixedRole为true）：这些角色的系数在上面已配置，这里不显示
        // 系统角色（isSystem为true）：这些角色不应该在这里配置KPI系数
        // 特殊角色（isSpecialRole为true）：这些角色有特殊处理逻辑，不使用基础系数
        
        // 过滤出真正需要配置的新角色（排除固定角色、系统角色和特殊角色）
        const configurableRoles = roles.filter(role => {
            // 排除系统角色
            if (role.isSystem === true) {
                return false;
            }
            // 排除固定角色
            if (role.isFixedRole === true) {
                return false;
            }
            // 排除特殊角色
            if (role.isSpecialRole === true) {
                return false;
            }
            // 只显示可以用于KPI记录的角色
            return role.canBeKpiRole === true;
        });
        
        console.log('[System] 总角色数量:', roles.length);
        console.log('[System] 所有角色详情:', roles.map(r => ({ 
            code: r.code, 
            name: r.name,
            isSystem: r.isSystem,
            isFixedRole: r.isFixedRole,
            isSpecialRole: r.isSpecialRole,
            canBeKpiRole: r.canBeKpiRole
        })));
        console.log('[System] 可配置角色数量:', configurableRoles.length);
        console.log('[System] 可配置角色列表:', configurableRoles.map(r => r.code));
        
        // 如果没有任何可配置角色，显示提示
        if (configurableRoles.length === 0) {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px;">
                    <p style="color: #856404; margin: 0 0 8px 0; font-weight: 600;">暂无需要配置的新角色</p>
                    <p style="color: #856404; margin: 0; font-size: 13px;">
                        固定角色（翻译、审校、PM、销售、综合岗、财务）的系数在上面已配置。
                    </p>
                    <p style="color: #856404; margin: 8px 0 0 0; font-size: 12px;">
                        创建新角色并设置"可用于KPI记录"后，会显示在这里。
                    </p>
                </div>
            `;
            return;
        }
        
        // 构建HTML：只显示可配置的新角色
        const tableRows = configurableRoles.map(role => {
            const roleConfig = roleRatios[role.code] || {};
            const currentRatio = role.ratio || roleConfig.base || 0;
            
            return `
                <tr>
                    <td style="padding: 8px; border: 1px solid #dee2e6;">${role.name}</td>
                    <td style="padding: 8px; border: 1px solid #dee2e6;">
                        <code style="background: #f1f3f5; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${role.code}</code>
                    </td>
                    <td style="padding: 8px; border: 1px solid #dee2e6;">
                        <input type="number" 
                               step="0.001" 
                               min="0" 
                               max="1" 
                               value="${currentRatio}" 
                               data-role-ratio="${role.code}"
                               style="width: 100px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;"
                               placeholder="0.000">
                    </td>
                    <td style="padding: 8px; border: 1px solid #dee2e6; color: #666; font-size: 13px;">
                        ${role.description || '无'}
                    </td>
                </tr>
            `;
        }).join('');
        
        const html = `
            <div style="background: #f8f9fa; padding: 12px; border-radius: 4px; margin-bottom: 12px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #e9ecef;">
                            <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">角色名称</th>
                            <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">角色代码</th>
                            <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">KPI系数</th>
                            <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">说明</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;
        
        document.getElementById('roleRatiosConfig').innerHTML = html;
    } catch (error) {
        console.error('加载角色系数配置失败:', error);
        document.getElementById('roleRatiosConfig').innerHTML = 
            '<div style="color: #f44336;">加载角色列表失败: ' + error.message + '</div>';
    }
}

// 挂载
