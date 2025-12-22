const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const Role = require('../models/Role');
const User = require('../models/User');
const ProjectMember = require('../models/ProjectMember');
const KpiRecord = require('../models/KpiRecord');

// 所有路由需要认证
router.use(authenticate);

// 获取可用于项目成员的角色列表（所有已登录用户可见）
// 用于前端项目成员下拉框，避免非管理员无法获取角色列表
router.get('/project-member-roles', asyncHandler(async (req, res) => {
  const roles = await Role.find({ 
    isActive: true, 
    canBeProjectMember: true 
  }).sort({ priority: -1, createdAt: -1 });

  res.json({
    success: true,
    data: roles
  });
}));

// 获取所有角色列表（管理员可见）
router.get('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { includeInactive } = req.query;
  const query = includeInactive === 'true' ? {} : { isActive: true };
  
  const roles = await Role.find(query).sort({ priority: -1, createdAt: -1 });
  
  res.json({
    success: true,
    data: roles
  });
}));

// 获取单个角色详情
router.get('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  
  if (!role) {
    throw new AppError('角色不存在', 404, 'NOT_FOUND');
  }
  
  res.json({
    success: true,
    data: role
  });
}));

// 创建角色
router.post('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { code, name, description, priority, permissions, canBeProjectMember, canBeKpiRole } = req.body;
  
  // 验证必填字段
  if (!code || !name) {
    throw new AppError('角色代码和名称必填', 400, 'VALIDATION_ERROR');
  }
  
  // 验证代码格式
  if (!/^[a-z][a-z0-9_]*$/.test(code)) {
    throw new AppError('角色代码只能包含小写字母、数字和下划线，且必须以字母开头', 400, 'VALIDATION_ERROR');
  }
  
  // 检查代码是否已存在
  const existingRole = await Role.findOne({ code });
  if (existingRole) {
    throw new AppError('角色代码已存在', 400, 'DUPLICATE_ENTRY');
  }
  
  // permissions 直接使用对象，不需要转换为 Map
  const role = await Role.create({
    code,
    name,
    description: description || '',
    priority: priority || 0,
    permissions: permissions || {},
    canBeProjectMember: canBeProjectMember !== undefined ? canBeProjectMember : true,
    canBeKpiRole: canBeKpiRole !== undefined ? canBeKpiRole : true,
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  // 刷新权限缓存
  const { refreshPermissionsCache, clearCache } = require('../config/permissions');
  await refreshPermissionsCache();
  clearCache();
  
  res.status(201).json({
    success: true,
    data: role
  });
}));

// 更新角色
router.put('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const { name, description, priority, permissions, isActive, canBeProjectMember, canBeKpiRole } = req.body;
  
  console.log('[Roles] 更新角色请求:', req.params.id, { name, description, priority, permissions, isActive, canBeProjectMember, canBeKpiRole });
  
  const role = await Role.findById(req.params.id);
  if (!role) {
    throw new AppError('角色不存在', 404, 'NOT_FOUND');
  }
  
  // 系统内置角色不能修改代码和 isSystem 字段
  if (role.isSystem && req.body.code && req.body.code !== role.code) {
    throw new AppError('系统内置角色的代码不能修改', 400, 'INVALID_OPERATION');
  }
  
  // 更新字段
  if (name !== undefined) role.name = name;
  if (description !== undefined) role.description = description;
  if (priority !== undefined) role.priority = priority;
  if (isActive !== undefined) role.isActive = isActive;
  if (canBeProjectMember !== undefined) role.canBeProjectMember = canBeProjectMember;
  if (canBeKpiRole !== undefined) role.canBeKpiRole = canBeKpiRole;
  
  // 更新权限（直接使用对象）
  if (permissions !== undefined) {
    if (typeof permissions === 'object' && !Array.isArray(permissions)) {
      role.permissions = permissions;
    } else {
      console.warn('[Roles] 权限数据格式不正确:', permissions);
      throw new AppError('权限数据格式不正确', 400, 'VALIDATION_ERROR');
    }
  }
  
  role.updatedBy = req.user._id;
  
  try {
    await role.save();
    console.log('[Roles] 角色更新成功:', role.code);
  } catch (saveError) {
    console.error('[Roles] 保存角色失败:', saveError);
    throw new AppError('保存角色失败: ' + (saveError.message || '未知错误'), 400, 'SAVE_ERROR');
  }
  
  // 刷新权限缓存，使新配置立即生效
  const { refreshPermissionsCache } = require('../config/permissions');
  await refreshPermissionsCache();
  
  res.json({
    success: true,
    data: role
  });
}));

// 删除角色
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) {
    throw new AppError('角色不存在', 404, 'NOT_FOUND');
  }
  
  // 系统内置角色不能删除
  if (role.isSystem) {
    throw new AppError('系统内置角色不能删除，只能禁用', 400, 'INVALID_OPERATION');
  }
  
  // 检查是否有用户使用此角色
  const usersWithRole = await User.countDocuments({ roles: role.code });
  if (usersWithRole > 0) {
    throw new AppError(`有 ${usersWithRole} 个用户正在使用此角色，无法删除`, 400, 'IN_USE');
  }
  
  // 检查是否有项目成员使用此角色
  if (role.canBeProjectMember) {
    const projectMembersWithRole = await ProjectMember.countDocuments({ role: role.code });
    if (projectMembersWithRole > 0) {
      throw new AppError(`有 ${projectMembersWithRole} 条项目成员记录使用此角色，无法删除`, 400, 'IN_USE');
    }
  }
  
  // 检查是否有KPI记录使用此角色
  if (role.canBeKpiRole) {
    const kpiRecordsWithRole = await KpiRecord.countDocuments({ role: role.code });
    if (kpiRecordsWithRole > 0) {
      throw new AppError(`有 ${kpiRecordsWithRole} 条KPI记录使用此角色，无法删除`, 400, 'IN_USE');
    }
  }
  
  await Role.findByIdAndDelete(req.params.id);
  
  // 刷新权限缓存
  const { refreshPermissionsCache } = require('../config/permissions');
  await refreshPermissionsCache();
  
  res.json({
    success: true,
    message: '角色已删除'
  });
}));

// 获取角色使用统计
router.get('/:id/usage', authorize('admin'), asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) {
    throw new AppError('角色不存在', 404, 'NOT_FOUND');
  }
  
  const [userCount, projectMemberCount, kpiRecordCount] = await Promise.all([
    User.countDocuments({ roles: role.code }),
    role.canBeProjectMember ? ProjectMember.countDocuments({ role: role.code }) : Promise.resolve(0),
    role.canBeKpiRole ? KpiRecord.countDocuments({ role: role.code }) : Promise.resolve(0)
  ]);
  
  res.json({
    success: true,
    data: {
      userCount,
      projectMemberCount,
      kpiRecordCount
    }
  });
}));

module.exports = router;

