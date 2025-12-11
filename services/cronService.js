const cron = require('node-cron');
const { generateMonthlyKPIRecords } = require('./kpiService');
const { backupDatabase, deleteOldBackups } = require('./backupService');

/**
 * 安排月度KPI自动计算任务
 * 每月1日00:00执行
 */
function scheduleMonthlyKPICalculation() {
  // 每月1日00:00执行
  cron.schedule('0 0 1 * *', async () => {
    try {
      console.log('🔄 开始执行月度KPI自动计算任务...');
      
      // 计算上个月
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const month = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
      
      console.log(`📅 计算月份: ${month}`);
      
      const result = await generateMonthlyKPIRecords(month);
      
      console.log(`✅ 月度KPI计算完成: 生成 ${result.count} 条记录`);
      if (result.errors && result.errors.length > 0) {
        console.warn('⚠️ 部分记录生成失败:', result.errors);
      }
    } catch (error) {
      console.error('❌ 月度KPI自动计算任务失败:', error);
    }
  }, {
    timezone: 'Asia/Shanghai'
  });

  console.log('✅ 月度KPI自动计算任务已安排（每月1日00:00执行）');
}

/**
 * 安排每日数据库备份任务
 * 每天00:00执行备份，并删除超过5天的旧备份
 */
function scheduleDailyBackup() {
  // 每天00:00执行
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('🔄 开始执行每日数据库备份任务...');
      
      // 执行备份
      const backupResult = await backupDatabase();
      
      if (backupResult.success) {
        console.log(`✅ 数据库备份成功: ${backupResult.filename} (${(backupResult.size / 1024 / 1024).toFixed(2)} MB)`);
      } else {
        console.error('❌ 数据库备份失败:', backupResult.error);
      }
      
      // 删除超过保留期的备份
      const deleteResult = await deleteOldBackups();
      
      if (deleteResult.deleted > 0) {
        console.log(`✅ 清理旧备份完成: 删除了 ${deleteResult.deleted} 个备份文件`);
        if (deleteResult.errors && deleteResult.errors.length > 0) {
          console.warn('⚠️ 部分备份删除失败:', deleteResult.errors);
        }
      } else {
        console.log('ℹ️ 无需清理旧备份');
      }
    } catch (error) {
      console.error('❌ 每日备份任务失败:', error);
    }
  }, {
    timezone: 'Asia/Shanghai'
  });

  console.log('✅ 每日数据库备份任务已安排（每天00:00执行）');
}

/**
 * 手动触发月度KPI计算（用于测试）
 */
async function triggerMonthlyCalculation(month) {
  try {
    console.log(`🔄 手动触发月度KPI计算: ${month}`);
    const result = await generateMonthlyKPIRecords(month);
    console.log(`✅ 完成: 生成 ${result.count} 条记录`);
    return result;
  } catch (error) {
    console.error('❌ 手动触发失败:', error);
    throw error;
  }
}

module.exports = {
  scheduleMonthlyKPICalculation,
  triggerMonthlyCalculation,
  scheduleDailyBackup
};



























