// 角色管理模块
import { apiFetch } from '../core/api.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, showAlert } from '../core/utils.js';

let rolesCache = [];

// 所有可用的权限列表
// 注意：values 中包含后端支持的枚举值，false 表示无权限
const ALL_PERMISSIONS = [
  { key: 'project.view', label: '查看项目', values: ['all', 'sales', 'assigned', false] },
  { key: 'project.edit', label: '编辑项目', values: ['all', 'sales', false] },
  { key: 'project.create', label: '创建项目', values: [true, false] },
  { key: 'project.delete', label: '删除项目', values: [true, false] },
  { key: 'project.member.manage', label: '管理项目成员', values: [true, false] },
  { key: 'kpi.view', label: '查看KPI', values: ['all', 'self', false] },
  { key: 'kpi.view.self', label: '查看自己的KPI', values: [true, false] },
  { key: 'kpi.config', label: '配置KPI', values: [true, false] },
  { key: 'finance.view', label: '查看财务', values: [true, false] },
  { key: 'finance.edit', label: '编辑财务', values: [true, false] },
  // 客户权限支持 granular 值：all/self/false
  { key: 'customer.view', label: '查看客户', values: ['all', 'self', false] },
  { key: 'customer.edit', label: '编辑客户', values: ['all', 'self', false] },
  { key: 'user.manage', label: '管理用户', values: [true, false] },
  { key: 'system.config', label: '系统配置', values: [true, false] },
  { key: 'role.manage', label: '管理角色', values: [true, false] }
];

const PERMISSION_HINTS = {
  'customer.view': 'self=仅自己创建的客户；all=所有客户',
  'customer.edit': 'self=仅自己创建的客户；all=所有客户',
  'project.view': 'assigned=自己创建或被分配的项目；all=全部项目',
  'project.amount.visible': '金额可见性按角色内置控制，谨慎开启'
};

// 加载角色列表
export async function loadRoles() {
  try {
    const res = await apiFetch('/roles');
    const data = await res.json();
    
    if (data.success) {
      rolesCache = data.data || [];
      renderRolesList();
    } else {
      showToast('加载角色列表失败: ' + (data.message || '未知错误'), 'error');
    }
  } catch (error) {
    showToast('加载角色列表失败: ' + error.message, 'error');
  }
}

