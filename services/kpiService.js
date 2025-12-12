const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const KpiRecord = require('../models/KpiRecord');
const MonthlyRoleKPI = require('../models/MonthlyRoleKPI');
const User = require('../models/User');
const KpiConfig = require('../models/KpiConfig');
const { calculateKPIByRole, calculateAdminStaff, calculateFinance } = require('../utils/kpiCalculator');

/**
 * 计算销售的完成系数（基于回款周期）
 * 
 * 业务规则说明：
 * - 返修可能是PM人员安排不当、翻译/审校/排版质量问题，或销售在项目初期沟通、需求理解、客户管理等方面的问题
 * - 虽然返修可能涉及销售责任，但销售KPI主要考核成交和回款，返修不直接扣减销售KPI
 * - 销售需登记返修但不扣KPI，通过其他指标（返修率统计、流程考核）约束销售行为
 * - 返修会影响PM的KPI（因为PM负责人员安排和质量管控），通过完成系数扣减
 * - 延期和客诉同样不影响销售KPI，但会影响生产人员（翻译、审校、排版、PM）的KPI
 * 
 * 销售完成系数根据回款周期计算：
 * - 3个月以内：1.0
 * - 3-6个月：0.9
 * - 6-9个月：0.8
 * - 9-12个月：0.7
 * - 12个月以上：0.6
 * 
 * 回款周期计算：从项目完成时间（completedAt）到回款时间（receivedAt）的月数
 * 如果项目未完成或未回款，使用项目创建时间（createdAt）到当前时间的月数作为参考
 * 
 * @param {Object} project - 项目对象
 * @returns {Number} 完成系数，根据回款周期返回0.6-1.0之间的值
 */
function calculateCompletionFactorForSales(project) {
  // 如果没有回款信息，返回默认值1.0（待回款项目暂不扣减）
  if (!project.payment || !project.payment.receivedAt || project.payment.receivedAmount <= 0) {
    return 1.0;
  }

  // 确定起始时间：优先使用项目完成时间，如果未完成则使用项目创建时间
  const startDate = project.completedAt || project.createdAt;
  if (!startDate) {
    return 1.0; // 如果没有起始时间，返回默认值
  }

  // 回款时间
  const receivedDate = new Date(project.payment.receivedAt);
  
  // 计算回款周期（月数）
  const monthsDiff = calculateMonthsDifference(startDate, receivedDate);
  
  // 根据回款周期返回对应的完成系数
  if (monthsDiff <= 3) {
    return 1.0; // 3个月以内
  } else if (monthsDiff <= 6) {
    return 0.9; // 3-6个月
  } else if (monthsDiff <= 9) {
    return 0.8; // 6-9个月
  } else if (monthsDiff <= 12) {
    return 0.7; // 9-12个月
  } else {
    return 0.6; // 12个月以上（用户说的-1可能是笔误，这里用0.6）
  }
}

/**
 * 计算两个日期之间的月数差
 * @param {Date|String} startDate - 开始日期
 * @param {Date|String} endDate - 结束日期
 * @returns {Number} 月数差（向上取整）
 */
function calculateMonthsDifference(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 0;
  }
  
  // 如果结束日期早于开始日期，返回0
  if (end < start) {
    return 0;
  }
  
  // 计算年份差和月份差
  const yearDiff = end.getFullYear() - start.getFullYear();
  const monthDiff = end.getMonth() - start.getMonth();
  const dayDiff = end.getDate() - start.getDate();
  
  // 总月数 = 年份差 * 12 + 月份差
  let totalMonths = yearDiff * 12 + monthDiff;
  
  // 如果结束日期的天数大于等于开始日期的天数，则算作完整的一个月
  // 例如：1月15日到2月15日算1个月，1月15日到2月14日也算1个月（向上取整）
  if (dayDiff >= 0) {
    totalMonths += 1;
  } else {
    // 如果结束日期的天数小于开始日期的天数，需要判断是否满一个月
    // 例如：1月15日到2月10日，虽然天数差为负，但已经跨月了，应该算1个月
    // 这里我们简单处理：只要跨月了就算1个月
    if (monthDiff > 0 || yearDiff > 0) {
      totalMonths += 1;
    }
  }
  
  return Math.max(0, totalMonths);
}

