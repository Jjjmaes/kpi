# Ubuntu 上 "不允许的来源" 错误解决方案

## 问题描述

在 Ubuntu 服务器上创建备份时，提示错误：
```
备份创建失败: 不允许的来源
```

## 原因分析

这个错误是由 CORS（跨域资源共享）配置引起的。当设置了 `ALLOWED_ORIGINS` 环境变量时，只有白名单中的域名/IP才能访问 API。

## 解决方案

### 方案一：不设置 ALLOWED_ORIGINS（推荐用于开发/内网环境）

**如果 `.env` 文件中没有 `ALLOWED_ORIGINS` 配置，系统会自动允许所有来源。**

检查 `.env` 文件：
```bash
cat .env | grep ALLOWED_ORIGINS
```

如果没有输出，说明未配置，系统应该允许所有来源。如果仍然报错，请检查：
1. `.env` 文件是否在项目根目录
2. 服务器是否重启以加载新的环境变量

### 方案二：配置 ALLOWED_ORIGINS（推荐用于生产环境）

在 `.env` 文件中添加或修改 `ALLOWED_ORIGINS`：

```bash
# 编辑 .env 文件
nano .env

# 添加或修改以下行（根据你的实际访问方式）
# 方式1: 通过 IP 访问
ALLOWED_ORIGINS=http://192.168.1.100:3000,http://192.168.1.100

# 方式2: 通过域名访问
ALLOWED_ORIGINS=http://yourdomain.com,https://yourdomain.com

# 方式3: 同时支持 IP 和域名
ALLOWED_ORIGINS=http://192.168.1.100:3000,http://yourdomain.com,https://yourdomain.com

# 方式4: 支持多个域名/IP（用逗号分隔，不要有空格）
ALLOWED_ORIGINS=http://192.168.1.100:3000,http://10.0.0.5:3000,http://yourdomain.com
```

**重要提示：**
- 多个来源用**逗号分隔**，不要有空格
- 必须包含**完整的协议和端口**（如 `http://192.168.1.100:3000`）
- 如果使用 HTTPS，需要添加 `https://` 开头的地址

### 方案三：临时测试（不推荐用于生产）

如果需要快速测试，可以临时注释掉 `.env` 中的 `ALLOWED_ORIGINS` 行：

```bash
# 编辑 .env
nano .env

# 在 ALLOWED_ORIGINS 行前加 # 注释
# ALLOWED_ORIGINS=http://example.com
```

## 应用配置更改

修改 `.env` 文件后，需要重启应用：

```bash
# 如果使用 PM2
pm2 restart kpi-system

# 如果使用 systemd
sudo systemctl restart kpi-system

# 如果直接运行
# 停止当前进程（Ctrl+C），然后重新启动
npm start
# 或
node server.js
```

## 验证配置

### 1. 检查环境变量是否加载

在服务器上运行：
```bash
node -e "require('dotenv').config(); console.log('ALLOWED_ORIGINS:', process.env.ALLOWED_ORIGINS || '未设置（允许所有来源）')"
```

### 2. 检查应用日志

查看应用启动日志，确认 CORS 配置：
```bash
# PM2 日志
pm2 logs kpi-system

# 或查看应用输出
# 应该能看到 CORS 相关的配置信息
```

### 3. 测试 API 访问

在浏览器控制台或使用 curl 测试：
```bash
# 测试备份列表接口（需要先登录获取 token）
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Origin: http://YOUR_IP:3000" \
     http://YOUR_IP:3000/api/backup/list
```

## 常见问题

### Q1: 为什么本地开发没问题，Ubuntu 服务器上就有问题？

**A:** 本地开发时可能没有设置 `ALLOWED_ORIGINS`，所以允许所有来源。服务器上可能配置了 `ALLOWED_ORIGINS`，但没有包含你当前访问的 IP/域名。

### Q2: 如何知道当前访问的 origin？

**A:** 在浏览器控制台运行：
```javascript
console.log('当前 Origin:', window.location.origin);
```

或者在服务器日志中查看被拒绝的请求，会显示完整的 origin。

### Q3: 可以允许所有来源吗？

**A:** 可以，但不推荐用于生产环境。只需不设置 `ALLOWED_ORIGINS` 环境变量即可。

### Q4: 配置后仍然报错？

**A:** 检查以下几点：
1. `.env` 文件是否在项目根目录（与 `server.js` 同级）
2. 环境变量格式是否正确（逗号分隔，无空格）
3. 是否重启了应用
4. 浏览器是否缓存了旧的错误信息（尝试清除缓存或使用无痕模式）

## 安全建议

1. **开发/内网环境**：可以不设置 `ALLOWED_ORIGINS`，允许所有来源
2. **生产环境**：建议设置 `ALLOWED_ORIGINS`，只允许信任的域名/IP
3. **HTTPS**：生产环境建议使用 HTTPS，并在 `ALLOWED_ORIGINS` 中配置 `https://` 地址

## 示例配置

### 开发环境（.env）
```env
# 不设置 ALLOWED_ORIGINS，允许所有来源
MONGODB_URI=mongodb://localhost:27017/kpi_system
PORT=3000
```

### 生产环境（.env）
```env
# 只允许特定域名访问
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
MONGODB_URI=mongodb://localhost:27017/kpi_system
PORT=3000
```

### 内网环境（.env）
```env
# 允许内网 IP 访问
ALLOWED_ORIGINS=http://192.168.1.100:3000,http://10.0.0.5:3000
MONGODB_URI=mongodb://localhost:27017/kpi_system
PORT=3000
```

