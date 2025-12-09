const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Project = require('../models/Project');
const PaymentRecord = require('../models/PaymentRecord');
const Invoice = require('../models/Invoice');
const KpiRecord = require('../models/KpiRecord');
const User = require('../models/User');

// 财务模块需要认证
router.use(authenticate);
router.use(authorize('admin', 'finance'));

// 应收对账列表（支持客户/销售过滤，逾期标记，回款状态，发票状态）
router.get('/receivables', async (req, res) => {
  try {
    const { customerId, status, dueBefore, salesId, paymentStatus, hasInvoice } = req.query;
    
    // 收集所有基础条件
    const baseConditions = {};
    if (customerId) baseConditions.customerId = customerId;
    if (salesId) baseConditions.createdBy = salesId;
    if (status) {
      baseConditions.status = status;
    } else {
      // 默认排除已取消项目
      baseConditions.status = { $ne: 'cancelled' };
    }
    
    // 收集需要 $or 的条件
    const orConditions = [];
    
    // 预期回款日期筛选
    if (dueBefore) {
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
    res.status(500).json({ success: false, message: error.message });
  }
});

// 新增回款记录并更新项目回款
router.post('/payment/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { amount, receivedAt, method, reference, invoiceNumber, note } = req.body;
    if (!amount || amount <= 0 || !receivedAt) {
      return res.status(400).json({ success: false, message: '回款金额和日期必填' });
    }
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ success: false, message: '项目不存在' });

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
    res.status(500).json({ success: false, message: error.message });
  }
});

// 查询项目回款记录（支持按回款状态筛选）
router.get('/payment/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { paymentStatus } = req.query;
    
    // 获取项目信息
    const project = await Project.findById(projectId).select('projectAmount payment');
    if (!project) {
      return res.status(404).json({ success: false, message: '项目不存在' });
    }
    
    // 获取所有回款记录（按时间正序，以便计算累计状态）
    let records = await PaymentRecord.find({ projectId })
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
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除回款记录（若需修正）
router.delete('/payment/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const rec = await PaymentRecord.findById(recordId);
    if (!rec) return res.status(404).json({ success: false, message: '记录不存在' });
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
    res.status(500).json({ success: false, message: error.message });
  }
});

// 新增发票
router.post('/invoice/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { invoiceNumber, amount, issueDate, status, type, note } = req.body;
    if (!invoiceNumber || !amount || !issueDate) {
      return res.status(400).json({ success: false, message: '发票号、金额、开票日期必填' });
    }
    
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ success: false, message: '项目不存在' });
    
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
      return res.status(400).json({ success: false, message: '发票号已存在' });
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
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新发票
router.put('/invoice/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await Invoice.findById(invoiceId).populate('projectId');
    if (!invoice) return res.status(404).json({ success: false, message: '发票不存在' });
    
    const project = invoice.projectId;
    if (!project) return res.status(404).json({ success: false, message: '项目不存在' });
    
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
        return res.status(400).json({ success: false, message: '发票号已存在' });
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
    res.status(500).json({ success: false, message: error.message });
  }
});

// 发票列表（支持状态、类型筛选）
router.get('/invoice', async (req, res) => {
  try {
    const { projectId, status, type } = req.query;
    const query = {};
    if (projectId) query.projectId = projectId;
    if (status) query.status = status;
    if (type) query.type = type;
    const list = await Invoice.find(query)
      .populate('projectId', 'projectName projectNumber')
      .sort({ issueDate: -1 });
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// KPI审核待办
router.get('/kpi/pending', async (req, res) => {
  try {
    const { month } = req.query;
    const q = { isReviewed: false };
    if (month) q.month = month;
    const list = await KpiRecord.find(q)
      .populate('userId', 'name')
      .populate('projectId', 'projectName');
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 报表：按客户、销售汇总
router.get('/reports/summary', async (req, res) => {
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
    projects.forEach(p => {
      const cust = p.customerId ? p.customerId.name : '未分配';
      byCustomer[cust] = (byCustomer[cust] || 0) + (p.projectAmount || 0);
      const sales = p.createdBy ? p.createdBy.name : '未知销售';
      bySales[sales] = (bySales[sales] || 0) + (p.projectAmount || 0);
    });
    res.json({
      success: true,
      data: {
        byCustomer,
        bySales
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 回款与发票对账报表
router.get('/reconciliation', async (req, res) => {
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
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

