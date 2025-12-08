const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const KpiRecord = require('../models/KpiRecord');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const User = require('../models/User');
const { calculateKPIByRole } = require('../utils/kpiCalculator');
const { generateMonthlyKPIRecords, generateProjectKPI, calculateProjectRealtime } = require('../services/kpiService');
const { exportMonthlyKPISheet, exportUserKPIDetail } = require('../services/excelService');

// 所有KPI路由需要认证
router.use(authenticate);

// Dashboard 汇总（按权限）
router.get('/dashboard', authorize('admin', 'finance', 'pm', 'sales', 'translator', 'reviewer', 'admin_staff'), async (req, res) => {
  try {
    const { month, status, businessType, role, customerId } = req.query;

    // month 默认当前月
    const target = month ? new Date(`${month}-01`) : new Date();
    const monthStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
    const startDate = new Date(target.getFullYear(), target.getMonth(), 1);
    const endDate = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59);

    const isAdmin = req.user.roles.includes('admin');
    const isFinance = req.user.roles.includes('finance');
    const canViewAmount = isAdmin || isFinance;

    // 项目可见性
    let projectQuery = {};
    if (!isAdmin && !isFinance) {
      const memberProjects = await ProjectMember.find({ userId: req.user._id }).distinct('projectId');
      const createdProjects = await Project.find({ createdBy: req.user._id }).distinct('_id');
      const allIds = [...new Set([...memberProjects.map(String), ...createdProjects.map(String)])];
      projectQuery._id = allIds.length > 0 ? { $in: allIds } : { $in: [] };
    }

    // 过滤条件
    if (status) projectQuery.status = status;
    if (businessType) projectQuery.businessType = businessType;
    if (customerId) projectQuery.customerId = customerId;

    // 时间范围：已完成用 completedAt，未完成用 createdAt
    projectQuery.$or = [
      { completedAt: { $gte: startDate, $lte: endDate } },
      { completedAt: { $exists: false }, createdAt: { $gte: startDate, $lte: endDate } }
    ];

    const projects = await Project.find(projectQuery);
    const projectCount = projects.length;
    const totalProjectAmount = canViewAmount
      ? projects.reduce((sum, p) => sum + (p.projectAmount || 0), 0)
      : undefined;

    // 统计分布
    const statusCounts = projects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});
    const businessTypeCounts = projects.reduce((acc, p) => {
      acc[p.businessType] = (acc[p.businessType] || 0) + 1;
      return acc;
    }, {});

    // KPI 汇总
    const kpiQuery = { month: monthStr };
    if (!isAdmin && !isFinance) kpiQuery.userId = req.user._id;
    if (role) kpiQuery.role = role;

    const kpiRecords = await KpiRecord.find(kpiQuery);
    const kpiTotal = kpiRecords.reduce((sum, r) => sum + r.kpiValue, 0);
    const kpiByRole = kpiRecords.reduce((acc, r) => {
      acc[r.role] = (acc[r.role] || 0) + r.kpiValue;
      return acc;
    }, {});

    // 回款预警：有expectedAt且未回款完成、已过期
    const now = new Date();
    const paymentWarnings = projects
      .filter(p => p.payment?.expectedAt && !p.payment.isFullyPaid && p.payment.expectedAt < now)
      .map(p => ({
        projectId: p._id,
        projectName: p.projectName,
        expectedAt: p.payment.expectedAt,
        receivedAmount: p.payment.receivedAmount || 0,
        daysOverdue: Math.ceil((now - p.payment.expectedAt) / (1000 * 60 * 60 * 24))
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 20); // 截取前20条避免过长

    // 交付逾期预警：未完成且deadline已过
    const deliveryWarnings = projects
      .filter(p => p.status !== 'completed' && p.deadline && p.deadline < now)
      .map(p => ({
        projectId: p._id,
        projectName: p.projectName,
        deadline: p.deadline,
        status: p.status,
        daysOverdue: Math.ceil((now - p.deadline) / (1000 * 60 * 60 * 24))
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 20);

    res.json({
      success: true,
      data: {
        month: monthStr,
        projectCount,
        totalProjectAmount: canViewAmount ? Math.round(totalProjectAmount * 100) / 100 : undefined,
        kpiTotal: Math.round(kpiTotal * 100) / 100,
        kpiByRole: Object.entries(kpiByRole).reduce((acc, [k, v]) => {
          acc[k] = Math.round(v * 100) / 100;
          return acc;
        }, {}),
        statusCounts,
        businessTypeCounts,
        paymentWarnings,
        deliveryWarnings
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 手动为单个项目生成KPI（管理员、财务、PM）
router.post('/generate-project/:projectId', authorize('admin', 'finance', 'pm'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await generateProjectKPI(projectId);

    res.json({
      success: true,
      message: `项目KPI生成成功，共生成 ${result.count} 条记录`,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 手动生成月度KPI（管理员和财务）
router.post('/generate-monthly', authorize('admin', 'finance'), async (req, res) => {
  try {
    const { month } = req.body; // 格式：YYYY-MM

    if (!month) {
      return res.status(400).json({ 
        success: false, 
        message: '请指定月份（格式：YYYY-MM）' 
      });
    }

    const result = await generateMonthlyKPIRecords(month);

    res.json({
      success: true,
      message: `月度KPI生成成功，共生成 ${result.count} 条记录`,
      data: result
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 获取用户KPI（用户可查看自己的，管理员和财务可查看所有）
router.get('/user/:userId', async (req, res) => {
  try {
    let { userId } = req.params;
    const { month, role } = req.query;

    // 权限检查
    const canViewAll = req.user.roles.includes('admin') || req.user.roles.includes('finance');
    if (!userId || userId === 'undefined' || userId === 'null') {
      userId = req.user._id.toString();
    }
    const targetUserId = canViewAll ? userId : req.user._id.toString();

    if (!canViewAll && userId !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: '无权查看其他用户的KPI' 
      });
    }

    let query = { userId: targetUserId };
    if (month) query.month = month;
    if (role) query.role = role;

    // 根据角色决定是否返回项目金额信息
    // 财务和管理员可以看到金额，其他角色（PM、翻译、审校）不能看到
    const canViewAmount = req.user.roles.includes('admin') || req.user.roles.includes('finance');
    
    const records = await KpiRecord.find(query)
      .populate('projectId', 'projectName clientName projectAmount')
      .sort({ month: -1, createdAt: -1 });

    // 如果用户不能查看金额，从返回数据中移除projectAmount
    if (!canViewAmount) {
      records.forEach(record => {
        if (record.projectId && record.projectId.projectAmount !== undefined) {
          delete record.projectId.projectAmount;
        }
      });
    }

    // 计算总计
    const total = records.reduce((sum, record) => sum + record.kpiValue, 0);

    res.json({
      success: true,
      data: {
        records,
        total: Math.round(total * 100) / 100,
        canViewAmount // 前端根据此字段决定是否显示金额
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 获取指定月份的KPI汇总（管理员和财务）
router.get('/month/:month', authorize('admin', 'finance'), async (req, res) => {
  try {
    const { month } = req.params;

    // 月度汇总只有管理员和财务可以查看，所以可以显示金额
    const records = await KpiRecord.find({ month })
      .populate('userId', 'name username email roles')
      .populate('projectId', 'projectName clientName projectAmount')
      .sort({ userId: 1, role: 1 });

    // 按用户和角色汇总
    const summary = {};
    records.forEach(record => {
      const userId = record.userId._id.toString();
      const userName = record.userId.name;
      const role = record.role;

      if (!summary[userId]) {
        summary[userId] = {
          userId,
          userName,
          roles: record.userId.roles,
          totalKPI: 0,
          byRole: {}
        };
      }

      if (!summary[userId].byRole[role]) {
        summary[userId].byRole[role] = 0;
      }

      summary[userId].byRole[role] += record.kpiValue;
      summary[userId].totalKPI += record.kpiValue;
    });

    // 转换为数组并排序
    const summaryArray = Object.values(summary).map(user => ({
      ...user,
      totalKPI: Math.round(user.totalKPI * 100) / 100,
      byRole: Object.entries(user.byRole).reduce((acc, [role, value]) => {
        acc[role] = Math.round(value * 100) / 100;
        return acc;
      }, {})
    })).sort((a, b) => b.totalKPI - a.totalKPI);

    res.json({
      success: true,
      data: {
        month,
        summary: summaryArray,
        records,
        totalRecords: records.length
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 计算单个项目的KPI（预览，不保存）
router.post('/calculate-project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    if (project.status !== 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: '项目尚未完成，无法计算KPI' 
      });
    }

    const members = await ProjectMember.find({ projectId })
      .populate('userId', 'name username');

    const completionFactor = project.calculateCompletionFactor();
    const results = [];

    for (const member of members) {
      const ratio = member.ratio_locked;
      const wordRatio = member.wordRatio || 1.0;
      const translatorType = member.translatorType || 'mtpe';

      let kpiResult;
      
      if (member.role === 'sales') {
        // 销售：优先使用回款金额，否则使用项目金额
        const amount = project.payment.receivedAmount > 0 
          ? project.payment.receivedAmount 
          : project.projectAmount;
        kpiResult = calculateKPIByRole({
          role: member.role,
          projectAmount: project.projectAmount,
          receivedAmount: amount,
          ratio,
          completionFactor
        });
      } else if (member.role === 'admin_staff') {
        // 综合岗需要全公司总额，这里先跳过，实际计算时需要传入
        continue;
      } else {
        kpiResult = calculateKPIByRole({
          role: member.role,
          projectAmount: project.projectAmount,
          ratio,
          wordRatio,
          completionFactor,
          translatorType
        });
      }

      results.push({
        userId: member.userId._id,
        userName: member.userId.name,
        role: member.role,
        kpiValue: kpiResult.kpiValue,
        formula: kpiResult.formula,
        details: {
          projectAmount: project.projectAmount,
          ratio,
          wordRatio: member.role === 'translator' ? wordRatio : undefined,
          completionFactor
        }
      });
    }

    res.json({
      success: true,
      data: {
        project: {
          id: project._id,
          projectName: project.projectName,
          projectAmount: project.projectAmount,
          completionFactor
        },
        results
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 实时计算单个项目的每人KPI（不落库，含权限校验）
router.get('/project/:projectId/realtime', authorize('admin', 'finance', 'pm', 'sales', 'translator', 'reviewer', 'admin_staff'), async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: '项目不存在' });
    }

    const isAdmin = req.user.roles.includes('admin') || req.user.roles.includes('finance');
    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isMember = await ProjectMember.findOne({ projectId, userId: req.user._id });

    if (!isAdmin && !isCreator && !isMember) {
      return res.status(403).json({ success: false, message: '无权查看该项目KPI' });
    }

    const data = await calculateProjectRealtime(projectId);

    // 非财务/管理员仅返回自己的预估KPI
    if (!isAdmin) {
      data.results = (data.results || []).filter(r => r.userId.toString() === req.user._id.toString());
      data.count = data.results.length;
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 审核KPI记录（财务和管理员）
router.post('/review/:recordId', authorize('admin', 'finance'), async (req, res) => {
  try {
    const record = await KpiRecord.findById(req.params.recordId);
    
    if (!record) {
      return res.status(404).json({ 
        success: false, 
        message: 'KPI记录不存在' 
      });
    }

    record.isReviewed = true;
    record.reviewedBy = req.user._id;
    record.reviewedAt = new Date();
    await record.save();

    res.json({
      success: true,
      message: 'KPI记录已审核',
      data: record
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 导出月度KPI工资表（Excel）
router.get('/export/month/:month', authorize('admin', 'finance'), async (req, res) => {
  try {
    const { month } = req.params;
    const buffer = await exportMonthlyKPISheet(month);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=KPI工资表-${month}.xlsx`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 导出用户KPI明细（Excel）
router.get('/export/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { month } = req.query;

    // 权限检查
    const canViewAll = req.user.roles.includes('admin') || req.user.roles.includes('finance');
    if (!canViewAll && userId !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: '无权导出其他用户的KPI' 
      });
    }

    // 根据角色决定是否显示项目金额
    // 财务和管理员可以看到金额，其他角色（PM、翻译、审校）不能看到
    const canViewAmount = req.user.roles.includes('admin') || req.user.roles.includes('finance');

    const buffer = await exportUserKPIDetail(userId, month || null, canViewAmount);
    const user = await User.findById(userId);
    const filename = month 
      ? `${user.name}-KPI明细-${month}.xlsx`
      : `${user.name}-KPI明细.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;

