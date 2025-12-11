const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const KpiRecord = require('../models/KpiRecord');
const User = require('../models/User');
const { calculateKPIByRole } = require('../utils/kpiCalculator');

/**
 * 计算销售的完成系数
 * 
 * 业务规则说明：
 * - 返修可能是PM人员安排不当、翻译/审校/排版质量问题，或销售在项目初期沟通、需求理解、客户管理等方面的问题
 * - 虽然返修可能涉及销售责任，但销售KPI主要考核成交和回款，返修不直接扣减销售KPI
 * - 销售需登记返修但不扣KPI，通过其他指标（返修率统计、流程考核）约束销售行为
 * - 返修会影响PM的KPI（因为PM负责人员安排和质量管控），通过完成系数扣减
 * - 延期和客诉同样不影响销售KPI，但会影响生产人员（翻译、审校、排版、PM）的KPI
 * 
 * 因此，销售最终考核仅与回款相关，完成系数固定为1，不受返修/延期/客诉影响。
 * 
 * @param {Object} project - 项目对象
 * @returns {Number} 完成系数，始终返回1
 */
function calculateCompletionFactorForSales(project) {
  // 销售最终考核仅与回款相关，不受返修/延期/客诉影响
  // 统一返回1，确保批量计算和单项目重算结果一致
  return 1;
}

function appendComplaintNote(formula, project) {
  if (!project?.hasComplaint) return formula;
  return `${formula}；客诉扣减20%`;
}

function calculateSalesCombined(project, completionFactor) {
  const bonusRatio = project.locked_ratios.sales_bonus;
  const commissionRatio = project.locked_ratios.sales_commission;
  const projectAmount = project.projectAmount || 0;
  let receivedAmount = project.payment?.receivedAmount || 0;
  // 预估阶段：无回款金额则使用项目金额；若标记回款完成也同样以项目金额兜底
  if (!receivedAmount || receivedAmount <= 0 || project.payment?.isFullyPaid) {
    receivedAmount = projectAmount;
  }

  const bonusPart = projectAmount * bonusRatio;
  const commissionPart = receivedAmount * commissionRatio * completionFactor;
  const kpiValue = Math.round((bonusPart + commissionPart) * 100) / 100;
  const formula = `成交金额(${projectAmount})×销售金额系数(${bonusRatio}) + 回款金额(${receivedAmount})×回款系数(${commissionRatio})×完成系数(${completionFactor})`;

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
              // 兼职排版：直接使用排版费用作为KPI
              const layoutCost = project.partTimeLayout?.layoutCost || 0;
              kpiResult = {
                kpiValue: layoutCost,
                formula: `排版费用：${layoutCost}元`
              };
            } else if (member.role === 'admin_staff') {
              // 综合岗：使用全公司总额
              kpiResult = calculateKPIByRole({
                role: member.role,
                projectAmount: totalCompanyAmount,
                ratio: effectiveRatio,
                completionFactor
              });
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

  const total = records.reduce((sum, r) => sum + r.kpiValue, 0);
  const byRole = {};

  records.forEach(record => {
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
    records
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
      } else if (member.role === 'admin_staff') {
        // 综合岗：使用全公司总额
        kpiResult = calculateKPIByRole({
          role: member.role,
          projectAmount: totalCompanyAmount,
          ratio: effectiveRatio,
          completionFactor
        });
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
    } else if (member.role === 'admin_staff') {
      // 综合岗：使用全公司总额
      kpiResult = calculateKPIByRole({
        role: member.role,
        projectAmount: totalCompanyAmount,
        ratio: effectiveRatio,
        completionFactor
      });
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

