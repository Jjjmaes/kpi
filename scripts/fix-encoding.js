const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let content = fs.readFileSync(filePath, 'utf8');

// 修复编码问题
content = content.replace(/失败[^\n]*const API_BASE/g, '失败)\nconst API_BASE');
content = content.replace(/全局状[^\n]*let currentUser/g, '全局状态\nlet currentUser');
content = content.replace(/当前选择的角[^\n]*let roleNames/g, '当前选择的角色\nlet roleNames');
content = content.replace(/'管理[^']*'/g, "'管理员'");
content = content.replace(/'销[^']*'/g, (m) => m.includes('兼职') ? "'兼职销售'" : "'销售'");
content = content.replace(/'综合[^']*'/g, "'综合岗'");
content = content.replace(/用于UI控制[^\n]*const PERMISSIONS/g, '用于UI控制)\nconst PERMISSIONS');
content = content.replace(/基于当前角色[^\n]*function hasPermission/g, '基于当前角色)\nfunction hasPermission');
content = content.replace(/获取权限[^\n]*function getPermission/g, '获取权限值\nfunction getPermission');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed encoding issues');

