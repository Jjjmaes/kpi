const ProjectEvaluation = require('../models/ProjectEvaluation');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const { AppError } = require('../middleware/errorHandler');

/**
 * 评价服务层
 */
class EvaluationService {
  /**
   * 检查是否可以评价
   * @param {String} projectId - 项目ID
   * @param {Object} evaluator - 评价人
   * @param {String} evaluationType - 评价类型
   * @returns {Promise<Object>} 检查结果和可评价的用户列表
   */
  async checkEvaluationEligibility(projectId, evaluator, evaluationType) {
    const project = await Project.findById(projectId)
      .populate('createdBy', 'name roles');
    
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    // 项目必须已完成
    if (project.status !== 'completed') {
      throw new AppError('项目尚未完成，无法评价', 400, 'PROJECT_NOT_COMPLETED');
    }

    // 检查时间限制：项目完成后30天内可评价
    const completedAt = project.completedAt || project.updatedAt;
    if (!completedAt) {
      throw new AppError('项目完成时间未记录', 400, 'INVALID_COMPLETION_TIME');
    }

    const daysSinceCompletion = Math.floor((new Date() - completedAt) / (1000 * 60 * 60 * 24));
    if (daysSinceCompletion > 30) {
      throw new AppError('评价时间已过期（项目完成后30天内可评价）', 400, 'EVALUATION_EXPIRED');
    }

    let eligibleUsers = [];

    if (evaluationType === 'pm_to_sales') {
      // PM评价销售：评价项目创建人（销售）
      // 检查用户是否有PM角色（不仅是项目成员，只要用户有PM角色就可以评价）
      const hasPMRole = evaluator.roles && evaluator.roles.includes('pm');
      if (!hasPMRole) {
        throw new AppError('只有项目经理可以评价销售', 403, 'INVALID_EVALUATOR_ROLE');
      }

      const salesId = project.createdBy?._id || project.createdBy;
      if (!salesId) {
        throw new AppError('项目创建人信息缺失', 400, 'MISSING_CREATOR');
      }

      // 不能评价自己
      if (salesId.toString() === evaluator._id.toString()) {
        throw new AppError('不能评价自己', 400, 'CANNOT_EVALUATE_SELF');
      }

      eligibleUsers = [{
        userId: salesId,
        role: project.createdBy?.roles?.includes('part_time_sales') ? 'part_time_sales' : 'sales',
        name: project.createdBy?.name || '未知'
      }];
    } else if (evaluationType === 'executor_to_pm') {
      // 执行人员评价PM：评价项目中的PM成员
      // 检查评价人是否是项目成员（执行人员必须是项目成员才能评价）
      const evaluatorMember = await ProjectMember.findOne({
        projectId: project._id,
        userId: evaluator._id
      });

      if (!evaluatorMember) {
        throw new AppError('您不是该项目成员，无法评价', 403, 'NOT_PROJECT_MEMBER');
      }

      const executorRoles = ['translator', 'reviewer', 'layout'];
      if (!executorRoles.includes(evaluatorMember.role)) {
        throw new AppError('只有翻译、审校、排版可以评价项目经理', 403, 'INVALID_EVALUATOR_ROLE');
      }

      // 查找项目中的PM成员
      const pmMembers = await ProjectMember.find({
        projectId: project._id,
        role: 'pm'
      }).populate('userId', 'name roles');

      eligibleUsers = pmMembers
        .filter(m => m.userId && m.userId._id.toString() !== evaluator._id.toString())
        .map(m => ({
          userId: m.userId._id,
          role: 'pm',
          name: m.userId.name
        }));
    } else {
      throw new AppError('无效的评价类型', 400, 'INVALID_EVALUATION_TYPE');
    }

    // 检查是否已评价
    const existingEvaluations = await ProjectEvaluation.find({
      projectId: project._id,
      evaluatorId: evaluator._id,
      evaluationType
    });

    const evaluatedUserIds = existingEvaluations.map(e => e.evaluatedUserId.toString());
    eligibleUsers = eligibleUsers.filter(u => !evaluatedUserIds.includes(u.userId.toString()));

    return {
      canEvaluate: eligibleUsers.length > 0,
      eligibleUsers,
      project: {
        id: project._id,
        name: project.projectName,
        completedAt: project.completedAt,
        daysSinceCompletion
      }
    };
  }

