const express = require('express');
const router = express.Router();
const { authenticate, authorize, getCurrentPermission } = require('../middleware/auth');
const { 
  isAdmin, 
  isFinance, 
  isAdminOrFinance, 
  canViewAllFinance, 
  canManageFinance 
} = require('../utils/permissionChecker');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const PaymentRecord = require('../models/PaymentRecord');
const Invoice = require('../models/Invoice');
const KpiRecord = require('../models/KpiRecord');
const User = require('../models/User');

// 财务模块需要认证
router.use(authenticate);

// 角色分级：查看（含销售）、管理（仅财务/管理员）
const allowViewFinance = authorize('admin', 'finance', 'sales', 'part_time_sales');
const allowManageFinance = authorize('admin', 'finance');

// 应收对账列表（支持客户/销售过滤，逾期标记，回款状态，发票状态）
router.get('/receivables', allowViewFinance, async (req, res) => {
  try {
    const { customerId, status, dueBefore, salesId, paymentStatus, hasInvoice, expectedStartDate, expectedEndDate } = req.query;
    
    // 基于当前角色进行权限判断
    const financeViewPerm = getCurrentPermission(req, 'finance.view');
    
    // 收集所有基础条件
    const baseConditions = {};
    if (customerId) baseConditions.customerId = customerId;
    
    // 根据财务查看权限过滤项目
    if (canViewAllFinance(req)) {
      // 可以查看所有财务数据，财务/管理员可按销售筛选
      if (salesId && isAdminOrFinance(req)) baseConditions.createdBy = salesId;
    } else if (financeViewPerm === 'sales' || (!financeViewPerm && (req.currentRole === 'sales' || req.currentRole === 'part_time_sales'))) {
      // 只能查看自己创建的项目（销售角色即使没有finance.view权限，也可以查看自己的项目回款）
      baseConditions.createdBy = req.user._id;
    } else {
      // 无权限，返回空结果
      baseConditions._id = { $in: [] };
    }
    if (status) {
      baseConditions.status = status;
    } else {
      // 默认排除已取消项目
      baseConditions.status = { $ne: 'cancelled' };
    }
    
    // 销售/兼职销售仅能查看自己创建的项目（不包含其他人的项目）
    
    // 收集需要 $or 的条件
    const orConditions = [];
    
    // 预期回款日期筛选（支持日期范围）
    if (expectedStartDate || expectedEndDate) {
      const dateCondition = {};
      if (expectedStartDate) {
        dateCondition.$gte = new Date(expectedStartDate);
      }
      if (expectedEndDate) {
        dateCondition.$lte = new Date(expectedEndDate);
      }
      orConditions.push({
        $or: [
          { 'payment.expectedAt': dateCondition },
          { 'payment.expectedAt': { $exists: false } },
          { 'payment.expectedAt': null }
        ]
      });
    } else if (dueBefore) {
      // 兼容旧的dueBefore参数
      orConditions.push({
        $or: [
          { 'payment.expectedAt': { $lte: new Date(dueBefore) } },
          { 'payment.expectedAt': { $exists: false } },
          { 'payment.expectedAt': null }
        ]
      });
    }
    
    // 回款状态筛选
    if (paymentStatus) {
      if (paymentStatus === 'unpaid') {
        orConditions.push({
          $or: [
            { 'payment.paymentStatus': 'unpaid' },
            { 'payment.paymentStatus': { $exists: false } },
            { 'payment.paymentStatus': null }
          ]
        });
      } else {
        baseConditions['payment.paymentStatus'] = paymentStatus;
      }
    }
    
    // 构建最终查询
    const query = {};
    if (orConditions.length > 0) {
      // 如果有 $or 条件，使用 $and 组合所有条件
      query.$and = [
        ...Object.keys(baseConditions).map(key => ({ [key]: baseConditions[key] })),
        ...orConditions
      ];
    } else {
      // 如果没有 $or 条件，直接使用基础条件
      Object.assign(query, baseConditions);
    }
    const projects = await Project.find(query)
      .populate('customerId', 'name shortName')
      .populate('createdBy', 'name')
      .select('projectName projectAmount payment customerId createdBy status projectNumber');
    
    // 获取所有项目的发票信息
    const projectIds = projects.map(p => p._id);
    const invoices = await Invoice.find({ 
      projectId: { $in: projectIds },
      status: { $ne: 'void' } // 排除作废发票
    }).select('projectId status');
    
    // 构建项目ID到发票的映射
    const projectInvoiceMap = {};
    invoices.forEach(inv => {
      if (!projectInvoiceMap[inv.projectId]) {
        projectInvoiceMap[inv.projectId] = [];
      }
      projectInvoiceMap[inv.projectId].push(inv);
    });
    
    let data = projects.map(p => {
      const received = p.payment?.receivedAmount || 0;
      const projectAmount = p.projectAmount || 0;
      const outstanding = Math.max(0, projectAmount - received);
      const overdue = !!(p.payment?.expectedAt && !p.payment?.isFullyPaid && p.payment.expectedAt < new Date());
      const projectInvoices = projectInvoiceMap[p._id] || [];
      const hasInvoices = projectInvoices.length > 0;
      
      // 如果 paymentStatus 不存在，根据回款金额自动计算
      let paymentStatus = p.payment?.paymentStatus;
      if (!paymentStatus) {
        if (received >= projectAmount && projectAmount > 0) {
          paymentStatus = 'paid';
        } else if (received > 0) {
          paymentStatus = 'partially_paid';
        } else {
          paymentStatus = 'unpaid';
        }
        // 异步更新项目（不阻塞响应）
        Project.findByIdAndUpdate(p._id, {
          'payment.paymentStatus': paymentStatus,
          'payment.remainingAmount': outstanding,
          'payment.isFullyPaid': received >= projectAmount && projectAmount > 0
        }).catch(err => console.error('更新项目回款状态失败:', err));
      }
      
      return {
        id: p._id,
        projectName: p.projectName,
        projectNumber: p.projectNumber,
        projectAmount: projectAmount,
        receivedAmount: received,
        expectedAt: p.payment?.expectedAt,
        isFullyPaid: p.payment?.isFullyPaid || (received >= projectAmount && projectAmount > 0),
        paymentStatus: paymentStatus,
        outstanding,
        status: p.status,
        customerId: p.customerId,
        customerName: p.customerId?.name || '',
        salesName: p.createdBy?.name || '',
        createdBy: p.createdBy,
        overdue,
        hasInvoice: hasInvoices,
        invoiceCount: projectInvoices.length
      };
    });
    
    // 发票状态筛选（已开票/未开票）
    if (hasInvoice === 'true') {
      data = data.filter(d => d.hasInvoice);
    } else if (hasInvoice === 'false') {
      data = data.filter(d => !d.hasInvoice);
    }
    
    console.log('应收对账查询结果:', {
      queryParams: { customerId, status, dueBefore, salesId, paymentStatus, hasInvoice },
      queryConditions: JSON.stringify(query),
      totalProjects: projects.length,
      filteredData: data.length
    });
    
    res.json({ 
      success: true, 
      data
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误',
        statusCode: 500
      }
    });
  }
});

