// 权限表配置
// 定义每个角色可以访问的功能和权限范围

const PERMISSIONS = {
  // 管理员：所有权限
  admin: {
    'project.view': 'all',              // 查看所有项目
    'project.edit': true,               // 编辑项目
    'project.create': true,              // 创建项目
    'project.delete': true,              // 删除项目
    'project.member.manage': true,       // 管理项目成员
    'kpi.view': 'all',                  // 查看所有KPI
    'kpi.view.self': true,              // 查看自己的KPI
    'kpi.config': true,                 // KPI配置
    'finance.view': true,                // 查看财务数据
    'finance.edit': true,                // 编辑财务数据
    'customer.view': true,               // 查看客户
    'customer.edit': true,               // 编辑客户
    'user.manage': true,                 // 用户管理
    'system.config': true                // 系统配置
  },

  // 财务：财务相关权限
  finance: {
    'project.view': 'all',
    'project.edit': false,
    'project.create': false,
    'project.delete': false,
    'project.member.manage': false,
    'kpi.view': 'all',
    'kpi.view.self': true,
    'kpi.config': false,
    'finance.view': true,
    'finance.edit': true,
    'customer.view': true,
    'customer.edit': true,
    'user.manage': false,
    'system.config': false
  },

  // 项目经理：项目管理权限
  pm: {
    'project.view': 'all',
    'project.edit': true,
    'project.create': true,
    'project.delete': false,
    'project.member.manage': true,
    'kpi.view': 'all',
    'kpi.view.self': true,
    'kpi.config': false,
    'finance.view': false,
    'finance.edit': false,
    'customer.view': true,
    'customer.edit': true,
    'user.manage': false,
    'system.config': false
  },

  // 销售：销售相关权限
  sales: {
    'project.view': 'sales',            // 只看自己创建的项目
    'project.edit': 'sales',            // 只能编辑自己创建的项目
    'project.create': true,
    'project.delete': false,
    'project.member.manage': false,
    'kpi.view': 'self',                 // 只看自己的KPI
    'kpi.view.self': true,
    'kpi.config': false,
    'finance.view': 'sales',            // 只看自己项目的财务
    'finance.edit': false,
    'customer.view': true,
    'customer.edit': true,
    'user.manage': false,
    'system.config': false
  },

  // 兼职销售：类似销售但权限更受限
  part_time_sales: {
    'project.view': 'sales',
    'project.edit': 'sales',
    'project.create': true,
    'project.delete': false,
    'project.member.manage': false,
    'kpi.view': 'self',
    'kpi.view.self': true,
    'kpi.config': false,
    'finance.view': 'sales',
    'finance.edit': false,
    'customer.view': true,
    'customer.edit': false,
    'user.manage': false,
    'system.config': false
  },

  // 翻译：只能看分配的项目
  translator: {
    'project.view': 'assigned',         // 只看分配给我的项目
    'project.edit': false,
    'project.create': false,
    'project.delete': false,
    'project.member.manage': false,
    'kpi.view': 'self',
    'kpi.view.self': true,
    'kpi.config': false,
    'finance.view': false,
    'finance.edit': false,
    'customer.view': false,
    'customer.edit': false,
    'user.manage': false,
    'system.config': false
  },

  // 审校：只能看分配的项目
  reviewer: {
    'project.view': 'assigned',
    'project.edit': false,
    'project.create': false,
    'project.delete': false,
    'project.member.manage': false,
    'kpi.view': 'self',
    'kpi.view.self': true,
    'kpi.config': false,
    'finance.view': false,
    'finance.edit': false,
    'customer.view': false,
    'customer.edit': false,
    'user.manage': false,
    'system.config': false
  },

  // 排版：只能看分配的项目
  layout: {
    'project.view': 'assigned',
    'project.edit': false,
    'project.create': false,
    'project.delete': false,
    'project.member.manage': false,
    'kpi.view': 'self',
    'kpi.view.self': true,
    'kpi.config': false,
    'finance.view': false,
    'finance.edit': false,
    'customer.view': false,
    'customer.edit': false,
    'user.manage': false,
    'system.config': false
  },

  // 综合岗：类似PM但权限稍低
  admin_staff: {
    'project.view': 'all',
    'project.edit': true,
    'project.create': true,
    'project.delete': false,
    'project.member.manage': true,
    'kpi.view': 'all',
    'kpi.view.self': true,
    'kpi.config': false,
    'finance.view': false,
    'finance.edit': false,
    'customer.view': true,
    'customer.edit': true,
    'user.manage': false,
    'system.config': false
  }
};

// 角色优先级（用于默认角色选择）
const ROLE_PRIORITY = {
  'admin': 100,
  'finance': 90,
  'pm': 80,
  'admin_staff': 75,
  'sales': 70,
  'part_time_sales': 65,
  'reviewer': 50,
  'translator': 40,
  'layout': 30
};

// 角色显示名称
const ROLE_NAMES = {
  'admin': '管理员',
  'finance': '财务',
  'pm': '项目经理',
  'sales': '销售',
  'part_time_sales': '兼职销售',
  'translator': '翻译',
  'reviewer': '审校',
  'layout': '排版',
  'admin_staff': '综合岗'
};

// 检查权限
function hasPermission(role, permission) {
  if (!role || !PERMISSIONS[role]) {
    return false;
  }
  return PERMISSIONS[role][permission] !== undefined && PERMISSIONS[role][permission] !== false;
}

// 获取权限值
function getPermission(role, permission) {
  if (!role || !PERMISSIONS[role]) {
    return false;
  }
  return PERMISSIONS[role][permission] || false;
}

// 根据优先级选择默认角色
function getDefaultRole(userRoles) {
  if (!userRoles || userRoles.length === 0) {
    return null;
  }
  
  // 按优先级排序
  const sortedRoles = userRoles.sort((a, b) => {
    const priorityA = ROLE_PRIORITY[a] || 0;
    const priorityB = ROLE_PRIORITY[b] || 0;
    return priorityB - priorityA;
  });
  
  return sortedRoles[0];
}

module.exports = {
  PERMISSIONS,
  ROLE_PRIORITY,
  ROLE_NAMES,
  hasPermission,
  getPermission,
  getDefaultRole
};














