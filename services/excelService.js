const ExcelJS = require('exceljs');
const KpiRecord = require('../models/KpiRecord');
const User = require('../models/User');
const Project = require('../models/Project');
const Customer = require('../models/Customer');
const KpiConfig = require('../models/KpiConfig');

/**
 * 导出月度KPI分值表
 * @param {String} month - 月份，格式：YYYY-MM
 * @returns {Promise<Buffer>} Excel文件Buffer
 */
async function exportMonthlyKPISheet(month) {
  const workbook = new ExcelJS.Workbook();
  // 设置默认字体以支持中文
  workbook.creator = '语家 OA 系统';
  const worksheet = workbook.addWorksheet(`KPI分值表-${month}`);
  // 设置默认字体为支持中文的字体
  worksheet.properties.defaultRowHeight = 20;

  // 获取该月的所有KPI记录
  const records = await KpiRecord.find({ month })
    .populate('userId', 'name username email roles')
    .populate('projectId', 'projectName clientName projectAmount')
    .sort({ userId: 1, role: 1 });

  if (records.length === 0) {
    throw new Error('该月没有KPI记录');
  }

  // 按用户汇总
  const userSummary = {};
  records.forEach(record => {
    const userId = record.userId._id.toString();
    if (!userSummary[userId]) {
      userSummary[userId] = {
        user: record.userId,
        totalKPI: 0,
        byRole: {},
        projects: []
      };
    }
    userSummary[userId].totalKPI += record.kpiValue;
    if (!userSummary[userId].byRole[record.role]) {
      userSummary[userId].byRole[record.role] = 0;
    }
    userSummary[userId].byRole[record.role] += record.kpiValue;
    userSummary[userId].projects.push(record);
  });

  // 设置列标题
  worksheet.columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '姓名', key: 'name', width: 15 },
    { header: '用户名', key: 'username', width: 15 },
    { header: '邮箱', key: 'email', width: 25 },
    { header: '角色', key: 'roles', width: 20 },
    { header: '翻译KPI(分)', key: 'translator', width: 12 },
    { header: '审校KPI(分)', key: 'reviewer', width: 12 },
    { header: 'PM KPI(分)', key: 'pm', width: 12 },
    { header: '销售KPI(分)', key: 'sales', width: 12 },
    { header: '综合岗KPI(分)', key: 'admin', width: 12 },
    { header: 'KPI总计(分)', key: 'total', width: 15 },
    { header: '参与项目数', key: 'projectCount', width: 12 }
  ];

  // 设置标题行样式（使用支持中文的字体）
  worksheet.getRow(1).font = { bold: true, size: 12, name: 'Microsoft YaHei' };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  
  // 设置所有列的默认字体以支持中文
  worksheet.columns.forEach(column => {
    column.font = { name: 'Microsoft YaHei', size: 11 };
  });

  // 填充数据
  let index = 1;
  const summaryArray = Object.values(userSummary).sort((a, b) => b.totalKPI - a.totalKPI);

  summaryArray.forEach(userData => {
    const row = worksheet.addRow({
      index: index++,
      name: userData.user.name,
      username: userData.user.username,
      email: userData.user.email,
      roles: userData.user.roles.join(', '),
      translator: Math.round((userData.byRole.translator || 0) * 100) / 100,
      reviewer: Math.round((userData.byRole.reviewer || 0) * 100) / 100,
      pm: Math.round((userData.byRole.pm || 0) * 100) / 100,
      sales: Math.round((userData.byRole.sales || 0) * 100) / 100,
      admin: Math.round((userData.byRole.admin_staff || 0) * 100) / 100,
      total: Math.round(userData.totalKPI * 100) / 100,
      projectCount: userData.projects.length
    });

    // 设置数字格式
    ['translator', 'reviewer', 'pm', 'sales', 'admin', 'total'].forEach(key => {
      row.getCell(key).numFmt = '#,##0.00';
    });
  });

  // 添加总计行
  const totalRow = worksheet.addRow({
    index: '总计',
    name: '',
    username: '',
    email: '',
    roles: '',
    translator: summaryArray.reduce((sum, u) => sum + (u.byRole.translator || 0), 0),
    reviewer: summaryArray.reduce((sum, u) => sum + (u.byRole.reviewer || 0), 0),
    pm: summaryArray.reduce((sum, u) => sum + (u.byRole.pm || 0), 0),
    sales: summaryArray.reduce((sum, u) => sum + (u.byRole.sales || 0), 0),
    admin: summaryArray.reduce((sum, u) => sum + (u.byRole.admin_staff || 0), 0),
    total: summaryArray.reduce((sum, u) => sum + u.totalKPI, 0),
    projectCount: records.length
  });

  totalRow.font = { bold: true };
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFE0E0' }
  };

  ['translator', 'reviewer', 'pm', 'sales', 'admin', 'total'].forEach(key => {
    totalRow.getCell(key).numFmt = '#,##0.00';
  });

  // 添加详细信息工作表
  const detailSheet = workbook.addWorksheet(`明细-${month}`);
  detailSheet.properties.defaultRowHeight = 20;
  detailSheet.columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '姓名', key: 'name', width: 15 },
    { header: '角色', key: 'role', width: 12 },
    { header: '项目名称', key: 'projectName', width: 30 },
    { header: '客户名称', key: 'clientName', width: 20 },
    { header: '项目金额', key: 'projectAmount', width: 15 },
    { header: 'KPI分值', key: 'kpiValue', width: 15 },
    { header: '计算月份', key: 'month', width: 12 }
  ];
  
  // 设置所有列的默认字体以支持中文
  detailSheet.columns.forEach(column => {
    column.font = { name: 'Microsoft YaHei', size: 11 };
  });

  detailSheet.getRow(1).font = { bold: true, name: 'Microsoft YaHei', size: 12 };
  detailSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  let detailIndex = 1;
  records.forEach(record => {
    detailSheet.addRow({
      index: detailIndex++,
      name: record.userId.name,
      role: record.role,
      projectName: record.projectId.projectName,
      clientName: record.projectId.clientName,
      projectAmount: record.projectId.projectAmount,
      kpiValue: Math.round(record.kpiValue * 100) / 100,
      month: record.month
    });
  });

  ['projectAmount', 'kpiValue'].forEach(key => {
    detailSheet.getColumn(key).numFmt = '#,##0.00';
  });

  // 生成Buffer
  // ExcelJS默认使用UTF-8编码，无需额外配置
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * 导出用户KPI明细
 * @param {String} userId - 用户ID
 * @param {String} month - 月份（可选）
 * @param {Boolean} canViewAmount - 是否显示项目金额（默认true）
 * @returns {Promise<Buffer>} Excel文件Buffer
 */