// 新增回款记录并更新项目回款
router.post('/payment/:projectId', allowManageFinance, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { amount, receivedAt, method, reference, invoiceNumber, note } = req.body;
    if (!amount || amount <= 0 || !receivedAt) {
      return res.status(400).json({ 
        success: false, 
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: '回款金额和日期必填',
          statusCode: 400
        }
      });
    }
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

    const paymentAmount = Number(amount);
    const projectAmount = project.projectAmount || 0;

    // 创建回款记录
    const paymentRecord = await PaymentRecord.create({
      projectId,
      amount: paymentAmount,
      receivedAt: new Date(receivedAt),
      method: method || 'bank',
      reference,
      invoiceNumber, // 关联发票号
      note,
      recordedBy: req.user._id
    });

    // 更新项目累计回款
    const totalReceived = (project.payment?.receivedAmount || 0) + paymentAmount;
    const remainingAmount = Math.max(0, projectAmount - totalReceived);
    
    project.payment.receivedAmount = totalReceived;
    project.payment.remainingAmount = remainingAmount;
    project.payment.receivedAt = new Date(receivedAt);
    project.payment.isFullyPaid = totalReceived >= projectAmount;
    
    // 自动判断回款状态
    if (totalReceived >= projectAmount) {
      project.payment.paymentStatus = 'paid'; // 已支付
    } else if (totalReceived > 0) {
      project.payment.paymentStatus = 'partially_paid'; // 部分支付
    } else {
      project.payment.paymentStatus = 'unpaid'; // 未支付
    }
    
    await project.save();

    // 如果关联了发票号，更新发票状态为已支付
    if (invoiceNumber) {
      const invoice = await Invoice.findOne({ 
        projectId, 
        invoiceNumber,
        status: { $ne: 'void' } // 排除作废发票
      });
      if (invoice) {
        invoice.status = 'paid';
        await invoice.save();
      }
    }

    res.json({ 
      success: true, 
      message: '回款已记录', 
      data: {
        paymentRecord,
        project: {
          ...project.toObject(),
          paymentStatus: project.payment.paymentStatus,
          remainingAmount: project.payment.remainingAmount
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误',
        statusCode: 500
      }
    });
  }
});

