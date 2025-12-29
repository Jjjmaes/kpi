/**
 * 初始化基础角色脚本
 *
 * 角色列表：
 * - admin        管理员
 * - finance      财务
 * - sales        销售
 * - translator   翻译
 * - reviewer     审校
 * - layout       排版
 * - admin_staff  综合岗
 *
 * 使用方式：
 *   node scripts/initBasicRoles.js
 *
 * 特点：
 * - 使用 upsert（有则更新，无则创建），可安全多次执行
 * - 只影响以上基础角色，不修改其他自定义角色
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/Role');

// 基础角色配置（与 initRoles.js 中保持一致）
const basicRoles = [
  {
    code: 'admin',
    name: '管理员',
    description: '系统管理员，拥有所有权限',
    priority: 100,
    isSystem: true,
    isManagementRole: true,
    isFixedRole: false,
    isSpecialRole: false,
    canRecordCapacity: false,
    canBeEvaluator: false,
    canBeEvaluated: false,
    canBeProjectMember: false,
    canBeKpiRole: false,
    permissions: {
      'project.view': 'all',
      'project.edit': 'all',
      'project.create': true,
      'project.delete': true,
      'project.member.manage': true,
      'kpi.view': 'all',
      'kpi.view.self': true,
      'kpi.config': true,
      'finance.view': true,
      'finance.edit': true,
      'customer.view': true,
      'customer.edit': true,
      'user.manage': true,
      'system.config': true,
      'role.manage': true
    }
  },
  {
    code: 'finance',
    name: '财务',
    description: '财务人员，可查看和编辑财务相关数据',
    priority: 90,
    isSystem: true,
    isManagementRole: true,
    isFixedRole: true,
    isSpecialRole: false,
    canRecordCapacity: false,
    canBeEvaluator: false,
    canBeEvaluated: false,
    canBeProjectMember: false,
    canBeKpiRole: true,
    permissions: {
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
    }
  },
  {
    code: 'sales',
    name: '销售',
    description: '销售人员，可创建和管理自己的项目',
    priority: 70,
    isSystem: true,
    isManagementRole: true,
    isFixedRole: true,
    isSpecialRole: false,
    canRecordCapacity: false,
    canBeEvaluator: false,
    canBeEvaluated: true,
    canBeProjectMember: true,
    canBeKpiRole: true,
    permissions: {
      'project.view': 'sales',
      'project.edit': 'sales',
      'project.create': true,
      'project.delete': false,
      'project.member.manage': false,
      'kpi.view': 'self',
      'kpi.view.self': true,
      'kpi.config': false,
      'finance.view': false,
      'finance.edit': false,
      'customer.view': true,
      'customer.edit': true,
      'user.manage': false,
      'system.config': false
    }
  },
  {
    code: 'translator',
    name: '翻译',
    description: '翻译人员',
    priority: 40,
    isSystem: true,
    isManagementRole: false,
    isFixedRole: true,
    isSpecialRole: false,
    canRecordCapacity: true,
    canBeEvaluator: true,
    canBeEvaluated: false,
    canBeProjectMember: true,
    canBeKpiRole: true,
    permissions: {
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
    }
  },
  {
    code: 'reviewer',
    name: '审校',
    description: '审校人员',
    priority: 50,
    isSystem: true,
    isManagementRole: false,
    isFixedRole: true,
    isSpecialRole: false,
    canRecordCapacity: true,
    canBeEvaluator: true,
    canBeEvaluated: false,
    canBeProjectMember: true,
    canBeKpiRole: true,
    permissions: {
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
    }
  },
  {
    code: 'layout',
    name: '排版',
    description: '排版人员',
    priority: 30,
    isSystem: true,
    isManagementRole: false,
    isFixedRole: false,
    isSpecialRole: true,
    canRecordCapacity: false,
    canBeEvaluator: true,
    canBeEvaluated: false,
    canBeProjectMember: true,
    canBeKpiRole: true,
    permissions: {
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
    }
  },
  {
    code: 'admin_staff',
    name: '综合岗',
    description: '综合岗人员',
    priority: 75,
    isSystem: true,
    isManagementRole: true,
    isFixedRole: true,
    isSpecialRole: false,
    canRecordCapacity: false,
    canBeEvaluator: false,
    canBeEvaluated: false,
    canBeProjectMember: true,
    canBeKpiRole: true,
    permissions: {
      'project.view': 'all',
      'project.edit': false,
      'project.create': true,
      'project.delete': false,
      'project.member.manage': true,
      'kpi.view': 'self',
      'kpi.view.self': true,
      'kpi.config': false,
      'finance.view': false,
      'finance.edit': false,
      'customer.view': false,
      'customer.edit': false,
      'user.manage': false,
      'system.config': false
    }
  }
];

async function initBasicRoles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi_system');
    console.log('✅ 已连接到 MongoDB');

    for (const roleData of basicRoles) {
      const { code, ...rest } = roleData;
      const result = await Role.findOneAndUpdate(
        { code },
        {
          $set: {
            ...rest,
            permissions: rest.permissions || {}
          }
        },
        {
          upsert: true,
          new: true
        }
      );
      console.log(`✅ 角色已创建/更新: ${result.name} (${result.code})`);
    }

    console.log('\n✅ 基础角色初始化完成');
    process.exit(0);
  } catch (error) {
    console.error('❌ 初始化基础角色失败:', error);
    process.exit(1);
  }
}

initBasicRoles();


