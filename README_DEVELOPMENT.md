# KPI绩效管理系统 - 开发文档

## 项目简介

这是一个为翻译公司设计的自动化KPI绩效管理系统，支持多角色、多项目、自动计算和Excel导出功能。

## 技术栈

- **后端**: Node.js + Express
- **数据库**: MongoDB + Mongoose
- **认证**: JWT
- **定时任务**: node-cron
- **Excel导出**: ExcelJS
- **前端**: 原生HTML/CSS/JavaScript

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件（参考 `.env.example`）：

```env
MONGODB_URI=mongodb://localhost:27017/kpi_system
JWT_SECRET=your-secret-key-change-in-production
PORT=3000
NODE_ENV=development
```

### 3. 启动MongoDB

确保MongoDB服务正在运行：

```bash
# Windows
mongod

# Linux/Mac
sudo systemctl start mongod
# 或
brew services start mongodb-community
```

### 4. 启动服务器

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

### 5. 访问系统

打开浏览器访问：`http://localhost:3000`

## 初始化数据

系统首次运行时，需要创建管理员用户和默认KPI配置。

### 创建管理员用户

可以使用MongoDB客户端或编写初始化脚本：

```javascript
// scripts/initAdmin.js
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function initAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const admin = await User.create({
    username: 'admin',
    password: 'admin123', // 生产环境请修改
    name: '系统管理员',
    email: 'admin@example.com',
    roles: ['admin']
  });
  
  console.log('管理员创建成功:', admin);
  process.exit(0);
}

initAdmin();
```

运行：
```bash
node scripts/initAdmin.js
```

### 默认KPI配置

系统会在首次访问配置接口时自动创建默认配置。

## API接口文档

### 认证接口

#### 登录
```
POST /api/auth/login
Body: { username, password }
Response: { success, token, user }
```

#### 获取当前用户
```
GET /api/auth/me
Headers: Authorization: Bearer <token>
```

### 项目管理接口

#### 创建项目
```
POST /api/projects/create
Headers: Authorization: Bearer <token>
Body: {
  projectName,
  clientName,
  projectAmount,
  deadline
}
```

#### 获取项目列表
```
GET /api/projects
Headers: Authorization: Bearer <token>
```

#### 添加项目成员
```
POST /api/projects/:id/add-member
Body: {
  userId,
  role, // translator, reviewer, pm, sales, admin_staff
  translatorType, // mtpe, deepedit (仅翻译角色)
  wordRatio // 字数占比 (仅翻译角色，默认1.0)
}
```

#### 标记项目完成
```
POST /api/projects/:id/finish
```

### KPI接口

#### 生成月度KPI
```
POST /api/kpi/generate-monthly
Body: { month: "YYYY-MM" }
```

#### 获取用户KPI
```
GET /api/kpi/user/:userId?month=YYYY-MM
```

#### 获取月度KPI汇总
```
GET /api/kpi/month/:month
```

#### 导出Excel
```
GET /api/kpi/export/month/:month
GET /api/kpi/export/user/:userId?month=YYYY-MM
```

### 配置接口（仅管理员）

#### 获取配置
```
GET /api/config
```

#### 更新配置
```
POST /api/config/update
Body: {
  translator_ratio_mtpe,
  translator_ratio_deepedit,
  reviewer_ratio,
  pm_ratio,
  sales_bonus_ratio,
  sales_commission_ratio,
  admin_ratio,
  completion_factor,
  reason
}
```

## 核心功能说明

### 1. 比例锁定机制

项目创建时，系统会自动从当前KPI配置中复制所有系数到项目的 `locked_ratios` 字段。后续即使配置变更，历史项目仍使用创建时的锁定比例。

### 2. KPI计算规则

- **翻译（MTPE）**: `项目金额 × 翻译系数 × 字数占比 × 完成系数`
- **翻译（深度编辑）**: `项目金额 × 深度编辑系数 × 字数占比 × 完成系数`
- **审校**: `项目金额 × 审校系数 × 完成系数`
- **PM**: `项目金额 × PM系数 × 完成系数`
- **销售（金额奖励）**: `成交金额 × 销售金额奖励系数`
- **销售（回款奖励）**: `回款金额 × 回款系数 × 完成系数`
- **综合岗**: `全公司项目金额合计 × 综合岗系数 × 完成系数`

### 3. 完成系数计算

完成系数受以下因素影响：
- 返修次数：每次返修减少5%
- 延期：减少10%
- 客户投诉：减少20%

### 4. 定时任务

系统每月1日00:00自动计算上个月的KPI记录。

## 角色权限

| 角色 | 权限 |
|------|------|
| Admin | 全局配置、用户管理、查看全部KPI |
| Finance | 查看全公司KPI、导出工资表 |
| Sales | 创建项目、查看自己KPI |
| PM | 标记返修、延期、客诉、产能记录 |
| Translator | 查看属于自己的KPI |
| Reviewer | 查看属于自己的KPI |

## 目录结构

```
kpi-system/
├── models/          # 数据模型
│   ├── User.js
│   ├── Project.js
│   ├── ProjectMember.js
│   ├── KpiConfig.js
│   └── KpiRecord.js
├── routes/          # 路由
│   ├── auth.js
│   ├── users.js
│   ├── projects.js
│   ├── kpi.js
│   └── config.js
├── services/        # 业务逻辑
│   ├── kpiService.js
│   ├── cronService.js
│   └── excelService.js
├── middleware/      # 中间件
│   └── auth.js
├── utils/          # 工具函数
│   └── kpiCalculator.js
├── public/         # 前端文件
│   ├── index.html
│   └── app.js
├── server.js       # 服务器入口
└── package.json
```

## 测试

### 测试用例

1. **比例锁定测试**: 创建项目后修改配置，验证历史项目KPI不变
2. **一人多岗测试**: 同一用户在不同项目中担任不同角色
3. **完成系数测试**: 验证返修、延期、客诉对KPI的影响
4. **权限测试**: 验证各角色的权限控制

## 部署

### 生产环境建议

1. 使用环境变量管理敏感信息
2. 启用HTTPS
3. 配置MongoDB副本集
4. 使用PM2管理进程
5. 配置日志系统
6. 定期备份数据库

### PM2部署示例

```bash
npm install -g pm2
pm2 start server.js --name kpi-system
pm2 save
pm2 startup
```

## 常见问题

### Q: 如何重置管理员密码？

A: 使用MongoDB客户端直接更新用户密码（已加密），或创建新管理员用户。

### Q: Cron任务没有执行？

A: 检查服务器时区设置，确保Cron任务配置正确。

### Q: Excel导出失败？

A: 检查文件权限和磁盘空间。

## 后续扩展

- [ ] AI翻译平台集成
- [ ] 自动质量评分
- [ ] 移动端支持
- [ ] 数据可视化图表
- [ ] 邮件通知功能
- [ ] 多语言支持

## 许可证

ISC

## 联系方式

如有问题或建议，请联系开发团队。

















