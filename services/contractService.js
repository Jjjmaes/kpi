const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs').promises;
const path = require('path');

/**
 * 生成项目合同 Word 文档（基于 docxtemplater 模板）
 * @param {Object} project - 项目数据（包含 customerId, contactInfo 等）
 * @param {Array} members - 项目成员列表（已 populate userId）
 * @returns {Promise<Buffer>} docx 文件 Buffer
 */
async function generateProjectContract(project, members = []) {
  // 构建模板变量
  const data = buildTemplateVariables(project, members);
  
  // 模板文件路径
  const templatePath = path.join(__dirname, '..', 'templates', 'contract-template.docx');
  
  console.log('[ContractService] 开始生成合同:', {
    projectId: project._id,
    projectNumber: project.projectNumber,
    templatePath,
  });
  
  try {
    // 检查模板文件是否存在
    try {
      await fs.access(templatePath);
    } catch (accessError) {
      console.error('[ContractService] 模板文件不存在:', templatePath);
      throw new Error(`合同模板文件不存在: ${templatePath}。请先创建模板文件。`);
    }
    
    // 读取模板文件
    const templateBuffer = await fs.readFile(templatePath);
    console.log('[ContractService] 模板文件读取成功，大小:', templateBuffer.length, 'bytes');
    
    // 使用 PizZip 加载 docx 文件
    let zip;
    try {
      zip = new PizZip(templateBuffer);
    } catch (zipError) {
      console.error('[ContractService] PizZip 加载失败:', zipError);
      throw new Error(`模板文件格式错误，无法读取: ${zipError.message}`);
    }
    
    // 创建 Docxtemplater 实例
    let doc;
    try {
      doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: {
          start: '{',
          end: '}',
        },
      });
      
      // 设置数据
      doc.setData(data);
      console.log('[ContractService] 变量设置成功，变量数量:', Object.keys(data).length);
      
    } catch (docError) {
      console.error('[ContractService] Docxtemplater 初始化失败:', docError);
      console.error('[ContractService] 错误详情:', JSON.stringify(docError, null, 2));
      
      // 提取所有错误详情
      let errorDetails = `模板初始化失败: ${docError.message}`;
      if (docError.properties && docError.properties.errors) {
        errorDetails += '\n\n详细错误信息：\n';
        docError.properties.errors.forEach((err, index) => {
          errorDetails += `\n错误 ${index + 1}:\n`;
          errorDetails += `  类型: ${err.name || 'Unknown'}\n`;
          errorDetails += `  消息: ${err.message || 'N/A'}\n`;
          if (err.properties) {
            if (err.properties.explanation) {
              errorDetails += `  说明: ${err.properties.explanation}\n`;
            }
            if (err.properties.context) {
              errorDetails += `  上下文: ${JSON.stringify(err.properties.context)}\n`;
            }
            if (err.properties.tag) {
              errorDetails += `  标签: ${err.properties.tag}\n`;
            }
            if (err.properties.id) {
              errorDetails += `  错误ID: ${err.properties.id}\n`;
            }
            if (err.properties.location) {
              errorDetails += `  位置: ${JSON.stringify(err.properties.location)}\n`;
            }
          }
        });
      }
      
      throw new Error(errorDetails);
    }
    
    // 渲染文档（替换变量）
    try {
      doc.render();
      console.log('[ContractService] 模板渲染成功');
    } catch (error) {
      // 处理模板错误
      const e = {
        message: error.message,
        name: error.name,
        stack: error.stack,
        properties: error.properties,
      };
      console.error('[ContractService] 模板渲染错误:', JSON.stringify(e, null, 2));
      
      // 提取更详细的错误信息
      let errorMessage = `模板渲染失败: ${e.message}`;
      if (e.properties) {
        if (e.properties.explanation) {
          errorMessage += `\n说明: ${e.properties.explanation}`;
        }
        if (e.properties.context) {
          errorMessage += `\n上下文: ${JSON.stringify(e.properties.context)}`;
        }
        if (e.properties.rootCause) {
          errorMessage += `\n根本原因: ${e.properties.rootCause}`;
        }
      }
      throw new Error(errorMessage);
    }
    
    // 生成文档 Buffer
    let buffer;
    try {
      buffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });
      console.log('[ContractService] 文档生成成功，大小:', buffer.length, 'bytes');
    } catch (bufferError) {
      console.error('[ContractService] 生成文档 Buffer 失败:', bufferError);
      throw new Error(`生成文档失败: ${bufferError.message}`);
    }
    
    return buffer;
  } catch (error) {
    console.error('[ContractService] 生成合同失败:', {
      error: error.message,
      stack: error.stack,
      templatePath,
    });
    throw error;
  }
}

