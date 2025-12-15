const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let content = fs.readFileSync(filePath, 'utf8');

// 修复所有编码问题
const fixes = [
    // 修复字符串中的乱码
    [/'修?/g, "'修改'"],
    [/'不一?/g, "'不一致'"],
    [/'模?/g, "'模块'"],
    [/'激?/g, "'激活'"],
    [/'禁?/g, "'禁用'"],
    [/'删?/g, "'删除'"],
    [/'创?/g, "'创建'"],
    [/'更?/g, "'更新'"],
    [/'状?/g, "'状态'"],
    [/'销?/g, "'销售'"],
    [/'提?/g, "'提示'"],
    [/'加载?/g, "'加载中'"],
    [/'添加?/g, "'添加'"],
    [/'术语?/g, "'术语库'"],
    [/'参考文?/g, "'参考文件'"],
    [/'?/g, "'是'"],
    [/'?/g, "'否'"],
    [/'本地?/g, "'本地化'"],
    [/'完?/g, "'完成'"],
    [/'取?/g, "'取消'"],
    [/'次?/g, "'次数'"],
    [/'金?/g, "'金额'"],
    [/'自?/g, "'自己'"],
    
    // 修复注释中的乱码
    [/认证检\)/g, '认证检查'],
    [/初始?/g, '初始化'],
    [/用于UI控制?/g, '用于UI控制'],
    [/基于当前角色?/g, '基于当前角色'],
    [/获取权限?/g, '获取权限值'],
    [/来自看板的月份筛选（成交\/创建月份?/g, '来自看板的月份筛选（成交/创建月份）'],
    
    // 修复其他乱码
    [/使用默认?/g, '使用默认值'],
    [/加载机构信息失败，使用默认?/g, '加载机构信息失败，使用默认值'],
];

fixes.forEach(([pattern, replacement]) => {
    content = content.replace(pattern, replacement);
});

// 修复重复的注释行
content = content.replace(/\/\/ 认证检\)\s*\n\/\/ 认证检查/g, '// 认证检查');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed all encoding issues');











































