require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/Role');

// 默认角色配置（从 config/permissions.js 迁移）
const defaultRoles = [
  {
    code: 'admin',
    name: '管理员',
    description: '系统管理员，拥有所有权限',
    priority: 100,
    isSystem: true,
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
    code: 'pm',
    name: '项目经理',
    description: '项目经理，可创建和管理项目',
    priority: 80,
    isSystem: true,
    permissions: {
      // 只查看“分配给自己”的项目（包括自己作为 PM 成员的项目）
      'project.view': 'assigned',
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
      'customer.edit': true,
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
  },
  {
    code: 'sales',
    name: '销售',
    description: '销售人员，可创建和管理自己的项目',
    priority: 70,
    isSystem: true,
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
    code: 'part_time_sales',
    name: '兼职销售',
    description: '兼职销售人员',
    priority: 65,
    isSystem: true,
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
    code: 'translator',
    name: '翻译',
    description: '翻译人员',
    priority: 40,
    isSystem: true,
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
  }
];

async function initRoles() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi_system');
    console.log('✅ 已连接到 MongoDB');

    // 检查是否已有角色数据
    const existingRoles = await Role.countDocuments();
    if (existingRoles > 0) {
      console.log(`⚠️  数据库中已有 ${existingRoles} 个角色，将跳过初始化`);
      console.log('   如需重新初始化，请先清空 roles 集合');
      process.exit(0);
    }

    // 创建默认角色
    console.log('📝 开始创建默认角色...');
    for (const roleData of defaultRoles) {
      const role = await Role.create({
        ...roleData,
        permissions: roleData.permissions || {}
      });
      console.log(`   ✅ 创建角色: ${role.name} (${role.code})`);
    }

    console.log(`\n✅ 成功初始化 ${defaultRoles.length} 个默认角色`);
    process.exit(0);
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    process.exit(1);
  }
}

initRoles();

