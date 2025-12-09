/**
 * KPI计算工具类
 * 根据README中的计算规则实现
 */

/**
 * 计算翻译（MTPE）KPI
 * @param {Number} projectAmount - 项目金额
 * @param {Number} ratio - 翻译系数
 * @param {Number} wordRatio - 字数占比
 * @param {Number} completionFactor - 完成系数
 */
function calculateTranslatorMTPE(projectAmount, ratio, wordRatio, completionFactor) {
  return projectAmount * ratio * wordRatio * completionFactor;
}

/**
 * 计算翻译（深度编辑）KPI
 * @param {Number} projectAmount - 项目金额
 * @param {Number} ratio - 深度编辑系数
 * @param {Number} wordRatio - 字数占比
 * @param {Number} completionFactor - 完成系数
 */
function calculateTranslatorDeepEdit(projectAmount, ratio, wordRatio, completionFactor) {
  return projectAmount * ratio * wordRatio * completionFactor;
}

/**
 * 计算审校KPI
 * @param {Number} projectAmount - 项目金额
 * @param {Number} ratio - 审校系数
 * @param {Number} completionFactor - 完成系数
 */
function calculateReviewer(projectAmount, ratio, completionFactor) {
  return projectAmount * ratio * completionFactor;
}

/**
 * 计算PM KPI
 * @param {Number} projectAmount - 项目金额
 * @param {Number} ratio - PM系数
 * @param {Number} completionFactor - 完成系数
 */
function calculatePM(projectAmount, ratio, completionFactor) {
  return projectAmount * ratio * completionFactor;
}

/**
 * 计算销售金额奖励
 * @param {Number} projectAmount - 成交金额
 * @param {Number} ratio - 销售金额奖励系数
 */
function calculateSalesBonus(projectAmount, ratio) {
  return projectAmount * ratio;
}

/**
 * 计算销售回款奖励
 * @param {Number} receivedAmount - 回款金额
 * @param {Number} ratio - 回款系数
 * @param {Number} completionFactor - 完成系数
 */
function calculateSalesCommission(receivedAmount, ratio, completionFactor) {
  return receivedAmount * ratio * completionFactor;
}

/**
 * 计算综合岗KPI
 * @param {Number} totalCompanyAmount - 全公司项目金额合计
 * @param {Number} ratio - 综合岗系数
 * @param {Number} completionFactor - 完成系数
 */
function calculateAdminStaff(totalCompanyAmount, ratio, completionFactor) {
  return totalCompanyAmount * ratio * completionFactor;
}

/**
 * 根据角色计算KPI
 * @param {Object} params - 计算参数
 */
function calculateKPIByRole(params) {
  const { role, projectAmount, ratio, wordRatio = 1, completionFactor = 1, translatorType = 'mtpe', receivedAmount = 0 } = params;

  let kpiValue = 0;
  let formula = '';

  switch (role) {
    case 'translator':
      if (translatorType === 'mtpe') {
        kpiValue = calculateTranslatorMTPE(projectAmount, ratio, wordRatio, completionFactor);
        formula = `项目金额(${projectAmount}) × 翻译系数(${ratio}) × 字数占比(${wordRatio}) × 完成系数(${completionFactor})`;
      } else {
        kpiValue = calculateTranslatorDeepEdit(projectAmount, ratio, wordRatio, completionFactor);
        formula = `项目金额(${projectAmount}) × 深度编辑系数(${ratio}) × 字数占比(${wordRatio}) × 完成系数(${completionFactor})`;
      }
      break;

    case 'reviewer':
      kpiValue = calculateReviewer(projectAmount, ratio, completionFactor);
      formula = `项目金额(${projectAmount}) × 审校系数(${ratio}) × 完成系数(${completionFactor})`;
      break;

    case 'pm':
      kpiValue = calculatePM(projectAmount, ratio, completionFactor);
      formula = `项目金额(${projectAmount}) × PM系数(${ratio}) × 完成系数(${completionFactor})`;
      break;

    case 'sales':
      // 销售有两种：金额奖励和回款奖励
      if (receivedAmount > 0) {
        kpiValue = calculateSalesCommission(receivedAmount, ratio, completionFactor);
        formula = `回款金额(${receivedAmount}) × 回款系数(${ratio}) × 完成系数(${completionFactor})`;
      } else {
        kpiValue = calculateSalesBonus(projectAmount, ratio);
        formula = `成交金额(${projectAmount}) × 销售金额奖励系数(${ratio})`;
      }
      break;

    case 'admin_staff':
      // 综合岗需要全公司总额，这里先返回0，需要在调用时传入totalCompanyAmount
      kpiValue = 0;
      formula = '综合岗需要全公司总额计算';
      break;

    default:
      throw new Error(`未知的角色类型: ${role}`);
  }

  return {
    kpiValue: Math.round(kpiValue * 100) / 100, // 保留两位小数
    formula
  };
}

module.exports = {
  calculateTranslatorMTPE,
  calculateTranslatorDeepEdit,
  calculateReviewer,
  calculatePM,
  calculateSalesBonus,
  calculateSalesCommission,
  calculateAdminStaff,
  calculateKPIByRole
};

