// 查询项目回款记录（支持按回款状态筛选）
router.get('/payment/:projectId', allowViewFinance, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { paymentStatus, startDate, endDate } = req.query;
    
    // 获取项目信息
    const project = await Project.findById(projectId).select('projectAmount payment createdBy');
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
    
    if (!isAdminOrFinance(req)) {
      const isOwner = project.createdBy?.toString() === req.user._id.toString();
      if (!isOwner) {
        return res.status(403).json({ 
          success: false, 
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '无权查看该项目回款',
            statusCode: 403
          }
        });
      }
    }
    
    // 构建查询条件（支持日期范围筛选）
    const paymentQuery = { projectId };
    if (startDate || endDate) {
      paymentQuery.receivedAt = {};
      if (startDate) {
        paymentQuery.receivedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        paymentQuery.receivedAt.$lte = end;
      }
    }
    
    // 获取所有回款记录（按时间正序，以便计算累计状态）
    let records = await PaymentRecord.find(paymentQuery)
      .populate('recordedBy', 'name')
      .sort({ receivedAt: 1, createdAt: 1 }); // 按时间正序
    
    // 如果指定了回款状态筛选，需要根据累计回款金额判断每条记录发生时的状态
    if (paymentStatus) {
      const projectAmount = project.projectAmount || 0;
      
      // 如果项目金额为0，无法判断状态，返回空数组
      if (projectAmount <= 0) {
        records = [];
      } else {
        let cumulativeAmount = 0; // 累计回款金额
        
        records = records.filter(record => {
          // 先加上当前记录的金额，计算该记录发生后的累计金额
          cumulativeAmount += record.amount || 0;
          
          // 判断该记录发生后的回款状态
          let recordStatus;
          if (cumulativeAmount >= projectAmount) {
            recordStatus = 'paid';
          } else if (cumulativeAmount > 0) {
            recordStatus = 'partially_paid';
          } else {
            recordStatus = 'unpaid';
          }
          
          return recordStatus === paymentStatus;
        });
      }
    }
    
    // 按时间倒序返回（最新的在前）
    records.reverse();
    
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误',
        statusCode: 500
      }
    });
  }
});

// 删除回款记录（若需修正）
router.delete('/payment/:recordId', allowManageFinance, async (req, res) => {
  try {
    const { recordId } = req.params;
    const rec = await PaymentRecord.findById(recordId);
    if (!rec) {
      return res.status(404).json({ 
        success: false, 
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: '记录不存在',
          statusCode: 404
        }
      });
    }
    const projectId = rec.projectId;
    const amount = rec.amount || 0;
    await PaymentRecord.deleteOne({ _id: recordId });
    
    // 回滚项目回款累计
    const project = await Project.findById(projectId);
    if (project) {
      const current = project.payment?.receivedAmount || 0;
      const newReceived = Math.max(0, current - amount);
      const projectAmount = project.projectAmount || 0;
      const remainingAmount = Math.max(0, projectAmount - newReceived);
      
      project.payment.receivedAmount = newReceived;
      project.payment.remainingAmount = remainingAmount;
      project.payment.isFullyPaid = newReceived >= projectAmount;
      
      // 重新判断回款状态
      if (newReceived >= projectAmount) {
        project.payment.paymentStatus = 'paid';
      } else if (newReceived > 0) {
        project.payment.paymentStatus = 'partially_paid';
      } else {
        project.payment.paymentStatus = 'unpaid';
      }
      
      await project.save();
    }
    res.json({ success: true, message: '回款记录已删除并已回滚项目回款' });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误',
        statusCode: 500
      }
    });
  }
});

