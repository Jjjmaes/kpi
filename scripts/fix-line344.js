const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 修复第344行（索引343）
if (lines[343] && lines[343].includes('使用默认')) {
    lines[343] = "        console.warn('加载机构信息失败，使用默认值', e);";
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Fixed line 344');

