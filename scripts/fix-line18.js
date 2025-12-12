const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 修复第18行（索引17）
if (lines[17] && lines[17].includes("'sales': '销售'part_time_sales'")) {
    lines[17] = "    'sales': '销售',";
    lines.splice(18, 0, "    'part_time_sales': '兼职销售',");
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Fixed line 18');























