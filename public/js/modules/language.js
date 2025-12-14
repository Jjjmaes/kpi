import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, showAlert } from '../core/utils.js';

// 加载语种列表，默认只取启用，refresh 为 true 时取全部
export async function loadLanguages(refresh) {
    try {
        const res = await apiFetch(`/languages${refresh ? '' : '?active=true'}`);
        const data = await res.json();
        if (!data.success) {
            showAlert('languagesList', data.message || '加载失败', 'error');
            return;
        }
        state.languagesCache = data.data || [];
        renderLanguages();
    } catch (error) {
        showAlert('languagesList', '加载失败: ' + error.message, 'error');
    }
}

function renderLanguages() {
    const container = document.getElementById('languagesList');
    if (!container) return;
    const rows = (state.languagesCache || []).map(lang => `
        <tr>
            <td>${lang.name}</td>
            <td>${lang.code}</td>
            <td>${lang.nativeName || '-'}</td>
            <td>${lang.isActive ? '<span class="badge badge-success">启用</span>' : '<span class="badge badge-danger">停用</span>'}</td>
            <td>
                <button class="btn-small" onclick="showEditLanguageModal('${lang._id}')">编辑</button>
            </td>
        </tr>
    `).join('');
    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>语种名称</th>
                    <th>代码</th>
                    <th>本地名称</th>
                    <th>状态</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="5" style="text-align:center;">暂无语种</td></tr>'}
            </tbody>
        </table>
    `;
}

export function showCreateLanguageModal() {
    const content = `
        <form id="createLangForm" data-submit="createLanguage(event)">
            <div class="form-group">
                <label>语种名称 *</label>
                <input type="text" name="name" placeholder="如：中文、英文" required>
            </div>
            <div class="form-group">
                <label>语种代码 *</label>
                <input type="text" name="code" placeholder="如：ZH、EN" required style="text-transform: uppercase;">
                <small style="color: #666; font-size: 12px;">通常使用ISO 639-1标准代码（大写）</small>
            </div>
            <div class="form-group">
                <label>本地名称（可选）</label>
                <input type="text" name="nativeName" placeholder="如：中文、English">
            </div>
            <div class="action-buttons">
                <button type="submit">创建</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '新增语种', body: content });
}

export async function createLanguage(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
        name: formData.get('name'),
        code: (formData.get('code') || '').toUpperCase(),
        nativeName: formData.get('nativeName') || undefined
    };
    try {
        const res = await apiFetch('/languages', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '创建失败', 'error');
            return;
        }
        closeModal();
        loadLanguages(true);
        showToast('语种已创建', 'success');
    } catch (error) {
        showToast('创建失败: ' + error.message, 'error');
    }
}

export function showEditLanguageModal(id) {
    const lang = (state.languagesCache || []).find(l => l._id === id);
    if (!lang) return;
    const content = `
        <form id="editLangForm" data-submit="updateLanguage(event, '${id}')">
            <div class="form-group">
                <label>语种名称 *</label>
                <input type="text" name="name" value="${lang.name}" required>
            </div>
            <div class="form-group">
                <label>语种代码 *</label>
                <input type="text" name="code" value="${lang.code}" required style="text-transform: uppercase;">
            </div>
            <div class="form-group">
                <label>本地名称（可选）</label>
                <input type="text" name="nativeName" value="${lang.nativeName || ''}">
            </div>
            <div class="form-group">
                <label>状态</label>
                <select name="isActive">
                    <option value="true" ${lang.isActive ? 'selected' : ''}>启用</option>
                    <option value="false" ${!lang.isActive ? 'selected' : ''}>停用</option>
                </select>
            </div>
            <div class="action-buttons">
                <button type="submit">保存</button>
                <button type="button" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '编辑语种', body: content });
}

export async function updateLanguage(e, id) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
        name: formData.get('name'),
        code: (formData.get('code') || '').toUpperCase(),
        nativeName: formData.get('nativeName') || undefined,
        isActive: formData.get('isActive') === 'true'
    };
    try {
        const res = await apiFetch(`/languages/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '更新失败', 'error');
            return;
        }
        closeModal();
        loadLanguages(true);
        showToast('语种已更新', 'success');
    } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
    }
}

// 挂载给 HTML 使用