function appendComplaintNote(formula, project) {
  if (!project?.hasComplaint) return formula;
  return `${formula}；客诉扣减20%`;
}

function calculateSalesCombined(project, completionFactor) {
  const bonusRatio = project.locked_ratios?.sales_bonus || 0;
  const commissionRatio = project.locked_ratios?.sales_commission || 0;
  const projectAmount = project.projectAmount || 0;
  let receivedAmount = project.payment?.receivedAmount || 0;
  // 预估阶段：无回款金额则使用项目金额；若标记回款完成也同样以项目金额兜底
  if (!receivedAmount || receivedAmount <= 0 || project.payment?.isFullyPaid) {
    receivedAmount = projectAmount;
  }

  const bonusPart = projectAmount * (bonusRatio || 0);
  const commissionPart = receivedAmount * (commissionRatio || 0) * (completionFactor || 1.0);
  const kpiValue = Math.round((bonusPart + commissionPart) * 100) / 100;
  
  // 计算回款周期信息（用于公式显示）
  let paymentCycleInfo = '';
  if (project.payment && project.payment.receivedAt && project.payment.receivedAmount > 0) {
    const startDate = project.completedAt || project.createdAt;
    if (startDate) {
      const monthsDiff = calculateMonthsDifference(startDate, project.payment.receivedAt);
      if (monthsDiff <= 3) {
        paymentCycleInfo = '（回款周期≤3月）';
      } else if (monthsDiff <= 6) {
        paymentCycleInfo = '（回款周期3-6月）';
      } else if (monthsDiff <= 9) {
        paymentCycleInfo = '（回款周期6-9月）';
      } else if (monthsDiff <= 12) {
        paymentCycleInfo = '（回款周期9-12月）';
      } else {
        paymentCycleInfo = '（回款周期>12月）';
      }
    }
  }
  
  const formula = `成交金额(${projectAmount})×销售金额系数(${bonusRatio}) + 回款金额(${receivedAmount})×回款系数(${commissionRatio})×完成系数(${completionFactor})${paymentCycleInfo}`;

  return { kpiValue, formula, bonusPart, commissionPart, bonusRatio, commissionRatio, receivedAmount };
}

// 任务锁：防止并发执行月度KPI计算
const monthlyKPILocks = new Map();

/**
 * 生成指定月份的KPI记录（带并发保护）
 * @param {String} month - 月份，格式：YYYY-MM
 * @param {Boolean} force - 是否强制重新计算（默认false，跳过已存在的记录）
 */