/**
 * 构建模板变量对象
 * @param {Object} project - 项目数据
 * @param {Array} members - 项目成员列表
 * @returns {Object} 模板变量对象
 */
function buildTemplateVariables(project, members = []) {
  const contact = project.contactInfo || project.customerId || {};
  const reqs = project.specialRequirements || {};
  
  // 辅助函数：确保值是字符串
  const ensureString = (value) => {
    if (value === null || value === undefined) return '—';
    return String(value);
  };
  
  // 格式化目标语种（过滤掉空值、null、undefined 和无效值）
  const targetLanguages = (project.targetLanguages || [])
    .filter(lang => lang && typeof lang === 'string' && lang.trim() !== '')
    .map(lang => lang.trim())
    .filter(lang => {
      // 过滤掉明显不是语种的值（如角色代码、空字符串等）
      const invalidPatterns = ['pm', 'sales', 'translator', 'reviewer', 'layout', 'admin', 'finance'];
      const lowerLang = lang.toLowerCase();
      return !invalidPatterns.includes(lowerLang) && lang.length > 0;
    });
  const targetLanguagesText = targetLanguages.length > 0 ? targetLanguages.join('、') : '—';
  
  // 格式化金额
  const amountText = project.projectAmount
    ? `人民币 ¥${Number(project.projectAmount).toFixed(2)}${project.isTaxIncluded ? '（含税）' : ''}`
    : '—';
  
  // 格式化单价
  const unitPriceText = project.unitPrice ? `¥${Number(project.unitPrice).toFixed(2)} / 千字` : '—';
  
  // 格式化字数
  const wordCountText = project.wordCount ? `${project.wordCount} 字` : '—';
  
  // 计算交付天数
  const deliveryDaysText = project.deadline ? daysFromNow(project.deadline) : '—';
  
  // 计算付款天数
  const payDueDaysText = project.expectedAt
    ? daysFromNow(project.expectedAt)
    : (project.payment && project.payment.expectedAt ? daysFromNow(project.payment.expectedAt) : '—');
  
  // 格式化日期
  const deadlineText = project.deadline ? formatDate(project.deadline) : '—';
  const payDueDateText = project.expectedAt
    ? formatDate(project.expectedAt)
    : (project.payment && project.payment.expectedAt ? formatDate(project.payment.expectedAt) : '—');
  
  // 业务类型和项目类型
  const businessTypeText = businessTypeLabel(project.businessType);
  const projectTypeText = projectTypeLabel(project.projectType);
  
  // 翻译类型复选框（布尔值）
  const isTranslation = project.businessType === 'translation';
  const isInterpretation = project.businessType === 'interpretation';
  
  // 交付方式复选框（布尔值）
  const hasElectronic = true; // 默认电子版
  const hasEmail = true; // 默认电子邮件
  const hasFax = false;
  const hasPrint = reqs.printSealExpress || false;
  
  // 格式化项目成员列表（用于循环）
  const formattedMembers = (members || []).map(member => {
    if (!member) return null;
    return {
      role: ensureString(getRoleName(member.role)),
      name: ensureString(member.userId?.name),
      username: ensureString(member.userId?.username),
      email: ensureString(member.userId?.email),
      phone: ensureString(member.userId?.phone),
    };
  }).filter(m => m !== null); // 过滤掉 null 值
  
  // 构建返回对象，确保所有值都是字符串或基本类型
  const variables = {
    // 基本信息（字符串）
    projectNumber: ensureString(project.projectNumber),
    projectName: ensureString(project.projectName),
    sourceLanguage: ensureString(project.sourceLanguage),
    targetLanguagesText: ensureString(targetLanguagesText),
    
    // 客户信息（字符串）
    customerName: ensureString(project.customerId?.name || project.clientName),
    customerAddress: ensureString(project.customerId?.address),
    contactName: ensureString(contact.name || project.customerId?.contactPerson),
    contactPhone: ensureString(contact.phone || project.customerId?.phone),
    contactEmail: ensureString(contact.email || project.customerId?.email),
    
    // 乙方信息（项目创建者）
    creatorEmail: ensureString(project.createdBy?.email),
    creatorName: ensureString(project.createdBy?.name),
    
    // 业务信息（字符串）
    businessTypeText: ensureString(businessTypeText),
    projectTypeText: ensureString(projectTypeText),
    
    // 翻译类型（布尔值，用于条件判断）
    isTranslation: Boolean(isTranslation),
    isInterpretation: Boolean(isInterpretation),
    
    // 费用信息（字符串）
    unitPriceText: ensureString(unitPriceText),
    wordCountText: ensureString(wordCountText),
    amountText: ensureString(amountText),
    taxIncludedText: project.isTaxIncluded ? '含税' : '不含税',
    
    // 时间信息（字符串）
    deadlineText: ensureString(deadlineText),
    deliveryDaysText: ensureString(deliveryDaysText),
    payDueDateText: ensureString(payDueDateText),
    payDueDaysText: ensureString(payDueDaysText),
    
    // 付款信息（字符串）- 转换为中文
    paymentStatusText: paymentStatusToChinese(project.payment?.paymentStatus),
    
    // 交付方式（布尔值，用于条件判断）
    hasElectronic: Boolean(hasElectronic),
    hasEmail: Boolean(hasEmail),
    hasFax: Boolean(hasFax),
    hasPrint: Boolean(hasPrint),
    
    // 特殊要求（字符串）
    terminologyText: boolText(reqs.terminology),
    referenceFilesText: boolText(reqs.referenceFiles),
    bilingualDeliveryText: boolText(reqs.bilingualDelivery),
    pureTranslationDeliveryText: boolText(reqs.pureTranslationDelivery),
    printSealExpressText: boolText(reqs.printSealExpress),
    notesText: ensureString(reqs.notes || '无'),
    
    // 项目成员（数组，用于循环）
    members: formattedMembers,
    hasMembers: Boolean(formattedMembers.length > 0),
  };
  
  return variables;
}

