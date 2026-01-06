/**
 * 统一权限检查工具
 * 提供统一的权限检查函数，避免代码重复
 * 
 * 使用方式：
 * const { isAdmin, isFinance, canViewAllProjects } = require('../utils/permissionChecker');
 * if (isAdmin(req)) { ... }
 */

const { getCurrentPermission } = require('../middleware/auth');

/**
 * 检查是否为管理员角色
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function isAdmin(req) {
  return req.currentRole === 'admin';
}

/**
 * 检查是否为财务角色
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function isFinance(req) {
  return req.currentRole === 'finance';
}

/**
 * 检查是否为销售角色（包括客户经理）
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function isSales(req) {
  return req.currentRole === 'sales' || req.currentRole === 'part_time_sales';
}

/**
 * 检查是否为客户经理角色
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function isPartTimeSales(req) {
  return req.currentRole === 'part_time_sales';
}

/**
 * 检查是否为PM角色
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function isPM(req) {
  return req.currentRole === 'pm';
}

/**
 * 检查是否为综合岗（admin_staff）或管理员
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function isAdminStaff(req) {
  if (!req || !req.user) {
    return false;
  }
  // 严格基于当前角色判断，不检查所有角色
  return req.currentRole === 'admin_staff' || req.currentRole === 'admin';
}

/**
 * 检查是否为管理员或财务角色
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function isAdminOrFinance(req) {
  return isAdmin(req) || isFinance(req);
}

/**
 * 检查是否为管理员、财务或PM角色
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function isAdminOrFinanceOrPM(req) {
  return isAdmin(req) || isFinance(req) || isPM(req);
}

/**
 * 检查是否为“仅交付/执行”用户 —— 不能看到客户详细信息（名称、邮箱、电话）
 * 业务要求：项目经理、专/兼职翻译、专/兼职排版、审校都不该看到客户信息
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function isDeliveryOnlyUser(req) {
  const currentRole = req.currentRole;
  if (currentRole) {
    // 所有执行类角色（包括PM）视为仅交付
    const restricted = ['pm', 'translator', 'reviewer', 'layout', 'part_time_translator'];
    return restricted.includes(currentRole);
  }
  // 向后兼容：基于所有角色判断
  const roles = req.user?.roles || [];
  const restricted = ['pm', 'translator', 'reviewer', 'layout', 'part_time_translator'];
  const privileged = ['admin', 'finance', 'sales', 'part_time_sales', 'admin_staff'];
  const hasRestricted = roles.some(r => restricted.includes(r));
  const hasPrivileged = roles.some(r => privileged.includes(r));
  return hasRestricted && !hasPrivileged;
}

/**
 * 检查是否可以查看所有项目
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function canViewAllProjects(req) {
  return getCurrentPermission(req, 'project.view') === 'all';
}

/**
 * 检查是否可以查看所有KPI
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function canViewAllKPI(req) {
  return getCurrentPermission(req, 'kpi.view') === 'all';
}

/**
 * 检查是否可以查看所有财务数据
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function canViewAllFinance(req) {
  const financeViewPerm = getCurrentPermission(req, 'finance.view');
  return financeViewPerm === true || financeViewPerm === 'all';
}

/**
 * 检查是否可以管理财务（仅财务/管理员）
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function canManageFinance(req) {
  return isAdminOrFinance(req);
}

/**
 * 检查是否可以查看项目金额（成交额）
 * 管理员、财务、销售和客户经理可以查看
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function canViewAmount(req) {
  return isAdmin(req) || isFinance(req) || isSales(req);
}

/**
 * 检查是否可以修改项目
 * 管理员或纯销售（不含PM身份的销售）可修改
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function canModifyProject(req) {
  if (isAdmin(req)) return true;
  if (isSales(req) && !isPM(req)) return true;
  return false;
}

/**
 * 检查是否可以删除项目
 * 管理员或纯销售（不含PM身份的销售）可删除
 * @param {Object} req - Express请求对象
 * @returns {Boolean}
 */
function canDeleteProject(req) {
  return canModifyProject(req);
}

/**
 * 检查是否为项目创建者
 * @param {Object} req - Express请求对象
 * @param {Object|String} project - 项目对象或项目ID
 * @returns {Boolean}
 */
function isProjectCreator(req, project) {
  if (!project) return false;
  const createdById = project.createdBy?._id ? project.createdBy._id.toString() : 
                      (project.createdBy ? project.createdBy.toString() : null);
  return createdById === req.user._id.toString();
}

/**
 * 检查是否为项目成员
 * @param {Object} req - Express请求对象
 * @param {String} projectId - 项目ID
 * @returns {Promise<Boolean>}
 */
async function isProjectMember(req, projectId) {
  if (!projectId) return false;
  const ProjectMember = require('../models/ProjectMember');
  const member = await ProjectMember.findOne({ 
    projectId, 
    userId: req.user._id 
  });
  return !!member;
}

/**
 * 检查是否可以查看项目
 * 管理员/财务/PM可以查看所有项目，销售可以查看自己创建的项目，成员可以查看分配的项目
 * @param {Object} req - Express请求对象
 * @param {Object} project - 项目对象
 * @returns {Promise<Boolean>}
 */
async function canViewProject(req, project) {
  if (!project) return false;
  
  // 管理员、财务、PM可以查看所有项目
  if (canViewAllProjects(req)) return true;
  
  // 销售可以查看自己创建的项目
  if (isSales(req) && isProjectCreator(req, project)) return true;
  
  // 成员可以查看分配的项目
  const projectId = project._id ? project._id.toString() : project.toString();
  return await isProjectMember(req, projectId);
}

module.exports = {
  // 角色检查
  isAdmin,
  isFinance,
  isSales,
  isPartTimeSales,
  isPM,
  isAdminStaff,
  isAdminOrFinance,
  isAdminOrFinanceOrPM,
  isDeliveryOnlyUser,
  
  // 权限检查
  canViewAllProjects,
  canViewAllKPI,
  canViewAllFinance,
  canManageFinance,
  canViewAmount,
  canModifyProject,
  canDeleteProject,
  
  // 项目相关检查
  isProjectCreator,
  isProjectMember,
  canViewProject
};

