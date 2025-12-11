# KPI 系统安装、配置与初始化指南

适用于 Ubuntu 20.04/22.04/24.04 服务器，包含从环境准备到初始化数据的全流程。

## 1. 系统要求
- OS：Ubuntu 20.04/22.04/24.04（其他 Linux 发行版可参考）
- Node.js：≥ 18（建议 LTS）
- MongoDB：≥ 4.4（本地或远程均可）
- Git：用于拉取代码
- MongoDB Database Tools：包含 `mongodump`/`mongorestore`（备份/恢复必需）
- 可选：PM2（进程守护），Nginx（反向代理/HTTPS）

## 2. 安装基础环境（Ubuntu）
```bash
# 更新系统
sudo apt-get update && sudo apt-get upgrade -y

# 安装 Node.js（示例：Node 18 LTS）
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

# 安装 Git
sudo apt-get install -y git

# 安装 MongoDB（如需本地部署）
sudo apt-get install -y mongodb
sudo systemctl enable --now mongodb

# 安装 MongoDB Database Tools（备份/恢复需要）
sudo apt-get install -y mongodb-database-tools
# 如果需要更详细的安装方式，参见：INSTALL_MONGODB_TOOLS_UBUNTU.md
```

## 3. 获取代码与依赖
```bash
git clone <your_repo_url> kpi
cd kpi
npm install
```

## 4. 配置环境变量（.env）
在项目根目录创建 `.env`，示例：
```env
# 服务端口
PORT=3000

# MongoDB 连接串（本地示例）
MONGODB_URI=mongodb://localhost:27017/kpi_system

# JWT 密钥（可用 scripts/generateJWTSecret.js 生成）
JWT_SECRET=your-strong-secret

# CORS 白名单（逗号分隔，需包含完整协议/域名/端口）
# 示例：允许本地、主域名、二级域名
ALLOWED_ORIGINS=http://localhost:3000,https://fanyiworld.com,https://kpi.fanyiworld.com
```
> 提示：生产环境请使用强随机的 `JWT_SECRET`，可运行 `node scripts/generateJWTSecret.js` 获取。

## 5. 初始化数据库数据
确保 MongoDB 已运行，执行以下脚本（会使用 .env 的 MONGODB_URI）：

```bash
# 1) 初始化管理员
node scripts/initAdmin.js
# 默认账号 admin / admin123，创建后请立即在前端修改密码

# 2) 初始化常用语种
node scripts/initLanguages.js
```

## 6. 启动与部署
本地/开发：
```bash
npm run dev   # nodemon 热重载
# 或
npm start     # 直接启动
```

生产（示例：使用 PM2）：
```bash
pm2 start server.js --name kpi-system
pm2 save
pm2 startup   # 持久化
```
服务器默认监听 `0.0.0.0:3000`。如用 Nginx 做反向代理/HTTPS，只需将流量转发到该端口。

## 7. 备份与恢复
- 系统内置定时任务：每天 00:00 自动备份，保留 5 天，目录 `backups/` 自动创建。
- 前端管理后台（仅管理员）可手动备份/恢复/删除。
- 若看到 `mongodump: command not found`，请安装 MongoDB Database Tools 并确保在 PATH 中。
- 更详细说明见：`BACKUP_FEATURE.md`

## 8. CORS 与域名访问
- 未设置 `ALLOWED_ORIGINS`：允许所有来源（仅建议开发/内网）。
- 已设置 `ALLOWED_ORIGINS`：必须将实际访问的域名/IP（含协议和端口）加入白名单，例如：
  - `https://kpi.fanyiworld.com`
  - 如需 HTTP 访问（不推荐生产），额外添加 `http://kpi.fanyiworld.com`
- 修改 `.env` 后重启服务使配置生效。

## 9. 健康检查与验证
- 健康检查接口：`GET /health`
- 登录测试：使用初始化管理员账号登录前端页面
- API 基础地址：前端默认使用当前页面的 `window.location.origin/api`，也可通过 `?api=` 参数指定

## 10. 常见问题速查
- **CORS 报“不允许的来源”**：在 `.env` 的 `ALLOWED_ORIGINS` 中加入当前访问的完整 Origin，重启服务。
- **备份失败 `mongodump` 不存在**：安装 `mongodb-database-tools`，或参考 `INSTALL_MONGODB_TOOLS_UBUNTU.md` / `INSTALL_MONGODB_TOOLS_WINDOWS.md`。
- **端口访问不到**：检查防火墙/安全组是否放行 3000（或你的自定义端口）。
- **管理员默认密码风险**：初始化后立即在前端修改密码；密码需包含大小写、数字、特殊字符，长度 ≥ 8。

## 11. 推荐的生产加固
- 使用 HTTPS（Nginx 反代）
- 配置 `ALLOWED_ORIGINS` 限制来源
- 为 MongoDB 设置认证，连接串中加入用户名/密码
- 定期查看备份目录空间，必要时调整保留天数（默认 5 天）


