const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const { AppError } = require('../middleware/errorHandler');

/**
 * 检查用户是否有权限访问项目
 * @param {String} projectId - 项目ID
 * @param {Object} user - 用户对象
 * @param {Array} userRoles - 用户角色数组
 * @returns {Promise<Object>} 项目对象
 * @throws {AppError} 如果项目不存在或无权访问
 */
async function checkProjectAccess(projectId, user, userRoles) {
  const project = await Project.findById(projectId);
  
  if (!project) {
    throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
  }
  
  // 管理员和财务可以访问所有项目
  if (userRoles.includes('admin') || userRoles.includes('finance')) {
    return project;
  }
  
  // 检查是否是项目创建者
  const isCreator = project.createdBy.toString() === user._id.toString();
  if (isCreator) {
    return project;
  }
  
  // 检查是否是项目成员
  const isMember = await ProjectMember.findOne({
    projectId: project._id,
    userId: user._id
  });
  
  if (isMember) {
    return project;
  }
  
  // 无权访问
  throw new AppError('无权访问此项目', 403, 'PROJECT_ACCESS_DENIED');
}

/**
 * 检查用户是否有权限修改项目
 * @param {Object} project - 项目对象
 * @param {Object} user - 用户对象
 * @param {Array} userRoles - 用户角色数组
 * @returns {Boolean} 是否有权限
 */
function canModifyProject(project, user, userRoles) {
  // 管理员始终可以修改
  if (userRoles.includes('admin')) {
    return true;
  }
  
  // 项目创建者可以修改
  const isCreator = project.createdBy.toString() === user._id.toString();
  if (isCreator) {
    return true;
  }
  
  // PM可以修改
  if (userRoles.includes('pm')) {
    return true;
  }
  
  return false;
}

/**
 * 检查用户是否有权限添加项目成员
 * @param {Object} project - 项目对象
 * @param {Object} user - 用户对象
 * @param {Array} userRoles - 用户角色数组
 * @returns {Boolean} 是否有权限
 */
function canAddMember(project, user, userRoles) {
  return canModifyProject(project, user, userRoles);
}

/**
 * 检查用户是否有权限删除项目成员
 * @param {Object} project - 项目对象
 * @param {Object} user - 用户对象
 * @param {Array} userRoles - 用户角色数组
 * @returns {Boolean} 是否有权限
 */
function canRemoveMember(project, user, userRoles) {
  return canModifyProject(project, user, userRoles);
}

/**
 * 检查用户是否有权限修改项目字段
 * @param {Object} project - 项目对象
 * @param {Object} user - 用户对象
 * @param {Array} userRoles - 用户角色数组
 * @param {String} field - 字段名
 * @returns {Boolean} 是否有权限
 */
function canEditProjectField(project, user, userRoles, field) {
  // 管理员可以修改所有字段
  if (userRoles.includes('admin')) {
    return true;
  }
  
  // 已完成的项目，非管理员不能修改
  if (project.status === 'completed') {
    return false;
  }
  
  // 项目创建者可以修改大部分字段
  const isCreator = project.createdBy.toString() === user._id.toString();
  
  // 某些字段只有管理员可以修改
  const adminOnlyFields = ['status', 'completedAt'];
  if (adminOnlyFields.includes(field) && !isCreator) {
    return false;
  }
  
  return canModifyProject(project, user, userRoles);
}

module.exports = {
  checkProjectAccess,
  canModifyProject,
  canAddMember,
  canRemoveMember,
  canEditProjectField
};

