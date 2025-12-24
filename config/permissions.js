// 权限表配置
// 从数据库读取角色和权限配置
// 如果数据库未初始化，则使用内存缓存

const mongoose = require('mongoose');
const Role = require('../models/Role');

// 内存缓存（用于性能优化）
let permissionsCache = null;
let priorityCache = null;
let nameCache = null;
let cacheTimestamp = null;
let loadingPromise = null;
let mongooseRef = mongoose; // 缓存外部传入的 mongoose 实例
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 默认权限配置（用于数据库未初始化时的回退）
function getDefaultPermissions() {
  return {
    permissions: {
      'admin': {
        'project.view': "all",
        'project.edit': "all",
        'project.create': true,
        'project.delete': true,
        'project.member.manage': true,
        'kpi.view': "all",
        'kpi.view.self': true,
        'kpi.config': true,
        'finance.view': true,
        'finance.edit': true,
        'customer.view': true,
        'customer.edit': true,
        'user.manage': true,
        'system.config': true,
        'role.manage': true
      },
      'finance': {
        'project.view': "all",
        'project.edit': false,
        'project.create': false,
        'project.delete': false,
        'project.member.manage': false,
        'kpi.view': "all",
        'kpi.view.self': true,
        'kpi.config': false,
        'finance.view': true,
        'finance.edit': true,
        'customer.view': true,
        'customer.edit': true,
        'user.manage': false,
        'system.config': false
      },
      'pm': {
        // 项目经理：只看"分配给自己"的项目（通过成员表 ProjectMember）
        'project.view': "assigned",
        'project.edit': false,
        'project.create': true,
        'project.delete': false,
        'project.member.manage': true,
        'kpi.view': "self",
        'kpi.view.self': true,
        'kpi.config': false,
        'finance.view': false,
        'finance.edit': false,
        'customer.view': false,
        'customer.edit': false,
        'user.manage': false,
        'system.config': false
      },
      'sales': {
        'project.view': "sales",
        'project.edit': "sales",
        'project.create': true,
        'project.delete': false,
        'project.member.manage': false,
        'kpi.view': "self",
        'kpi.view.self': true,
        'kpi.config': false,
        'finance.view': false,
        'finance.edit': false,
        // 客户权限：默认只能查看/编辑自己创建的客户
        'customer.view': 'self',
        'customer.edit': 'self',
        'user.manage': false,
        'system.config': false
      },
      'part_time_sales': {
        'project.view': "sales",
        'project.edit': "sales",
        'project.create': true,
        'project.delete': false,
        'project.member.manage': false,
        'kpi.view': "self",
        'kpi.view.self': true,
        'kpi.config': false,
        'finance.view': false,
        'finance.edit': false,
        // 兼职销售：默认只能查看自己创建的客户，不允许编辑
        'customer.view': 'self',
        'customer.edit': false,
        'user.manage': false,
        'system.config': false
      },
      'translator': {
        'project.view': "assigned",
        'project.edit': false,
        'project.create': false,
        'project.delete': false,
        'project.member.manage': false,
        'kpi.view': "self",
        'kpi.view.self': true,
        'kpi.config': false,
        'finance.view': false,
        'finance.edit': false,
        'customer.view': false,
        'customer.edit': false,
        'user.manage': false,
        'system.config': false
      },
      'reviewer': {
        'project.view': "assigned",
        'project.edit': false,
        'project.create': false,
        'project.delete': false,
        'project.member.manage': false,
        'kpi.view': "self",
        'kpi.view.self': true,
        'kpi.config': false,
        'finance.view': false,
        'finance.edit': false,
        'customer.view': false,
        'customer.edit': false,
        'user.manage': false,
        'system.config': false
      },
      'layout': {
        'project.view': "assigned",
        'project.edit': false,
        'project.create': false,
        'project.delete': false,
        'project.member.manage': false,
        'kpi.view': "self",
        'kpi.view.self': true,
        'kpi.config': false,
        'finance.view': false,
        'finance.edit': false,
        'customer.view': false,
        'customer.edit': false,
        'user.manage': false,
        'system.config': false
      },
      'admin_staff': {
        'project.view': "all",
        'project.edit': false,
        'project.create': true,
        'project.delete': false,
        'project.member.manage': true,
        'kpi.view': "self",
        'kpi.view.self': true,
        'kpi.config': false,
        'finance.view': false,
        'finance.edit': false,
        'customer.view': false,
        'customer.edit': false,
        'user.manage': false,
        'system.config': false
      }
    },
    priority: {
      'admin': 100,
      'finance': 90,
      'pm': 80,
      'admin_staff': 75,
      'sales': 70,
      'part_time_sales': 65,
      'reviewer': 50,
      'translator': 40,
      'layout': 30
    },
    names: {
      'admin': "管理员",
      'finance': "财务",
      'pm': "项目经理",
      'sales': "销售",
      'part_time_sales': "兼职销售",
      'translator': "翻译",
      'reviewer': "审校",
      'layout': "排版",
      'admin_staff': "综合岗"
    }
  };
}

