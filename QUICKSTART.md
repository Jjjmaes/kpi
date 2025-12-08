# KPI系统 - 快速启动指南

## 第一步：安装依赖

```bash
npm install
```

## 第二步：启动MongoDB

确保MongoDB已安装并运行：

```bash
# Windows (如果MongoDB已安装为服务，会自动启动)
# 或手动启动
mongod

# Linux
sudo systemctl start mongod

# Mac
brew services start mongodb-community
```

## 第三步：创建环境变量文件

创建 `.env` 文件：

```env
MONGODB_URI=mongodb://localhost:27017/kpi_system
JWT_SECRET=your-secret-key-change-in-production
PORT=3000
NODE_ENV=development
```

### 🔐 如何配置 JWT_SECRET？

`JWT_SECRET` 用于签名和验证 JWT 令牌，**必须使用一个强随机字符串**。

#### 方法一：使用脚本自动生成（最简单）

运行项目提供的脚本：

```bash
node scripts/generateJWTSecret.js
```

脚本会生成密钥并询问是否自动添加到 `.env` 文件。

#### 方法二：使用 Node.js 命令生成

在项目根目录运行：

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

这会生成一个128字符的随机十六进制字符串，复制到 `.env` 文件中：

```env
JWT_SECRET=生成的随机字符串
```

#### 方法三：使用 OpenSSL（Linux/Mac）

```bash
openssl rand -hex 64
```

#### 方法四：使用 PowerShell（Windows）

```powershell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))
```

#### 方法五：在线生成工具

访问 https://randomkeygen.com/ 或类似工具生成随机字符串。

#### ⚠️ 安全提示

- **开发环境**：可以使用简单的字符串（如 `dev-secret-key-123`）
- **生产环境**：**必须**使用强随机字符串，长度至少32字符
- **不要**将 `.env` 文件提交到 Git 仓库
- **不要**在代码中硬编码密钥
- 如果密钥泄露，立即更换并重新生成所有令牌

#### 示例配置

**开发环境**：
```env
JWT_SECRET=dev-secret-key-for-testing-only-12345
```

**生产环境**：
```env
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2
```

## 第四步：初始化管理员账户

```bash
node scripts/initAdmin.js
```

默认管理员账户：
- 用户名: `admin`
- 密码: `admin123`

⚠️ **生产环境请务必修改密码！**

## 第五步：启动服务器

```bash
# 开发模式（推荐）
npm run dev

# 或生产模式
npm start
```

## 第六步：访问系统

打开浏览器访问：`http://localhost:3000`

使用管理员账户登录即可开始使用。

## 基本使用流程

1. **登录系统** - 使用管理员账户登录
2. **配置KPI系数** - 在"KPI配置"页面设置各岗位的系数
3. **创建项目** - 销售角色可以创建新项目
4. **添加成员** - 为项目添加翻译、审校、PM等成员
5. **标记项目状态** - PM可以标记返修、延期、客诉等
6. **完成项目** - 项目完成后标记为已完成
7. **生成KPI** - 系统自动或手动生成月度KPI
8. **导出工资表** - 财务可以导出Excel格式的工资表

## 常见问题

### MongoDB连接失败

检查MongoDB是否正在运行：
```bash
# Windows
net start MongoDB

# Linux
sudo systemctl status mongod
```

### 端口被占用

修改 `.env` 文件中的 `PORT` 值，或关闭占用3000端口的程序。

### 无法登录

确保已运行初始化脚本创建管理员账户：
```bash
node scripts/initAdmin.js
```

## 下一步

查看 `README_DEVELOPMENT.md` 了解详细的API文档和开发指南。