// 新增发票
router.post('/invoice/:projectId', allowManageFinance, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { invoiceNumber, amount, issueDate, status, type, note } = req.body;
    if (!invoiceNumber || !amount || !issueDate) {
      return res.status(400).json({ 
        success: false, 
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: '发票号、金额、开票日期必填',
          statusCode: 400
        }
      });
    }
    
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
    
    const invoiceAmount = Number(amount);
    const projectAmount = project.projectAmount || 0;
    
    // 校验发票金额必须大于0
    if (invoiceAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: '发票金额必须大于0' 
      });
    }
    
    // 校验单张发票金额不能超过项目总金额
    if (invoiceAmount > projectAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `发票金额(${invoiceAmount.toLocaleString()})不能超过项目总金额(${projectAmount.toLocaleString()})` 
      });
    }
    
    // 获取该项目的所有历史发票（排除作废的）
    const existingInvoices = await Invoice.find({ 
      projectId,
      status: { $ne: 'void' } // 排除作废的发票
    });
    
    // 计算累计开票金额
    const totalInvoiceAmount = existingInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    
    // 校验累计开票金额（包括本次）不能超过项目总金额
    const newTotalAmount = totalInvoiceAmount + invoiceAmount;
    if (newTotalAmount > projectAmount) {
      const remaining = projectAmount - totalInvoiceAmount;
      return res.status(400).json({ 
        success: false, 
        message: `累计开票金额不能超过项目总金额！项目金额：¥${projectAmount.toLocaleString()}，已开票：¥${totalInvoiceAmount.toLocaleString()}，本次开票：¥${invoiceAmount.toLocaleString()}，最多可开票：¥${Math.max(0, remaining).toLocaleString()}` 
      });
    }
    
    // 检查发票号是否已存在
    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (existingInvoice) {
      return res.status(400).json({ 
        success: false, 
        error: {
          code: 'DUPLICATE_ENTRY',
          message: '发票号已存在',
          statusCode: 400
        }
      });
    }
    
    const invoice = await Invoice.create({
      projectId,
      invoiceNumber,
      amount: invoiceAmount,
      issueDate: new Date(issueDate),
      status: status || 'issued', // 默认已开具
      type: type || 'vat',
      note,
      createdBy: req.user._id
    });
    
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误',
        statusCode: 500
      }
    });
  }
});

// 更新发票
router.put('/invoice/:invoiceId', allowManageFinance, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await Invoice.findById(invoiceId)
      .populate('projectId', 'projectName projectNumber projectAmount customerId');
    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        error: {
          code: 'INVOICE_NOT_FOUND',
          message: '发票不存在',
          statusCode: 404
        }
      });
    }
    
    const project = invoice.projectId;
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
    
    const projectAmount = project.projectAmount || 0;
    
    // 如果更新了金额，需要校验累计开票金额
    if (req.body.amount !== undefined) {
      const newAmount = Number(req.body.amount);
      
      // 校验发票金额必须大于0
      if (newAmount <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: '发票金额必须大于0' 
        });
      }
      
      // 校验单张发票金额不能超过项目总金额
      if (newAmount > projectAmount) {
        return res.status(400).json({ 
          success: false, 
          message: `发票金额(${newAmount.toLocaleString()})不能超过项目总金额(${projectAmount.toLocaleString()})` 
        });
      }
      
      // 获取该项目的所有历史发票（排除作废的，以及当前正在更新的发票）
      const existingInvoices = await Invoice.find({ 
        projectId: project._id,
        status: { $ne: 'void' },
        _id: { $ne: invoiceId } // 排除当前发票
      });
      
      // 计算累计开票金额（不包括当前发票）
      const totalInvoiceAmount = existingInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
      
      // 校验累计开票金额（包括更新后的金额）不能超过项目总金额
      const newTotalAmount = totalInvoiceAmount + newAmount;
      if (newTotalAmount > projectAmount) {
        const remaining = projectAmount - totalInvoiceAmount;
        return res.status(400).json({ 
          success: false, 
          message: `累计开票金额不能超过项目总金额！项目金额：¥${projectAmount.toLocaleString()}，已开票（不含本张）：¥${totalInvoiceAmount.toLocaleString()}，更新后金额：¥${newAmount.toLocaleString()}，最多可开票：¥${Math.max(0, remaining).toLocaleString()}` 
        });
      }
    }
    
    // 如果更新了发票号，检查是否与其他发票重复
    if (req.body.invoiceNumber !== undefined && req.body.invoiceNumber !== invoice.invoiceNumber) {
      const existingInvoice = await Invoice.findOne({ 
        invoiceNumber: req.body.invoiceNumber,
        _id: { $ne: invoiceId }
      });
      if (existingInvoice) {
        return res.status(400).json({ 
        success: false, 
        error: {
          code: 'DUPLICATE_ENTRY',
          message: '发票号已存在',
          statusCode: 400
        }
      });
      }
    }
    
    ['invoiceNumber', 'amount', 'issueDate', 'status', 'type', 'note'].forEach(f => {
      if (req.body[f] !== undefined) {
        invoice[f] = f === 'issueDate' ? new Date(req.body[f]) : req.body[f];
      }
    });
    await invoice.save();
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误',
        statusCode: 500
      }
    });
  }
});