async function generateMonthlyKPIRecords(month, force = false) {
  // 并发保护：如果该月份正在计算，等待或返回
  if (monthlyKPILocks.has(month)) {
    const lockInfo = monthlyKPILocks.get(month);
    const elapsed = Date.now() - lockInfo.startTime;
    // 如果锁超过30分钟，认为任务异常，释放锁
    if (elapsed > 30 * 60 * 1000) {
      console.warn(`⚠️  月度KPI计算任务锁超时，释放锁: ${month}`);
      monthlyKPILocks.delete(month);
    } else {
      return { 
        count: 0, 
        message: `该月份的KPI正在计算中，请稍后再试`,
        inProgress: true 
      };
    }
  }

  // 设置任务锁
  monthlyKPILocks.set(month, { startTime: Date.now() });

  try {
    // 解析月份
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59);

    // 查找该月完成的所有项目
    const projects = await Project.find({
      status: 'completed',
      completedAt: {
        $gte: startDate,
        $lte: endDate
      }
    });

    if (projects.length === 0) {
      monthlyKPILocks.delete(month);
      return { count: 0, message: '该月没有完成的项目' };
    }

    // 计算全公司总额（用于综合岗）
    const totalCompanyAmount = projects.reduce((sum, p) => sum + p.projectAmount, 0);

    let recordCount = 0;
    let updatedCount = 0;
    const errors = [];

    // 遍历每个项目
    for (const project of projects) {
      try {
        // 获取项目成员
        const members = await ProjectMember.find({ projectId: project._id })
          .populate('userId');

        if (members.length === 0) {
          continue;
        }

        // 计算完成系数
        const completionFactor = project.calculateCompletionFactor();

        // 为每个成员计算KPI（使用 upsert 确保幂等性）
        for (const member of members) {
          try {
            const ratio = member.ratio_locked;
            let effectiveRatio = ratio;
            const wordRatio = member.wordRatio || 1.0;
            const translatorType = member.translatorType || 'mtpe';

            let kpiResult;

            if (member.role === 'sales') {
              // 销售：金额奖励 + 回款奖励（均计入）
              // 统一使用 calculateCompletionFactorForSales 确保规则一致
              const salesCompletion = calculateCompletionFactorForSales(project);
              const salesResult = calculateSalesCombined(project, salesCompletion);
              effectiveRatio = project.locked_ratios.sales_bonus;
              kpiResult = {
                kpiValue: salesResult.kpiValue,
                formula: salesResult.formula
              };
            } else if (member.role === 'part_time_sales') {
              // 兼职销售：成交额 - 公司应收 - 税费 = 返还佣金
              const commission = project.calculatePartTimeSalesCommission();
              const totalAmount = project.projectAmount || 0;
              const companyReceivable = project.partTimeSales?.companyReceivable || 0;
              const taxRate = project.partTimeSales?.taxRate || 0;
              const receivableAmount = totalAmount - companyReceivable;
              const taxAmount = receivableAmount * taxRate;
              
              kpiResult = {
                kpiValue: commission,
                formula: `成交额(${totalAmount}) - 公司应收(${companyReceivable}) = 应收金额(${receivableAmount})；应收金额(${receivableAmount}) - 税费(${taxAmount.toFixed(2)}) = 返还佣金(${commission})`
              };
            } else if (member.role === 'layout') {
              // 兼职排版：直接使用排版费用作为KPI（按金额计算）
              const layoutCost = project.partTimeLayout?.layoutCost || 0;
              kpiResult = {
                kpiValue: layoutCost,
                formula: `排版费用：${layoutCost}元`
              };
            } else if (member.role === 'admin_staff' || member.role === 'finance') {
              // 综合岗和财务岗：跳过项目级计算，将在最后按月汇总计算
              continue;
            } else {
              // 其他角色
              kpiResult = calculateKPIByRole({
                role: member.role,
                projectAmount: project.projectAmount,
                ratio: effectiveRatio,
                wordRatio,
                completionFactor,
                translatorType
              });
            }

            // 追加客诉说明
            kpiResult.formula = appendComplaintNote(kpiResult.formula, project);

            // 使用 upsert 确保幂等性（基于唯一索引：userId + projectId + month + role）
            const recordData = {
              userId: member.userId._id,
              projectId: project._id,
              role: member.role,
              month,
              kpiValue: kpiResult.kpiValue,
              calculationDetails: {
                projectAmount: project.projectAmount,
                ratio: effectiveRatio,
                wordRatio: member.role === 'translator' ? wordRatio : undefined,
                completionFactor: member.role === 'sales' ? calculateCompletionFactorForSales(project) : completionFactor,
                formula: kpiResult.formula,
                complaintPenalty: project.hasComplaint ? 0.2 : 0,
                hasComplaint: !!project.hasComplaint
              }
            };

            // 使用 findOneAndUpdate 实现 upsert（如果不存在则创建，存在则更新）
            const existing = await KpiRecord.findOne({
              userId: member.userId._id,
              projectId: project._id,
              month,
              role: member.role
            });

            if (existing) {
              if (force) {
                // 强制更新
                await KpiRecord.findByIdAndUpdate(existing._id, recordData);
                updatedCount++;
              } else {
                // 跳过已存在的记录
                continue;
              }
            } else {
              // 创建新记录
              await KpiRecord.create(recordData);
              recordCount++;
            }
          } catch (memberError) {
            // 如果是唯一约束冲突，忽略（说明并发插入导致）
            if (memberError.code === 11000) {
              console.warn(`⚠️  KPI记录已存在（并发插入）: ${member.userId?.name} - ${project.projectName}`);
              continue;
            }
            errors.push({
              project: project.projectName,
              member: member.userId?.name || 'Unknown',
              error: memberError.message
            });
          }
        }
      } catch (projectError) {
        errors.push({
          project: project.projectName,
          error: projectError.message
        });
      }
    }

    // 为综合岗和财务岗生成月度汇总KPI（使用管理员评价完成系数，默认1.0）
    try {
      // 获取当前配置的admin_ratio
      const config = await KpiConfig.findOne().sort({ createdAt: -1 });
      const adminRatio = config?.admin_ratio || 0;

      if (adminRatio > 0 && totalCompanyAmount > 0) {
        // 查找所有综合岗和财务岗用户
        const adminStaffUsers = await User.find({ roles: 'admin_staff' });
        const financeUsers = await User.find({ roles: 'finance' });

        // 为综合岗用户生成月度KPI（使用与财务岗相同的计算公式）
        for (const user of adminStaffUsers) {
          try {
            // 查找是否已有记录（可能已有管理员评价）
            const existing = await MonthlyRoleKPI.findOne({
              userId: user._id,
              month,
              role: 'admin_staff'
            });

            if (existing) {
              if (force) {
                // 强制重新计算（但保留评价系数）
                const evaluationFactor = existing.evaluationFactor || 1.0;
                // 使用与财务岗相同的计算公式：calculateFinance
                const kpiValue = calculateFinance(totalCompanyAmount, adminRatio, evaluationFactor);
                existing.totalCompanyAmount = totalCompanyAmount;
                existing.ratio = adminRatio;
                existing.kpiValue = kpiValue;
                existing.calculationDetails = {
                  formula: `全公司当月项目总金额(${totalCompanyAmount}) × 综合岗系数(${adminRatio}) × 完成系数(${evaluationFactor})`
                };
                await existing.save();
                updatedCount++;
              }
              // 如果不强制，保留原有评价
            } else {
              // 创建新记录（默认评价为"中"，系数1.0）
              // 使用与财务岗相同的计算公式：calculateFinance
              const kpiValue = calculateFinance(totalCompanyAmount, adminRatio, 1.0);
              await MonthlyRoleKPI.create({
                userId: user._id,
                role: 'admin_staff',
                month,
                totalCompanyAmount,
                ratio: adminRatio,
                evaluationFactor: 1.0,
                evaluationLevel: 'medium',
                kpiValue,
                calculationDetails: {
                  formula: `全公司当月项目总金额(${totalCompanyAmount}) × 综合岗系数(${adminRatio}) × 完成系数(1.0)`
                }
              });
              recordCount++;
            }
          } catch (error) {
            if (error.code !== 11000) { // 忽略唯一约束冲突
              errors.push({
                user: user.name,
                role: 'admin_staff',
                error: error.message
              });
            }
          }
        }

        // 为财务岗用户生成月度KPI
        for (const user of financeUsers) {
          try {
            // 查找是否已有记录（可能已有管理员评价）
            const existing = await MonthlyRoleKPI.findOne({
              userId: user._id,
              month,
              role: 'finance'
            });

            if (existing) {
              if (force) {
                // 强制重新计算（但保留评价系数）
                const evaluationFactor = existing.evaluationFactor || 1.0;
                const kpiValue = calculateFinance(totalCompanyAmount, adminRatio, evaluationFactor);
                existing.totalCompanyAmount = totalCompanyAmount;
                existing.ratio = adminRatio;
                existing.kpiValue = kpiValue;
                existing.calculationDetails = {
                  formula: `全公司当月项目总金额(${totalCompanyAmount}) × 财务岗系数(${adminRatio}) × 完成系数(${evaluationFactor})`
                };
                await existing.save();
                updatedCount++;
              }
              // 如果不强制，保留原有评价
            } else {
              // 创建新记录（默认评价为"中"，系数1.0）
              const kpiValue = calculateFinance(totalCompanyAmount, adminRatio, 1.0);
              await MonthlyRoleKPI.create({
                userId: user._id,
                role: 'finance',
                month,
                totalCompanyAmount,
                ratio: adminRatio,
                evaluationFactor: 1.0,
                evaluationLevel: 'medium',
                kpiValue,
                calculationDetails: {
                  formula: `全公司当月项目总金额(${totalCompanyAmount}) × 财务岗系数(${adminRatio}) × 完成系数(1.0)`
                }
              });
              recordCount++;
            }
          } catch (error) {
            if (error.code !== 11000) { // 忽略唯一约束冲突
              errors.push({
                user: user.name,
                role: 'finance',
                error: error.message
              });
            }
          }
        }
      }
    } catch (monthlyError) {
      errors.push({
        type: 'monthly_role_kpi',
        error: monthlyError.message
      });
    }

    return {
      count: recordCount,
      updated: updatedCount,
      projectsProcessed: projects.length,
      errors: errors.length > 0 ? errors : undefined
    };
  } finally {
    // 释放任务锁
    monthlyKPILocks.delete(month);
  }
}

