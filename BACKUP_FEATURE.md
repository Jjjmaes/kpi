# 数据库备份与恢复功能说明

## 功能概述

系统实现了完整的数据库备份与恢复功能，包括：
- 每日自动备份（每天00:00执行）
- 自动清理超过5天的旧备份
- 手动创建备份
- 备份列表查看
- 数据库恢复
- 备份文件管理

## 技术实现

### 1. 备份服务 (`services/backupService.js`)

主要功能：
- `backupDatabase()`: 使用 `mongodump` 备份数据库，并压缩为 tar.gz 格式
- `deleteOldBackups()`: 删除超过保留期（5天）的备份文件
- `listBackups()`: 获取备份文件列表
- `restoreDatabase()`: 使用 `mongorestore` 恢复数据库
- `deleteBackup()`: 删除指定备份文件

### 2. 定时任务 (`services/cronService.js`)

- 每天00:00自动执行备份
- 自动清理超过5天的旧备份
- 使用 `node-cron` 调度任务

### 3. API 路由 (`routes/backup.js`)

所有接口需要管理员权限：
- `GET /api/backup/list` - 获取备份列表
- `POST /api/backup/create` - 手动创建备份
- `POST /api/backup/restore` - 恢复数据库
- `DELETE /api/backup/:filename` - 删除备份文件
- `POST /api/backup/cleanup` - 手动清理旧备份

### 4. 前端界面 (`public/index.html` + `public/app.js`)

- 数据备份管理页面（仅管理员可见）
- 备份列表展示
- 创建备份、恢复备份、删除备份功能
- 清理旧备份功能

## 使用说明

### 系统要求

1. **MongoDB 数据库工具**：
   - 需要安装 `mongodb-database-tools`
   - 包含 `mongodump` 和 `mongorestore` 命令
   
   **Ubuntu/Debian 安装**：
   ```bash
   wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
   echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
   sudo apt-get update
   sudo apt-get install -y mongodb-database-tools
   ```
   
   详细安装说明请参考：`INSTALL_MONGODB_TOOLS_UBUNTU.md`

   **CentOS/RHEL 安装**：
   ```bash
   sudo yum install -y mongodb-database-tools
   ```
   
   **Windows 安装**：
   详细安装说明请参考：`INSTALL_MONGODB_TOOLS_WINDOWS.md`

2. **系统命令**：
   - `tar` 命令（用于压缩/解压备份文件）
   - 通常 Linux 系统已预装

### 备份存储

- 备份文件保存在项目根目录的 `backups/` 文件夹
- 备份文件命名格式：`backup_YYYY-MM-DD_HH-mm-ss.tar.gz`
- 自动备份会在每天00:00执行

### 备份保留策略

- 自动保留最近5天的备份
- 超过5天的备份会在每日备份任务中自动删除
- 可以手动清理旧备份

### 恢复操作注意事项

⚠️ **重要警告**：
- 恢复操作会**覆盖当前数据库**，所有现有数据将被替换
- 恢复操作**不可逆**，请确保已做好当前数据的备份
- 恢复前建议先创建当前数据库的备份
- 恢复过程中系统可能暂时不可用

## 使用流程

### 1. 查看备份列表

1. 登录系统（管理员账户）
2. 点击导航栏的"数据备份"
3. 系统自动加载备份列表

### 2. 手动创建备份

1. 在数据备份页面点击"创建备份"按钮
2. 等待备份完成（可能需要几分钟）
3. 备份完成后会显示备份文件名和大小

### 3. 恢复数据库

1. 在备份列表中找到要恢复的备份文件
2. 点击"恢复"按钮
3. **确认两次警告提示**（防止误操作）
4. 等待恢复完成（可能需要几分钟）
5. 恢复成功后页面会自动刷新

### 4. 删除备份文件

1. 在备份列表中找到要删除的备份文件
2. 点击"删除"按钮
3. 确认删除操作

### 5. 清理旧备份

1. 点击"清理旧备份"按钮
2. 系统会自动删除超过5天的备份文件
3. 显示删除的备份文件数量

## 故障排查

### 备份失败

**问题**：创建备份时提示失败

**可能原因**：
1. 未安装 `mongodb-database-tools`
2. MongoDB 连接失败
3. 磁盘空间不足
4. 权限不足

**解决方法**：
1. 检查是否安装了 `mongodb-database-tools`：`which mongodump`
2. 检查 MongoDB 连接：确认 `.env` 文件中的 `MONGODB_URI` 正确
3. 检查磁盘空间：`df -h`
4. 检查备份目录权限：确保 `backups/` 目录可写

### 恢复失败

**问题**：恢复数据库时提示失败

**可能原因**：
1. 备份文件损坏
2. MongoDB 连接失败
3. 磁盘空间不足
4. 权限不足

**解决方法**：
1. 检查备份文件是否完整
2. 检查 MongoDB 连接
3. 检查磁盘空间
4. 检查 MongoDB 用户权限

### 定时任务未执行

**问题**：每天00:00没有自动备份

**可能原因**：
1. 服务器时间不正确
2. 时区设置错误
3. 服务器重启后未启动应用

**解决方法**：
1. 检查服务器时间：`date`
2. 检查时区设置：`timedatectl`
3. 确保应用在服务器重启后自动启动（使用 PM2 或 systemd）

## 安全建议

1. **定期检查备份**：确保备份文件正常生成
2. **异地备份**：建议将备份文件同步到其他服务器或云存储
3. **备份加密**：敏感数据建议对备份文件进行加密
4. **访问控制**：确保只有管理员可以访问备份功能
5. **日志监控**：监控备份任务的执行日志

## 环境变量

无需额外配置，使用现有的 `MONGODB_URI` 环境变量。

## 更新日期

2024-12-19


