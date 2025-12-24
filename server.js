require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const path = require('path'); // 【新增】引入 path 模块用于处理绝对路径

// 调试：输出关键配置信息（生产环境可以移除或改为仅错误时输出）
console.log('[Server] 启动配置检查:');
console.log('  - 工作目录:', process.cwd());
console.log('  - 脚本目录:', __dirname);
console.log('  - MongoDB URI:', process.env.MONGODB_URI ? '已配置' : '使用默认值');
console.log('  - JWT Secret:', process.env.JWT_SECRET ? '已配置' : '使用默认值（不安全）');
console.log('  - PORT:', process.env.PORT || 3000);

const app = express();
// 【新增】配置 Express 信任 Nginx 反向代理
// '1' 表示信任第一层代理（即你的 Nginx）
app.set('trust proxy', 1);

// 安全中间件
app.use(helmet({
    contentSecurityPolicy: false, // 允许内联脚本（前端使用）
    crossOriginEmbedderPolicy: false
}));

// 速率限制：API请求限制
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 1000, // 限制每个IP 15分钟内最多1000次请求
    message: { success: false, message: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
});

// 登录接口更严格的限制
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 20, // 限制每个IP 15分钟内最多20次登录尝试
    message: { success: false, message: '登录尝试过于频繁，请15分钟后再试' },
    skipSuccessfulRequests: true, // 成功请求不计入限制
});

// 应用速率限制到API路由
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);

// CORS配置：生产环境建议配置白名单
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : null; // null 表示未配置，允许所有来源

app.use(cors({
    origin: (origin, callback) => {
        // 允许无origin的请求（如移动应用、Postman、同源请求等）
        if (!origin) return callback(null, true);
        
        // 如果未配置白名单（ALLOWED_ORIGINS环境变量），允许所有来源
        if (!allowedOrigins) {
            return callback(null, true);
        }
        
        // 检查是否在白名单中
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        
        // 记录被拒绝的请求以便调试
        console.warn(`⚠️  CORS拒绝请求: ${origin}`);
        console.warn(`    允许的来源: ${allowedOrigins.join(', ')}`);
        console.warn(`    提示: 如果这是合法请求，请在 .env 文件中添加: ALLOWED_ORIGINS=${origin}`);
        
        callback(new Error(`不允许的来源: ${origin}。请在服务器 .env 文件中配置 ALLOWED_ORIGINS 环境变量，添加允许的域名/IP，例如: ALLOWED_ORIGINS=http://${origin.replace(/^https?:\/\//, '')},https://${origin.replace(/^https?:\/\//, '')}`));
    },
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' })); // 限制请求体大小
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
// 【修改】使用绝对路径，防止 CWD 变化导致找不到文件
app.use(express.static(path.join(__dirname, 'public'))); 

// 路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const projectRoutes = require('./routes/projects');
const kpiRoutes = require('./routes/kpi');
const configRoutes = require('./routes/config');
const financeRoutes = require('./routes/finance');
const languagePairRoutes = require('./routes/languagePairs');
const languageRoutes = require('./routes/languages');
const customerRoutes = require('./routes/customers');
const auditRoutes = require('./routes/audit');
const notificationRoutes = require('./routes/notifications');
const backupRoutes = require('./routes/backup');
const invoiceRequestRoutes = require('./routes/invoiceRequests');
const roleRoutes = require('./routes/roles');
const evaluationRoutes = require('./routes/evaluations');
const expressRoutes = require('./routes/express');
const officeSupplyRoutes = require('./routes/officeSupply');
const sealRoutes = require('./routes/seal');
const expenseRoutes = require('./routes/expense');

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/kpi', kpiRoutes);
app.use('/api/config', configRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/language-pairs', languagePairRoutes);
app.use('/api/languages', languageRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/invoice-requests', invoiceRequestRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/express', expressRoutes);
app.use('/api/officeSupply', officeSupplyRoutes);
app.use('/api/seal', sealRoutes);
app.use('/api/expense', expenseRoutes);

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'KPI System is running' });
});

// 获取服务器信息（用于前端自动配置API地址）
app.get('/api/server-info', (req, res) => {
    const os = require('os');
    const protocol = req.protocol;
    const host = req.get('host');
    
    // 获取本机IP地址
    function getLocalIP() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return 'localhost';
    }
    
    const localIP = getLocalIP();
    const port = process.env.PORT || 3000;
    
    res.json({
        success: true,
        data: {
            protocol,
            host,
            localIP,
            port,
            accessUrls: {
                local: `${protocol}://localhost:${port}`,
                network: `${protocol}://${localIP}:${port}`,
                current: `${protocol}://${host}`,
                domain: process.env.DOMAIN ? `${protocol}://${process.env.DOMAIN}` : null
            }
        }
    });
});

// 【修改开始】

// 1. 引入错误处理中间件

const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// 2. SPA 后备路由：仅捕获非 /api/ 开头的 GET 请求，且不是静态文件请求

// 我们不使用 app.get('*') 来避免捕获未匹配到的 API 路由

// 而是让 notFoundHandler 来处理 API 404

// 注意：express.static 已经处理了静态文件，如果文件存在会直接返回，不会继续执行
// 只有当静态文件不存在时，才会继续执行到这里，此时返回 index.html 用于 SPA 路由

app.use((req, res, next) => {
    // 只处理非 /api/ 开头的 GET 请求
    // 排除静态文件扩展名（这些应该由 express.static 处理）
    if (!req.url.startsWith('/api/') && req.method === 'GET') {
        // 检查是否是静态文件请求（如果静态文件不存在，express.static 不会响应，继续到这里）
        // 此时返回 index.html，让前端路由处理
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    next();
});

// 3. 404 处理

// 放在 app.use(notFoundHandler) 这里的 notFoundHandler

// 将只捕获：

//   a) 未被 /api/ 路由明确匹配的 API 请求 (例如 POST /api/auth/xxx)

//   b) 未被上面的 app.use 捕获的其他非 GET 请求

app.use(notFoundHandler); 

// 4. 统一错误处理中间件（必须在最后）

app.use(errorHandler);


// 连接MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi_system', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(async () => {
    console.log('✅ MongoDB connected');
    
    // 初始化权限配置（从数据库加载）
    const { initPermissions } = require('./config/permissions');
    initPermissions(mongoose);
    
    // 确保备份目录存在
    const fs = require('fs').promises;
    const path = require('path');
    const backupDir = path.join(__dirname, 'backups');
    try {
        await fs.mkdir(backupDir, { recursive: true });
        console.log('✅ Backup directory ready:', backupDir);
    } catch (error) {
        console.error('⚠️ Failed to create backup directory:', error.message);
    }

    // 启动Cron任务
    const { scheduleMonthlyKPICalculation, scheduleDailyBackup } = require('./services/cronService');
    scheduleMonthlyKPICalculation();
    scheduleDailyBackup();
    console.log('✅ Cron tasks scheduled');
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // 监听所有网络接口，允许局域网和域名访问

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`📡 Accessible from:`);
    console.log(`    - Local: http://localhost:${PORT}`);
    console.log(`    - Network: http://${getLocalIP()}:${PORT}`);
    if (process.env.DOMAIN) {
        console.log(`    - Domain: ${process.env.DOMAIN}`);
    }
});

// 获取本机IP地址（用于显示局域网访问地址）
function getLocalIP() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // 跳过内部（即127.0.0.1）和非IPv4地址
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}