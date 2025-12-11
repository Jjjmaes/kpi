const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  backupDatabase,
  deleteOldBackups,
  listBackups,
  restoreDatabase,
  deleteBackup,
  formatFileSize
} = require('../services/backupService');

// 所有备份管理接口都需要管理员权限
router.use(authenticate);
router.use(authorize('admin'));

/**
 * 获取备份列表
 * GET /api/backup/list
 */
router.get('/list', async (req, res) => {
  try {
    const backups = await listBackups();
    
    // 格式化备份信息
    const formattedBackups = backups.map(backup => ({
      filename: backup.filename,
      size: backup.size,
      sizeFormatted: formatFileSize(backup.size),
      format: backup.format,
      createdAt: backup.createdAt,
      modifiedAt: backup.modifiedAt,
      age: backup.age // 天数
    }));

    res.json({
      success: true,
      data: formattedBackups,
      count: formattedBackups.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 手动创建备份
 * POST /api/backup/create
 */
router.post('/create', async (req, res) => {
  try {
    const result = await backupDatabase();
    
    if (result.success) {
      res.json({
        success: true,
        message: '备份创建成功',
        data: {
          filename: result.filename,
          size: result.size,
          sizeFormatted: formatFileSize(result.size),
          format: result.format,
          createdAt: result.createdAt
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || '备份创建失败',
        error: result.stderr
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 恢复数据库
 * POST /api/backup/restore
 * Body: { filename: "backup_2024-12-19_00-00-00.tar.gz" }
 */
router.post('/restore', async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        message: '请提供备份文件名'
      });
    }

    // 警告：恢复操作会覆盖当前数据库
    const result = await restoreDatabase(filename);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message || '数据库恢复成功',
        data: {
          filename: result.filename
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || '数据库恢复失败',
        error: result.stderr
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 删除指定备份
 * DELETE /api/backup/:filename
 */
router.delete('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // 防止路径遍历攻击
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: '无效的文件名'
      });
    }

    const result = await deleteBackup(filename);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message || '备份删除成功',
        data: {
          filename: result.filename
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || '备份删除失败'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 清理旧备份（手动触发）
 * POST /api/backup/cleanup
 */
router.post('/cleanup', async (req, res) => {
  try {
    const result = await deleteOldBackups();
    
    res.json({
      success: true,
      message: `清理完成，删除了 ${result.deleted} 个旧备份`,
      data: {
        deleted: result.deleted,
        files: result.files,
        errors: result.errors
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;