async function exportUserKPIDetail(userId, month = null, canViewAmount = true) {
  const workbook = new ExcelJS.Workbook();
  // 设置默认字体以支持中文
  workbook.creator = '语家 OA 系统';
  const user = await User.findById(userId);
  
  if (!user) {
    throw new Error('用户不存在');
  }

  const query = { userId };
  if (month) query.month = month;

  // 根据权限决定是否加载项目金额
  let populateFields = 'projectName clientName';
  if (canViewAmount) {
    populateFields += ' projectAmount';
  }

  const records = await KpiRecord.find(query)
    .populate('projectId', populateFields)
    .sort({ month: -1, createdAt: -1 });

  const worksheet = workbook.addWorksheet(`${user.name}-KPI明细`);

  // 根据权限决定列
  const columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '月份', key: 'month', width: 12 },
    { header: '角色', key: 'role', width: 12 },
    { header: '项目名称', key: 'projectName', width: 30 },
    { header: '客户名称', key: 'clientName', width: 20 }
  ];
  
  if (canViewAmount) {
    columns.push({ header: '项目金额', key: 'projectAmount', width: 15 });
  }
  
  columns.push(
    { header: 'KPI分值', key: 'kpiValue', width: 15 },
    { header: '计算公式', key: 'formula', width: 50 }
  );

  worksheet.columns = columns;
  
  // 设置所有列的默认字体以支持中文
  worksheet.columns.forEach(column => {
    column.font = { name: 'Microsoft YaHei', size: 11 };
  });

  worksheet.getRow(1).font = { bold: true, name: 'Microsoft YaHei', size: 12 };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  let index = 1;
  records.forEach(record => {
    const rowData = {
      index: index++,
      month: record.month,
      role: record.role,
      projectName: record.projectId?.projectName || 'N/A',
      clientName: record.projectId?.clientName || 'N/A',
      kpiValue: Math.round(record.kpiValue * 100) / 100,
      formula: record.calculationDetails?.formula || ''
    };
    
    if (canViewAmount) {
      rowData.projectAmount = record.projectId?.projectAmount || 0;
    }
    
    worksheet.addRow(rowData);
  });

  const numFmtKeys = ['kpiValue'];
  if (canViewAmount) {
    numFmtKeys.push('projectAmount');
  }
  
  numFmtKeys.forEach(key => {
    worksheet.getColumn(key).numFmt = '#,##0.00';
  });

  // ExcelJS默认使用UTF-8编码，无需额外配置
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * 导出项目报价单
 * @param {String} projectId - 项目ID（可选，如果提供则从数据库获取）
 * @param {Object} projectData - 项目数据对象（可选，如果提供则直接使用）
 * @returns {Promise<Buffer>} Excel文件Buffer
 */
