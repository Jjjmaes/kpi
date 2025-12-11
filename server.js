require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const app = express();

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
  : true; // 开发环境允许所有来源，生产环境建议配置

app.use(cors({
  origin: (origin, callback) => {
    // 允许无origin的请求（如移动应用、Postman等）
    if (!origin) return callback(null, true);
    
    if (allowedOrigins === true || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('不允许的来源'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' })); // 限制请求体大小
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use(express.static('public'));

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

// 连接MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi_system', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB connected');
  
  // 启动Cron任务
  const { scheduleMonthlyKPICalculation } = require('./services/cronService');
  scheduleMonthlyKPICalculation();
  console.log('✅ Cron tasks scheduled');
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Internal server error' 
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // 监听所有网络接口，允许局域网和域名访问

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📡 Accessible from:`);
  console.log(`   - Local: http://localhost:${PORT}`);
  console.log(`   - Network: http://${getLocalIP()}:${PORT}`);
  if (process.env.DOMAIN) {
    console.log(`   - Domain: ${process.env.DOMAIN}`);
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

