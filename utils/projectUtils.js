const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');

/**
 * 获取用户可访问的项目ID列表
 * 优化：合并查询，避免重复查询
 * @param {String} userId - 用户ID
 * @returns {Promise<Array>} 项目ID数组
 */
async function getUserProjectIds(userId) {
  // 并行查询，提高性能
  const [memberProjects, createdProjects] = await Promise.all([
    ProjectMember.find({ userId }).distinct('projectId'),
    Project.find({ createdBy: userId }).distinct('_id')
  ]);
  
  // 合并并去重
  const allProjectIds = [...new Set([
    ...memberProjects.map(id => id.toString()),
    ...createdProjects.map(id => id.toString())
  ])];
  
  return allProjectIds;
}

/**
 * 批量获取项目的成员信息
 * 优化：使用批量查询避免N+1问题
 * @param {Array} projectIds - 项目ID数组
 * @returns {Promise<Map>} Map<projectId, members[]>
 */
async function getProjectsMembers(projectIds) {
  if (!projectIds || projectIds.length === 0) {
    return new Map();
  }
  
  const members = await ProjectMember.find({
    projectId: { $in: projectIds }
  }).populate('userId', 'name username email roles');
  
  // 按项目ID分组
  const membersMap = new Map();
  members.forEach(member => {
    const projectId = member.projectId.toString();
    if (!membersMap.has(projectId)) {
      membersMap.set(projectId, []);
    }
    membersMap.get(projectId).push(member);
  });
  
  return membersMap;
}

module.exports = {
  getUserProjectIds,
  getProjectsMembers
};

