/**
 * 测试应收对账查询逻辑
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

    // 测试1: 无筛选条件
    console.log('=== 测试1: 无筛选条件 ===');
    const query1 = { status: { $ne: 'cancelled' } };
    const count1 = await Project.countDocuments(query1);
    console.log(`查询条件:`, JSON.stringify(query1, null, 2));
    console.log(`结果数量: ${count1}\n`);

    // 测试2: 筛选未支付
    console.log('=== 测试2: 筛选未支付 ===');
    const query2 = {
      status: { $ne: 'cancelled' },
      $and: [{
        $or: [
          { 'payment.paymentStatus': 'unpaid' },
          { 'payment.paymentStatus': { $exists: false } },
          { 'payment.paymentStatus': null }
        ]
      }]
    };
    const count2 = await Project.countDocuments(query2);
    console.log(`查询条件:`, JSON.stringify(query2, null, 2));
    console.log(`结果数量: ${count2}\n`);

    // 测试3: 筛选部分支付
    console.log('=== 测试3: 筛选部分支付 ===');
    const query3 = {
      status: { $ne: 'cancelled' },
      'payment.paymentStatus': 'partially_paid'
    };
    const count3 = await Project.countDocuments(query3);
    console.log(`查询条件:`, JSON.stringify(query3, null, 2));
    console.log(`结果数量: ${count3}\n`);

    // 测试4: 筛选已支付
    console.log('=== 测试4: 筛选已支付 ===');
    const query4 = {
      status: { $ne: 'cancelled' },
      'payment.paymentStatus': 'paid'
    };
    const count4 = await Project.countDocuments(query4);
    console.log(`查询条件:`, JSON.stringify(query4, null, 2));
    console.log(`结果数量: ${count4}\n`);

    // 显示所有项目的回款状态分布
    console.log('=== 项目回款状态分布 ===');
    const allProjects = await Project.find({ status: { $ne: 'cancelled' } })
      .select('projectName projectNumber payment');
    
    const statusCount = {
      unpaid: 0,
      partially_paid: 0,
      paid: 0,
      null_or_undefined: 0
    };

    allProjects.forEach(p => {
      const status = p.payment?.paymentStatus;
      if (!status || status === null) {
        statusCount.null_or_undefined++;
      } else if (statusCount[status] !== undefined) {
        statusCount[status]++;
      }
    });

    console.log('状态分布:', statusCount);
    console.log(`\n总项目数: ${allProjects.length}`);

    // 显示前3个项目的详细信息
    console.log('\n=== 前3个项目详情 ===');
    allProjects.slice(0, 3).forEach((p, i) => {
      console.log(`\n项目 ${i + 1}:`);
      console.log(`  名称: ${p.projectName}`);
      console.log(`  编号: ${p.projectNumber || '无'}`);
      console.log(`  回款状态: ${p.payment?.paymentStatus || 'null/undefined'}`);
      console.log(`  已回款: ${p.payment?.receivedAmount || 0}`);
      console.log(`  项目金额: ${p.projectAmount || 0}`);
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