async function exportProjectQuotation(projectId = null, projectData = null) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '语家 OA 系统';
  
  let project, customer, creator;
  
  if (projectId) {
    // 从数据库获取项目数据
    project = await Project.findById(projectId)
      .populate('customerId', 'name shortName contactPerson phone email address')
      .populate('createdBy', 'name username email phone');
    
    if (!project) {
      throw new Error('项目不存在');
    }
    customer = project.customerId;
    // 获取项目创建者信息（作为乙方联系人）
    creator = project.createdBy;
  } else if (projectData) {
    // 使用提供的项目数据（创建项目时使用）
    project = projectData;
    if (projectData.customerId && typeof projectData.customerId === 'object') {
      customer = projectData.customerId;
    } else if (projectData.customerId) {
      customer = await Customer.findById(projectData.customerId);
    }
    
    // 获取项目创建者信息（作为乙方联系人）
    if (projectData.createdBy) {
      if (typeof projectData.createdBy === 'object') {
        creator = projectData.createdBy;
      } else {
        creator = await User.findById(projectData.createdBy).select('name username email phone');
      }
    }
  } else {
    throw new Error('必须提供项目ID或项目数据');
  }
  
  if (!customer) {
    throw new Error('客户信息不存在');
  }
  
  // 获取公司信息
  const companyInfo = await KpiConfig.getActiveConfig();
  
  const worksheet = workbook.addWorksheet('报价单');
  worksheet.properties.defaultRowHeight = 20;
  
  // 设置列宽
  worksheet.columns = [
    { width: 15 },
    { width: 40 }
  ];
  
  // 设置所有列的默认字体
  worksheet.columns.forEach(column => {
    column.font = { name: 'Microsoft YaHei', size: 11 };
  });
  
  let rowIndex = 1;
  
  // 标题
  const titleRow = worksheet.addRow(['项目报价单', '']);
  titleRow.getCell(1).font = { bold: true, size: 16, name: 'Microsoft YaHei' };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.mergeCells(1, 1, 1, 2);
  titleRow.height = 30;
  rowIndex++;
  
  worksheet.addRow([]);
  rowIndex++;
  
  // 甲方（客户）基本信息
  const customerTitleRow = worksheet.addRow(['甲方信息', '']);
  customerTitleRow.getCell(1).font = { bold: true, size: 12, name: 'Microsoft YaHei' };
  customerTitleRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  worksheet.mergeCells(rowIndex, 1, rowIndex, 2);
  rowIndex++;
  
  const customerInfoRows = [
    ['客户名称', customer.name],
    ['客户简称', customer.shortName || ''],
    ['联系人', customer.contactPerson || ''],
    ['联系电话', customer.phone || ''],
    ['邮箱', customer.email || ''],
    ['客户地址', customer.address || '']
  ];
  
  customerInfoRows.forEach(([label, value]) => {
    const row = worksheet.addRow([label, value]);
    row.getCell(1).font = { bold: true, name: 'Microsoft YaHei', size: 11 };
    row.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };
    row.getCell(2).font = { name: 'Microsoft YaHei', size: 11 };
    rowIndex++;
  });
  
  worksheet.addRow([]);
  rowIndex++;
  
  // 乙方（公司）信息
  const companyRow = worksheet.addRow(['乙方信息', '']);
  companyRow.getCell(1).font = { bold: true, size: 12, name: 'Microsoft YaHei' };
  companyRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  worksheet.mergeCells(rowIndex, 1, rowIndex, 2);
  rowIndex++;
  
  // 乙方联系人使用项目创建者的信息
  // 如果没有创建者信息，使用公司配置中的默认联系人信息
  const contactPerson = creator ? creator.name : (companyInfo.companyContact || '');
  // 优先使用创建者的phone字段，如果没有则使用email，最后使用公司配置的电话
  const contactPhone = creator ? (creator.phone || creator.email || companyInfo.companyPhone || '') : (companyInfo.companyPhone || '');
  const contactEmail = creator ? creator.email : (companyInfo.companyEmail || '');
  
  const companyInfoRows = [
    ['公司名称', companyInfo.companyName || ''],
    ['联系人', contactPerson],
    ['联系电话', contactPhone],
    ['联系邮箱', contactEmail],
    ['公司地址', companyInfo.companyAddress || '']
  ];
  
  companyInfoRows.forEach(([label, value]) => {
    const row = worksheet.addRow([label, value]);
    row.getCell(1).font = { bold: true, name: 'Microsoft YaHei', size: 11 };
    row.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };
    row.getCell(2).font = { name: 'Microsoft YaHei', size: 11 };
    rowIndex++;
  });
  
  worksheet.addRow([]);
  rowIndex++;
  
  // 项目基本信息
  const projectInfoRow = worksheet.addRow(['项目信息', '']);
  projectInfoRow.getCell(1).font = { bold: true, size: 12, name: 'Microsoft YaHei' };
  projectInfoRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  worksheet.mergeCells(rowIndex, 1, rowIndex, 2);
  rowIndex++;
  
  const infoRows = [
    ['项目编号', project.projectNumber || '待生成'],
    ['项目名称', project.projectName],
    ['业务类型', getBusinessTypeText(project.businessType)],
    ['项目类型', project.projectType ? getProjectTypeText(project.projectType) : ''],
    ['源语种', project.sourceLanguage],
    ['目标语种', Array.isArray(project.targetLanguages) ? project.targetLanguages.join('、') : project.targetLanguages],
    ['字数', project.wordCount ? project.wordCount.toLocaleString() + ' 字' : ''],
    ['单价', project.unitPrice ? '¥' + project.unitPrice.toLocaleString() + ' /千字' : ''],
    ['项目金额', '¥' + (project.projectAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
    ['是否含税', project.isTaxIncluded ? '是' : '否'],
    ['需要发票', project.needInvoice ? '是' : '否'],
    ['交付时间', project.deadline ? new Date(project.deadline).toLocaleDateString('zh-CN') : ''],
    ['协议付款日', project.payment?.expectedAt ? new Date(project.payment.expectedAt).toLocaleDateString('zh-CN') : '']
  ];
  
  infoRows.forEach(([label, value]) => {
    const row = worksheet.addRow([label, value]);
    row.getCell(1).font = { bold: true, name: 'Microsoft YaHei', size: 11 };
    row.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };
    row.getCell(2).font = { name: 'Microsoft YaHei', size: 11 };
    rowIndex++;
  });
  
  // 特殊要求
  if (project.specialRequirements) {
    worksheet.addRow([]);
    rowIndex++;
    
    const reqRow = worksheet.addRow(['特殊要求', '']);
    reqRow.getCell(1).font = { bold: true, name: 'Microsoft YaHei', size: 11 };
    reqRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };
    worksheet.mergeCells(rowIndex, 1, rowIndex, 2);
    rowIndex++;
    
    const requirements = [];
    if (project.specialRequirements.terminology) requirements.push('术语表');
    if (project.specialRequirements.nda) requirements.push('保密协议');
    if (project.specialRequirements.referenceFiles) requirements.push('参考文件');
    if (project.specialRequirements.notes) requirements.push(project.specialRequirements.notes);
    
    if (requirements.length > 0) {
      const reqValueRow = worksheet.addRow(['', requirements.join('；')]);
      reqValueRow.getCell(2).font = { name: 'Microsoft YaHei', size: 11 };
      worksheet.mergeCells(rowIndex, 1, rowIndex, 2);
      rowIndex++;
    }
  }
  
  // 备注
  worksheet.addRow([]);
  rowIndex++;
  
  const noteRow = worksheet.addRow(['备注', '']);
  noteRow.getCell(1).font = { bold: true, name: 'Microsoft YaHei', size: 11 };
  noteRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF0F0F0' }
  };
  worksheet.mergeCells(rowIndex, 1, rowIndex, 2);
  rowIndex++;
  
  const noteValueRow = worksheet.addRow(['', '此报价单由系统自动生成，如有疑问请联系销售人员。']);
  noteValueRow.getCell(2).font = { name: 'Microsoft YaHei', size: 11 };
  worksheet.mergeCells(rowIndex, 1, rowIndex, 2);
  
  // 生成Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  
  // 验证buffer是否有效
  if (!buffer || buffer.length === 0) {
    throw new Error('生成的Excel文件为空');
  }
  
  // 确保返回的是Node.js Buffer对象
  // ExcelJS的writeBuffer()可能返回ArrayBuffer，需要转换为Buffer
  if (buffer instanceof ArrayBuffer) {
    return Buffer.from(buffer);
  } else if (buffer instanceof Uint8Array) {
    return Buffer.from(buffer);
  } else if (Buffer.isBuffer(buffer)) {
    return buffer;
  } else {
    // 尝试转换为Buffer
    return Buffer.from(buffer);
  }
}

// 业务类型文本映射
function getBusinessTypeText(type) {
  const map = {
    'translation': '笔译',
    'interpretation': '口译',
    'transcription': '转录',
    'localization': '本地化',
    'other': '其他'
  };
  return map[type] || type;
}

// 项目类型文本映射
function getProjectTypeText(type) {
  const map = {
    'mtpe': 'MTPE',
    'deepedit': '深度编辑',
    'review': '审校项目',
    'mixed': '混合类型'
  };
  return map[type] || type;
}

module.exports = {
  exportMonthlyKPISheet,
  exportUserKPIDetail,
  exportProjectQuotation
};

