/**
 * 初始化/修正角色权限配置表（roles 集合）
 * - 以 config/permissions.js 的默认配置为基准
 * - 对每个默认角色执行 upsert，确保核心权限与优先级一致
 * - 不会删除已有自定义角色
 *
 * 运行：
 *   MONGODB_URI="mongodb://localhost:27017/kpi_system" node scripts/initPermissions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/Role');
const { getDefaultPermissions } = require('../config/permissions');

async function main() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi_system';
  await mongoose.connect(mongoUri);
  console.log(`✅ Connected to MongoDB: ${mongoUri}`);

  const defaults = getDefaultPermissions();
  const permMap = defaults.permissions || {};
  const priorityMap = defaults.priority || {};
  const nameMap = defaults.names || {};

  const codes = Object.keys(permMap);
  let created = 0;
  let updated = 0;

  for (const code of codes) {
    const permissions = permMap[code] || {};
    const priority = priorityMap[code] ?? 0;
    const name = nameMap[code] || code;

    const payload = {
      code,
      name,
      description: `${name}（系统默认角色）`,
      priority,
      permissions,
      isActive: true,
      isSystem: true
    };

    const result = await Role.updateOne(
      { code },
      { $set: payload, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    if (result.upsertedCount && result.upsertedCount > 0) {
      created += 1;
      console.log(`➕ created role: ${code}`);
    } else if (result.modifiedCount && result.modifiedCount > 0) {
      updated += 1;
      console.log(`♻️  updated role: ${code}`);
    } else {
      console.log(`✔️  unchanged role: ${code}`);
    }
  }

  console.log(`\nDone. created=${created}, updated=${updated}, total default roles=${codes.length}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ init permissions failed:', err);
  process.exit(1);
});