// 发票列表（支持状态、类型筛选）
router.get('/invoice', allowViewFinance, async (req, res) => {
  try {
    const { projectId, status, type } = req.query;
    const query = {};
    if (projectId) query.projectId = projectId;
    if (status) query.status = status;
    if (type) query.type = type;
    
    // 权限控制：sale只能查看自己项目的发票
    if (!isAdminOrFinance(req)) {
      // sale角色：只能查看自己创建的项目
      const projects = await Project.find({ createdBy: req.user._id }).select('_id');
      const projectIds = projects.map(p => p._id);
      if (projectId) {
        // 如果指定了projectId，检查是否属于该用户
        if (!projectIds.some(id => id.toString() === projectId)) {
          return res.status(403).json({ 
          success: false, 
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '无权查看该项目发票',
            statusCode: 403
          }
        });
        }
      } else {
        // 如果没有指定projectId，只查询该用户的项目
        query.projectId = { $in: projectIds };
      }
    }
    
    const list = await Invoice.find(query)
      .populate('projectId', 'projectName projectNumber')
      .sort({ issueDate: -1 });
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误',
        statusCode: 500
      }
    });
  }
});

// KPI审核待办
router.get('/kpi/pending', allowManageFinance, async (req, res) => {
  try {
    const { month } = req.query;
    const q = { isReviewed: false };
    if (month) q.month = month;
    const list = await KpiRecord.find(q)
      .populate('userId', 'name')
      .populate('projectId', 'projectName');
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误',
        statusCode: 500
      }
    });
  }
});

// 报表：按客户、销售汇总
router.get('/reports/summary', allowManageFinance, async (req, res) => {
  try {
    const { month } = req.query;
    const q = {};
    
    // 排除已取消的项目
    q.status = { $ne: 'cancelled' };
    
    if (month) {
      const [y, m] = month.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59);
      // 时间范围：已完成用 completedAt，未完成用 createdAt
      q.$or = [
        { completedAt: { $gte: start, $lte: end } },
        { completedAt: { $exists: false }, createdAt: { $gte: start, $lte: end } }
      ];
    }
    const projects = await Project.find(q).populate('customerId', 'name').populate('createdBy', 'name');
    const byCustomer = {};
    const bySales = {};
    const byBusinessType = {};
    const byStatus = {};
    let totalAmount = 0;
    let totalProjects = projects.length;
    
    projects.forEach(p => {
      const amount = p.projectAmount || 0;
      totalAmount += amount;
      
      // 按客户汇总
      const cust = p.customerId ? p.customerId.name : '未分配';
      byCustomer[cust] = (byCustomer[cust] || 0) + amount;
      
      // 按销售汇总
      const sales = p.createdBy ? p.createdBy.name : '未知销售';
      bySales[sales] = (bySales[sales] || 0) + amount;
      
      // 按业务类型汇总
      const businessType = p.businessType || '其他';
      byBusinessType[businessType] = (byBusinessType[businessType] || 0) + amount;
      
      // 按状态汇总
      const status = p.status || 'pending';
      byStatus[status] = (byStatus[status] || 0) + amount;
    });
    
    res.json({
      success: true,
      data: {
        byCustomer,
        bySales,
        byBusinessType,
        byStatus,
        totalAmount,
        totalProjects
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误',
        statusCode: 500
      }
    });
  }
});

