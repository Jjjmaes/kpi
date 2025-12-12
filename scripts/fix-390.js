const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 修复第390行（索引389）
if (lines[389]) {
    // 直接替换整行
    lines[389] = "                showAlert('loginAlert', '首次登录需修改密码，请先登录后按提示修改', 'error');";
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Fixed line 390');






















