const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs').promises;
const path = require('path');
const KpiConfig = require('../models/KpiConfig');

/**
 * 生成项目报价单 Word 文档（基于 docxtemplater 模板）
 * @param {Object} project - 项目数据（包含 customerId, projectFiles, targetLanguages 等）
 * @returns {Promise<Buffer>} docx 文件 Buffer
 */
async function generateProjectQuotation(project) {
  // 构建模板变量
  const data = await buildTemplateVariables(project);
  
  // 模板文件路径
  const templatePath = path.join(__dirname, '..', 'templates', 'quotation-template.docx');
  
  console.log('[QuotationService] 开始生成报价单:', {
    projectId: project._id,
    projectNumber: project.projectNumber,
    templatePath,
  });
  
  try {
    // 检查模板文件是否存在
    try {
      await fs.access(templatePath);
    } catch (accessError) {
      console.error('[QuotationService] 模板文件不存在:', templatePath);
      throw new Error(`报价单模板文件不存在: ${templatePath}。请先创建模板文件。`);
    }
    
    // 读取模板文件
    const templateBuffer = await fs.readFile(templatePath);
    console.log('[QuotationService] 模板文件读取成功，大小:', templateBuffer.length, 'bytes');
    
    // 使用 PizZip 加载 docx 文件
    let zip;
    try {
      zip = new PizZip(templateBuffer);
    } catch (zipError) {
      console.error('[QuotationService] PizZip 加载失败:', zipError);
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
      console.log('[QuotationService] 变量设置成功，变量数量:', Object.keys(data).length);
      
    } catch (docError) {
      console.error('[QuotationService] Docxtemplater 初始化失败:', docError);
      console.error('[QuotationService] 错误详情:', JSON.stringify(docError, null, 2));
      
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
      console.log('[QuotationService] 模板渲染成功');
    } catch (error) {
      const e = {
        message: error.message,
        name: error.name,
        stack: error.stack,
        properties: error.properties,
      };
      console.error('[QuotationService] 模板渲染错误:', JSON.stringify(e, null, 2));
      
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
      console.log('[QuotationService] 文档生成成功，大小:', buffer.length, 'bytes');
    } catch (bufferError) {
      console.error('[QuotationService] 生成文档 Buffer 失败:', bufferError);
      throw new Error(`生成文档失败: ${bufferError.message}`);
    }
    
    return buffer;
  } catch (error) {
    console.error('[QuotationService] 生成报价单失败:', {
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
 * @returns {Promise<Object>} 模板变量对象
 */
async function buildTemplateVariables(project) {
  const contact = project.contactInfo || project.customerId || {};
  const reqs = project.specialRequirements || {};
  
  // 获取公司信息
  const companyInfo = await KpiConfig.getActiveConfig();
  
  // 辅助函数：确保值是字符串
  const ensureString = (value) => {
    if (value === null || value === undefined) return '—';
    return String(value);
  };
  
  // 格式化目标语种（过滤无效值）
  const targetLanguages = (project.targetLanguages || [])
    .filter(lang => lang && typeof lang === 'string' && lang.trim() !== '')
    .map(lang => lang.trim())
    .filter(lang => {
      const invalidPatterns = ['pm', 'sales', 'translator', 'reviewer', 'layout', 'admin', 'finance'];
      const lowerLang = lang.toLowerCase();
      return !invalidPatterns.includes(lowerLang) && lang.length > 0;
    });
  const targetLanguagesText = targetLanguages.length > 0 ? targetLanguages.join('、') : '—';
  
  // 格式化金额
  const amountText = project.projectAmount
    ? `¥${Number(project.projectAmount).toFixed(2)}`
    : '—';
  
  // 格式化单价
  const unitPriceText = project.unitPrice ? `¥${Number(project.unitPrice).toFixed(2)} / 千字` : '—';
  
  // 格式化字数
  const wordCountText = project.wordCount ? `${project.wordCount.toLocaleString('zh-CN')} 字` : '—';
  
  // 格式化日期
  const deadlineText = project.deadline ? formatDate(project.deadline) : '—';
  const payDueDateText = project.payment?.expectedAt
    ? formatDate(project.payment.expectedAt)
    : '—';
  
  // 业务类型和项目类型
  const businessTypeText = businessTypeLabel(project.businessType);
  const projectTypeText = projectTypeLabel(project.projectType);
  
  // 生成报价明细
  const quotationDetails = buildQuotationDetails(project);
  
  // 计算总计
  const totalWordCount = quotationDetails.reduce((sum, item) => sum + (item.wordCount || 0), 0);
  const totalAmount = quotationDetails.reduce((sum, item) => sum + (item.amount || 0), 0);
  
  // 构建返回对象
  const variables = {
    // 基本信息（字符串）
    projectNumber: ensureString(project.projectNumber || '待生成'),
    projectName: ensureString(project.projectName),
    sourceLanguage: ensureString(project.sourceLanguage),
    targetLanguagesText: ensureString(targetLanguagesText),
    
    // 客户信息（字符串）
    customerName: ensureString(project.customerId?.name || project.clientName),
    customerShortName: ensureString(project.customerId?.shortName),
    customerAddress: ensureString(project.customerId?.address),
    contactName: ensureString(contact.name || project.customerId?.contactPerson),
    contactPhone: ensureString(contact.phone || project.customerId?.phone),
    contactEmail: ensureString(contact.email || project.customerId?.email),
    
    // 乙方信息（字符串）
    companyName: ensureString(companyInfo?.companyName || '上海语家信息科技有限公司'),
    companyAddress: ensureString(companyInfo?.companyAddress || '上海市浦东新盛荣路88弄1-206'),
    companyPhone: ensureString(companyInfo?.companyPhone || '021-61984608'),
    companyEmail: ensureString(companyInfo?.companyEmail || ''),
    creatorName: ensureString(project.createdBy?.name),
    creatorEmail: ensureString(project.createdBy?.email),
    creatorPhone: ensureString(project.createdBy?.phone),
    
    // 业务信息（字符串）
    businessTypeText: ensureString(businessTypeText),
    projectTypeText: ensureString(projectTypeText),
    
    // 费用信息（字符串）
    unitPriceText: ensureString(unitPriceText),
    wordCountText: ensureString(wordCountText),
    amountText: ensureString(amountText),
    taxIncludedText: project.isTaxIncluded ? '含税' : '不含税',
    
    // 时间信息（字符串）
    deadlineText: ensureString(deadlineText),
    payDueDateText: ensureString(payDueDateText),
    
    // 特殊要求（字符串）
    terminologyText: boolText(reqs.terminology),
    referenceFilesText: boolText(reqs.referenceFiles),
    bilingualDeliveryText: boolText(reqs.bilingualDelivery),
    pureTranslationDeliveryText: boolText(reqs.pureTranslationDelivery),
    printSealExpressText: boolText(reqs.printSealExpress),
    notesText: ensureString(reqs.notes || '无'),
    needInvoiceText: project.needInvoice ? '是' : '否',
    
    // 报价明细（数组，用于循环）
    quotationDetails: quotationDetails,
    hasDetails: Boolean(quotationDetails.length > 0),
    
    // 汇总信息（字符串）
    totalWordCount: totalWordCount.toLocaleString('zh-CN'),
    totalAmount: totalAmount.toFixed(2),
    totalAmountText: `¥${totalAmount.toFixed(2)}`,
  };
  
  return variables;
}

/**
 * 构建报价明细列表
 * @param {Object} project - 项目数据
 * @returns {Array} 报价明细数组
 */
function buildQuotationDetails(project) {
  // 优先使用精确的明细数据（第二阶段）
  if (project.quotationDetails && Array.isArray(project.quotationDetails) && project.quotationDetails.length > 0) {
    // 格式化精确明细数据
    return project.quotationDetails.map((detail, index) => ({
      index: index + 1,
      filename: detail.filename || '—',
      sourceLanguage: detail.sourceLanguage || project.sourceLanguage || '—',
      targetLanguage: detail.targetLanguage || '—',
      wordCount: detail.wordCount || 0,
      wordCountText: (detail.wordCount || 0).toLocaleString('zh-CN'),
      unitPrice: (detail.unitPrice || 0).toFixed(2),
      amount: Math.round((detail.amount || 0) * 100) / 100,
      amountText: `¥${(Math.round((detail.amount || 0) * 100) / 100).toFixed(2)}`,
      fileType: detail.fileType || '',
      notes: detail.notes || '',
    }));
  }
  
  // 如果没有精确明细，回退到第一阶段的计算逻辑（向后兼容）
  const files = project.projectFiles || [];
  const targetLanguages = (project.targetLanguages || [])
    .filter(lang => lang && typeof lang === 'string' && lang.trim() !== '')
    .map(lang => lang.trim())
    .filter(lang => {
      const invalidPatterns = ['pm', 'sales', 'translator', 'reviewer', 'layout', 'admin', 'finance'];
      const lowerLang = lang.toLowerCase();
      return !invalidPatterns.includes(lowerLang) && lang.length > 0;
    });
  
  const totalWordCount = project.wordCount || 0;
  const unitPrice = project.unitPrice || 0;
  const sourceLanguage = project.sourceLanguage || '—';
  
  const details = [];
  
  // 情况1：有多个文件，单个语种
  if (files.length > 1 && targetLanguages.length === 1) {
    const wordCountPerFile = Math.floor(totalWordCount / files.length);
    files.forEach((file, index) => {
      const isLast = index === files.length - 1;
      const wordCount = isLast 
        ? totalWordCount - (wordCountPerFile * (files.length - 1))
        : wordCountPerFile;
      const amount = (wordCount / 1000) * unitPrice;
      
      details.push({
        index: index + 1,
        filename: file.filename || `文件${index + 1}`,
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguages[0],
        wordCount: wordCount,
        wordCountText: wordCount.toLocaleString('zh-CN'),
        unitPrice: unitPrice.toFixed(2),
        amount: Math.round(amount * 100) / 100,
        amountText: `¥${(Math.round(amount * 100) / 100).toFixed(2)}`,
      });
    });
  }
  // 情况2：单个文件，多个语种
  else if (files.length <= 1 && targetLanguages.length > 1) {
    const wordCountPerLanguage = Math.floor(totalWordCount / targetLanguages.length);
    targetLanguages.forEach((lang, index) => {
      const isLast = index === targetLanguages.length - 1;
      const wordCount = isLast 
        ? totalWordCount - (wordCountPerLanguage * (targetLanguages.length - 1))
        : wordCountPerLanguage;
      const amount = (wordCount / 1000) * unitPrice;
      
      details.push({
        index: index + 1,
        filename: files[0]?.filename || '项目文件',
        sourceLanguage: sourceLanguage,
        targetLanguage: lang,
        wordCount: wordCount,
        wordCountText: wordCount.toLocaleString('zh-CN'),
        unitPrice: unitPrice.toFixed(2),
        amount: Math.round(amount * 100) / 100,
        amountText: `¥${(Math.round(amount * 100) / 100).toFixed(2)}`,
      });
    });
  }
  // 情况3：多个文件，多个语种（组合）
  else if (files.length > 1 && targetLanguages.length > 1) {
    const totalItems = files.length * targetLanguages.length;
    const wordCountPerItem = Math.floor(totalWordCount / totalItems);
    let detailIndex = 1;
    
    files.forEach((file, fileIndex) => {
      targetLanguages.forEach((lang, langIndex) => {
        const isLast = fileIndex === files.length - 1 && langIndex === targetLanguages.length - 1;
        const wordCount = isLast 
          ? totalWordCount - (wordCountPerItem * (totalItems - 1))
          : wordCountPerItem;
        const amount = (wordCount / 1000) * unitPrice;
        
        details.push({
          index: detailIndex++,
          filename: file.filename || `文件${fileIndex + 1}`,
          sourceLanguage: sourceLanguage,
          targetLanguage: lang,
          wordCount: wordCount,
          wordCountText: wordCount.toLocaleString('zh-CN'),
          unitPrice: unitPrice.toFixed(2),
          amount: Math.round(amount * 100) / 100,
          amountText: `¥${(Math.round(amount * 100) / 100).toFixed(2)}`,
        });
      });
    });
  }
  // 情况4：单个文件，单个语种（默认情况）
  else {
    details.push({
      index: 1,
      filename: files[0]?.filename || '项目文件',
      sourceLanguage: sourceLanguage,
      targetLanguage: targetLanguages[0] || '—',
      wordCount: totalWordCount,
      wordCountText: totalWordCount.toLocaleString('zh-CN'),
      unitPrice: unitPrice.toFixed(2),
      amount: Math.round((totalWordCount / 1000) * unitPrice * 100) / 100,
      amountText: `¥${(Math.round((totalWordCount / 1000) * unitPrice * 100) / 100).toFixed(2)}`,
    });
  }
  
  return details;
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
  generateProjectQuotation,
};


