# 后台错误日志查看指南

## 一、PM2 日志（Node.js 应用日志）

### 1. 使用 PM2 命令查看（推荐）

```bash
# 查看所有日志（实时监控，按 Ctrl+C 退出）
pm2 logs kpi

# 查看最近 100 行日志
pm2 logs kpi --lines 100

# 只查看错误日志
pm2 logs kpi --err --lines 50

# 只查看输出日志（成功信息）
pm2 logs kpi --out --lines 50

# 清空日志
pm2 flush kpi
```

### 2. 直接查看日志文件

日志文件位置（根据 `ecosystem.config.js` 配置）：
- **错误日志**：`/var/www/kpi/logs/pm2-error.log`
- **输出日志**：`/var/www/kpi/logs/pm2-out.log`

```bash
# 进入项目目录
cd /var/www/kpi

# 查看错误日志最后 50 行
tail -50 logs/pm2-error.log

# 查看输出日志最后 50 行
tail -50 logs/pm2-out.log

# 实时监控错误日志（按 Ctrl+C 退出）
tail -f logs/pm2-error.log

# 实时监控输出日志
tail -f logs/pm2-out.log

# 搜索特定错误
grep -i "error" logs/pm2-error.log | tail -20
grep -i "413" logs/pm2-error.log | tail -20
grep -i "createProject" logs/pm2-error.log | tail -20

# 查看今天的错误
grep "$(date +%Y-%m-%d)" logs/pm2-error.log

# 查看最近 1 小时内的错误
grep "$(date -d '1 hour ago' +%Y-%m-%d)" logs/pm2-error.log
```

### 3. 日志中的关键信息

#### ✅ **正常启动**
```
✅ MongoDB connected
✅ Backup directory ready: /var/www/kpi/backups
✅ Cron tasks scheduled
🚀 Server running on http://0.0.0.0:3000
```

#### ❌ **错误信息**
```
[Error Handler] {
  message: '错误信息',
  stack: '错误堆栈',
  url: '/api/projects/create',
  method: 'POST',
  userId: '...',
  timestamp: '2025-01-16T...'
}
```

#### ⚠️ **413 错误（请求体过大）**
```
[createProject] 413 错误 - 请求体大小: X.XX MB
```

---

## 二、Nginx 错误日志

### 1. 查看 Nginx 错误日志

```bash
# Nginx 错误日志通常在这些位置：
# - /var/log/nginx/error.log
# - /etc/nginx/logs/error.log

# 查看最后 50 行
sudo tail -50 /var/log/nginx/error.log

# 实时监控（按 Ctrl+C 退出）
sudo tail -f /var/log/nginx/error.log

# 搜索 413 错误
sudo grep "413" /var/log/nginx/error.log | tail -20

# 查看今天的错误
sudo grep "$(date +%Y-%m-%d)" /var/log/nginx/error.log
```

### 2. Nginx 访问日志

```bash
# 查看访问日志
sudo tail -50 /var/log/nginx/access.log

# 实时监控
sudo tail -f /var/log/nginx/access.log

# 搜索 413 状态码
sudo grep " 413 " /var/log/nginx/access.log | tail -20
```

### 3. 常见的 Nginx 错误

#### ❌ **413 Request Entity Too Large**
```
client intended to send too large body: XXXX bytes
```

**解决方法**：在 Nginx 配置中添加 `client_max_body_size 50m;`

---

## 三、快速诊断 413 错误

### 步骤 1：查看浏览器控制台

1. 打开浏览器开发者工具（F12）
2. 切换到 Console 标签
3. 查看是否有 `[createProject] 请求体大小: X.XX MB` 的输出

### 步骤 2：查看 PM2 错误日志

```bash
# 实时监控错误日志
pm2 logs kpi --err

# 或查看日志文件
tail -f /var/www/kpi/logs/pm2-error.log
```

### 步骤 3：查看 Nginx 错误日志

```bash
# 实时监控 Nginx 错误
sudo tail -f /var/log/nginx/error.log
```

### 步骤 4：检查 Nginx 配置

```bash
# 检查 client_max_body_size 配置
sudo grep -r "client_max_body_size" /etc/nginx/

# 如果找不到或值太小，需要修改配置
```

---

## 四、常用日志查看命令组合

### 查看最近的错误（所有日志源）

```bash
# PM2 错误日志
echo "=== PM2 错误日志 ===" && tail -20 /var/www/kpi/logs/pm2-error.log

# Nginx 错误日志
echo "=== Nginx 错误日志 ===" && sudo tail -20 /var/log/nginx/error.log

# Nginx 访问日志中的 413 错误
echo "=== Nginx 413 错误 ===" && sudo grep " 413 " /var/log/nginx/access.log | tail -10
```

### 搜索特定错误

```bash
# 搜索项目创建相关的错误
grep -i "createProject\|projects/create" /var/www/kpi/logs/pm2-error.log | tail -20

# 搜索附件相关的错误
grep -i "attachment\|附件" /var/www/kpi/logs/pm2-error.log | tail -20

# 搜索 413 错误
grep -i "413\|Request Entity Too Large" /var/www/kpi/logs/pm2-error.log | tail -20
```

---

## 五、日志文件位置总结

| 日志类型 | 文件路径 | 查看命令 |
|---------|---------|---------|
| PM2 错误日志 | `/var/www/kpi/logs/pm2-error.log` | `tail -f /var/www/kpi/logs/pm2-error.log` |
| PM2 输出日志 | `/var/www/kpi/logs/pm2-out.log` | `tail -f /var/www/kpi/logs/pm2-out.log` |
| Nginx 错误日志 | `/var/log/nginx/error.log` | `sudo tail -f /var/log/nginx/error.log` |
| Nginx 访问日志 | `/var/log/nginx/access.log` | `sudo tail -f /var/log/nginx/access.log` |

---

## 六、日志清理

### 清理 PM2 日志

```bash
# 清空 PM2 日志
pm2 flush kpi

# 或手动删除日志文件（会重新创建）
rm /var/www/kpi/logs/pm2-error.log
rm /var/www/kpi/logs/pm2-out.log
```

### 清理 Nginx 日志（需要 root 权限）

```bash
# 清空 Nginx 错误日志（保留文件）
sudo truncate -s 0 /var/log/nginx/error.log

# 清空 Nginx 访问日志
sudo truncate -s 0 /var/log/nginx/access.log
```

---

## 七、调试 413 错误的完整流程

1. **浏览器控制台**：查看 `[createProject] 请求体大小`
2. **PM2 日志**：`pm2 logs kpi --err` 查看应用层错误
3. **Nginx 错误日志**：`sudo tail -f /var/log/nginx/error.log` 查看代理层错误
4. **Nginx 访问日志**：`sudo grep " 413 " /var/log/nginx/access.log` 查看 413 请求记录
5. **检查配置**：`sudo grep "client_max_body_size" /etc/nginx/` 检查 Nginx 配置

---

**最后更新**：2025-01-16


