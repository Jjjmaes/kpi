const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let content = fs.readFileSync(filePath, 'utf8');

// 修复第15行：'admin': '管理员'finance': '财务',
content = content.replace(/'admin': '管理员'finance': '财务',/g, "'admin': '管理员',\n    'finance': '财务',");

// 修复第18行：'sales': '销售'part_time_sales': '兼职销?,
content = content.replace(/'sales': '销售'part_time_sales': '兼职销[^']*',/g, "'sales': '销售',\n    'part_time_sales': '兼职销售',");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed syntax errors');

