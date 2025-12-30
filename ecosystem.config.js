const fs = require('fs');
const path = require('path');

// 读取 .env 文件并解析环境变量
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  const env = {};
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    // 按行分割，支持 Windows (\r\n) 和 Unix (\n) 换行符
    const lines = envContent.split(/\r?\n/);
    
    lines.forEach(line => {
      line = line.trim();
      // 跳过注释和空行
      if (line && !line.startsWith('#')) {
        // 处理一行中有多个 KEY=VALUE 的情况（错误格式，但尝试修复）
        // 先尝试按空格分割，如果分割后有多个包含等号的片段，则分别解析
        const parts = line.split(/\s+/);
        
        parts.forEach(part => {
          part = part.trim();
          if (part && part.includes('=')) {
            // 只取第一个等号作为分隔符（值中可能包含等号）
            const equalIndex = part.indexOf('=');
            if (equalIndex > 0) {
              const key = part.substring(0, equalIndex).trim();
              const value = part.substring(equalIndex + 1).trim();
              // 移除引号（如果有）
              if (key && value) {
                env[key] = value.replace(/^["']|["']$/g, '');
              }
            }
          }
        });
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

