const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const KpiConfig = require('../models/KpiConfig');
const fs = require('fs').promises;
const path = require('path');

// 公共接口：获取机构信息（无需登录）
router.get('/public', async (req, res) => {
  try {
    const config = await KpiConfig.getActiveConfig();
    res.json({
      success: true,
      data: {
        companyName: config.companyName || '公司名称',
        companyAddress: config.companyAddress || '',
        companyContact: config.companyContact || '',
        companyPhone: config.companyPhone || '',
        companyEmail: config.companyEmail || ''
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 以下路由需要管理员权限
router.use(authenticate);
router.use(authorize('admin'));

// 获取当前KPI配置
router.get('/', async (req, res) => {
  try {
    const config = await KpiConfig.getActiveConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 更新KPI配置
router.post('/update', async (req, res) => {
  try {
    const {
      translator_ratio_mtpe,
      translator_ratio_deepedit,
      reviewer_ratio,
      pm_ratio,
      sales_bonus_ratio,
      sales_commission_ratio,
      admin_ratio,
      completion_factor,
      companyName,
      companyAddress,
      companyContact,
      companyPhone,
      companyEmail,
      roleRatios, // 新增：动态角色系数配置
      reason
    } = req.body;

    // 获取当前配置
    const currentConfig = await KpiConfig.getActiveConfig();
    
    // 保存旧值
    const oldValues = {
      translator_ratio_mtpe: currentConfig.translator_ratio_mtpe,
      translator_ratio_deepedit: currentConfig.translator_ratio_deepedit,
      reviewer_ratio: currentConfig.reviewer_ratio,
      pm_ratio: currentConfig.pm_ratio,
      sales_bonus_ratio: currentConfig.sales_bonus_ratio,
      sales_commission_ratio: currentConfig.sales_commission_ratio,
      admin_ratio: currentConfig.admin_ratio,
      completion_factor: currentConfig.completion_factor,
      companyName: currentConfig.companyName,
      companyAddress: currentConfig.companyAddress,
      companyContact: currentConfig.companyContact,
      companyPhone: currentConfig.companyPhone,
      companyEmail: currentConfig.companyEmail
    };

    // 更新配置
    if (translator_ratio_mtpe !== undefined) currentConfig.translator_ratio_mtpe = translator_ratio_mtpe;
    if (translator_ratio_deepedit !== undefined) currentConfig.translator_ratio_deepedit = translator_ratio_deepedit;
    if (reviewer_ratio !== undefined) currentConfig.reviewer_ratio = reviewer_ratio;
    if (pm_ratio !== undefined) currentConfig.pm_ratio = pm_ratio;
    if (sales_bonus_ratio !== undefined) currentConfig.sales_bonus_ratio = sales_bonus_ratio;
    if (sales_commission_ratio !== undefined) currentConfig.sales_commission_ratio = sales_commission_ratio;
    if (admin_ratio !== undefined) currentConfig.admin_ratio = admin_ratio;
    if (completion_factor !== undefined) currentConfig.completion_factor = completion_factor;
    if (companyName !== undefined) currentConfig.companyName = companyName;
    if (companyAddress !== undefined) currentConfig.companyAddress = companyAddress;
    if (companyContact !== undefined) currentConfig.companyContact = companyContact;
    if (companyPhone !== undefined) currentConfig.companyPhone = companyPhone;
    if (companyEmail !== undefined) currentConfig.companyEmail = companyEmail;
    // 更新动态角色系数配置
    if (roleRatios !== undefined && typeof roleRatios === 'object') {
      currentConfig.roleRatios = roleRatios;
    }

    currentConfig.version += 1;
    currentConfig.updatedAt = Date.now();

    // 记录变更历史
    currentConfig.changeHistory.push({
      changedBy: req.user._id,
      changedAt: Date.now(),
      oldValues,
      newValues: {
        translator_ratio_mtpe: currentConfig.translator_ratio_mtpe,
        translator_ratio_deepedit: currentConfig.translator_ratio_deepedit,
        reviewer_ratio: currentConfig.reviewer_ratio,
        pm_ratio: currentConfig.pm_ratio,
        sales_bonus_ratio: currentConfig.sales_bonus_ratio,
        sales_commission_ratio: currentConfig.sales_commission_ratio,
        admin_ratio: currentConfig.admin_ratio,
        completion_factor: currentConfig.completion_factor,
        companyName: currentConfig.companyName,
        companyAddress: currentConfig.companyAddress,
        companyContact: currentConfig.companyContact,
        companyPhone: currentConfig.companyPhone,
        companyEmail: currentConfig.companyEmail,
        roleRatios: currentConfig.roleRatios
      },
      reason: reason || '未提供原因'
    });

    await currentConfig.save();

    res.json({
      success: true,
      message: '配置更新成功',
      data: currentConfig
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 获取配置变更历史
router.get('/history', async (req, res) => {
  try {
    const config = await KpiConfig.getActiveConfig();
    const history = config.changeHistory || [];
    
    // 填充变更人信息
    const User = require('../models/User');
    const historyWithUsers = await Promise.all(
      history.map(async (item) => {
        const user = await User.findById(item.changedBy).select('name username');
        return {
          ...item.toObject(),
          changedByUser: user
        };
      })
    );

    res.json({
      success: true,
      data: historyWithUsers.reverse() // 最新的在前
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 获取权限配置（从数据库读取）
router.get('/permissions', async (req, res) => {
  try {
    // 从数据库读取权限配置
    const { getPermissions, getRoleNames } = require('../config/permissions');
    const permissions = await getPermissions();
    const roleNames = await getRoleNames();
    
    res.json({
      success: true,
      data: {
        permissions: permissions || {},
        roleNames: roleNames || {}
      }
    });
  } catch (error) {
    console.error('[Config] 获取权限配置失败:', error);
    // 如果数据库未初始化，尝试使用默认配置
    try {
      const { getDefaultPermissions } = require('../config/permissions');
      const defaultPerms = getDefaultPermissions();
      res.json({
        success: true,
        data: {
          permissions: defaultPerms.permissions || {},
          roleNames: defaultPerms.names || {}
        }
      });
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }
});

// 更新权限配置
router.put('/permissions', async (req, res) => {
  try {
    const { permissions, reason } = req.body;
    
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({
        success: false,
        message: '权限数据格式错误'
      });
    }

    // 读取当前权限配置文件
    const configPath = path.join(__dirname, '../config/permissions.js');
    let configContent = await fs.readFile(configPath, 'utf-8');

    // 验证权限数据格式
    const { PERMISSIONS: currentPermissions, ROLE_NAMES } = require('../config/permissions');
    const validRoles = Object.keys(currentPermissions);
    const validPermissionKeys = new Set();
    validRoles.forEach(role => {
      Object.keys(currentPermissions[role] || {}).forEach(key => validPermissionKeys.add(key));
    });

    // 验证并更新权限
    const updatedPermissions = {};
    for (const role of validRoles) {
      if (!permissions[role]) {
        updatedPermissions[role] = currentPermissions[role];
        continue;
      }
      
      updatedPermissions[role] = {};
      for (const permKey of validPermissionKeys) {
        const newValue = permissions[role][permKey];
        // 验证值类型：true, false, 'all', 'sales', 'assigned', 'self'
        if (newValue === true || newValue === false || 
            newValue === 'all' || newValue === 'sales' || 
            newValue === 'assigned' || newValue === 'self') {
          updatedPermissions[role][permKey] = newValue;
        } else {
          // 保持原值
          updatedPermissions[role][permKey] = currentPermissions[role]?.[permKey] || false;
        }
      }
    }

    // 生成新的配置文件内容
    let newConfigContent = `// 权限表配置
// 定义每个角色可以访问的功能和权限范围
// 最后更新：${new Date().toISOString()}
// 更新原因：${reason || '未提供原因'}
// 更新人：${req.user.name || req.user.username}

const PERMISSIONS = ${JSON.stringify(updatedPermissions, null, 2).replace(/"([^"]+)":/g, "'$1':")};

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
const ROLE_NAMES = ${JSON.stringify(ROLE_NAMES, null, 2).replace(/"([^"]+)":/g, "'$1':")};

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
`;

    // 备份原文件
    const backupPath = path.join(__dirname, '../config/permissions.js.backup');
    await fs.copyFile(configPath, backupPath);

    // 写入新配置
    await fs.writeFile(configPath, newConfigContent, 'utf-8');

    // 清除 require 缓存，使新配置生效
    delete require.cache[require.resolve('../config/permissions')];

    res.json({
      success: true,
      message: '权限配置更新成功，已备份原配置文件',
      data: {
        permissions: updatedPermissions
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 获取所有可用于KPI的角色及其系数配置
router.get('/kpi-roles', async (req, res) => {
  try {
    const Role = require('../models/Role');
    const config = await KpiConfig.getActiveConfig();
    
    // 获取所有允许用于KPI的角色
    const roles = await Role.find({
      isActive: true,
      canBeKpiRole: true
    }).sort({ priority: -1 });
    
    // 构建角色及其系数配置（包含完整的角色字段用于前端过滤）
    const roleConfigs = roles.map(role => {
      const roleRatios = config.roleRatios || {};
      const roleConfig = roleRatios[role.code] || {};
      
      return {
        code: role.code,
        name: role.name,
        description: role.description,
        // 从固定字段或动态配置中获取系数
        ratio: config.getRoleRatio(role.code, 'base'),
        // 完整的角色配置（如果有）
        ratioConfig: roleConfig,
        // 包含完整的角色字段用于前端过滤
        isSystem: role.isSystem || false,
        isFixedRole: role.isFixedRole || false,
        isSpecialRole: role.isSpecialRole || false,
        canBeKpiRole: role.canBeKpiRole !== undefined ? role.canBeKpiRole : true,
        isActive: role.isActive !== undefined ? role.isActive : true
      };
    });
    
    res.json({
      success: true,
      data: roleConfigs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 更新特定角色的KPI系数配置
router.put('/kpi-roles/:roleCode', async (req, res) => {
  try {
    const { roleCode } = req.params;
    const { ratio, ratioConfig } = req.body;
    
    // 验证角色是否存在且允许用于KPI
    const Role = require('../models/Role');
    const role = await Role.findOne({
      code: roleCode,
      isActive: true,
      canBeKpiRole: true
    });
    
    if (!role) {
      return res.status(400).json({
        success: false,
        message: '角色不存在或不允许用于KPI'
      });
    }
    
    const config = await KpiConfig.getActiveConfig();
    const roleRatios = config.roleRatios || {};
    
    // 更新角色系数配置
    if (ratioConfig !== undefined && typeof ratioConfig === 'object') {
      roleRatios[roleCode] = ratioConfig;
    } else if (ratio !== undefined) {
      // 如果只提供了单个ratio值，作为base系数
      roleRatios[roleCode] = { base: ratio };
    } else {
      return res.status(400).json({
        success: false,
        message: '请提供ratio或ratioConfig参数'
      });
    }
    
    config.roleRatios = roleRatios;
    config.version += 1;
    config.updatedAt = Date.now();
    
    // 记录变更历史
    config.changeHistory.push({
      changedBy: req.user._id,
      changedAt: Date.now(),
      oldValues: {},
      newValues: { roleRatios: { [roleCode]: roleRatios[roleCode] } },
      reason: `更新角色 ${role.name} (${roleCode}) 的KPI系数配置`
    });
    
    await config.save();
    
    res.json({
      success: true,
      message: `角色 ${role.name} 的KPI系数配置已更新`,
      data: {
        code: roleCode,
        name: role.name,
        ratioConfig: roleRatios[roleCode]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;





















