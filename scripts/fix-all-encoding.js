const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 修复所有编码问题
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // 修复注释和代码混在一起的问题
    if (line.includes('?const ') || line.includes('?function ') || line.includes('?let ')) {
        line = line.replace(/\?const /g, ')\nconst ');
        line = line.replace(/\?function /g, ')\nfunction ');
        line = line.replace(/\?let /g, ')\nlet ');
    }
    
    // 修复字符串中的乱码
    if (line.includes("'管理") && !line.includes("'管理员'")) {
        line = line.replace(/'管理[^']*'/g, "'管理员'");
    }
    if (line.includes("'销") && !line.includes("'销售'")) {
        if (line.includes('兼职')) {
            line = line.replace(/'兼职销[^']*'/g, "'兼职销售'");
        } else if (!line.includes('兼职销售')) {
            line = line.replace(/'销[^']*'/g, "'销售'");
        }
    }
    if (line.includes("'综合") && !line.includes("'综合岗'")) {
        line = line.replace(/'综合[^']*'/g, "'综合岗'");
    }
    
    // 修复字符串中的其他乱码（如 '默认?'）
    line = line.replace(/'默认[^']*'/g, "'默认值'");
    line = line.replace(/使用默认[^']*'/g, "使用默认值'");
    
    lines[i] = line;
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Fixed all encoding issues');