// 回款与发票对账报表
router.get('/reconciliation', allowManageFinance, async (req, res) => {
  try {
    const { projectId, startDate, endDate } = req.query;
    const query = {};
    if (projectId) query.projectId = projectId;
    
    // 获取项目信息
    const projects = await Project.find(query)
      .populate('customerId', 'name')
      .populate('createdBy', 'name')
      .select('projectName projectNumber projectAmount payment customerId createdBy');
    
    // 获取回款记录
    const paymentQuery = {};
    if (projectId) paymentQuery.projectId = projectId;
    if (startDate || endDate) {
      paymentQuery.receivedAt = {};
      if (startDate) paymentQuery.receivedAt.$gte = new Date(startDate);
      if (endDate) paymentQuery.receivedAt.$lte = new Date(endDate);
    }
    const payments = await PaymentRecord.find(paymentQuery)
      .populate('recordedBy', 'name')
      .sort({ receivedAt: -1 });
    
    // 获取发票记录
    const invoiceQuery = {};
    if (projectId) invoiceQuery.projectId = projectId;
    if (startDate || endDate) {
      invoiceQuery.issueDate = {};
      if (startDate) invoiceQuery.issueDate.$gte = new Date(startDate);
      if (endDate) invoiceQuery.issueDate.$lte = new Date(endDate);
    }
    const invoices = await Invoice.find(invoiceQuery)
      .populate('createdBy', 'name')
      .sort({ issueDate: -1 });
    
    // 构建对账数据
    const reconciliationData = projects.map(project => {
      const projectPayments = payments.filter(p => p.projectId.toString() === project._id.toString());
      const projectInvoices = invoices.filter(i => i.projectId.toString() === project._id.toString());
      
      const totalPaymentAmount = projectPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const totalInvoiceAmount = projectInvoices
        .filter(i => i.status !== 'void')
        .reduce((sum, i) => sum + (i.amount || 0), 0);
      
      return {
        projectId: project._id,
        projectNumber: project.projectNumber,
        projectName: project.projectName,
        projectAmount: project.projectAmount,
        customerName: project.customerId?.name || '',
        salesName: project.createdBy?.name || '',
        receivedAmount: project.payment?.receivedAmount || 0,
        remainingAmount: project.payment?.remainingAmount || 0,
        paymentStatus: project.payment?.paymentStatus || 'unpaid',
        totalPaymentAmount,
        totalInvoiceAmount,
        paymentCount: projectPayments.length,
        invoiceCount: projectInvoices.filter(i => i.status !== 'void').length,
        isBalanced: Math.abs(totalPaymentAmount - totalInvoiceAmount) < 0.01, // 允许0.01的误差
        payments: projectPayments.map(p => ({
          id: p._id,
          amount: p.amount,
          receivedAt: p.receivedAt,
          method: p.method,
          reference: p.reference,
          invoiceNumber: p.invoiceNumber,
          recordedBy: p.recordedBy?.name || ''
        })),
        invoices: projectInvoices.map(i => ({
          id: i._id,
          invoiceNumber: i.invoiceNumber,
          amount: i.amount,
          issueDate: i.issueDate,
          status: i.status,
          type: i.type,
          createdBy: i.createdBy?.name || ''
        }))
      };
    });
    
    res.json({
      success: true,
      data: reconciliationData,
      summary: {
        totalProjects: reconciliationData.length,
        totalPaymentAmount: reconciliationData.reduce((sum, d) => sum + d.totalPaymentAmount, 0),
        totalInvoiceAmount: reconciliationData.reduce((sum, d) => sum + d.totalInvoiceAmount, 0),
        balancedProjects: reconciliationData.filter(d => d.isBalanced).length,
        unbalancedProjects: reconciliationData.filter(d => !d.isBalanced).length
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || '服务器内部错误',
        statusCode: 500
      }
    });
  }
});

