import { apiFetch } from '../core/api.js';
import { showToast, showAlert } from '../core/utils.js';
import { API_BASE } from '../core/config.js';
import { state } from '../core/state.js';

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
                            <button class="btn-small" data-click="downloadBackupFile('${backup.filename}')" style="margin-right: 5px;">下载</button>
                            <button class="btn-small btn-success" data-click="restoreBackup('${backup.filename}')" style="margin-right: 5px;">恢复</button>
                            <button class="btn-small btn-danger" data-click="deleteBackupFile('${backup.filename}')">删除</button>
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

// 下载备份文件
export async function downloadBackupFile(filename) {
    if (!filename) {
        showToast('无效的备份文件名', 'error');
        return;
    }
    
    try {
        showAlert('backupAlert', '正在下载备份文件...', 'info');
        
        // 直接使用 fetch 并手动添加认证 token，避免 apiFetch 设置 Content-Type
        const url = `${API_BASE}/backup/download/${encodeURIComponent(filename)}`;
        const headers = {};
        
        if (state.token) {
            headers['Authorization'] = `Bearer ${state.token}`;
        }
        if (state.currentRole) {
            headers['X-Role'] = state.currentRole;
        }
        
        const res = await fetch(url, {
            method: 'GET',
            headers
        });
        
        if (!res.ok) {
            // 尝试解析错误响应
            let errorMessage = `下载失败: ${res.status}`;
            try {
                const errorData = await res.json();
                errorMessage = errorData.message || errorMessage;
            } catch (e) {
                // 如果不是 JSON，使用状态文本
                errorMessage = res.statusText || errorMessage;
            }
            throw new Error(errorMessage);
        }
        
        // 将响应转换为 blob
        const blob = await res.blob();
        
        // 从响应头获取文件名，如果没有则使用原始文件名
        const contentDisposition = res.headers.get('Content-Disposition');
        let downloadFilename = filename;
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
                downloadFilename = filenameMatch[1].replace(/['"]/g, '');
                // 处理 URL 编码的文件名
                try {
                    downloadFilename = decodeURIComponent(downloadFilename);
                } catch (e) {
                    // 如果解码失败，使用原始值
                }
            }
        }
        
        // 创建临时 URL 并触发下载
        const urlObj = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlObj;
        a.download = downloadFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // 清理临时 URL
        window.URL.revokeObjectURL(urlObj);
        
        showAlert('backupAlert', '备份文件下载成功', 'success');
    } catch (error) {
        console.error('下载备份失败:', error);
        showAlert('backupAlert', '下载备份失败: ' + error.message, 'error');
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

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 触发文件选择
export function triggerBackupFileSelect() {
    const input = document.getElementById('backupUploadInput');
    if (input) input.click();
}

// 初始化上传区域
export function initBackupUpload() {
    const input = document.getElementById('backupUploadInput');
    const uploadArea = document.getElementById('backupUploadArea');
    const fileNameDiv = document.getElementById('backupUploadFileName');
    const fileNameText = document.getElementById('backupUploadFileNameText');
    const uploadBtn = document.getElementById('backupUploadBtn');
    const progressDiv = document.getElementById('backupUploadProgress');
    const progressBar = document.getElementById('backupUploadProgressBar');
    const progressText = document.getElementById('backupUploadProgressText');

    if (!input || !uploadArea) return;

    // 文件选择变化
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.name.toLowerCase().endsWith('.tar.gz') && !file.name.toLowerCase().endsWith('.gz')) {
                showToast('只支持 .tar.gz 格式的备份文件', 'error');
                input.value = '';
                return;
            }
            fileNameText.textContent = `${file.name} (${formatFileSize(file.size)})`;
            fileNameDiv.style.display = 'block';
            uploadBtn.style.display = 'inline-block';
        }
    });

    // 点击上传区域选择文件
    uploadArea.addEventListener('click', (e) => {
        // 如果点击的是按钮或文件名区域，不触发文件选择
        if (e.target.closest('button') || e.target.closest('#backupUploadFileName')) {
            return;
        }
        input.click();
    });

    // 拖拽上传支持
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.borderColor = '#667eea';
        uploadArea.style.backgroundColor = '#f8faff';
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.borderColor = '#cbd5e1';
        uploadArea.style.backgroundColor = 'white';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.borderColor = '#cbd5e1';
        uploadArea.style.backgroundColor = 'white';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (!file.name.toLowerCase().endsWith('.tar.gz') && !file.name.toLowerCase().endsWith('.gz')) {
                showToast('只支持 .tar.gz 格式的备份文件', 'error');
                return;
            }
            // 创建 DataTransfer 对象来设置文件
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            input.files = dataTransfer.files;
            
            // 触发 change 事件
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    // 隐藏进度条
    if (progressDiv) progressDiv.style.display = 'none';
}

