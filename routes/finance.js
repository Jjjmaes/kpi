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

// 应收对账列表（支持客户/销售过滤，逾期标记）
router.get('/receivables', async (req, res) => {
  try {
    const { customerId, status, dueBefore, salesId } = req.query;
    const query = {};
    if (customerId) query.customerId = customerId;
    if (salesId) query.createdBy = salesId;
    if (status) query.status = status;
    if (dueBefore) {
      query['payment.expectedAt'] = { $lte: new Date(dueBefore) };
    }
    const projects = await Project.find(query).select('projectName projectAmount payment expectedAt customerId createdBy status projectNumber');
    const data = projects.map(p => {
      const received = p.payment?.receivedAmount || 0;
      const outstanding = Math.max((p.projectAmount || 0) - received, 0);
      const overdue = !!(p.payment?.expectedAt && !p.payment?.isFullyPaid && p.payment.expectedAt < new Date());
      return {
        id: p._id,
        projectName: p.projectName,
        projectNumber: p.projectNumber,
        projectAmount: p.projectAmount,
        receivedAmount: received,
        expectedAt: p.payment?.expectedAt,
        isFullyPaid: p.payment?.isFullyPaid,
        outstanding,
        status: p.status,
        customerId: p.customerId,
        createdBy: p.createdBy,
        overdue
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 新增回款记录并更新项目回款
router.post('/payment/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { amount, receivedAt, method, reference, note } = req.body;
    if (!amount || amount <= 0 || !receivedAt) {
      return res.status(400).json({ success: false, message: '回款金额和日期必填' });
    }
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ success: false, message: '项目不存在' });

    await PaymentRecord.create({
      projectId,
      amount,
      receivedAt: new Date(receivedAt),
      method: method || 'bank',
      reference,
      note,
      recordedBy: req.user._id
    });

    // 更新项目累计回款
    const totalReceived = (project.payment?.receivedAmount || 0) + Number(amount);
    project.payment.receivedAmount = totalReceived;
    project.payment.receivedAt = new Date(receivedAt);
    project.payment.isFullyPaid = totalReceived >= (project.projectAmount || 0);
    await project.save();

    res.json({ success: true, message: '回款已记录', data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 查询项目回款记录
router.get('/payment/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const records = await PaymentRecord.find({ projectId }).sort({ receivedAt: -1, createdAt: -1 });
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
    await PaymentRecord.deleteOne({ _id: recordId });
    // 不自动回滚项目金额，避免误差；如需同步请后续补偿
    res.json({ success: true, message: '回款记录已删除' });
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
    const invoice = await Invoice.create({
      projectId,
      invoiceNumber,
      amount,
      issueDate: new Date(issueDate),
      status: status || 'issued',
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
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ success: false, message: '发票不存在' });
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

// 发票列表
router.get('/invoice', async (req, res) => {
  try {
    const { projectId, status } = req.query;
    const query = {};
    if (projectId) query.projectId = projectId;
    if (status) query.status = status;
    const list = await Invoice.find(query).sort({ issueDate: -1 });
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
    if (month) {
      const [y, m] = month.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59);
      q.completedAt = { $gte: start, $lte: end };
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

module.exports = router;

