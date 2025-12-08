const ExcelJS = require('exceljs');
const KpiRecord = require('../models/KpiRecord');
const User = require('../models/User');

/**
 * 导出月度KPI工资表
 * @param {String} month - 月份，格式：YYYY-MM
 * @returns {Promise<Buffer>} Excel文件Buffer
 */
async function exportMonthlyKPISheet(month) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`KPI工资表-${month}`);

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
    { header: '翻译KPI', key: 'translator', width: 12 },
    { header: '审校KPI', key: 'reviewer', width: 12 },
    { header: 'PM KPI', key: 'pm', width: 12 },
    { header: '销售KPI', key: 'sales', width: 12 },
    { header: '综合岗KPI', key: 'admin', width: 12 },
    { header: 'KPI总计', key: 'total', width: 15 },
    { header: '参与项目数', key: 'projectCount', width: 12 }
  ];

  // 设置标题行样式
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

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
  detailSheet.columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '姓名', key: 'name', width: 15 },
    { header: '角色', key: 'role', width: 12 },
    { header: '项目名称', key: 'projectName', width: 30 },
    { header: '客户名称', key: 'clientName', width: 20 },
    { header: '项目金额', key: 'projectAmount', width: 15 },
    { header: 'KPI数值', key: 'kpiValue', width: 15 },
    { header: '计算月份', key: 'month', width: 12 }
  ];

  detailSheet.getRow(1).font = { bold: true };
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
    { header: 'KPI数值', key: 'kpiValue', width: 15 },
    { header: '计算公式', key: 'formula', width: 50 }
  );

  worksheet.columns = columns;

  worksheet.getRow(1).font = { bold: true };
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

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = {
  exportMonthlyKPISheet,
  exportUserKPIDetail
};