// 清空上传选择
export function clearBackupUpload() {
    const input = document.getElementById('backupUploadInput');
    const fileNameDiv = document.getElementById('backupUploadFileName');
    const uploadBtn = document.getElementById('backupUploadBtn');
    const progressDiv = document.getElementById('backupUploadProgress');
    
    if (input) input.value = '';
    if (fileNameDiv) fileNameDiv.style.display = 'none';
    if (uploadBtn) uploadBtn.style.display = 'none';
    if (progressDiv) progressDiv.style.display = 'none';
}

// 上传备份文件
export async function uploadBackupFile() {
    const input = document.getElementById('backupUploadInput');
    if (!input || !input.files || input.files.length === 0) {
        showToast('请选择要上传的备份文件（.tar.gz）', 'warning');
        return;
    }

    const file = input.files[0];
    if (!file.name.toLowerCase().endsWith('.tar.gz') && !file.name.toLowerCase().endsWith('.gz')) {
        showToast('只支持 .tar.gz 格式的备份文件', 'error');
        return;
    }

    if (!confirm(`⚠️ 确认上传备份文件 "${file.name}" 吗？\n上传后可以从该文件恢复数据库。`)) return;

    const formData = new FormData();
    formData.append('file', file);

    const progressDiv = document.getElementById('backupUploadProgress');
    const progressBar = document.getElementById('backupUploadProgressBar');
    const progressText = document.getElementById('backupUploadProgressText');
    const uploadBtn = document.getElementById('backupUploadBtn');

    // 显示进度条
    if (progressDiv) progressDiv.style.display = 'block';
    if (uploadBtn) uploadBtn.disabled = true;
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';

    showAlert('backupAlert', '正在上传备份文件，请稍候...', 'info');

    try {
        const xhr = new XMLHttpRequest();
        
        // 上传进度
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                if (progressBar) progressBar.style.width = percentComplete + '%';
                if (progressText) progressText.textContent = percentComplete + '%';
            }
        });

        // 完成处理
        xhr.addEventListener('load', async () => {
            if (uploadBtn) uploadBtn.disabled = false;
            if (progressDiv) progressDiv.style.display = 'none';
            
            if (xhr.status === 200) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (data.success) {
                        showAlert('backupAlert', `✅ 备份文件上传成功：${data.data?.filename || ''}`, 'success');
                        await loadBackups();
                        clearBackupUpload();
                    } else {
                        showAlert('backupAlert', '上传失败: ' + (data.message || '未知错误'), 'error');
                    }
                } catch (parseError) {
                    showAlert('backupAlert', '解析响应失败: ' + parseError.message, 'error');
                }
            } else {
                try {
                    const errorData = JSON.parse(xhr.responseText);
                    showAlert('backupAlert', '上传失败: ' + (errorData.message || `HTTP ${xhr.status}`), 'error');
                } catch {
                    showAlert('backupAlert', `上传失败: HTTP ${xhr.status}`, 'error');
                }
            }
        });

        // 错误处理
        xhr.addEventListener('error', () => {
            if (uploadBtn) uploadBtn.disabled = false;
            if (progressDiv) progressDiv.style.display = 'none';
            showAlert('backupAlert', '上传失败: 网络错误', 'error');
        });

        // 发送请求
        xhr.open('POST', '/api/backup/upload');
        xhr.send(formData);
    } catch (error) {
        console.error('上传备份文件失败:', error);
        if (uploadBtn) uploadBtn.disabled = false;
        if (progressDiv) progressDiv.style.display = 'none';
        showAlert('backupAlert', '上传备份文件失败: ' + error.message, 'error');
    }
}