/**
 * 获取用户月度KPI汇总
 * @param {String} userId - 用户ID
 * @param {String} month - 月份
 */
async function getUserMonthlyKPI(userId, month) {
  const records = await KpiRecord.find({ userId, month })
    .populate('projectId', 'projectName clientName');

  // 获取月度角色KPI（综合岗和财务岗）
  const monthlyRoleKPIs = await MonthlyRoleKPI.find({ userId, month })
    .populate('evaluatedBy', 'name username');

  const total = records.reduce((sum, r) => sum + r.kpiValue, 0) + 
                monthlyRoleKPIs.reduce((sum, r) => sum + r.kpiValue, 0);
  const byRole = {};

  records.forEach(record => {
    if (!byRole[record.role]) {
      byRole[record.role] = 0;
    }
    byRole[record.role] += record.kpiValue;
  });

  monthlyRoleKPIs.forEach(record => {
    if (!byRole[record.role]) {
      byRole[record.role] = 0;
    }
    byRole[record.role] += record.kpiValue;
  });

  return {
    total: Math.round(total * 100) / 100,
    byRole: Object.entries(byRole).reduce((acc, [role, value]) => {
      acc[role] = Math.round(value * 100) / 100;
      return acc;
    }, {}),
    records,
    monthlyRoleKPIs
  };
}