// 渲染角色列表
function renderRolesList() {
  const container = document.getElementById('rolesList');
  if (!container) return;
  
  if (rolesCache.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#666;padding:20px;">暂无角色</div>';
    return;
  }
  
  const rows = rolesCache.map(role => {
    // permissions 已经是对象，直接使用
    const permissions = role.permissions || {};
    
    const permissionsCount = Object.keys(permissions).length;
    const statusBadge = role.isActive 
      ? '<span class="badge badge-success">启用</span>' 
      : '<span class="badge badge-danger">禁用</span>';
    const systemBadge = role.isSystem 
      ? '<span class="badge" style="background:#6c757d;color:white;margin-left:4px;">系统</span>' 
      : '';
    
    return `
      <tr>
        <td><strong>${role.code}</strong></td>
        <td>${role.name}</td>
        <td>${role.description || '-'}</td>
        <td>${role.priority}</td>
        <td>${permissionsCount} 项</td>
        <td>${statusBadge}${systemBadge}</td>
        <td>
          <button class="btn-small" data-click="viewRole('${role._id}')" style="background:#667eea;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">查看</button>
          <button class="btn-small" data-click="editRole('${role._id}')" style="background:#10b981;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;margin-left:4px;">编辑</button>
          ${!role.isSystem ? `<button class="btn-small" data-click="deleteRole('${role._id}')" style="background:#ef4444;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;margin-left:4px;">删除</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
  
  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>角色代码</th>
          <th>角色名称</th>
          <th>描述</th>
          <th>优先级</th>
          <th>权限数量</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// 显示创建角色模态框
export async function showCreateRoleModal() {
  const modalContent = `
    <div style="padding:20px;max-width:800px;max-height:80vh;overflow-y:auto;">
      <form id="createRoleForm">
        <div class="form-group">
          <label>角色代码 <span style="color:red;">*</span>：</label>
          <input type="text" id="roleCode" required pattern="^[a-z][a-z0-9_]*$" 
                 style="width:100%;padding:8px;" placeholder="只能包含小写字母、数字和下划线，且必须以字母开头">
          <div style="font-size:12px;color:#666;margin-top:4px;">例如：custom_role</div>
        </div>
        <div class="form-group">
          <label>角色名称 <span style="color:red;">*</span>：</label>
          <input type="text" id="roleName" required style="width:100%;padding:8px;" placeholder="请输入角色名称">
        </div>
        <div class="form-group">
          <label>描述：</label>
          <textarea id="roleDescription" style="width:100%;padding:8px;min-height:60px;" placeholder="请输入角色描述"></textarea>
        </div>
        <div class="form-group">
          <label>优先级 <span style="color:red;">*</span>：</label>
          <input type="number" id="rolePriority" required value="0" style="width:100%;padding:8px;" placeholder="数字越大优先级越高">
          <div style="font-size:12px;color:#666;margin-top:4px;">用于默认角色选择，建议范围：0-100</div>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="roleCanBeProjectMember" checked> 可用于项目成员角色
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="roleCanBeKpiRole" checked> 可用于KPI记录角色
          </label>
        </div>
        <h3 style="margin:20px 0 10px;">权限配置</h3>
        <div id="permissionsConfig" style="border:1px solid #ddd;border-radius:4px;padding:12px;max-height:400px;overflow-y:auto;">
          ${ALL_PERMISSIONS.map(perm => {
            const hint = PERMISSION_HINTS[perm.key];
            return `
              <div style="margin-bottom:12px;padding:8px;background:#f8f9fa;border-radius:4px;">
                <label style="font-weight:bold;display:block;margin-bottom:4px;">${perm.label} (${perm.key})</label>
                <select class="permission-select" data-permission="${perm.key}" style="width:100%;padding:6px;">
                  <option value="false">无权限</option>
                  ${perm.values.filter(v => v !== false).map(v => 
                    `<option value="${JSON.stringify(v)}">${v === true ? '是' : v === 'all' ? '全部' : v === 'self' ? '自己' : v === 'sales' ? '销售' : v === 'assigned' ? '分配的' : v}</option>`
                  ).join('')}
                </select>
                ${hint ? `<div style="font-size:12px;color:#666;margin-top:4px;">${hint}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button type="button" data-click="closeModal()" style="padding:8px 16px;background:#ccc;color:white;border:none;border-radius:4px;cursor:pointer;">取消</button>
          <button type="submit" style="padding:8px 16px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;">创建</button>
        </div>
      </form>
    </div>
  `;
  
  showModal({ title: '创建新角色', body: modalContent });
  
  const form = document.getElementById('createRoleForm');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      await submitCreateRole();
    };
  }
}

// 提交创建角色
async function submitCreateRole() {
  try {
    const code = document.getElementById('roleCode')?.value?.trim();
    const name = document.getElementById('roleName')?.value?.trim();
    const description = document.getElementById('roleDescription')?.value?.trim() || '';
    const priority = parseInt(document.getElementById('rolePriority')?.value || '0');
    const canBeProjectMember = document.getElementById('roleCanBeProjectMember')?.checked !== false;
    const canBeKpiRole = document.getElementById('roleCanBeKpiRole')?.checked !== false;
    
    // 收集权限配置
    const permissions = {};
    document.querySelectorAll('.permission-select').forEach(select => {
      const permKey = select.dataset.permission;
      const selectValue = select.value?.trim();
      if (!permKey || selectValue === undefined) {
        return;
      }

      try {
        const value = JSON.parse(selectValue);
        permissions[permKey] = value; // 即便为 false 也存入，便于配置展示
      } catch (parseError) {
        console.error('[Role] 解析权限值失败:', selectValue, parseError);
        if (selectValue === 'true') {
          permissions[permKey] = true;
        } else if (selectValue === 'false') {
          permissions[permKey] = false;
        } else {
          // 其他字符串值直接写入
          permissions[permKey] = selectValue;
        }
      }
    });
    
    const res = await apiFetch('/roles', {
      method: 'POST',
      body: JSON.stringify({
        code,
        name,
        description,
        priority,
        permissions,
        canBeProjectMember,
        canBeKpiRole
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      showToast('角色创建成功', 'success');
      closeModal();
      await loadRoles();
    } else {
      showToast(data.error?.message || data.message || '创建失败', 'error');
    }
  } catch (error) {
    showToast('创建失败: ' + error.message, 'error');
  }
}

// 查看角色详情
export async function viewRole(roleId) {
  const role = rolesCache.find(r => r._id === roleId);
  if (!role) {
    showToast('角色不存在', 'error');
    return;
  }
  
  // permissions 已经是对象，直接使用
  const permissions = role.permissions || {};
  
  const permissionsList = ALL_PERMISSIONS.map(perm => {
    const value = permissions[perm.key];
    const valueText = value === undefined || value === false ? '无权限' 
      : value === true ? '是' 
      : value === 'all' ? '全部' 
      : value === 'self' ? '自己' 
      : value === 'sales' ? '销售' 
      : value === 'assigned' ? '分配的' 
      : value;
    return `<div style="padding:8px;border-bottom:1px solid #eee;"><strong>${perm.label}:</strong> ${valueText}</div>`;
  }).join('');
  
  // 获取使用统计
  let usageInfo = '';
  try {
    const usageRes = await apiFetch(`/roles/${roleId}/usage`);
    const usageData = await usageRes.json();
    if (usageData.success) {
      usageInfo = `
        <div style="margin-top:16px;padding:12px;background:#f8f9fa;border-radius:4px;">
          <h4>使用统计</h4>
          <div>用户数量: ${usageData.data.userCount}</div>
          <div>项目成员记录: ${usageData.data.projectMemberCount}</div>
          <div>KPI记录: ${usageData.data.kpiRecordCount}</div>
        </div>
      `;
    }
  } catch (error) {
    console.warn('获取使用统计失败:', error);
  }
  
  const modalContent = `
    <div style="padding:20px;max-width:600px;max-height:80vh;overflow-y:auto;">
      <div style="margin-bottom:16px;">
        <div><strong>角色代码:</strong> ${role.code}</div>
        <div><strong>角色名称:</strong> ${role.name}</div>
        <div><strong>描述:</strong> ${role.description || '-'}</div>
        <div><strong>优先级:</strong> ${role.priority}</div>
        <div><strong>状态:</strong> ${role.isActive ? '启用' : '禁用'}</div>
        <div><strong>系统内置:</strong> ${role.isSystem ? '是' : '否'}</div>
        <div><strong>可用于项目成员:</strong> ${role.canBeProjectMember ? '是' : '否'}</div>
        <div><strong>可用于KPI记录:</strong> ${role.canBeKpiRole ? '是' : '否'}</div>
      </div>
      <h4>权限配置</h4>
      <div style="border:1px solid #ddd;border-radius:4px;max-height:300px;overflow-y:auto;">
        ${permissionsList}
      </div>
      ${usageInfo}
    </div>
  `;
  
  showModal({ title: '角色详情', body: modalContent });
}

// 编辑角色
export async function editRole(roleId) {
  const role = rolesCache.find(r => r._id === roleId);
  if (!role) {
    showToast('角色不存在', 'error');
    return;
  }
  
  // permissions 已经是对象，直接使用
  const permissions = role.permissions || {};
  
  const modalContent = `
    <div style="padding:20px;max-width:800px;max-height:80vh;overflow-y:auto;">
      <form id="editRoleForm">
        <div class="form-group">
          <label>角色代码：</label>
          <input type="text" id="editRoleCode" value="${role.code}" ${role.isSystem ? 'readonly' : ''} 
                 style="width:100%;padding:8px;background:${role.isSystem ? '#f5f5f5' : 'white'};" 
                 ${role.isSystem ? 'title="系统内置角色的代码不能修改"' : ''}>
          ${role.isSystem ? '<div style="font-size:12px;color:#666;margin-top:4px;">系统内置角色的代码不能修改</div>' : ''}
        </div>
        <div class="form-group">
          <label>角色名称 <span style="color:red;">*</span>：</label>
          <input type="text" id="editRoleName" required value="${role.name}" style="width:100%;padding:8px;">
        </div>
        <div class="form-group">
          <label>描述：</label>
          <textarea id="editRoleDescription" style="width:100%;padding:8px;min-height:60px;">${role.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label>优先级 <span style="color:red;">*</span>：</label>
          <input type="number" id="editRolePriority" required value="${role.priority}" style="width:100%;padding:8px;">
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="editRoleIsActive" ${role.isActive ? 'checked' : ''}> 启用
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="editRoleCanBeProjectMember" ${role.canBeProjectMember ? 'checked' : ''}> 可用于项目成员角色
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="editRoleCanBeKpiRole" ${role.canBeKpiRole ? 'checked' : ''}> 可用于KPI记录角色
          </label>
        </div>
        <h3 style="margin:20px 0 10px;">权限配置</h3>
        <div id="editPermissionsConfig" style="border:1px solid #ddd;border-radius:4px;padding:12px;max-height:400px;overflow-y:auto;">
          ${ALL_PERMISSIONS.map(perm => {
            const currentValue = permissions[perm.key];
            const currentValueStr = currentValue === undefined ? 'false' : JSON.stringify(currentValue);
            const hint = PERMISSION_HINTS[perm.key];
            return `
              <div style="margin-bottom:12px;padding:8px;background:#f8f9fa;border-radius:4px;">
                <label style="font-weight:bold;display:block;margin-bottom:4px;">${perm.label} (${perm.key})</label>
                <select class="edit-permission-select" data-permission="${perm.key}" style="width:100%;padding:6px;">
                  <option value="false" ${currentValueStr === 'false' ? 'selected' : ''}>无权限</option>
                  ${perm.values.filter(v => v !== false).map(v => {
                    const vStr = JSON.stringify(v);
                    return `<option value="${vStr}" ${currentValueStr === vStr ? 'selected' : ''}>${v === true ? '是' : v === 'all' ? '全部' : v === 'self' ? '自己' : v === 'sales' ? '销售' : v === 'assigned' ? '分配的' : v}</option>`;
                  }).join('')}
                </select>
                ${hint ? `<div style="font-size:12px;color:#666;margin-top:4px;">${hint}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button type="button" data-click="closeModal()" style="padding:8px 16px;background:#ccc;color:white;border:none;border-radius:4px;cursor:pointer;">取消</button>
          <button type="submit" style="padding:8px 16px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;">保存</button>
        </div>
      </form>
    </div>
  `;
  
  showModal({ title: '编辑角色', body: modalContent });
  
  const form = document.getElementById('editRoleForm');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      await submitEditRole(roleId);
    };
  }
}

// 提交编辑角色
async function submitEditRole(roleId) {
  try {
    const name = document.getElementById('editRoleName')?.value?.trim();
    const description = document.getElementById('editRoleDescription')?.value?.trim() || '';
    const priority = parseInt(document.getElementById('editRolePriority')?.value || '0');
    const isActive = document.getElementById('editRoleIsActive')?.checked !== false;
    const canBeProjectMember = document.getElementById('editRoleCanBeProjectMember')?.checked !== false;
    const canBeKpiRole = document.getElementById('editRoleCanBeKpiRole')?.checked !== false;
    
    // 收集权限配置
    const permissions = {};
    try {
      document.querySelectorAll('.edit-permission-select').forEach(select => {
        const permKey = select.dataset.permission;
        if (!permKey) {
          console.warn('[Role] 权限选择器缺少 data-permission 属性');
          return;
        }
        
        const selectValue = select.value?.trim();
        if (selectValue === undefined) {
          return;
        }
        
        try {
          const value = JSON.parse(selectValue);
          permissions[permKey] = value; // 包含 false，便于保留显式配置
        } catch (parseError) {
          console.error('[Role] 解析权限值失败:', selectValue, parseError);
          // 如果解析失败，尝试直接使用字符串值
          if (selectValue === 'true') {
            permissions[permKey] = true;
          } else if (selectValue === 'false') {
            permissions[permKey] = false;
          } else {
            permissions[permKey] = selectValue;
          }
        }
      });
    } catch (permError) {
      console.error('[Role] 收集权限配置失败:', permError);
      showToast('收集权限配置失败: ' + permError.message, 'error');
      return;
    }
    
    const requestData = {
      name,
      description,
      priority,
      isActive,
      permissions,
      canBeProjectMember,
      canBeKpiRole
    };
    
    console.log('[Role] 提交更新角色:', roleId, requestData);
    
    const res = await apiFetch(`/roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(requestData)
    });
    
    console.log('[Role] API 响应状态:', res.status, res.statusText);
    
    const data = await res.json();
    console.log('[Role] API 响应数据:', data);
    
    if (data.success) {
      showToast('角色更新成功', 'success');
      closeModal();
      await loadRoles();
    } else {
      const errorMsg = data.error?.message || data.message || data.error || '更新失败';
      console.error('[Role] 更新失败:', errorMsg, data);
      showToast('更新失败: ' + errorMsg, 'error');
    }
  } catch (error) {
    console.error('[Role] 更新角色异常:', error);
    showToast('更新失败: ' + error.message, 'error');
  }
}

// 删除角色
export async function deleteRole(roleId) {
  const role = rolesCache.find(r => r._id === roleId);
  if (!role) {
    showToast('角色不存在', 'error');
    return;
  }
  
  if (role.isSystem) {
    showToast('系统内置角色不能删除', 'error');
    return;
  }
  
  if (!confirm(`确定要删除角色 "${role.name}" (${role.code}) 吗？\n\n此操作不可恢复！`)) {
    return;
  }
  
  try {
    const res = await apiFetch(`/roles/${roleId}`, {
      method: 'DELETE'
    });
    
    const data = await res.json();
    
    if (data.success) {
      showToast('角色已删除', 'success');
      await loadRoles();
    } else {
      showToast(data.error?.message || data.message || '删除失败', 'error');
    }
  } catch (error) {
    showToast('删除失败: ' + error.message, 'error');
  }
}