  /**
   * 创建评价
   * @param {String} projectId - 项目ID
   * @param {Object} evaluator - 评价人
   * @param {Object} evaluationData - 评价数据
   * @returns {Promise<Object>} 创建的评价
   */
  async createEvaluation(projectId, evaluator, evaluationData) {
    const { evaluatedUserId, evaluationType, scores, comments, isAnonymous } = evaluationData;

    // 先检查评价资格
    const eligibility = await this.checkEvaluationEligibility(projectId, evaluator, evaluationType);
    
    // 验证被评价人是否在可评价列表中
    const eligibleUser = eligibility.eligibleUsers.find(
      u => u.userId.toString() === evaluatedUserId
    );

    if (!eligibleUser) {
      throw new AppError('被评价人不在可评价列表中', 400, 'INVALID_EVALUATED_USER');
    }

    // 检查是否已评价过
    const existing = await ProjectEvaluation.findOne({
      projectId,
      evaluatorId: evaluator._id,
      evaluatedUserId,
      evaluationType
    });

    if (existing) {
      throw new AppError('您已经评价过该用户', 400, 'ALREADY_EVALUATED');
    }

    // 验证评分
    const requiredScores = evaluationType === 'pm_to_sales' 
      ? ['informationCompleteness', 'communicationQuality', 'problemSolving', 'overallSatisfaction']
      : ['projectManagement', 'communicationQuality', 'technicalSupport', 'overallSatisfaction'];

    for (const scoreKey of requiredScores) {
      if (!scores[scoreKey] || scores[scoreKey] < 1 || scores[scoreKey] > 5) {
        throw new AppError(`评分 ${scoreKey} 无效，必须在1-5分之间`, 400, 'INVALID_SCORE');
      }
    }

    // 获取评价人角色
    // 对于PM评价销售，使用用户的PM角色；对于执行人员评价PM，使用项目成员角色
    let evaluatorRole;
    if (evaluationType === 'pm_to_sales') {
      evaluatorRole = 'pm'; // PM评价销售时，使用PM角色
    } else {
      const evaluatorMember = await ProjectMember.findOne({
        projectId,
        userId: evaluator._id
      });
      if (!evaluatorMember) {
        throw new AppError('评价人不是项目成员', 400, 'NOT_PROJECT_MEMBER');
      }
      evaluatorRole = evaluatorMember.role;
    }

    // 创建评价
    const evaluation = await ProjectEvaluation.create({
      projectId,
      evaluatorId: evaluator._id,
      evaluatorRole: evaluatorRole,
      evaluatedUserId,
      evaluatedRole: eligibleUser.role,
      evaluationType,
      scores,
      comments: comments || undefined,
      isAnonymous: isAnonymous !== false, // 默认匿名
      evaluatedAt: new Date()
    });

    return evaluation;
  }

