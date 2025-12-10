/**
 * 生成JWT密钥脚本
 * 使用方法: node scripts/generateJWTSecret.js
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 生成64字节（512位）的随机密钥
const secret = crypto.randomBytes(64).toString('hex');

console.log('\n🔐 生成的JWT密钥：\n');
console.log(secret);
console.log('\n' + '='.repeat(80));
console.log('\n📝 请将以下内容添加到 .env 文件中：\n');
console.log(`JWT_SECRET=${secret}\n`);
console.log('='.repeat(80));
console.log('\n⚠️  安全提示：');
console.log('   - 请妥善保管此密钥，不要泄露给他人');
console.log('   - 不要将 .env 文件提交到 Git 仓库');
console.log('   - 生产环境请使用不同的密钥\n');

// 询问是否自动添加到 .env 文件
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const envPath = path.join(__dirname, '..', '.env');

rl.question('是否自动添加到 .env 文件？(y/n): ', (answer) => {
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    try {
      let envContent = '';
      
      // 如果 .env 文件存在，读取内容
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
        
        // 如果已存在 JWT_SECRET，替换它
        if (envContent.includes('JWT_SECRET=')) {
          envContent = envContent.replace(/JWT_SECRET=.*/g, `JWT_SECRET=${secret}`);
          console.log('\n✅ 已更新 .env 文件中的 JWT_SECRET');
        } else {
          // 如果不存在，添加到文件末尾
          envContent += `\nJWT_SECRET=${secret}\n`;
          console.log('\n✅ 已添加 JWT_SECRET 到 .env 文件');
        }
      } else {
        // 如果文件不存在，创建新文件
        envContent = `# KPI系统环境变量配置
MONGODB_URI=mongodb://localhost:27017/kpi_system
JWT_SECRET=${secret}
PORT=3000
NODE_ENV=development
`;
        console.log('\n✅ 已创建 .env 文件并添加 JWT_SECRET');
      }
      
      fs.writeFileSync(envPath, envContent, 'utf8');
    } catch (error) {
      console.error('\n❌ 写入 .env 文件失败:', error.message);
      console.log('\n请手动将以下内容添加到 .env 文件：');
      console.log(`JWT_SECRET=${secret}`);
    }
  } else {
    console.log('\n请手动将以下内容添加到 .env 文件：');
    console.log(`JWT_SECRET=${secret}`);
  }
  
  rl.close();
});

























