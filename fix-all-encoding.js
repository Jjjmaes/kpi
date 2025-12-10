const fs = require('fs');

let content = fs.readFileSync('public/app.js', 'utf8');

// 修复所有包含 \uFFFD 的常见模式
const fixes = [
    // 修复 showToast 调用中的语法错误
    [/showToast\('([^']+), 'success'\)/g, "showToast('$1', 'success')"],
    
    // 修复字符串中的乱码
    [/语种已创[\uFFFD]*/g, '语种已创建'],
    [/语种已更[\uFFFD]*/g, '语种已更新'],
    [/用户已删[\uFFFD]*/g, '用户已删除'],
    [/客户已删[\uFFFD]*/g, '客户已删除'],
    [/客户不存[\uFFFD]*/g, '客户不存在'],
    [/成员已删除[\uFFFD]*/g, '成员已删除'],
    [/项目已完成[\uFFFD]*/g, '项目已完成'],
    [/项目已更新[\uFFFD]*/g, '项目已更新'],
    [/项目已取[\uFFFD]*/g, '项目已取消'],
    [/发票已新[\uFFFD]*/g, '发票已新增'],
    [/回款已记[\uFFFD]*/g, '回款已记录'],
    [/已删除回款记[\uFFFD]*/g, '已删除回款记录'],
    
    // 修复模板字符串中的乱码
    [/\$\{u\.isActive \? '激[\uFFFD]* : '禁用'\}/g, "${u.isActive ? '激活' : '禁用'}"],
    [/\$\{c\.isActive \? '激[\uFFFD]* : '禁用'\}/g, "${c.isActive ? '激活' : '禁用'}"],
    [/\$\{lang\.isActive \? '激[\uFFFD]* : '禁用'\}/g, "${lang.isActive ? '激活' : '禁用'}"],
    [/'激[\uFFFD]*/g, "'激活'"],
    [/'禁[\uFFFD]*/g, "'禁用'"],
    
    // 修复其他常见乱码
    [/状[\uFFFD]+/g, '状态'],
    [/用户[\uFFFD]+/g, '用户名'],
    [/联系[\uFFFD]+/g, '联系人'],
    [/简[\uFFFD]+/g, '简称'],
    [/删[\uFFFD]+/g, '删除'],
    [/创[\uFFFD]+/g, '创建'],
    [/更[\uFFFD]+/g, '更新'],
    [/销[\uFFFD]+/g, '销售'],
    [/加载[\uFFFD]+/g, '加载中'],
    [/上一[\uFFFD]+/g, '上一页'],
    [/下一[\uFFFD]+/g, '下一页'],
    [/全部销[\uFFFD]+/g, '全部销售'],
    [/全部状[\uFFFD]+/g, '全部状态'],
    [/待开[\uFFFD]+/g, '待开始'],
    [/进行[\uFFFD]+/g, '进行中'],
    [/已完[\uFFFD]+/g, '已完成'],
    [/如：中文、英[\uFFFD]+/g, '如：中文、英文'],
    [/请至少选择一个角[\uFFFD]+/g, '请至少选择一个角色'],
];

fixes.forEach(([pattern, replacement]) => {
    content = content.replace(pattern, replacement);
});

fs.writeFileSync('public/app.js', content, 'utf8');
console.log('Fixed all encoding issues');

