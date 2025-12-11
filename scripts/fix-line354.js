const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 修复第354行（索引353）
if (lines[353] && lines[353].includes('初始')) {
    lines[353] = "// 初始化";
    lines.splice(354, 0, "document.addEventListener('DOMContentLoaded', async () => {");
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Fixed line 354');




















