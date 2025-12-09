/**
 * 测试修复后的应收对账查询逻辑
 */

const mongoose = require('mongoose');
const Project = require('../models/Project');
require('dotenv').config();

async function testQuery() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('数据库连接成功\n');

    // 模拟应收对账查询逻辑
    const customerId = null;
    const status = null;
    const dueBefore = null;
    const salesId = null;
    const paymentStatus = 'unpaid'; // 测试筛选未支付
    const hasInvoice = null;

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
        // 将所有条件放入 $and 数组
        const baseConditions = {};
        Object.keys(query).forEach(key => {
          if (key !== '$and' && key !== '$or') {
            baseConditions[key] = query[key];
          }
        });
        
        // 重新构建查询，使用 $and 组合所有条件
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
        
        // 清除基础条件（已放入 $and）
        Object.keys(baseConditions).forEach(key => {
          delete query[key];
        });
      } else {
        query['payment.paymentStatus'] = paymentStatus;
      }
    }

    console.log('查询条件:', JSON.stringify(query, null, 2));
    
    const projects = await Project.find(query)
      .select('projectName projectNumber payment status');
    
    console.log(`\n查询结果数量: ${projects.length}`);
    projects.forEach((p, i) => {
      console.log(`\n项目 ${i + 1}:`);
      console.log(`  名称: ${p.projectName}`);
      console.log(`  编号: ${p.projectNumber || '无'}`);
      console.log(`  状态: ${p.status}`);
      console.log(`  回款状态: ${p.payment?.paymentStatus || 'null/undefined'}`);
    });

    await mongoose.disconnect();
    console.log('\n测试完成');
    process.exit(0);
  } catch (error) {
    console.error('测试失败:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testQuery();


