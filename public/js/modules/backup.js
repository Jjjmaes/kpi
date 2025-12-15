import { apiFetch } from '../core/api.js';
import { showToast, showAlert } from '../core/utils.js';

// 加载备份列表
export async function loadBackups() {
    try {
        const res = await apiFetch('/backup/list');
        const data = await res.json();
        if (data.success) {
            renderBackups(data.data || []);
        } else {
            showAlert('backupAlert', '加载备份列表失败: ' + data.message, 'error');
            const list = document.getElementById('backupsList');
            if (list) list.innerHTML = '<div class="card-desc">加载失败</div>';
        }
    } catch (error) {
        console.error('加载备份列表失败:', error);
        showAlert('backupAlert', '加载备份列表失败: ' + error.message, 'error');
        const list = document.getElementById('backupsList');
        if (list) list.innerHTML = '<div class="card-desc">加载失败</div>';
    }
}

function renderBackups(backups) {
    const container = document.getElementById('backupsList');
    if (!container) return;

    if (!backups || backups.length === 0) {
        container.innerHTML = '<div class="card-desc">暂无备份文件</div>';
        return;
    }

    const html = `
        <table style="width: 100%;">
            <thead>
                <tr>
                    <th>文件名</th>
                    <th>大小</th>
                    <th>格式</th>
                    <th>创建时间</th>
                    <th>保留天数</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${backups.map(backup => `
                    <tr>
                        <td><code>${backup.filename}</code></td>
                        <td>${backup.sizeFormatted}</td>
                        <td>${backup.format}</td>
                        <td>${new Date(backup.createdAt).toLocaleString('zh-CN')}</td>
                        <td>${backup.age} 天</td>
                        <td>
                            <button class="btn-small btn-success" onclick="restoreBackup('${backup.filename}')" style="margin-right: 5px;">恢复</button>
                            <button class="btn-small btn-danger" onclick="deleteBackupFile('${backup.filename}')">删除</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

// 创建备份
export async function createBackup() {
    if (!confirm('确定要创建数据库备份吗？')) return;
    showAlert('backupAlert', '正在创建备份，请稍候...', 'info');

    try {
        const res = await apiFetch('/backup/create', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showAlert('backupAlert', `备份创建成功: ${data.data.filename} (${data.data.sizeFormatted})`, 'success');
            await loadBackups();
        } else {
            showAlert('backupAlert', '备份创建失败: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('创建备份失败:', error);
        showAlert('backupAlert', '创建备份失败: ' + error.message, 'error');
    }
}

// 恢复备份
export async function restoreBackup(filename) {
    if (!confirm(`⚠️ 警告：恢复操作会覆盖当前数据库！\n\n确定要恢复备份 "${filename}" 吗？\n\n此操作不可逆，请确保已做好当前数据的备份！`)) return;
    if (!confirm('请再次确认：您确定要恢复这个备份吗？当前所有数据将被覆盖！')) return;

    showAlert('backupAlert', '正在恢复数据库，请稍候...（这可能需要几分钟）', 'info');

    try {
        const res = await apiFetch('/backup/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        const data = await res.json();
        if (data.success) {
            showAlert('backupAlert', '数据库恢复成功！页面将在3秒后刷新...', 'success');
            setTimeout(() => window.location.reload(), 3000);
        } else {
            showAlert('backupAlert', '数据库恢复失败: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('恢复备份失败:', error);
        showAlert('backupAlert', '恢复备份失败: ' + error.message, 'error');
    }
}

// 删除备份文件
export async function deleteBackupFile(filename) {
    if (!confirm(`确定要删除备份 "${filename}" 吗？`)) return;
    try {
        const res = await apiFetch(`/backup/${encodeURIComponent(filename)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showAlert('backupAlert', '备份文件删除成功', 'success');
            await loadBackups();
        } else {
            showAlert('backupAlert', '删除失败: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('删除备份失败:', error);
        showAlert('backupAlert', '删除备份失败: ' + error.message, 'error');
    }
}

// 清理旧备份
export async function cleanupOldBackups() {
    if (!confirm('确定要清理超过5天的旧备份吗？')) return;
    showAlert('backupAlert', '正在清理旧备份...', 'info');
    try {
        const res = await apiFetch('/backup/cleanup', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showAlert('backupAlert', `清理完成：删除了 ${data.data.deleted} 个旧备份`, 'success');
            await loadBackups();
        } else {
            showAlert('backupAlert', '清理失败: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('清理旧备份失败:', error);
        showAlert('backupAlert', '清理旧备份失败: ' + error.message, 'error');
    }
}

// 挂载到 window 供 HTML 调用










