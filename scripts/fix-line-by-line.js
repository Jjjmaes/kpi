const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// 逐行修复
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const originalLine = line;
    
    // 修复第390行
    if (i === 389 && line.includes('修?')) {
        line = line.replace(/修\?/g, '修改');
    }
    
    // 修复第494行
    if (i === 493 && line.includes('不一?')) {
        line = line.replace(/不一\?/g, '不一致');
    }
    
    // 修复第366行（删除重复注释）
    if (i === 365 && line.includes('认证检')) {
        line = '// 认证检查';
    }
    if (i === 366 && line.includes('认证检查')) {
        lines[i] = ''; // 删除重复行
        continue;
    }
    
    // 修复第312行
    if (i === 311 && line.includes('角色?')) {
        line = line.replace(/角色\?/g, '角色）');
    }
    
    // 修复第322行
    if (i === 321 && line.includes('月份?')) {
        line = line.replace(/月份\?/g, '月份）');
    }
    
    // 修复第387行
    if (i === 386 && line.includes('改密?')) {
        line = line.replace(/改密\?/g, '改密码');
    }
    
    // 修复第466行
    if (i === 465 && line.includes('至?')) {
        line = line.replace(/至\?8/g, '至少8');
        line = line.replace(/字符\?/g, '字符');
    }
    
    // 修复所有包含乱码的字符串
    line = line.replace(/修\?/g, '修改');
    line = line.replace(/不一\?/g, '不一致');
    line = line.replace(/模\?/g, '模块');
    line = line.replace(/激\?/g, '激活');
    line = line.replace(/禁\?/g, '禁用');
    line = line.replace(/删\?/g, '删除');
    line = line.replace(/创\?/g, '创建');
    line = line.replace(/更\?/g, '更新');
    line = line.replace(/状\?/g, '状态');
    line = line.replace(/销\?/g, '销售');
    line = line.replace(/提\?/g, '提示');
    line = line.replace(/加载\?/g, '加载中');
    line = line.replace(/添加\?/g, '添加');
    line = line.replace(/术语\?/g, '术语库');
    line = line.replace(/参考文\?/g, '参考文件');
    line = line.replace(/本地\?/g, '本地化');
    line = line.replace(/完\?/g, '完成');
    line = line.replace(/取\?/g, '取消');
    line = line.replace(/次\?/g, '次数');
    line = line.replace(/金\?/g, '金额');
    line = line.replace(/自\?/g, '自己');
    line = line.replace(/至\?/g, '至少');
    line = line.replace(/字符\?/g, '字符');
    line = line.replace(/改密\?/g, '改密码');
    line = line.replace(/角色\?/g, '角色）');
    line = line.replace(/月份\?/g, '月份）');
    
    // 修复注释中的乱码
    line = line.replace(/认证检\)/g, '认证检查');
    line = line.replace(/初始\?/g, '初始化');
    line = line.replace(/用于UI控制\?/g, '用于UI控制）');
    line = line.replace(/基于当前角色\?/g, '基于当前角色）');
    line = line.replace(/获取权限\?/g, '获取权限值）');
    
    if (line !== originalLine) {
        lines[i] = line;
    }
}

// 删除空行（重复的注释行）
const cleanedLines = lines.filter((line, index) => {
    // 保留非空行，或者删除重复的注释
    if (line.trim() === '// 认证检查' && index > 365 && lines[index - 1]?.trim() === '// 认证检查') {
        return false;
    }
    return true;
});

fs.writeFileSync(filePath, cleanedLines.join('\n'), 'utf8');
console.log('Fixed all lines');