  /**
   * 获取项目的评价列表
   * @param {String} projectId - 项目ID
   * @param {Object} requester - 请求人
   * @returns {Promise<Array>} 评价列表
   */
  async getProjectEvaluations(projectId, requester) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('项目不存在', 404, 'PROJECT_NOT_FOUND');
    }

    // 检查权限：项目成员、管理员可以查看
    const isAdmin = requester.roles.includes('admin');
    const isMember = await ProjectMember.findOne({
      projectId,
      userId: requester._id
    });

    if (!isAdmin && !isMember) {
      throw new AppError('无权查看该项目的评价', 403, 'PERMISSION_DENIED');
    }

    const evaluations = await ProjectEvaluation.find({ projectId })
      .populate('evaluatorId', 'name username')
      .populate('evaluatedUserId', 'name username')
      .sort({ evaluatedAt: -1 });

    // 如果是匿名评价，隐藏评价人信息（管理员除外）
    return evaluations.map(evaluation => {
      const obj = evaluation.toObject();
      if (evaluation.isAnonymous && !isAdmin) {
        obj.evaluatorId = null;
        obj.evaluatorRole = null;
      }
      return obj;
    });
  }

  /**
   * 获取用户收到的评价统计
   * @param {String} userId - 用户ID
   * @param {Object} requester - 请求人
   * @returns {Promise<Object>} 评价统计
   */
  async getUserEvaluationStats(userId, requester) {
    // 只能查看自己的评价统计，或管理员可以查看所有
    const isAdmin = requester.roles.includes('admin');
    if (!isAdmin && userId !== requester._id.toString()) {
      throw new AppError('无权查看其他用户的评价统计', 403, 'PERMISSION_DENIED');
    }

    const evaluations = await ProjectEvaluation.find({ evaluatedUserId: userId })
      .populate('projectId', 'projectName projectNumber')
      .populate('evaluatorId', 'name')
      .sort({ evaluatedAt: -1 });

    // 计算平均分
    const calculateAverage = (scores, key) => {
      const validScores = scores.filter(s => s[key] !== undefined && s[key] !== null);
      if (validScores.length === 0) return null;
      const sum = validScores.reduce((acc, s) => acc + s[key], 0);
      return Math.round((sum / validScores.length) * 100) / 100;
    };

    const allScores = evaluations.map(e => e.scores);
    
    const stats = {
      totalCount: evaluations.length,
      pmToSalesCount: evaluations.filter(e => e.evaluationType === 'pm_to_sales').length,
      executorToPmCount: evaluations.filter(e => e.evaluationType === 'executor_to_pm').length,
      averages: {
        informationCompleteness: calculateAverage(allScores, 'informationCompleteness'),
        projectManagement: calculateAverage(allScores, 'projectManagement'),
        communicationQuality: calculateAverage(allScores, 'communicationQuality'),
        problemSolving: calculateAverage(allScores, 'problemSolving'),
        technicalSupport: calculateAverage(allScores, 'technicalSupport'),
        overallSatisfaction: calculateAverage(allScores, 'overallSatisfaction')
      },
      recentEvaluations: evaluations.slice(0, 10).map(e => ({
        id: e._id,
        projectName: e.projectId?.projectName,
        projectNumber: e.projectId?.projectNumber,
        evaluationType: e.evaluationType,
        overallSatisfaction: e.scores.overallSatisfaction,
        comments: e.comments,
        evaluatedAt: e.evaluatedAt,
        isAnonymous: e.isAnonymous,
        evaluatorName: e.isAnonymous ? '匿名' : (e.evaluatorId?.name || '未知')
      }))
    };

    return stats;
  }

  /**
   * 获取用户待评价的项目列表
   * @param {Object} user - 用户对象
   * @returns {Promise<Array>} 待评价项目列表
   */
  async getPendingEvaluations(user) {
    // 查找用户参与的项目
    const userProjects = await ProjectMember.find({ userId: user._id })
      .populate('projectId')
      .then(members => members
        .filter(m => m.projectId && m.projectId.status === 'completed')
        .map(m => ({
          project: m.projectId,
          memberRole: m.role
        }))
      );

    const pendingList = [];

    for (const { project, memberRole } of userProjects) {
      // 检查时间限制
      const completedAt = project.completedAt || project.updatedAt;
      if (!completedAt) continue;

      const daysSinceCompletion = Math.floor((new Date() - completedAt) / (1000 * 60 * 60 * 24));
      if (daysSinceCompletion > 30) continue;

      // PM可以评价销售
      if (memberRole === 'pm') {
        const salesId = project.createdBy?._id || project.createdBy;
        if (salesId && salesId.toString() !== user._id.toString()) {
          const existing = await ProjectEvaluation.findOne({
            projectId: project._id,
            evaluatorId: user._id,
            evaluatedUserId: salesId,
            evaluationType: 'pm_to_sales'
          });

          if (!existing) {
            pendingList.push({
              projectId: project._id,
              projectName: project.projectName,
              projectNumber: project.projectNumber,
              evaluationType: 'pm_to_sales',
              evaluatedUserId: salesId,
              evaluatedRole: 'sales',
              completedAt: project.completedAt,
              daysRemaining: 30 - daysSinceCompletion
            });
          }
        }
      }

      // 执行人员可以评价PM
      if (['translator', 'reviewer', 'layout'].includes(memberRole)) {
        const pmMembers = await ProjectMember.find({
          projectId: project._id,
          role: 'pm'
        });

        for (const pmMember of pmMembers) {
          if (pmMember.userId.toString() === user._id.toString()) continue;

          const existing = await ProjectEvaluation.findOne({
            projectId: project._id,
            evaluatorId: user._id,
            evaluatedUserId: pmMember.userId,
            evaluationType: 'executor_to_pm'
          });

          if (!existing) {
            pendingList.push({
              projectId: project._id,
              projectName: project.projectName,
              projectNumber: project.projectNumber,
              evaluationType: 'executor_to_pm',
              evaluatedUserId: pmMember.userId,
              evaluatedRole: 'pm',
              completedAt: project.completedAt,
              daysRemaining: 30 - daysSinceCompletion
            });
          }
        }
      }
    }

    return pendingList;
  }
}

module.exports = new EvaluationService();

