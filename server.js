require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static('public'));

// 路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const projectRoutes = require('./routes/projects');
const kpiRoutes = require('./routes/kpi');
const configRoutes = require('./routes/config');
const financeRoutes = require('./routes/finance');
const customerRoutes = require('./routes/customers');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/kpi', kpiRoutes);
app.use('/api/config', configRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/customers', customerRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'KPI System is running' });
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
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

