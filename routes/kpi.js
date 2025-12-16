const express = require('express');
const router = express.Router();
const { authenticate, authorize, getCurrentPermission } = require('../middleware/auth');
const { 
  isAdmin, 
  isFinance, 
  isSales, 
  isPM, 
  isAdminOrFinance,
  canViewAllProjects, 
  canViewAllKPI, 
  canViewAmount 
} = require('../utils/permissionChecker');
const KpiRecord = require('../models/KpiRecord');
const MonthlyRoleKPI = require('../models/MonthlyRoleKPI');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const User = require('../models/User');
const { calculateKPIByRole } = require('../utils/kpiCalculator');
const { calculateAdminStaff, calculateFinance } = require('../utils/kpiCalculator');
const { generateMonthlyKPIRecords, generateProjectKPI, calculateProjectRealtime, calculateProjectsRealtimeBatch } = require('../services/kpiService');
const { exportMonthlyKPISheet, exportUserKPIDetail } = require('../services/excelService');

// 所有KPI路由需要认证
router.use(authenticate);

// Dashboard 汇总（按权限）
// 允许兼职销售/排版查看自己的数据
router.get('/dashboard', authorize('admin', 'finance', 'pm', 'sales', 'translator', 'reviewer', 'admin_staff', 'part_time_sales', 'layout'), async (req, res) => {
  try {
    const { month, status, businessType, role, customerId } = req.query;

    // month 默认当前月
    const target = month ? new Date(`${month}-01`) : new Date();
    const monthStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
    const startDate = new Date(target.getFullYear(), target.getMonth(), 1);
    const endDate = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59);

    // 使用当前角色进行权限判断
    const currentRole = req.currentRole;
    const kpiViewPerm = getCurrentPermission(req, 'kpi.view');
    const projectViewPerm = getCurrentPermission(req, 'project.view');
    const financeViewPerm = getCurrentPermission(req, 'finance.view');

    // 项目可见性 - 基于当前角色的权限
    let projectQuery = {};
    if (canViewAllProjects(req)) {
      // 可以查看所有项目，不需要过滤
    } else if (projectViewPerm === 'sales') {
      // 只看自己创建的项目
      projectQuery.createdBy = req.user._id;
    } else if (projectViewPerm === 'assigned') {
      // 只看分配给我的项目
      const memberProjects = await ProjectMember.find({ userId: req.user._id }).distinct('projectId');
      projectQuery._id = memberProjects.length > 0 ? { $in: memberProjects } : { $in: [] };
    } else {
      // 默认：只看自己创建或分配的项目
      const memberProjects = await ProjectMember.find({ userId: req.user._id }).distinct('projectId');
      const createdProjects = await Project.find({ createdBy: req.user._id }).distinct('_id');
      const allIds = [...new Set([...memberProjects.map(String), ...createdProjects.map(String)])];
      projectQuery._id = allIds.length > 0 ? { $in: allIds } : { $in: [] };
    }

    // 过滤条件
    if (status) {
      projectQuery.status = status;
    } else {
      // 默认排除已取消项目
      projectQuery.status = { $ne: 'cancelled' };
    }
    if (businessType) projectQuery.businessType = businessType;
    if (customerId) projectQuery.customerId = customerId;

  // 如果前端选择了特定角色（dashboardRole 下拉），按该角色进一步限定项目范围（基于当前用户在该角色下参与或创建的项目）
  if (role) {
    let roleProjectIds = [];
    if (role === 'sales') {
      // 销售：本人创建的项目 + 作为销售成员的项目
      const salesMemberProjects = await ProjectMember.find({ userId: req.user._id, role: 'sales' }).distinct('projectId');
      const createdProjects = await Project.find({ createdBy: req.user._id }).distinct('_id');
      roleProjectIds = [...new Set([...salesMemberProjects.map(String), ...createdProjects.map(String)])];
    } else {
      // 其他角色：仅本人作为该角色成员参与的项目
      const memberProjects = await ProjectMember.find({ userId: req.user._id, role }).distinct('projectId');
      roleProjectIds = memberProjects.map(String);
    }

    // 将角色过滤与现有可见性过滤求交集
    if (projectQuery._id && projectQuery._id.$in) {
      const allowedSet = new Set(roleProjectIds);
      const intersected = projectQuery._id.$in.map(String).filter(id => allowedSet.has(id));
      projectQuery._id = { $in: intersected };
    } else if (roleProjectIds.length > 0) {
      projectQuery._id = { $in: roleProjectIds };
    } else {
      // 没有符合角色的项目，确保查询结果为空
      projectQuery._id = { $in: [] };
    }
  }

    // 时间范围：统一使用 createdAt 判断当月项目数（避免跨月重复统计）
    projectQuery.createdAt = { $gte: startDate, $lte: endDate };

    let projects = await Project.find(projectQuery).populate('createdBy', 'roles');

    // 再次基于 dashboardRole 对项目进行用户侧过滤（防止查询条件未生效或遗漏）
    if (role) {
      let allowedIds = [];
      if (role === 'sales') {
        const salesMemberProjects = await ProjectMember.find({ userId: req.user._id, role: 'sales' }).distinct('projectId');
        const createdProjects = await Project.find({ createdBy: req.user._id }).distinct('_id');
        allowedIds = [...new Set([...salesMemberProjects.map(String), ...createdProjects.map(String)])];
      } else {
        const memberProjects = await ProjectMember.find({ userId: req.user._id, role }).distinct('projectId');
        allowedIds = memberProjects.map(String);
      }
      if (allowedIds.length > 0) {
        const allowedSet = new Set(allowedIds.map(String));
        projects = projects.filter(p => allowedSet.has(p._id.toString()));
      } else {
        projects = [];
      }
    }

    const projectCount = projects.length;
    const totalProjectAmount = canViewAmount
      ? projects.reduce((sum, p) => sum + (p.projectAmount || 0), 0)
      : undefined;
    const totalReceived = projects.reduce((sum, p) => sum + (p.payment?.receivedAmount || 0), 0);
    const paymentCompletionRate = totalProjectAmount && totalProjectAmount > 0
      ? Math.round((totalReceived / totalProjectAmount) * 100)
      : 0;

    // 统计分布
    const statusCounts = projects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});
    const businessTypeCounts = projects.reduce((acc, p) => {
      acc[p.businessType] = (acc[p.businessType] || 0) + 1;
      return acc;
    }, {});

    // KPI 汇总 - 基于当前角色的权限
    // 先查询已生成的KPI记录
    const kpiQuery = { month: monthStr };
    if (kpiViewPerm === 'all') {
      // 可以查看所有KPI，不需要过滤用户
    } else if (kpiViewPerm === 'self') {
      // 只看自己的KPI
      kpiQuery.userId = req.user._id;
    } else {
      // 默认：只看自己的KPI
      kpiQuery.userId = req.user._id;
    }
    // 如果查询参数中指定了role，使用查询参数；否则使用当前选择的角色
    if (role) {
      kpiQuery.role = role;
    } else if (currentRole && currentRole !== 'admin') {
      // 如果当前选择了特定角色，只查询该角色的KPI
      kpiQuery.role = currentRole;
    }

    const kpiRecords = await KpiRecord.find(kpiQuery);
    
    // 按角色分别累加KPI（避免多角色混淆）
    let kpiTotal = 0;
    const kpiByRole = {};
    
    // 1. 先累加已生成的KPI记录（按角色分别累加）
    kpiRecords.forEach(r => {
      if (!kpiByRole[r.role]) {
        kpiByRole[r.role] = 0;
      }
      kpiByRole[r.role] += r.kpiValue;
    });
    
    // 2. 获取用户在当前月份的所有项目成员记录（按角色分组）
    // 如果用户选择了特定角色，只获取该角色的成员记录
    const memberQuery = { 
      userId: req.user._id,
      projectId: { $in: projects.map(p => p._id) }
    };
    
    // 如果当前选择了特定角色，只计算该角色的KPI
    if (currentRole && currentRole !== 'admin') {
      memberQuery.role = currentRole;
    }
    
    const userMemberProjects = await ProjectMember.find(memberQuery)
      .populate('projectId', 'projectName projectAmount deadline status');
    
    // 按项目和角色分组，避免重复计算
    const projectRoleMap = new Map(); // key: projectId_role, value: member
    userMemberProjects.forEach(member => {
      if (member.projectId) {
        const key = `${member.projectId._id.toString()}_${member.role}`;
        projectRoleMap.set(key, member);
      }
    });
    
    // 3. 添加创建者项目（如果用户是销售角色，且当前选择了销售角色）
    const hasSalesRole = req.user.roles && req.user.roles.includes('sales');
    if (hasSalesRole && (!currentRole || currentRole === 'sales' || currentRole === 'admin')) {
      projects.forEach(project => {
        const createdById = project.createdBy?._id ? project.createdBy._id.toString() : 
                           (project.createdBy ? project.createdBy.toString() : null);
        if (createdById === req.user._id.toString()) {
          const key = `${project._id.toString()}_sales`;
          // 如果用户还没有作为销售成员添加，添加一个虚拟成员记录
          if (!projectRoleMap.has(key)) {
            projectRoleMap.set(key, {
              projectId: { _id: project._id },
              role: 'sales',
              userId: req.user._id
            });
          }
        }
      });
    }
    
    // 4. 实时计算KPI（批量优化，避免N+1查询）
    // 注意：综合岗和财务岗跳过项目级计算，将在步骤5中按月汇总计算
    
    // 收集需要实时计算的项目ID和角色信息
    const projectsToCalculate = [];
    const projectRoleKeys = [];
    
    for (const [key, member] of projectRoleMap) {
      const [projectId, role] = key.split('_');
      
      // 如果当前选择了特定角色，只计算该角色的KPI
      if (currentRole && currentRole !== 'admin' && role !== currentRole) {
        continue;
      }
      
      // 综合岗和财务岗跳过项目级实时计算，将在步骤5中按月汇总计算
      if (role === 'admin_staff' || role === 'finance') {
        continue;
      }
      
      // 检查是否已经在kpiRecords中（避免重复计算）
      const alreadyInRecords = kpiRecords.some(r => {
        const rProjectId = r.projectId?._id ? r.projectId._id.toString() : 
                          (r.projectId ? r.projectId.toString() : null);
        return rProjectId === projectId && r.role === role;
      });
      
      if (!alreadyInRecords) {
        if (!projectsToCalculate.includes(projectId)) {
          projectsToCalculate.push(projectId);
        }
        projectRoleKeys.push({ projectId, role, key });
      }
    }
    
    // 批量计算实时KPI（优化N+1查询）
    if (projectsToCalculate.length > 0) {
      try {
        const batchResults = await calculateProjectsRealtimeBatch(projectsToCalculate);
        
        // 从批量结果中提取当前用户的KPI
        for (const { projectId, role } of projectRoleKeys) {
          const projectResult = batchResults[projectId];
          if (projectResult && projectResult.results && projectResult.results.length > 0) {
            // 只累加当前用户在当前项目中的当前角色的KPI
            for (const result of projectResult.results) {
              const resultUserId = result.userId?._id ? result.userId._id.toString() : 
                                  (result.userId ? result.userId.toString() : null);
              const currentUserId = req.user._id.toString();
              
              if (resultUserId === currentUserId && result.role === role) {
                if (result.kpiValue && result.kpiValue > 0) {
                  if (!kpiByRole[result.role]) {
                    kpiByRole[result.role] = 0;
                  }
                  kpiByRole[result.role] += result.kpiValue;
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('[Dashboard] 批量计算实时KPI失败:', error.message, error.stack);
        // 如果批量计算失败，降级为单个计算（向后兼容）
        console.warn('[Dashboard] 降级为单个计算模式');
        for (const { projectId, role } of projectRoleKeys) {
          try {
            const realtimeResult = await calculateProjectRealtime(projectId);
            if (realtimeResult && realtimeResult.results && realtimeResult.results.length > 0) {
              for (const result of realtimeResult.results) {
                const resultUserId = result.userId?._id ? result.userId._id.toString() : 
                                    (result.userId ? result.userId.toString() : null);
                const currentUserId = req.user._id.toString();
                
                if (resultUserId === currentUserId && result.role === role) {
                  if (result.kpiValue && result.kpiValue > 0) {
                    if (!kpiByRole[result.role]) {
                      kpiByRole[result.role] = 0;
                    }
                    kpiByRole[result.role] += result.kpiValue;
                  }
                }
              }
            }
          } catch (singleError) {
            console.error(`[Dashboard] 计算项目 ${projectId} 角色 ${role} 的实时KPI失败:`, singleError.message);
          }
        }
      }
    }
    
    // 5. 获取月度角色KPI（综合岗和财务岗）- 如果用户有这些角色，需要包含在KPI中
    const monthlyRoleKPIsQuery = {
      month: monthStr,
      userId: req.user._id
    };
    
    // 如果当前选择了特定角色，只获取该角色的月度KPI
    if (currentRole && (currentRole === 'admin_staff' || currentRole === 'finance')) {
      monthlyRoleKPIsQuery.role = currentRole;
    }
    
    const monthlyRoleKPIs = await MonthlyRoleKPI.find(monthlyRoleKPIsQuery);
    
    // 将月度角色KPI加入按角色汇总（综合岗和财务岗是月度汇总，不按项目计算）
    monthlyRoleKPIs.forEach(record => {
      // 如果当前选择了特定角色，只累加该角色的KPI
      if (currentRole && currentRole !== 'admin' && record.role !== currentRole) {
        return;
      }
      
      if (!kpiByRole[record.role]) {
        kpiByRole[record.role] = 0;
      }
      kpiByRole[record.role] += record.kpiValue;
    });
    
    // 5.1 如果用户是综合岗或财务岗，但没有月度KPI记录，实时计算预估KPI
    const userRoles = req.user.roles || [];
    const hasAdminStaffRole = userRoles.includes('admin_staff');
    const hasFinanceRole = userRoles.includes('finance');
    
    // 计算当月全公司项目总金额（用于综合岗和财务岗的实时计算）
    // 注意：这里应该使用全公司所有项目，而不是当前用户可见的项目
    const [year, monthNum] = monthStr.split('-').map(Number);
    const monthStartDate = new Date(year, monthNum - 1, 1);
    const monthEndDate = new Date(year, monthNum, 0, 23, 59, 59);
    
    const allMonthlyProjects = await Project.find({
      createdAt: {
        $gte: monthStartDate,
        $lte: monthEndDate
      }
    });
    const totalCompanyAmount = allMonthlyProjects.reduce((sum, p) => sum + (p.projectAmount || 0), 0);
    
    // 获取KPI配置
    const KpiConfig = require('../models/KpiConfig');
    const config = await KpiConfig.findOne().sort({ createdAt: -1 });
    const adminRatio = config?.admin_ratio || 0;
    
    // 如果用户有综合岗角色，但没有月度KPI记录，实时计算预估KPI
    if (hasAdminStaffRole && adminRatio > 0 && totalCompanyAmount > 0) {
      const hasAdminStaffKPI = monthlyRoleKPIs.some(r => r.role === 'admin_staff');
      if (!hasAdminStaffKPI) {
        // 如果没有月度KPI记录，实时计算预估KPI（使用默认完成系数1.0）
        const { calculateFinance } = require('../utils/kpiCalculator');
        const estimatedKPI = calculateFinance(totalCompanyAmount, adminRatio, 1.0);
        if (!kpiByRole['admin_staff']) {
          kpiByRole['admin_staff'] = 0;
        }
        // 只有在没有月度KPI记录时才累加实时计算的预估KPI
        kpiByRole['admin_staff'] += estimatedKPI;
      }
    }
    
    // 如果用户有财务岗角色，但没有月度KPI记录，实时计算预估KPI
    if (hasFinanceRole && adminRatio > 0 && totalCompanyAmount > 0) {
      const hasFinanceKPI = monthlyRoleKPIs.some(r => r.role === 'finance');
      if (!hasFinanceKPI) {
        // 如果没有月度KPI记录，实时计算预估KPI（使用默认完成系数1.0）
        const { calculateFinance } = require('../utils/kpiCalculator');
        const estimatedKPI = calculateFinance(totalCompanyAmount, adminRatio, 1.0);
        if (!kpiByRole['finance']) {
          kpiByRole['finance'] = 0;
        }
        // 只有在没有月度KPI记录时才累加实时计算的预估KPI
        kpiByRole['finance'] += estimatedKPI;
      }
    }
    
    // 6. 根据当前选择的角色，只显示该角色的KPI
    // 如果用户选择了特定角色，只返回该角色的KPI；否则返回所有角色的总和
    if (currentRole && currentRole !== 'admin') {
      // 只显示当前角色的KPI
      kpiTotal = kpiByRole[currentRole] || 0;
      // 清空其他角色的KPI，只保留当前角色（用于图表显示）
      Object.keys(kpiByRole).forEach(role => {
        if (role !== currentRole) {
          delete kpiByRole[role];
        }
      });
    } else {
      // 如果没有选择角色或选择了管理员角色，返回所有角色的总和
      kpiTotal = Object.values(kpiByRole).reduce((sum, value) => sum + value, 0);
    }

    // KPI 趋势（近3个月）- 销售和兼职销售显示成交额趋势
    const trendMonths = [];
    const baseDate = new Date(target.getFullYear(), target.getMonth(), 1);
    for (let i = 2; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() - i);
      trendMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    
    let kpiTrend = [];
    if (isSales(req) && !isAdmin(req) && !isFinance(req)) {
      // 销售和兼职销售：计算成交额趋势（基于项目金额）
      for (const month of trendMonths) {
        const [year, monthNum] = month.split('-');
        const trendStartDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const trendEndDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59);
        
        // 使用相同的项目查询逻辑，但只针对该月份
        let trendProjectQuery = {};
        const trendMemberProjects = await ProjectMember.find({ userId: req.user._id }).distinct('projectId');
        const trendCreatedProjects = await Project.find({ createdBy: req.user._id }).distinct('_id');
        const trendAllIds = [...new Set([...trendMemberProjects.map(String), ...trendCreatedProjects.map(String)])];
        trendProjectQuery._id = trendAllIds.length > 0 ? { $in: trendAllIds } : { $in: [] };
        
        // 应用筛选条件
        if (status) {
          trendProjectQuery.status = status;
        } else {
          trendProjectQuery.status = { $ne: 'cancelled' };
        }
        if (businessType) trendProjectQuery.businessType = businessType;
        if (customerId) trendProjectQuery.customerId = customerId;
        
        // 时间范围：统一使用 createdAt 判断当月项目（与 dashboard 保持一致）
        trendProjectQuery.createdAt = { $gte: trendStartDate, $lte: trendEndDate };
        
        const trendProjects = await Project.find(trendProjectQuery);
        const trendAmount = trendProjects.reduce((sum, p) => sum + (p.projectAmount || 0), 0);
        kpiTrend.push({
          month: month,
          total: Math.round(trendAmount * 100) / 100
        });
      }
    } else {
      // 其他角色：计算KPI趋势
      const trendQuery = { month: { $in: trendMonths } };
      if (kpiViewPerm === 'all') {
        // 可以查看所有KPI，不需要过滤用户
      } else {
        // 只看自己的KPI
        trendQuery.userId = req.user._id;
      }
      const trendRecords = await KpiRecord.find(trendQuery);
      kpiTrend = trendMonths.map(m => ({
        month: m,
        total: trendRecords.filter(r => r.month === m).reduce((s, r) => s + r.kpiValue, 0)
      }));
    }

    // 回款预警：已逾期
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

    // 回款即将到期：未来5天内到期且未全额回款
    const soonEnd = new Date();
    soonEnd.setDate(soonEnd.getDate() + 5);
    const paymentDueSoon = projects
      .filter(p => p.payment?.expectedAt && !p.payment.isFullyPaid && p.payment.expectedAt >= now && p.payment.expectedAt <= soonEnd)
      .map(p => ({
        projectId: p._id,
        projectName: p.projectName,
        expectedAt: p.payment.expectedAt,
        receivedAmount: p.payment.receivedAmount || 0,
        daysLeft: Math.ceil((p.payment.expectedAt - now) / (1000 * 60 * 60 * 24))
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 20);

    // 交付逾期预警：未完成且deadline已过
    const deliveryWarnings = projects
      .filter(p => {
        // 只统计未完成且未取消的项目，且交付时间已过
        const status = (p.status || '').toLowerCase();
        const isActive = status === 'pending' || status === 'in_progress';
        return isActive && p.deadline && p.deadline < now;
      })
      .map(p => ({
        projectId: p._id,
        projectName: p.projectName,
        deadline: p.deadline,
        status: p.status,
        daysOverdue: Math.ceil((now - p.deadline) / (1000 * 60 * 60 * 24))
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 20);

    // 最近7天指标
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentCompleted = projects.filter(p => p.status === 'completed' && p.completedAt && p.completedAt >= sevenDaysAgo).length;
    const recentPaymentOverdue = paymentWarnings.filter(w => w.expectedAt && w.expectedAt >= sevenDaysAgo).length;
    const recentDeliveryOverdue = deliveryWarnings.filter(w => w.deadline && w.deadline >= sevenDaysAgo).length;

    // 今日指标（根据角色不同）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let todayDeals = null; // 今日成交（销售和兼职销售）
    let todayDelivery = null; // 今日进入交付（销售和兼职销售）
    let todayMyDueProjects = null; // 今日本人应完成项目（翻译、审校、排版）

    if (isSales(req) && !isAdmin(req) && !isFinance(req)) {
      // 销售和兼职销售：今日成交和进入交付
      // 今日成交：今天创建的项目
      const todayCreatedQuery = { ...projectQuery };
      todayCreatedQuery.createdAt = { $gte: today, $lt: tomorrow };
      delete todayCreatedQuery.$or; // 移除月份查询条件
      const todayCreatedProjects = await Project.find(todayCreatedQuery);
      todayDeals = {
        count: todayCreatedProjects.length,
        amount: todayCreatedProjects.reduce((sum, p) => sum + (p.projectAmount || 0), 0)
      };

      // 今日待交付：交付日期（deadline）是今天的项目
      const todayDueQuery = { ...projectQuery };
      todayDueQuery.deadline = { $gte: today, $lt: tomorrow };
      todayDueQuery.status = { $nin: ['completed', 'cancelled'] }; // 未完成且未取消的项目
      delete todayDueQuery.$or; // 移除月份查询条件
      const todayDueProjects = await Project.find(todayDueQuery);
      todayDelivery = {
        count: todayDueProjects.length,
        amount: todayDueProjects.reduce((sum, p) => sum + (p.projectAmount || 0), 0)
      };
    } else if (isPM(req) && !isAdmin(req) && !isFinance(req)) {
      // 项目经理：今日待交付项目（deadline是今天，且项目经理是PM成员）
      const todayDueQuery = {
        deadline: { $gte: today, $lt: tomorrow },
        status: { $nin: ['completed', 'cancelled'] }, // 未完成且未取消的项目
        _id: { $in: [] } // 初始化为空，后面会填充
      };

      // 获取用户作为PM成员的项目ID
      const pmMemberProjects = await ProjectMember.find({ 
        userId: req.user._id, 
        role: 'pm' 
      }).distinct('projectId');
      
      if (pmMemberProjects.length > 0) {
        todayDueQuery._id = { $in: pmMemberProjects };
        const todayDueProjects = await Project.find(todayDueQuery);
        todayDelivery = {
          count: todayDueProjects.length,
          amount: todayDueProjects.reduce((sum, p) => sum + (p.projectAmount || 0), 0)
      };
      } else {
        todayDelivery = { count: 0, amount: 0 };
      }
    } else {
      // 翻译、审校、排版：今日本人应完成项目
      const userRoles = req.user.roles || [];
      const isWorker = userRoles.includes('translator') || userRoles.includes('reviewer') || userRoles.includes('layout');
      
      if (isWorker) {
        // 查找今天deadline的项目，且用户是项目成员
        const todayDueQuery = {
          deadline: { $gte: today, $lt: tomorrow },
          status: { $ne: 'completed' }, // 未完成的项目
          _id: { $in: [] } // 初始化为空，后面会填充
        };

        // 获取用户作为成员的项目ID
        const userMemberProjects = await ProjectMember.find({ userId: req.user._id }).distinct('projectId');
        if (userMemberProjects.length > 0) {
          todayDueQuery._id = { $in: userMemberProjects };
          const todayDueProjects = await Project.find(todayDueQuery)
            .select('_id projectName deadline status businessType')
            .populate('customerId', 'name');
          
          todayMyDueProjects = {
            count: todayDueProjects.length,
            projects: todayDueProjects.map(p => ({
              projectId: p._id,
              projectName: p.projectName,
              deadline: p.deadline,
              status: p.status,
              businessType: p.businessType,
              customerName: p.customerId?.name || ''
            }))
          };
        } else {
          todayMyDueProjects = { count: 0, projects: [] };
        }
      }
    }

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
        paymentDueSoon,
        deliveryWarnings,
        paymentCompletionRate,
        kpiTrend,
        recentCompleted,
        recentPaymentOverdue,
        recentDeliveryOverdue,
        todayDeals,
        todayDelivery,
        todayMyDueProjects
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
    const { month, force = false } = req.body; // 格式：YYYY-MM, force: 是否强制更新已存在的记录

    if (!month) {
      return res.status(400).json({ 
        success: false, 
        message: '请指定月份（格式：YYYY-MM）' 
      });
    }

    const result = await generateMonthlyKPIRecords(month, force);

    let message = `月度KPI生成成功，共生成 ${result.count} 条新记录`;
    if (result.updated && result.updated > 0) {
      message += `，更新 ${result.updated} 条已存在记录`;
    }
    if (result.inProgress) {
      return res.status(409).json({
        success: false,
        message: result.message
      });
    }

    res.json({
      success: true,
      message,
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

    // 权限检查：只有管理员和财务可以查看所有用户的KPI
    const canViewAll = req.user.roles.includes('admin') || req.user.roles.includes('finance');
    
    // 处理userId参数
    if (!userId || userId === 'undefined' || userId === 'null') {
      userId = req.user._id.toString();
    }
    
    // 如果不是管理员/财务，强制只能查看自己的KPI
    const targetUserId = canViewAll ? userId : req.user._id.toString();

    // 双重检查：如果尝试查看其他用户的KPI，直接拒绝
    if (!canViewAll && userId !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: '无权查看其他用户的KPI' 
      });
    }

    let query = { userId: targetUserId };
    if (month) query.month = month;
    if (role) query.role = role;

    // 根据当前角色决定是否返回项目金额信息
    // 财务和管理员可以看到金额，其他角色（PM、翻译、审校）不能看到
    const currentRole = req.currentRole;
    const canViewAmount = currentRole === 'admin' || currentRole === 'finance';
    
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

    // 获取月度角色KPI（综合岗和财务岗）
    const monthlyRoleKPIs = await MonthlyRoleKPI.find(query)
      .populate('evaluatedBy', 'name username')
      .sort({ month: -1, createdAt: -1 });

    // 计算总计（包含项目KPI和月度角色KPI）
    const projectTotal = records.reduce((sum, record) => sum + record.kpiValue, 0);
    const monthlyRoleTotal = monthlyRoleKPIs.reduce((sum, record) => sum + record.kpiValue, 0);
    const total = projectTotal + monthlyRoleTotal;

    res.json({
      success: true,
      data: {
        records,
        monthlyRoleKPIs,
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

    // 获取月度角色KPI（综合岗和财务岗）
    const monthlyRoleKPIs = await MonthlyRoleKPI.find({ month })
      .populate('userId', 'name username email roles')
      .populate('evaluatedBy', 'name username')
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

    // 将月度角色KPI也加入汇总
    monthlyRoleKPIs.forEach(record => {
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
        monthlyRoleKPIs,
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
// 允许兼职销售/排版查看自己所在项目的实时KPI
router.get('/project/:projectId/realtime', authorize('admin', 'finance', 'pm', 'sales', 'translator', 'reviewer', 'admin_staff', 'part_time_sales', 'layout'), async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: '项目不存在',
          statusCode: 404
        }
      });
    }

    const isCreator = project.createdBy.toString() === req.user._id.toString();
    const isMember = await ProjectMember.findOne({ projectId, userId: req.user._id });

    if (!isAdminOrFinance(req) && !isCreator && !isMember) {
      return res.status(403).json({ 
        success: false, 
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: '无权查看该项目KPI',
          statusCode: 403
        }
      });
    }

    const data = await calculateProjectRealtime(projectId);

    // 非财务/管理员仅返回自己的预估KPI
    if (!isAdminOrFinance(req)) {
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

// 拒绝KPI记录（财务和管理员）
router.post('/reject/:recordId', authorize('admin', 'finance'), async (req, res) => {
  try {
    const { reason } = req.body;
    const record = await KpiRecord.findById(req.params.recordId);
    
    if (!record) {
      return res.status(404).json({ 
        success: false, 
        message: 'KPI记录不存在' 
      });
    }

    // 拒绝时删除记录（因为拒绝的记录不应该出现在工资表中）
    await KpiRecord.findByIdAndDelete(req.params.recordId);

    res.json({
      success: true,
      message: 'KPI记录已拒绝并删除',
      data: { recordId: req.params.recordId, reason }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 批量审核KPI记录（财务和管理员）
router.post('/review/batch', authorize('admin', 'finance'), async (req, res) => {
  try {
    const { recordIds } = req.body;
    
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: '请选择要审核的记录' 
      });
    }

    const result = await KpiRecord.updateMany(
      { _id: { $in: recordIds } },
      { 
        isReviewed: true,
        reviewedBy: req.user._id,
        reviewedAt: new Date()
      }
    );

    res.json({
      success: true,
      message: `已批量审核 ${result.modifiedCount} 条记录`,
      data: { count: result.modifiedCount }
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
    // 使用encodeURIComponent确保中文文件名正确编码
    const filename = encodeURIComponent(`KPI工资表-${month}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
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
    // 使用RFC 5987格式确保中文文件名正确编码
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 获取指定月份的月度角色KPI（综合岗和财务岗）- 管理员可查看
router.get('/monthly-role/:month', authorize('admin'), async (req, res) => {
  try {
    const { month } = req.params;

    const records = await MonthlyRoleKPI.find({ month })
      .populate('userId', 'name username email roles')
      .populate('evaluatedBy', 'name username')
      .sort({ role: 1, userId: 1 });

    res.json({
      success: true,
      data: {
        month,
        records
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// 管理员评价完成系数（综合岗和财务岗）
router.post('/monthly-role/:id/evaluate', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { evaluationLevel } = req.body;

    if (!evaluationLevel || !['good', 'medium', 'poor'].includes(evaluationLevel)) {
      return res.status(400).json({
        success: false,
        message: '评价等级无效，必须是 good（好）、medium（中）或 poor（差）'
      });
    }

    const record = await MonthlyRoleKPI.findById(id);
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'KPI记录不存在'
      });
    }

    // 根据评价等级设置完成系数
    const evaluationFactorMap = {
      good: 1.1,
      medium: 1.0,
      poor: 0.8
    };
    const evaluationFactor = evaluationFactorMap[evaluationLevel];

    // 重新计算KPI值
    let kpiValue;
    if (record.role === 'admin_staff') {
      kpiValue = calculateAdminStaff(record.totalCompanyAmount, record.ratio, evaluationFactor);
    } else if (record.role === 'finance') {
      kpiValue = calculateFinance(record.totalCompanyAmount, record.ratio, evaluationFactor);
    } else {
      return res.status(400).json({
        success: false,
        message: '该记录不是综合岗或财务岗的KPI'
      });
    }

    // 更新记录
    record.evaluationFactor = evaluationFactor;
    record.evaluationLevel = evaluationLevel;
    record.kpiValue = kpiValue;
    record.evaluatedBy = req.user._id;
    record.evaluatedAt = new Date();
    record.calculationDetails = {
      formula: `全公司当月项目总金额(${record.totalCompanyAmount}) × ${record.role === 'admin_staff' ? '综合岗' : '财务岗'}系数(${record.ratio}) × 完成系数(${evaluationFactor})`
    };

    await record.save();

    res.json({
      success: true,
      message: '评价完成系数已更新',
      data: record
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;

