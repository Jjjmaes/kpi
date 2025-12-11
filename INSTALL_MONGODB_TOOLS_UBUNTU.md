# Ubuntu 安装 MongoDB Database Tools 指南

## 问题说明

如果看到以下错误：
```
mongodump: command not found
```

说明系统未安装 MongoDB Database Tools。

## 安装步骤

### 方法一：使用 apt 安装（推荐）

**Ubuntu 20.04/22.04/24.04:**

```bash
# 导入 MongoDB 公钥
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -

# 添加 MongoDB 仓库（Ubuntu 20.04 Focal）
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# 或者 Ubuntu 22.04 Jammy
# echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# 更新包列表
sudo apt-get update

# 安装 MongoDB Database Tools
sudo apt-get install -y mongodb-database-tools
```

**或者安装特定版本（推荐 6.0 版本，更稳定）：**

```bash
# 导入 MongoDB 公钥
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# 添加 MongoDB 仓库
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# 更新并安装
sudo apt-get update
sudo apt-get install -y mongodb-database-tools
```

### 方法二：直接下载 deb 包

```bash
# 下载 deb 包（替换版本号和架构）
wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2004-x86_64-100.9.0.deb

# 安装
sudo dpkg -i mongodb-database-tools-ubuntu2004-x86_64-100.9.0.deb

# 如果依赖有问题，修复依赖
sudo apt-get install -f
```

### 方法三：使用 Snap（如果已安装 snap）

```bash
sudo snap install mongodb-database-tools
```

## 验证安装

安装完成后，验证工具是否可用：

```bash
mongodump --version
mongorestore --version
```

如果显示版本号，说明安装成功。

## 重启应用

如果应用正在运行（使用 PM2 或其他进程管理器）：

```bash
# PM2
pm2 restart kpi-system

# 或者 systemd
sudo systemctl restart kpi-system
```

## 常见问题

### 问题 1：apt-key 已弃用警告

如果看到 `apt-key is deprecated` 警告，使用新方法：

```bash
# Ubuntu 22.04+
sudo apt-get install -y gnupg
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt-get update
sudo apt-get install -y mongodb-database-tools
```

### 问题 2：权限不足

如果遇到权限问题：

```bash
# 确保备份目录有写权限
sudo chown -R $USER:$USER /path/to/project/backups
chmod 755 /path/to/project/backups
```

### 问题 3：MongoDB 连接失败

检查 MongoDB 服务状态：

```bash
# 检查 MongoDB 是否运行
sudo systemctl status mongod

# 如果没有运行，启动它
sudo systemctl start mongod

# 检查连接
mongo --eval "db.version()"
# 或使用 mongosh（MongoDB 6.0+）
mongosh --eval "db.version()"
```

### 问题 4：tar 命令不存在

Ubuntu 系统通常已预装 tar，如果没有：

```bash
sudo apt-get install -y tar
```

## 系统要求

- **操作系统**: Ubuntu 18.04, 20.04, 22.04, 24.04
- **架构**: amd64, arm64
- **MongoDB**: 版本 4.0 或更高

## 自动备份验证

安装完成后，可以手动测试备份：

```bash
# 进入项目目录
cd /path/to/project

# 手动执行备份（如果应用支持命令行）
# 或者通过 Web 界面创建备份
```

## 定时任务验证

检查 cron 任务是否正常：

```bash
# 查看应用日志
pm2 logs kpi-system

# 或查看系统日志
journalctl -u kpi-system -f
```

每天 00:00 应该能看到备份任务执行日志。

## 注意事项

1. **磁盘空间**: 确保有足够的磁盘空间存储备份文件
2. **备份目录权限**: 确保 Node.js 进程用户有写权限
3. **MongoDB 认证**: 如果 MongoDB 启用了认证，确保连接字符串包含用户名和密码
4. **防火墙**: 如果 MongoDB 在远程服务器，确保端口开放

## 故障排查

### 检查工具是否在 PATH 中

```bash
which mongodump
which mongorestore
```

如果返回路径，说明已正确安装。

### 测试备份命令

```bash
# 测试备份（替换为你的 MongoDB URI）
mongodump --uri="mongodb://localhost:27017/kpi_system" --out=/tmp/test_backup

# 如果成功，会创建备份目录
ls -la /tmp/test_backup
```

### 查看详细错误

如果备份失败，查看应用日志获取详细错误信息。

