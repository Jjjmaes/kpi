const Role = require('../models/Role');
const { AppError } = require('../middleware/errorHandler');

/**
 * 验证角色是否允许用于KPI记录
 * @param {String} roleCode - 角色代码
 * @param {Boolean} throwError - 如果验证失败是否抛出错误（默认true）
 * @returns {Promise<Boolean>} - 如果角色允许用于KPI返回true，否则返回false或抛出错误
 */
async function validateKpiRole(roleCode, throwError = true) {
  if (!roleCode || typeof roleCode !== 'string') {
    if (throwError) {
      throw new AppError('角色代码无效', 400, 'VALIDATION_ERROR');
    }
    return false;
  }

  const role = await Role.findOne({ 
    code: roleCode.trim().toLowerCase(),
    isActive: true 
  });

  if (!role) {
    if (throwError) {
      throw new AppError(`角色 "${roleCode}" 不存在或已禁用`, 400, 'ROLE_NOT_FOUND');
    }
    return false;
  }

  if (!role.canBeKpiRole) {
    if (throwError) {
      throw new AppError(`角色 "${role.name}" (${roleCode}) 不允许用于KPI记录`, 400, 'ROLE_NOT_ALLOWED_FOR_KPI');
    }
    return false;
  }

  return true;
}

/**
 * 批量验证多个角色是否允许用于KPI记录
 * @param {Array<String>} roleCodes - 角色代码数组
 * @param {Boolean} throwError - 如果验证失败是否抛出错误（默认true）
 * @returns {Promise<Object>} - 返回验证结果对象 { valid: [...], invalid: [...] }
 */
async function validateKpiRoles(roleCodes, throwError = false) {
  if (!Array.isArray(roleCodes) || roleCodes.length === 0) {
    return { valid: [], invalid: [] };
  }

  const roles = await Role.find({
    code: { $in: roleCodes.map(code => code.trim().toLowerCase()) },
    isActive: true
  });

  const roleMap = {};
  roles.forEach(role => {
    roleMap[role.code] = role;
  });

  const valid = [];
  const invalid = [];

  for (const code of roleCodes) {
    const normalizedCode = code.trim().toLowerCase();
    const role = roleMap[normalizedCode];

    if (!role) {
      invalid.push({ code, reason: '角色不存在或已禁用' });
    } else if (!role.canBeKpiRole) {
      invalid.push({ code, reason: `角色 "${role.name}" 不允许用于KPI记录` });
    } else {
      valid.push(code);
    }
  }

  if (throwError && invalid.length > 0) {
    const errorMessages = invalid.map(item => `${item.code}: ${item.reason}`).join('; ');
    throw new AppError(`以下角色验证失败: ${errorMessages}`, 400, 'ROLE_VALIDATION_ERROR');
  }

  return { valid, invalid };
}

/**
 * 获取所有允许用于KPI记录的角色
 * @returns {Promise<Array>} - 返回角色对象数组
 */
async function getValidKpiRoles() {
  return await Role.find({
    isActive: true,
    canBeKpiRole: true
  }).sort({ priority: -1 });
}

module.exports = {
  validateKpiRole,
  validateKpiRoles,
  getValidKpiRoles
};