/**
 * 为单个项目实时计算并生成KPI记录
 * @param {String} projectId - 项目ID
 */
async function generateProjectKPI(projectId) {
  const project = await Project.findById(projectId);
  
  if (!project) {
    throw new Error('项目不存在');
  }

  if (project.status !== 'completed') {
    throw new Error('项目尚未完成，无法计算KPI');
  }

  // 获取项目完成月份
  const completedDate = project.completedAt || new Date();
  const month = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}`;

  // 检查是否已生成过KPI记录
  const existingRecords = await KpiRecord.find({
    projectId: project._id
  });

  if (existingRecords.length > 0) {
    // 如果已存在，删除旧记录（允许重新计算）
    await KpiRecord.deleteMany({ projectId: project._id });
  }

  // 获取项目成员
  const members = await ProjectMember.find({ projectId: project._id })
    .populate('userId');

  if (members.length === 0) {
    return { count: 0, message: '项目没有成员，无法计算KPI' };
  }

  // 计算完成系数
  const completionFactor = project.calculateCompletionFactor();

  // 计算全公司总额（用于综合岗，需要查询当月所有完成项目）
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59);
  
  const monthlyProjects = await Project.find({
    status: 'completed',
    completedAt: {
      $gte: startDate,
      $lte: endDate
    }
  });
  const totalCompanyAmount = monthlyProjects.reduce((sum, p) => sum + p.projectAmount, 0);

  let recordCount = 0;
  const errors = [];

  // 为每个成员计算KPI
  for (const member of members) {
    try {
      const ratio = member.ratio_locked;
      let effectiveRatio = ratio;
      const wordRatio = member.wordRatio || 1.0;
      const translatorType = member.translatorType || 'mtpe';

      let kpiResult;

      if (member.role === 'sales') {
        // 销售：金额奖励 + 回款奖励（均计入）
        // 统一使用 calculateCompletionFactorForSales 确保规则一致
        const salesCompletion = calculateCompletionFactorForSales(project);
        const salesResult = calculateSalesCombined(project, salesCompletion);
        effectiveRatio = project.locked_ratios.sales_bonus;
        kpiResult = {
          kpiValue: salesResult.kpiValue,
          formula: salesResult.formula
        };
      } else if (member.role === 'admin_staff' || member.role === 'finance') {
        // 综合岗和财务岗：跳过项目级计算，将在月度汇总时使用管理员评价的完成系数
        continue;
      } else {
        // 其他角色
        kpiResult = calculateKPIByRole({
          role: member.role,
          projectAmount: project.projectAmount,
          ratio: effectiveRatio,
          wordRatio,
          completionFactor,
          translatorType
        });
      }

      // 创建KPI记录
      await KpiRecord.create({
        userId: member.userId._id,
        projectId: project._id,
        role: member.role,
        month,
        kpiValue: kpiResult.kpiValue,
        calculationDetails: {
          projectAmount: project.projectAmount,
          ratio: effectiveRatio,
          wordRatio: member.role === 'translator' ? wordRatio : undefined,
              completionFactor: member.role === 'sales' ? calculateCompletionFactorForSales(project) : completionFactor,
              formula: member.role === 'sales' ? kpiResult.formula : appendComplaintNote(kpiResult.formula, project),
              complaintPenalty: member.role === 'sales' ? 0 : (project.hasComplaint ? 0.2 : 0),
              hasComplaint: member.role === 'sales' ? false : !!project.hasComplaint,
              // 兼职销售相关
              partTimeSalesCommission: member.role === 'part_time_sales' ? kpiResult.kpiValue : undefined,
              // 兼职排版相关
              layoutCost: member.role === 'layout' ? kpiResult.kpiValue : undefined
        }
      });

      recordCount++;
    } catch (memberError) {
      errors.push({
        member: member.userId?.name || 'Unknown',
        error: memberError.message
      });
    }
  }

  return {
    count: recordCount,
    month,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * 实时计算单个项目的KPI（不落库）
 * @param {String} projectId
 */
async function calculateProjectRealtime(projectId) {
  const project = await Project.findById(projectId);
  
  if (!project) {
    throw new Error('项目不存在');
  }

  // 确定计算月份（已完成用完成时间，未完成用当前时间）
  const targetDate = project.completedAt || new Date();
  const month = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

  // 获取项目成员
  const members = await ProjectMember.find({ projectId: project._id })
    .populate('userId');

  // 如果未显式添加销售成员，但创建人具备销售角色，自动补充一条销售成员用于预估
  const hasSalesMember = members.some(m => m.role === 'sales');
  if (!hasSalesMember && project.createdBy) {
    const creator = await User.findById(project.createdBy);
    if (creator && (creator.roles || []).includes('sales')) {
      members.push({
        userId: creator,
        role: 'sales',
        ratio_locked: project.locked_ratios.sales_bonus,
        wordRatio: 1.0,
        translatorType: 'mtpe'
      });
    }
  }

  if (members.length === 0) {
    return { count: 0, message: '项目没有成员，无法计算KPI', month, results: [] };
  }

  // 计算完成系数
  const completionFactor = project.calculateCompletionFactor();

  // 计算全公司总额（用于综合岗，基于同月已完成项目）
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59);
  
  const monthlyProjects = await Project.find({
    status: 'completed',
    completedAt: {
      $gte: startDate,
      $lte: endDate
    }
  });
  const totalCompanyAmount = monthlyProjects.reduce((sum, p) => sum + p.projectAmount, 0);

  const results = [];

  for (const member of members) {
    const ratio = member.ratio_locked;
    let effectiveRatio = ratio;
    const wordRatio = member.wordRatio || 1.0;
    const translatorType = member.translatorType || 'mtpe';

    let kpiResult;

    if (member.role === 'sales') {
      // 销售：金额奖励 + 回款奖励（均计入），不受客诉扣减，但受返修/延期影响
      const salesCompletion = calculateCompletionFactorForSales(project);
      const salesResult = calculateSalesCombined(project, salesCompletion);
      effectiveRatio = project.locked_ratios.sales_bonus;
      kpiResult = {
        kpiValue: salesResult.kpiValue,
        formula: salesResult.formula,
        bonusPart: salesResult.bonusPart,
        commissionPart: salesResult.commissionPart
      };
      } else if (member.role === 'part_time_sales') {
        // 兼职销售：成交额 - 公司应收 - 税费 = 返还佣金
        const commission = project.calculatePartTimeSalesCommission();
        const totalAmount = project.projectAmount || 0;
        const companyReceivable = project.partTimeSales?.companyReceivable || 0;
        const taxRate = project.partTimeSales?.taxRate || 0;
        const receivableAmount = totalAmount - companyReceivable;
        const taxAmount = receivableAmount * taxRate;
        
        kpiResult = {
          kpiValue: commission,
          formula: `成交额(${totalAmount}) - 公司应收(${companyReceivable}) = 应收金额(${receivableAmount})；应收金额(${receivableAmount}) - 税费(${taxAmount.toFixed(2)}) = 返还佣金(${commission})`
        };
      } else if (member.role === 'layout') {
        // 兼职排版：直接使用排版费用作为KPI
        const layoutCost = project.partTimeLayout?.layoutCost || 0;
        kpiResult = {
          kpiValue: layoutCost,
          formula: `排版费用：${layoutCost}元`
        };
    } else if (member.role === 'admin_staff' || member.role === 'finance') {
      // 综合岗和财务岗：需要按月汇总计算，使用管理员评价的完成系数
      // 实时计算时，提示需要按月汇总
      kpiResult = {
        kpiValue: 0,
        formula: '综合岗/财务岗KPI需要按月汇总计算，使用管理员评价的完成系数'
      };
    } else {
      // 其他角色
      kpiResult = calculateKPIByRole({
        role: member.role,
        projectAmount: project.projectAmount,
        ratio: effectiveRatio,
        wordRatio,
        completionFactor,
        translatorType
      });
    }

    // 追加客诉说明
    kpiResult.formula = appendComplaintNote(kpiResult.formula, project);

    results.push({
      userId: member.userId._id,
      userName: member.userId.name,
      role: member.role,
      kpiValue: kpiResult.kpiValue,
      formula: member.role === 'sales' ? kpiResult.formula : appendComplaintNote(kpiResult.formula, project),
      details: {
        projectAmount: member.role === 'admin_staff' ? totalCompanyAmount : project.projectAmount,
        ratio: effectiveRatio,
        wordRatio: member.role === 'translator' ? wordRatio : undefined,
        completionFactor: member.role === 'sales' ? calculateCompletionFactorForSales(project) : completionFactor,
        translatorType: member.role === 'translator' ? translatorType : undefined,
        salesBonus: member.role === 'sales' ? kpiResult.bonusPart : undefined,
        salesCommission: member.role === 'sales' ? kpiResult.commissionPart : undefined
      }
    });
  }

  return {
    count: results.length,
    month,
    project: {
      id: project._id,
      projectName: project.projectName,
      projectAmount: project.projectAmount,
      completionFactor
    },
    results
  };
}

module.exports = {
  generateMonthlyKPIRecords,
  getUserMonthlyKPI,
  generateProjectKPI,
  calculateProjectRealtime
};