// 导出应收对账CSV（使用GBK编码解决Excel乱码问题）
router.get('/receivables/export', allowViewFinance, async (req, res) => {
  try {
    const iconv = require('iconv-lite');
    const { customerId, status, dueBefore, salesId, paymentStatus, hasInvoice, expectedStartDate, expectedEndDate } = req.query;
    
    // 使用与/receivables相同的查询逻辑
    const baseConditions = {};
    if (customerId) baseConditions.customerId = customerId;
    if (salesId && isAdminOrFinance(req)) baseConditions.createdBy = salesId;
    if (!isAdminOrFinance(req)) {
      baseConditions.createdBy = req.user._id;
    }
    if (status) {
      baseConditions.status = status;
    } else {
      baseConditions.status = { $ne: 'cancelled' };
    }
    
    // 销售/兼职销售仅能导出自己创建的项目
    
    const orConditions = [];
    // 预期回款日期筛选（支持日期范围）
    if (expectedStartDate || expectedEndDate) {
      const dateCondition = {};
      if (expectedStartDate) {
        dateCondition.$gte = new Date(expectedStartDate);
      }
      if (expectedEndDate) {
        dateCondition.$lte = new Date(expectedEndDate);
      }
      orConditions.push({
        $or: [
          { 'payment.expectedAt': dateCondition },
          { 'payment.expectedAt': { $exists: false } },
          { 'payment.expectedAt': null }
        ]
      });
    } else if (dueBefore) {
      // 兼容旧的dueBefore参数
      orConditions.push({
        $or: [
          { 'payment.expectedAt': { $lte: new Date(dueBefore) } },
          { 'payment.expectedAt': { $exists: false } },
          { 'payment.expectedAt': null }
        ]
      });
    }
    
    if (paymentStatus) {
      if (paymentStatus === 'unpaid') {
        orConditions.push({
          $or: [
            { 'payment.paymentStatus': 'unpaid' },
            { 'payment.paymentStatus': { $exists: false } },
            { 'payment.paymentStatus': null }
          ]
        });
      } else {
        baseConditions['payment.paymentStatus'] = paymentStatus;
      }
    }
    
    const query = {};
    if (orConditions.length > 0) {
      query.$and = [
        ...Object.keys(baseConditions).map(key => ({ [key]: baseConditions[key] })),
        ...orConditions
      ];
    } else {
      Object.assign(query, baseConditions);
    }
    
    // 修复：只选择payment，不要单独选择payment.expectedAt，避免路径冲突
    const projects = await Project.find(query)
      .populate('customerId', 'name shortName')
      .populate('createdBy', 'name')
      .select('projectName projectAmount payment customerId createdBy status projectNumber');
    
    const projectIds = projects.map(p => p._id);
    const invoices = await Invoice.find({ 
      projectId: { $in: projectIds },
      status: { $ne: 'void' }
    }).select('projectId status');
    
    const projectInvoiceMap = {};
    invoices.forEach(inv => {
      const pid = inv.projectId.toString();
      if (!projectInvoiceMap[pid]) {
        projectInvoiceMap[pid] = [];
      }
      projectInvoiceMap[pid].push(inv);
    });
    
    const rows = projects.map(p => {
      const received = p.payment?.receivedAmount || 0;
      const projectAmount = p.projectAmount || 0;
      const outstanding = Math.max(0, projectAmount - received);
      const projectInvoices = projectInvoiceMap[p._id.toString()] || [];
      const hasInvoices = projectInvoices.length > 0;
      
      if (hasInvoice === 'true' && !hasInvoices) return null;
      if (hasInvoice === 'false' && hasInvoices) return null;
      
      let pStatus = p.payment?.paymentStatus;
      if (!pStatus) {
        if (received >= projectAmount && projectAmount > 0) {
          pStatus = 'paid';
        } else if (received > 0) {
          pStatus = 'partially_paid';
        } else {
          pStatus = 'unpaid';
        }
      }
      
      const statusText = pStatus === 'paid' ? '已支付' : 
                        pStatus === 'partially_paid' ? '部分支付' : '未支付';
      
      const expectedAt = p.payment?.expectedAt;
      const isOverdue = expectedAt && !p.payment?.isFullyPaid && new Date(expectedAt) < new Date();
      
      return [
        p.projectNumber || '-',
        p.projectName || '',
        p.customerId?.name || '',
        p.createdBy?.name || '',
        projectAmount || 0,
        received || 0,
        outstanding || 0,
        expectedAt ? new Date(expectedAt).toLocaleDateString('zh-CN') : '',
        statusText,
        hasInvoices ? '已开票' : '未开票',
        isOverdue ? '逾期' : ''
      ];
    }).filter(row => row !== null);
    
    const header = ['项目编号', '项目名称', '客户', '销售', '项目金额', '已回款', '未回款', '约定回款日', '回款状态', '发票状态', '逾期'];
    const csvData = [header, ...rows].map(row => 
      row.map(cell => {
        const str = (cell ?? '').toString();
        return `"${str.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '')}"`;
      }).join(',')
    ).join('\r\n');
    
    // 转换为GBK编码（Windows Excel默认编码）
    const gbkBuffer = iconv.encode(csvData, 'gbk');
    
    res.setHeader('Content-Type', 'text/csv;charset=gbk');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('应收对账.csv')}`);
    res.send(gbkBuffer);
  } catch (error) {
    console.error('导出应收对账失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 导出对账表CSV（使用GBK编码解决Excel乱码问题）
router.get('/reconciliation/export', allowManageFinance, async (req, res) => {
  try {
    const iconv = require('iconv-lite');
    const { startDate, endDate } = req.query;
    
    // 使用与/reconciliation相同的查询逻辑
    const query = { status: { $ne: 'cancelled' } };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }
    
    const projects = await Project.find(query)
      .populate('customerId', 'name')
      .populate('createdBy', 'name')
      .select('projectName projectNumber projectAmount payment customerId createdBy');
    
    const projectIds = projects.map(p => p._id);
    
    // 获取回款记录
    const paymentRecords = await PaymentRecord.find({ projectId: { $in: projectIds } })
      .select('projectId amount paymentDate');
    
    // 获取发票记录
    const invoices = await Invoice.find({ 
      projectId: { $in: projectIds },
      status: { $ne: 'void' }
    }).select('projectId amount status');
    
    // 构建映射
    const paymentMap = {};
    paymentRecords.forEach(pr => {
      const pid = pr.projectId.toString();
      if (!paymentMap[pid]) {
        paymentMap[pid] = [];
      }
      paymentMap[pid].push(pr);
    });
    
    const invoiceMap = {};
    invoices.forEach(inv => {
      const pid = inv.projectId.toString();
      if (!invoiceMap[pid]) {
        invoiceMap[pid] = [];
      }
      invoiceMap[pid].push(inv);
    });
    
    const rows = projects.map(p => {
      const pid = p._id.toString();
      const projectPayments = paymentMap[pid] || [];
      const projectInvoices = invoiceMap[pid] || [];
      
      const totalPaymentAmount = projectPayments.reduce((sum, pr) => sum + (pr.amount || 0), 0);
      const totalInvoiceAmount = projectInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
      
      const receivedAmount = p.payment?.receivedAmount || 0;
      const projectAmount = p.projectAmount || 0;
      const remainingAmount = Math.max(0, projectAmount - receivedAmount);
      
      let paymentStatus = p.payment?.paymentStatus;
      if (!paymentStatus) {
        if (receivedAmount >= projectAmount && projectAmount > 0) {
          paymentStatus = 'paid';
        } else if (receivedAmount > 0) {
          paymentStatus = 'partially_paid';
        } else {
          paymentStatus = 'unpaid';
        }
      }
      
      const statusText = paymentStatus === 'paid' ? '已支付' : 
                        paymentStatus === 'partially_paid' ? '部分支付' : '未支付';
      const isBalanced = Math.abs(totalPaymentAmount - totalInvoiceAmount) < 0.01;
      
      return [
        p.projectNumber || '-',
        p.projectName || '',
        p.customerId?.name || '',
        p.createdBy?.name || '',
        projectAmount || 0,
        receivedAmount || 0,
        remainingAmount || 0,
        statusText,
        totalPaymentAmount || 0,
        totalInvoiceAmount || 0,
        isBalanced ? '已对平' : '未对平'
      ];
    });
    
    const header = ['项目编号', '项目名称', '客户', '销售', '项目金额', '已回款', '剩余应收', '回款状态', '回款总额', '发票总额', '对账状态'];
    const csvData = [header, ...rows].map(row => 
      row.map(cell => {
        const str = (cell ?? '').toString();
        return `"${str.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '')}"`;
      }).join(',')
    ).join('\r\n');
    
    // 转换为GBK编码（Windows Excel默认编码）
    const gbkBuffer = iconv.encode(csvData, 'gbk');
    
    res.setHeader('Content-Type', 'text/csv;charset=gbk');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('对账表.csv')}`);
    res.send(gbkBuffer);
  } catch (error) {
    console.error('导出对账表失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

