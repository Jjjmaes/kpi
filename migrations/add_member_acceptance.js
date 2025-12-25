/**
 * 数据库迁移脚本：为现有成员添加接受状态
 * 
 * 功能：
 * 1. 为所有现有成员设置 acceptanceStatus = 'accepted'
 * 2. 为所有现有项目初始化 memberAcceptance
 * 
 * 使用方法：
 * node migrations/add_member_acceptance.js
 */

const mongoose = require('mongoose');
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// 导入模型
const ProjectMember = require('../models/ProjectMember');
const Project = require('../models/Project');

async function migrate() {
  console.log('开始迁移：为现有成员添加接受状态...');
  console.log('==========================================');
  
  try {
    // 1. 为所有现有成员设置 acceptanceStatus = 'accepted'
    console.log('\n步骤1: 更新成员接受状态...');
    const result1 = await ProjectMember.updateMany(
      { acceptanceStatus: { $exists: false } },
      { 
        $set: { 
          acceptanceStatus: 'accepted',
          acceptanceAt: new Date()
        }
      }
    );
    console.log(`✓ 已更新 ${result1.modifiedCount} 个成员记录（设置为已接受）`);
    
    // 2. 为所有现有项目初始化 memberAcceptance
    console.log('\n步骤2: 初始化项目成员确认状态...');
    const projects = await Project.find({});
    let updatedProjects = 0;
    let totalProductionMembers = 0;
    
    for (const project of projects) {
      const members = await ProjectMember.find({ projectId: project._id });
      const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
      const productionMembers = members.filter(m => productionRoles.includes(m.role));
      
      // 统计已接受的生产人员
      const acceptedProductionMembers = productionMembers.filter(m => 
        m.acceptanceStatus === 'accepted' || !m.acceptanceStatus
      );
      
      if (!project.memberAcceptance) {
        project.memberAcceptance = {
          requiresConfirmation: productionMembers.length > 0,
          pendingCount: 0,
          acceptedCount: acceptedProductionMembers.length,
          rejectedCount: 0,
          allConfirmed: productionMembers.length === acceptedProductionMembers.length
        };
        await project.save();
        updatedProjects++;
        totalProductionMembers += productionMembers.length;
      }
    }
    
    console.log(`✓ 已更新 ${updatedProjects} 个项目记录`);
    console.log(`✓ 共处理 ${totalProductionMembers} 个生产人员`);
    
    console.log('\n==========================================');
    console.log('迁移完成！');
    console.log('==========================================');
    
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/kpi';
  
  console.log('连接数据库:', mongoUri.replace(/\/\/.*@/, '//***@')); // 隐藏密码
  
  mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    console.log('✓ 数据库连接成功\n');
    return migrate();
  }).then(() => {
    console.log('\n迁移完成，退出');
    process.exit(0);
  }).catch(err => {
    console.error('迁移失败:', err);
    process.exit(1);
  });
}

module.exports = migrate;


