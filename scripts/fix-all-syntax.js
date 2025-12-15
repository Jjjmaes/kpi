const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 修复所有编码问题
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // 修复注释和代码混在一起的问题
    if (line.includes('?async ') || line.includes('?function ') || line.includes('?const ') || line.includes('?let ')) {
        const parts = line.split('?');
        if (parts.length > 1) {
            lines[i] = parts[0] + ')';
            lines.splice(i + 1, 0, parts[1]);
            i++; // 跳过新插入的行
        }
    }
    
    // 修复特定注释
    if (line.includes('认证检') && !line.includes('认证检查')) {
        line = line.replace(/认证检[^]*async/, '认证检查\nasync');
        if (line !== lines[i]) {
            const parts = line.split('\n');
            lines[i] = parts[0];
            if (parts.length > 1) {
                lines.splice(i + 1, 0, parts[1]);
                i++;
            }
        }
    }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Fixed all syntax issues');












