// 从数据库加载权限配置
async function loadPermissionsFromDB() {
  try {
    // 复用进行中的加载，避免并发重复查询
    if (loadingPromise) {
      return loadingPromise;
    }
    loadingPromise = (async () => {
      // 检查数据库连接
      const conn = (mongooseRef || mongoose).connection;
      if (!conn || conn.readyState !== 1) {
        console.warn('[Permissions] 数据库未连接，使用默认配置');
        return getDefaultPermissions();
      }

      const roles = await Role.find({ isActive: true });
      
      const permissions = {};
      const priority = {};
      const names = {};
      
      roles.forEach(role => {
        permissions[role.code] = role.permissions || {};
        priority[role.code] = role.priority;
        names[role.code] = role.name;
      });
      
      // 更新缓存
      permissionsCache = permissions;
      priorityCache = priority;
      nameCache = names;
      cacheTimestamp = Date.now();
      
      return { permissions, priority, names };
    })();
    const result = await loadingPromise;
    loadingPromise = null;
    return result;
  } catch (error) {
    loadingPromise = null;
    console.error('[Permissions] 加载权限配置失败:', error);
    // 如果数据库未初始化，返回默认配置
    return getDefaultPermissions();
  }
}

// 主动刷新缓存（外部调用）
async function refreshPermissionsCache() {
  try {
    const result = await loadPermissionsFromDB();
    return result;
  } catch (err) {
    console.error('[Permissions] 刷新权限缓存失败:', err);
    return getDefaultPermissions();
  }
}

// 获取缓存的权限配置（如果缓存有效）
async function getCachedPermissions() {
  const now = Date.now();
  
  // 如果缓存存在且未过期，直接返回
  if (permissionsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL) {
    return {
      permissions: permissionsCache,
      priority: priorityCache,
      names: nameCache
    };
  }
  
  // 否则从数据库重新加载
  return await loadPermissionsFromDB();
}

// 检查权限（异步版本）
async function hasPermission(role, permission) {
  const { permissions } = await getCachedPermissions();
  if (!role || !permissions[role]) {
    return false;
  }
  return permissions[role][permission] !== undefined && permissions[role][permission] !== false;
}

// 获取权限值（异步版本）
async function getPermission(role, permission) {
  const { permissions } = await getCachedPermissions();
  if (!role || !permissions[role]) {
    return false;
  }
  return permissions[role][permission] || false;
}

// 根据优先级选择默认角色（异步版本）
async function getDefaultRole(userRoles) {
  if (!userRoles || userRoles.length === 0) {
    return null;
  }
  
  const { priority } = await getCachedPermissions();
  
  // 按优先级排序
  const sortedRoles = userRoles.sort((a, b) => {
    const priorityA = priority[a] || 0;
    const priorityB = priority[b] || 0;
    return priorityB - priorityA;
  });
  
  return sortedRoles[0];
}

// 获取角色名称（异步版本）
async function getRoleName(roleCode) {
  const { names } = await getCachedPermissions();
  return names[roleCode] || roleCode;
}

// 获取所有角色名称映射（异步版本）
async function getRoleNames() {
  const { names } = await getCachedPermissions();
  return names;
}

// 获取所有权限配置（异步版本）
async function getPermissions() {
  const { permissions } = await getCachedPermissions();
  return permissions;
}

// 获取角色优先级映射（异步版本）
async function getRolePriority() {
  const { priority } = await getCachedPermissions();
  return priority;
}

// 清除缓存（用于角色更新后刷新）
function clearCache() {
  // 保留当前缓存以供同步读取，标记过期并触发后台刷新
  cacheTimestamp = null;
  refreshPermissionsCache().catch(err => {
    console.warn('[Permissions] 异步刷新权限缓存失败:', err);
  });
}

// 同步版本（向后兼容，但会使用缓存）
function hasPermissionSync(role, permission) {
  if (!permissionsCache) {
    // 如果缓存未初始化，使用默认配置
    const defaultPerms = getDefaultPermissions();
    if (!role || !defaultPerms.permissions[role]) {
      return false;
    }
    return defaultPerms.permissions[role][permission] !== undefined && defaultPerms.permissions[role][permission] !== false;
  }
  
  if (!role || !permissionsCache[role]) {
    return false;
  }
  return permissionsCache[role][permission] !== undefined && permissionsCache[role][permission] !== false;
}

function getPermissionSync(role, permission) {
  if (!permissionsCache) {
    const defaultPerms = getDefaultPermissions();
    if (!role || !defaultPerms.permissions[role]) {
      return false;
    }
    return defaultPerms.permissions[role][permission] || false;
  }
  
  if (!role || !permissionsCache[role]) {
    return false;
  }
  return permissionsCache[role][permission] || false;
}

function getDefaultRoleSync(userRoles) {
  if (!userRoles || userRoles.length === 0) {
    return null;
  }
  
  const defaultPerms = getDefaultPermissions();
  const priority = priorityCache || defaultPerms.priority;
  
  const sortedRoles = userRoles.sort((a, b) => {
    const priorityA = priority[a] || 0;
    const priorityB = priority[b] || 0;
    return priorityB - priorityA;
  });
  
  return sortedRoles[0];
}

// 初始化：在服务器启动时预加载权限配置
function initPermissions(mongooseInstance) {
  // 如果外部传入实例，则缓存该实例供连接检查
  if (mongooseInstance) {
    mongooseRef = mongooseInstance;
  }
  // 预加载权限配置
  loadPermissionsFromDB().catch(err => {
    console.warn('[Permissions] 初始化权限配置失败，将使用默认配置:', err.message);
  });
}

module.exports = {
  // 异步版本（推荐使用）
  hasPermission,
  getPermission,
  getDefaultRole,
  getRoleName,
  getRoleNames,
  getPermissions,
  getRolePriority,
  loadPermissionsFromDB,
  refreshPermissionsCache,
  clearCache,
  initPermissions,
  
  // 同步版本（向后兼容）
  hasPermissionSync,
  getPermissionSync,
  getDefaultRoleSync,
  
  // 默认配置（用于回退）
  getDefaultPermissions
};
