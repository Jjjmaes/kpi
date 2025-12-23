const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const evaluationService = require('../services/evaluationService');

// 所有评价路由需要认证
router.use(authenticate);

/**
 * 检查评价资格
 * GET /api/evaluations/check/:projectId
 * 查询参数：evaluationType (pm_to_sales | executor_to_pm)
 */
router.get('/check/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { evaluationType } = req.query;

  if (!evaluationType || !['pm_to_sales', 'executor_to_pm'].includes(evaluationType)) {
    throw new AppError('无效的评价类型', 400, 'INVALID_EVALUATION_TYPE');
  }

  const result = await evaluationService.checkEvaluationEligibility(
    projectId,
    req.user,
    evaluationType
  );

  res.json({
    success: true,
    data: result
  });
}));

/**
 * 创建评价
 * POST /api/evaluations
 */
router.post('/', asyncHandler(async (req, res) => {
  const { projectId, evaluatedUserId, evaluationType, scores, comments, isAnonymous } = req.body;

  if (!projectId || !evaluatedUserId || !evaluationType || !scores) {
    throw new AppError('请填写所有必填字段', 400, 'VALIDATION_ERROR');
  }

  const evaluation = await evaluationService.createEvaluation(
    projectId,
    req.user,
    {
      evaluatedUserId,
      evaluationType,
      scores,
      comments,
      isAnonymous
    }
  );

  res.status(201).json({
    success: true,
    message: '评价提交成功',
    data: evaluation
  });
}));

/**
 * 获取项目的评价列表
 * GET /api/evaluations/project/:projectId
 */
router.get('/project/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const evaluations = await evaluationService.getProjectEvaluations(projectId, req.user);

  res.json({
    success: true,
    data: evaluations
  });
}));

/**
 * 获取用户收到的评价统计
 * GET /api/evaluations/user/:userId/stats
 */
router.get('/user/:userId/stats', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const stats = await evaluationService.getUserEvaluationStats(userId, req.user);

  res.json({
    success: true,
    data: stats
  });
}));

/**
 * 获取待评价项目列表
 * GET /api/evaluations/pending
 */
router.get('/pending', asyncHandler(async (req, res) => {
  const pendingList = await evaluationService.getPendingEvaluations(req.user);

  res.json({
    success: true,
    data: pendingList
  });
}));

module.exports = router;

