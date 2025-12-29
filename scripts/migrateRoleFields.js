/**
 * 数据迁移脚本：为现有角色添加新字段
 * 
 * 运行方式：
 * node scripts/migrateRoleFields.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/Role');

// 管理角色列表（用于设置isManagementRole）
const managementRoles = ['admin', 'finance', 'pm', 'admin_staff', 'sales', 'part_time_sales'];

// 固定角色列表（用于设置isFixedRole）
const fixedRoles = ['translator', 'reviewer', 'pm', 'sales', 'admin_staff', 'finance'];

// 特殊角色列表（用于设置isSpecialRole）
const specialRoles = ['part_time_sales', 'part_time_translator', 'layout'];

// 可以记录产能的角色（用于设置canRecordCapacity）
const capacityRoles = ['translator', 'reviewer'];

// 可以作为评价人的角色（用于设置canBeEvaluator）
const evaluatorRoles = ['pm', 'translator', 'reviewer', 'layout'];

// 可以被评价的角色（用于设置canBeEvaluated）
const evaluatedRoles = ['sales', 'part_time_sales', 'pm'];

async function migrateRoleFields() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi_system');
    console.log('✅ 已连接到 MongoDB');

    // 获取所有角色
    const roles = await Role.find({});
    console.log(`📋 找到 ${roles.length} 个角色，开始迁移...`);

    let updatedCount = 0;

    for (const role of roles) {
      const updates = {};
      let needsUpdate = false;

      // 设置 isManagementRole
      if (role.isManagementRole === undefined) {
        updates.isManagementRole = managementRoles.includes(role.code);
        needsUpdate = true;
      }

      // 设置 isFixedRole
      if (role.isFixedRole === undefined) {
        updates.isFixedRole = fixedRoles.includes(role.code);
        needsUpdate = true;
      }

      // 设置 isSpecialRole
      if (role.isSpecialRole === undefined) {
        updates.isSpecialRole = specialRoles.includes(role.code);
        needsUpdate = true;
      }

      // 设置 canRecordCapacity
      if (role.canRecordCapacity === undefined) {
        updates.canRecordCapacity = capacityRoles.includes(role.code);
        needsUpdate = true;
      }

      // 设置 canBeEvaluator
      if (role.canBeEvaluator === undefined) {
        updates.canBeEvaluator = evaluatorRoles.includes(role.code);
        needsUpdate = true;
      }

      // 设置 canBeEvaluated
      if (role.canBeEvaluated === undefined) {
        updates.canBeEvaluated = evaluatedRoles.includes(role.code);
        needsUpdate = true;
      }

      if (needsUpdate) {
        await Role.updateOne(
          { _id: role._id },
          { $set: updates }
        );
        console.log(`   ✅ 更新角色: ${role.name} (${role.code})`);
        console.log(`      更新字段: ${Object.keys(updates).join(', ')}`);
        updatedCount++;
      } else {
        console.log(`   ⏭️  跳过角色: ${role.name} (${role.code}) - 字段已存在`);
      }
    }

    console.log(`\n✅ 迁移完成！共更新 ${updatedCount} 个角色`);
    process.exit(0);
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  }
}

migrateRoleFields();


