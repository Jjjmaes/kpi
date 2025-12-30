const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticate, authorize } = require('../middleware/auth');
const {
  backupDatabase,
  deleteOldBackups,
  listBackups,
  restoreDatabase,
  deleteBackup,
  formatFileSize,
  BACKUP_DIR
} = require('../services/backupService');

// 所有备份管理接口都需要管理员权限
router.use(authenticate);
router.use(authorize('admin'));

// 配置 multer 用于文件上传
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
      cb(null, BACKUP_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // 保留原始文件名，但添加时间戳避免冲突
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `uploaded_${timestamp}_${name}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 限制 500MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许 .tar.gz 或目录格式的备份文件
    const allowedExtensions = ['.tar.gz', '.gz'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.some(allowed => file.originalname.toLowerCase().endsWith(allowed))) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .tar.gz 格式的备份文件'));
    }
  }
});

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
 * 下载备份文件
 * GET /api/backup/download/:filename
 */
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    // 防止路径遍历攻击
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: '无效的文件名'
      });
    }

    const filepath = path.join(BACKUP_DIR, filename);

    try {
      const stats = await fs.stat(filepath);
      if (!stats.isFile()) {
        return res.status(404).json({
          success: false,
          message: '备份文件不存在'
        });
      }
    } catch {
      return res.status(404).json({
        success: false,
        message: '备份文件不存在'
      });
    }

    // 设置下载响应头
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('下载备份文件失败:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: '下载备份文件失败'
          });
        }
      }
    });
  } catch (error) {
    console.error('下载备份文件异常:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || '下载备份文件失败'
      });
    }
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

/**
 * 上传备份文件
 * POST /api/backup/upload
 * FormData: { file: File }
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请选择要上传的备份文件'
      });
    }

    const uploadedFilename = req.file.filename;
    const uploadedPath = req.file.path;
    const uploadedSize = req.file.size;

    res.json({
      success: true,
      message: '备份文件上传成功',
      data: {
        filename: uploadedFilename,
        originalName: req.file.originalname,
        size: uploadedSize,
        sizeFormatted: formatFileSize(uploadedSize),
        path: uploadedPath
      }
    });
  } catch (error) {
    // 如果上传失败，清理已上传的文件
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('清理上传文件失败:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || '文件上传失败'
    });
  }
});

/**
 * 从上传的文件恢复数据库
 * POST /api/backup/restore-uploaded
 * Body: { filename: "uploaded_1234567890_backup.tar.gz" }
 */
router.post('/restore-uploaded', async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        message: '请提供备份文件名'
      });
    }

    // 防止路径遍历攻击
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: '无效的文件名'
      });
    }

    // 检查文件是否存在
    const filepath = path.join(BACKUP_DIR, filename);
    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({
        success: false,
        message: '备份文件不存在'
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

module.exports = router;


