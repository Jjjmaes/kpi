// 批量替换脚本：将带Authorization的fetch调用替换为apiFetch
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/app.js');
let content = fs.readFileSync(filePath, 'utf8');

// 替换模式1: fetch(`${API_BASE}/xxx`, { headers: { 'Authorization': `Bearer ${token}` } })
content = content.replace(
    /await fetch\(`\$\{API_BASE\}([^`]+)`,\s*\{\s*headers:\s*\{\s*'Authorization':\s*`Bearer \$\{token\}`\s*\}\s*\}\)/g,
    'await apiFetch(`${API_BASE}$1`)'
);

// 替换模式2: fetch(`${API_BASE}/xxx`, { method: '...', headers: { 'Authorization': `Bearer ${token}`, ... } })
content = content.replace(
    /await fetch\(`\$\{API_BASE\}([^`]+)`,\s*\{\s*method:\s*['"]([^'"]+)['"],\s*headers:\s*\{\s*'Authorization':\s*`Bearer \$\{token\}`([^}]*)\}([^}]*)\}\)/g,
    (match, path, method, otherHeaders, body) => {
        // 移除Authorization，保留其他headers
        const cleanHeaders = otherHeaders.replace(/,\s*'Authorization':\s*`Bearer \$\{token\}`/g, '')
            .replace(/'Authorization':\s*`Bearer \$\{token\}`,\s*/g, '');
        return `await apiFetch(\`\${API_BASE}${path}\`, { method: '${method}', headers: {${cleanHeaders}}, ${body}})`;
    }
);

// 替换模式3: fetch(`${API_BASE}/xxx`, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': ... } })
content = content.replace(
    /await fetch\(`\$\{API_BASE\}([^`]+)`,\s*\{\s*headers:\s*\{\s*'Authorization':\s*`Bearer \$\{token\}`,\s*([^}]+)\}([^}]*)\}\)/g,
    (match, path, otherHeaders, body) => {
        return `await apiFetch(\`\${API_BASE}${path}\`, { headers: {${otherHeaders}}, ${body}})`;
    }
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('替换完成！');

















