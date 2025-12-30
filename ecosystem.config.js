const fs = require('fs');
const path = require('path');

// 读取 .env 文件并解析环境变量
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  const env = {};
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      line = line.trim();
      // 跳过注释和空行
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          // 移除引号（如果有）
          env[key.trim()] = value.replace(/^["']|["']$/g, '');
        }
      }
    });
  }
  
  return env;
}

// 加载 .env 文件中的环境变量
const envVars = loadEnvFile();

module.exports = {
  apps: [{
    name: 'kpi',
    script: './server.js',
    cwd: '/var/www/kpi', // 确保工作目录正确
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      // 从 .env 文件加载的环境变量
      ...envVars
    },
    // 日志配置
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // 自动重启配置
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    // 监听配置
    ignore_watch: [
      'node_modules',
      'logs',
      'backups',
      '.git'
    ]
  }]
};