/**
 * 获取角色名称
 */
function getRoleName(roleCode) {
  const roleMap = {
    pm: '项目经理',
    translator: '翻译',
    reviewer: '审校',
    layout: '排版',
    sales: '销售',
    part_time_translator: '兼职翻译',
    part_time_sales: '兼职销售',
  };
  return roleMap[roleCode] || roleCode;
}

/**
 * 将付款状态转换为中文
 * @param {String} status - 付款状态（英文）
 * @returns {String} 中文状态
 */
function paymentStatusToChinese(status) {
  if (!status) return '—';
  
  const statusMap = {
    'paid': '已支付',
    'partially_paid': '部分支付',
    'unpaid': '未支付',
  };
  
  return statusMap[status] || status;
}

/**
 * 布尔值转文本
 */
function boolText(flag) {
  return flag ? '是' : '否';
}

/**
 * 业务类型标签
 */
function businessTypeLabel(code) {
  const map = {
    translation: '笔译',
    interpretation: '口译',
    transcription: '转录',
    localization: '本地化',
    other: '其他',
  };
  return map[code] || '—';
}

/**
 * 项目类型标签
 */
function projectTypeLabel(code) {
  const map = {
    mtpe: 'MTPE',
    deepedit: '深度编辑',
    review: '审校',
    mixed: '综合',
  };
  return map[code] || '—';
}

/**
 * 计算从今天到指定日期的天数
 */
function daysFromNow(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  return diff > 0 ? `${diff} 个工作日` : '—';
}

/**
 * 格式化日期
 */
function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = {
  generateProjectContract,
};
