const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');

// 备份目录
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const RETENTION_DAYS = 5; // 保留5天的备份

/**
 * 确保备份目录存在
 */
async function ensureBackupDir() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch (error) {
    console.error('创建备份目录失败:', error);
    throw error;
  }
}

/**
 * 执行数据库备份
 * @returns {Promise<Object>} 备份信息 { success, filename, filepath, size, error }
 */
async function backupDatabase() {
  try {
    await ensureBackupDir();

    // 获取MongoDB连接信息
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi_system';
    const dbName = mongoUri.split('/').pop().split('?')[0] || 'kpi_system';
    
    // 生成备份文件名（格式：backup_YYYY-MM-DD_HH-mm-ss）
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${timestamp}.tar.gz`;
    const filepath = path.join(BACKUP_DIR, filename);

    return new Promise((resolve, reject) => {
      // 使用mongodump备份数据库
      // 注意：需要系统已安装mongodb-database-tools
      const tempDir = path.join(BACKUP_DIR, `temp_${timestamp}`);
      const dumpCommand = `mongodump --uri="${mongoUri}" --out="${tempDir}"`;
      
      exec(dumpCommand, async (error, stdout, stderr) => {
        if (error) {
          console.error('备份执行失败:', error);
          
          // 检查是否是命令未找到的错误
          let errorMessage = error.message;
          if (error.code === 1 && (error.message.includes('不是内部或外部命令') || 
              error.message.includes('not found') || 
              error.message.includes('command not found'))) {
            errorMessage = '未找到 mongodump 命令。请安装 MongoDB Database Tools 并添加到系统 PATH。\n' +
                          'Windows: https://www.mongodb.com/try/download/database-tools\n' +
                          'Linux: sudo apt-get install mongodb-database-tools';
          }
          
          reject({
            success: false,
            error: errorMessage,
            stderr: stderr,
            code: error.code
          });
          return;
        }

        try {
          // 将备份目录压缩为tar.gz
          const tarCommand = `tar -czf "${filepath}" -C "${BACKUP_DIR}" "temp_${timestamp}"`;
          
          exec(tarCommand, async (tarError) => {
            if (tarError) {
              // 如果压缩失败，尝试直接使用目录备份
              console.warn('压缩失败，使用目录备份:', tarError.message);
              const dirBackupPath = path.join(BACKUP_DIR, `backup_${timestamp}`);
              try {
                await fs.rename(path.join(BACKUP_DIR, `temp_${timestamp}`), dirBackupPath);
                const stats = await fs.stat(dirBackupPath);
                const dirSize = await getDirectorySize(dirBackupPath);
                
                // 目录备份不发送邮件（因为无法作为附件发送）
                console.log('⚠️ 目录备份格式，跳过邮件发送');
                
                resolve({
                  success: true,
                  filename: `backup_${timestamp}`,
                  filepath: dirBackupPath,
                  size: dirSize,
                  format: 'directory',
                  createdAt: now
                });
              } catch (renameError) {
                reject({
                  success: false,
                  error: `压缩和重命名都失败: ${tarError.message}, ${renameError.message}`
                });
              }
              return;
            }

            // 删除临时目录（使用更可靠的方法，支持 Ubuntu/Linux）
            try {
              const tempDirPath = path.join(BACKUP_DIR, `temp_${timestamp}`);
              // 等待一小段时间，确保 tar 命令完全释放文件句柄（在 Linux 上可能需要）
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // 先尝试使用 fs.rm（Node.js 14.14.0+，在 Linux 和 Windows 上都可用）
              try {
                await fs.rm(tempDirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
                console.log(`✅ 临时目录已删除: temp_${timestamp}`);
              } catch (rmError) {
                // 如果 fs.rm 失败，尝试使用递归删除目录内容
                console.warn('fs.rm 删除失败，尝试递归删除:', rmError.message);
                await deleteDirectoryRecursive(tempDirPath);
                console.log(`✅ 临时目录已删除（递归方式）: temp_${timestamp}`);
              }
            } catch (rmError) {
              console.error('❌ 删除临时目录失败:', rmError.message);
              console.error('   临时目录路径:', path.join(BACKUP_DIR, `temp_${timestamp}`));
              // 即使删除失败，也继续完成备份流程
              // 临时目录会在下次清理任务中被删除
            }

            // 获取文件大小
            const stats = await fs.stat(filepath);
            
            // 发送备份文件到管理员邮箱（异步，不阻塞备份流程）
            try {
              const emailService = require('./emailService');
              emailService.sendBackupEmail(filepath, filename, stats.size)
                .then(result => {
                  if (result.success) {
                    console.log(`✅ 备份文件已发送到 ${result.recipients} 个管理员邮箱`);
                  } else {
                    console.warn(`⚠️ 备份文件邮件发送失败: ${result.reason || result.error}`);
                  }
                })
                .catch(err => {
                  console.error('❌ 发送备份邮件异常:', err);
                });
            } catch (emailError) {
              console.warn('⚠️ 发送备份邮件失败:', emailError.message);
            }
            
            resolve({
              success: true,
              filename: filename,
              filepath: filepath,
              size: stats.size,
              format: 'tar.gz',
              createdAt: now
            });
          });
        } catch (statError) {
          reject({
            success: false,
            error: `获取备份文件信息失败: ${statError.message}`
          });
        }
      });
    });
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 递归删除目录（兼容性更好的方法，支持 Windows 和 Linux）
 */
async function deleteDirectoryRecursive(dirPath) {
  try {
    // 先尝试使用 fs.rm（Node.js 14.14.0+，在 Linux 和 Windows 上都可用）
    try {
      await fs.rm(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (rmError) {
      // 如果 fs.rm 失败，使用递归删除方法
      console.warn(`fs.rm 删除失败，使用递归删除: ${rmError.message}`);
    }

    // 递归删除方法（兼容旧版本 Node.js）
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          await deleteDirectoryRecursive(filePath);
        } else {
          // 在 Linux 上，可能需要先修改文件权限
          try {
            await fs.chmod(filePath, 0o666);
          } catch (chmodError) {
            // 忽略权限修改失败
          }
          await fs.unlink(filePath);
        }
      } catch (fileError) {
        console.warn(`删除文件/目录失败: ${filePath}`, fileError.message);
        // 继续删除其他文件
      }
    }
    
    // 删除空目录
    try {
      await fs.rmdir(dirPath);
    } catch (rmdirError) {
      // 如果 rmdir 失败，最后尝试一次 fs.rm
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
      } catch (finalError) {
        throw new Error(`删除目录失败: ${rmdirError.message}`);
      }
    }
  } catch (error) {
    throw new Error(`删除目录失败: ${error.message}`);
  }
}

/**
 * 获取目录大小（递归）
 */
async function getDirectorySize(dirPath) {
  let totalSize = 0;
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
  } catch (error) {
    console.error('计算目录大小失败:', error);
  }
  return totalSize;
}

/**
 * 删除超过保留期的备份
 * @returns {Promise<Object>} 删除信息 { deleted, errors }
 */
async function deleteOldBackups() {
  try {
    await ensureBackupDir();
    
    const files = await fs.readdir(BACKUP_DIR);
    const now = new Date();
    const retentionTime = RETENTION_DAYS * 24 * 60 * 60 * 1000; // 5天的毫秒数
    
    const deleted = [];
    const errors = [];

    for (const file of files) {
      // 同时清理临时目录（无论是否过期）
      if (file.startsWith('temp_') || file.startsWith('restore_temp_')) {
        const filepath = path.join(BACKUP_DIR, file);
        try {
          const stats = await fs.stat(filepath);
          if (stats.isDirectory()) {
            await deleteDirectoryRecursive(filepath);
            deleted.push({
              filename: file,
              deletedAt: new Date(),
              age: 0,
              reason: '临时目录清理'
            });
            console.log(`✅ 清理临时目录: ${file}`);
          }
        } catch (error) {
          errors.push({
            filename: file,
            error: error.message
          });
          console.error(`❌ 清理临时目录失败: ${file}`, error);
        }
        continue;
      }
      
      const filepath = path.join(BACKUP_DIR, file);
      
      try {
        const stats = await fs.stat(filepath);
        const fileAge = now.getTime() - stats.mtime.getTime();
        
        if (fileAge > retentionTime) {
          if (stats.isDirectory()) {
            await deleteDirectoryRecursive(filepath);
          } else {
            await fs.unlink(filepath);
          }
          deleted.push({
            filename: file,
            deletedAt: new Date(),
            age: Math.round(fileAge / (24 * 60 * 60 * 1000)) // 天数
          });
          console.log(`✅ 删除旧备份: ${file} (${Math.round(fileAge / (24 * 60 * 60 * 1000))}天前)`);
        }
      } catch (error) {
        errors.push({
          filename: file,
          error: error.message
        });
        console.error(`❌ 删除备份失败: ${file}`, error);
      }
    }

    return {
      deleted: deleted.length,
      files: deleted,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    return {
      deleted: 0,
      error: error.message
    };
  }
}

/**
 * 获取备份列表
 * @returns {Promise<Array>} 备份文件列表
 */
async function listBackups() {
  try {
    await ensureBackupDir();
    
    const files = await fs.readdir(BACKUP_DIR);
    const backups = [];

    for (const file of files) {
      // 过滤掉临时目录（以 temp_ 开头的目录）
      if (file.startsWith('temp_') || file.startsWith('restore_temp_')) {
        continue;
      }
      
      const filepath = path.join(BACKUP_DIR, file);
      
      try {
        const stats = await fs.stat(filepath);
        
        // 判断是目录还是文件
        const isDirectory = stats.isDirectory();
        const size = isDirectory 
          ? await getDirectorySize(filepath)
          : stats.size;

        backups.push({
          filename: file,
          filepath: filepath,
          size: size,
          format: isDirectory ? 'directory' : (file.endsWith('.tar.gz') ? 'tar.gz' : 'unknown'),
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          age: Math.round((Date.now() - stats.mtime.getTime()) / (24 * 60 * 60 * 1000)) // 天数
        });
      } catch (error) {
        console.error(`获取备份信息失败: ${file}`, error);
      }
    }

    // 按创建时间倒序排列
    backups.sort((a, b) => b.createdAt - a.createdAt);

    return backups;
  } catch (error) {
    console.error('获取备份列表失败:', error);
    return [];
  }
}

/**
 * 恢复数据库
 * @param {String} filename - 备份文件名
 * @returns {Promise<Object>} 恢复结果 { success, message, error }
 */
async function restoreDatabase(filename) {
  try {
    await ensureBackupDir();
    
    const filepath = path.join(BACKUP_DIR, filename);
    
    // 检查文件是否存在
    try {
      await fs.access(filepath);
    } catch {
      return {
        success: false,
        error: '备份文件不存在'
      };
    }

    const stats = await fs.stat(filepath);
    const isDirectory = stats.isDirectory();
    
    // 获取MongoDB连接信息
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi_system';
    const dbName = mongoUri.split('/').pop().split('?')[0] || 'kpi_system';

    return new Promise((resolve, reject) => {
      if (isDirectory || filename.endsWith('.tar.gz')) {
        // 如果是压缩文件，先解压
        let restorePath = filepath;
        
        if (filename.endsWith('.tar.gz')) {
          const extractPath = path.join(BACKUP_DIR, `restore_temp_${Date.now()}`);
          const extractCommand = `tar -xzf "${filepath}" -C "${BACKUP_DIR}"`;
          
          exec(extractCommand, async (extractError) => {
            if (extractError) {
              reject({
                success: false,
                error: `解压备份文件失败: ${extractError.message}`
              });
              return;
            }

            // 查找解压后的目录
            try {
              const extractedDirs = await fs.readdir(BACKUP_DIR);
              // 查找最新的temp_或backup_开头的目录
              const tempDirs = extractedDirs.filter(dir => 
                dir.startsWith('temp_') || dir.startsWith('backup_')
              ).sort().reverse(); // 按名称倒序，取最新的
              
              if (tempDirs.length === 0) {
                reject({
                  success: false,
                  error: '无法找到解压后的备份目录'
                });
                return;
              }

              const restoreDir = tempDirs[0];
              const restoreDirPath = path.join(BACKUP_DIR, restoreDir);
              
              // 检查目录结构：mongodump会创建 restoreDir/dbName 结构
              const dirContents = await fs.readdir(restoreDirPath);
              if (dirContents.includes(dbName)) {
                restorePath = path.join(restoreDirPath, dbName);
              } else {
                // 如果没有直接找到dbName，尝试查找子目录
                for (const item of dirContents) {
                  const itemPath = path.join(restoreDirPath, item);
                  const itemStats = await fs.stat(itemPath);
                  if (itemStats.isDirectory()) {
                    const subContents = await fs.readdir(itemPath);
                    if (subContents.includes(dbName)) {
                      restorePath = path.join(itemPath, dbName);
                      break;
                    }
                  }
                }
                // 如果还是没找到，使用默认路径
                if (!restorePath || restorePath === filepath) {
                  restorePath = path.join(restoreDirPath, dbName);
                }
              }
            } catch (error) {
              reject({
                success: false,
                error: `查找解压目录失败: ${error.message}`
              });
              return;
            }

            // 执行恢复
            const restoreCommand = `mongorestore --uri="${mongoUri}" --drop "${restorePath}"`;
            
            exec(restoreCommand, async (restoreError, stdout, stderr) => {
              // 清理临时目录
              try {
                const tempDir = path.join(BACKUP_DIR, restoreDir.split('/').pop());
                await fs.rm(tempDir, { recursive: true, force: true });
              } catch (cleanupError) {
                console.warn('清理临时目录失败:', cleanupError.message);
              }

              if (restoreError) {
                let errorMessage = `恢复数据库失败: ${restoreError.message}`;
                if (restoreError.code === 1 && (restoreError.message.includes('不是内部或外部命令') || 
                    restoreError.message.includes('not found') || 
                    restoreError.message.includes('command not found'))) {
                  errorMessage = '未找到 mongorestore 命令。请安装 MongoDB Database Tools 并添加到系统 PATH。\n' +
                                'Windows: https://www.mongodb.com/try/download/database-tools\n' +
                                'Linux: sudo apt-get install mongodb-database-tools';
                }
                reject({
                  success: false,
                  error: errorMessage,
                  stderr: stderr,
                  code: restoreError.code
                });
                return;
              }

              resolve({
                success: true,
                message: '数据库恢复成功',
                filename: filename
              });
            });
          });
        } else {
          // 直接使用目录恢复
          restorePath = path.join(filepath, dbName);
          
          const restoreCommand = `mongorestore --uri="${mongoUri}" --drop "${restorePath}"`;
          
          exec(restoreCommand, (restoreError, stdout, stderr) => {
            if (restoreError) {
              let errorMessage = `恢复数据库失败: ${restoreError.message}`;
              if (restoreError.code === 1 && (restoreError.message.includes('不是内部或外部命令') || 
                  restoreError.message.includes('not found') || 
                  restoreError.message.includes('command not found'))) {
                errorMessage = '未找到 mongorestore 命令。请安装 MongoDB Database Tools 并添加到系统 PATH。\n' +
                              'Windows: https://www.mongodb.com/try/download/database-tools\n' +
                              'Linux: sudo apt-get install mongodb-database-tools';
              }
              reject({
                success: false,
                error: errorMessage,
                stderr: stderr,
                code: restoreError.code
              });
              return;
            }

            resolve({
              success: true,
              message: '数据库恢复成功',
              filename: filename
            });
          });
        }
      } else {
        reject({
          success: false,
          error: '不支持的备份文件格式'
        });
      }
    });
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 删除指定备份文件
 * @param {String} filename - 备份文件名
 * @returns {Promise<Object>} 删除结果
 */
async function deleteBackup(filename) {
  try {
    const filepath = path.join(BACKUP_DIR, filename);
    
    const stats = await fs.stat(filepath);
    if (stats.isDirectory()) {
      await fs.rm(filepath, { recursive: true, force: true });
    } else {
      await fs.unlink(filepath);
    }

    return {
      success: true,
      message: '备份文件删除成功',
      filename: filename
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

module.exports = {
  backupDatabase,
  deleteOldBackups,
  listBackups,
  restoreDatabase,
  deleteBackup,
  formatFileSize,
  BACKUP_DIR,
  RETENTION_DAYS
};

