/**
 * 测试应收对账API
 */

const mongoose = require('mongoose');
require('dotenv').config();

// 加载所有模型
require('../models/Project');
require('../models/Invoice');
require('../models/Customer');
require('../models/User');

const Project = mongoose.model('Project');
const Invoice = mongoose.model('Invoice');

async function testAPI() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('数据库连接成功\n');

    // 模拟API请求参数
    const req = {
      query: {
        // 不传任何筛选条件
      }
    };

    const { customerId, status, dueBefore, salesId, paymentStatus, hasInvoice } = req.query;
    const query = {};
    
    // 基础筛选条件
    if (customerId) query.customerId = customerId;
    if (salesId) query.createdBy = salesId;
    if (status) {
      query.status = status;
    } else {
      // 默认排除已取消项目
      query.status = { $ne: 'cancelled' };
    }
    if (dueBefore) {
      query['payment.expectedAt'] = { $lte: new Date(dueBefore) };
    }
    
    // 回款状态筛选
    if (paymentStatus) {
      if (paymentStatus === 'unpaid') {
        const baseConditions = {};
        Object.keys(query).forEach(key => {
          if (key !== '$and' && key !== '$or') {
            baseConditions[key] = query[key];
          }
        });
        
        query.$and = [
          ...Object.keys(baseConditions).map(key => ({ [key]: baseConditions[key] })),
          {
            $or: [
              { 'payment.paymentStatus': 'unpaid' },
              { 'payment.paymentStatus': { $exists: false } },
              { 'payment.paymentStatus': null }
            ]
          }
        ];
        
        Object.keys(baseConditions).forEach(key => {
          delete query[key];
        });
      } else {
        query['payment.paymentStatus'] = paymentStatus;
      }
    }

    console.log('查询条件:', JSON.stringify(query, null, 2));
    
    const projects = await Project.find(query)
      .populate('customerId', 'name shortName')
      .populate('createdBy', 'name')
      .select('projectName projectAmount payment expectedAt customerId createdBy status projectNumber');
    
    console.log(`\n查询到的项目数量: ${projects.length}`);
    
    if (projects.length === 0) {
      console.log('\n⚠️ 没有查询到任何项目！');
      console.log('检查所有项目:');
      const allProjects = await Project.find({}).select('status projectName');
      console.log(`总项目数: ${allProjects.length}`);
      allProjects.forEach(p => {
        console.log(`  - ${p.projectName}: status=${p.status}`);
      });
    } else {
      // 获取所有项目的发票信息
      const projectIds = projects.map(p => p._id);
      const invoices = await Invoice.find({ 
        projectId: { $in: projectIds },
        status: { $ne: 'void' }
      }).select('projectId status');
      
      console.log(`\n相关发票数量: ${invoices.length}`);
      
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
        
        let paymentStatus = p.payment?.paymentStatus;
        if (!paymentStatus) {
          if (received >= projectAmount && projectAmount > 0) {
            paymentStatus = 'paid';
          } else if (received > 0) {
            paymentStatus = 'partially_paid';
          } else {
            paymentStatus = 'unpaid';
          }
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
      
      // 发票状态筛选
      if (hasInvoice === 'true') {
        data = data.filter(d => d.hasInvoice);
      } else if (hasInvoice === 'false') {
        data = data.filter(d => !d.hasInvoice);
      }
      
      console.log(`\n最终返回数据数量: ${data.length}`);
      console.log('\n前3条数据:');
      data.slice(0, 3).forEach((d, i) => {
        console.log(`\n${i + 1}. ${d.projectName}`);
        console.log(`   编号: ${d.projectNumber}`);
        console.log(`   状态: ${d.status}`);
        console.log(`   回款状态: ${d.paymentStatus}`);
        console.log(`   已回款: ${d.receivedAmount}`);
        console.log(`   项目金额: ${d.projectAmount}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n测试完成');
    process.exit(0);
  } catch (error) {
    console.error('测试失败:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testAPI();

