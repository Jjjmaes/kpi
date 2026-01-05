import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, getStatusBadgeClass, getStatusText, getBusinessTypeText, getRoleText } from '../core/utils.js';
import { loadCustomers } from './customer.js';
import { loadLanguages } from './language.js';
import { showEvaluationModal, showProjectEvaluationsList, checkPendingEvaluations } from './evaluation.js';

// --- 辅助 ---
// 是否可以在项目相关界面看到项目金额 / 单价
// 业务要求：项目经理、专/兼职翻译、专/兼职排版、审校都不看金额
// 允许看金额的角色：admin、finance、sales、part_time_sales、admin_staff（可按需要调整）
const canViewProjectAmount = () => {
    const role = state.currentRole || (state.currentUser?.roles?.[0] || '');
    if (!role) return false;
    const allowed = ['admin', 'finance', 'sales', 'part_time_sales', 'admin_staff'];
    return allowed.includes(role);
};

let targetLanguageRowIndex = 0;
let currentProjectDetail = null; // 查看/编辑时缓存当前项目
let projectMemberRolesLoadedPromise = null; // 缓存可用于项目成员的角色列表

async function ensureProjectMemberRoles() {
    if (window.projectMemberRoles && Array.isArray(window.projectMemberRoles)) {
        return window.projectMemberRoles;
    }
    if (projectMemberRolesLoadedPromise) {
        return projectMemberRolesLoadedPromise;
    }
    projectMemberRolesLoadedPromise = (async () => {
        try {
            // 使用专门的接口获取「可作为项目成员」的角色，非管理员也可访问
            const res = await apiFetch('/roles/project-member-roles');
            const data = await res.json();
            if (data.success) {
                const roles = (data.data || [])
                    .filter(r => r.isActive && r.canBeProjectMember)
                    .map(r => ({ 
                        value: r.code, 
                        label: r.name,
                        isManagementRole: r.isManagementRole || false // 保存isManagementRole字段
                    }));
                window.projectMemberRoles = roles;
                return roles;
            }
        } catch (err) {
            console.error('加载项目成员角色失败:', err);
        }
        window.projectMemberRoles = [];
        return [];
    })();
    return projectMemberRolesLoadedPromise;
}

const getProjectTypeText = (type) => {
    const typeMap = {
        mtpe: 'MTPE',
        deepedit: '深度编辑',
        review: '审校项目',
        mixed: '混合类型'
    };
    return typeMap[type] || type;
};

const isFinanceRole = () => {
    const roles = state.currentUser?.roles || [];
    return roles.includes('finance') || roles.includes('admin');
};

export function addTargetLanguageRow() {
    const container = document.getElementById('targetLanguagesContainer');
    if (!container) return;
    const rowId = `targetLangRow-${targetLanguageRowIndex++}`;
    
    // 使用语言缓存生成目标语种选项，而不是源语种选项
    const languageOptions = (state.languagesCache || [])
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}">${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    
    const row = document.createElement('div');
    row.className = 'target-language-row';
    row.id = rowId;
    row.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;">
            <select class="target-language-select" required style="flex:1;">
                <option value="">请选择目标语种</option>
                ${languageOptions}
            </select>
            <button type="button" class="btn-small" data-click="removeTargetLanguageRow('${rowId}')">删除</button>
        </div>
    `;
    container.appendChild(row);
}

export function removeTargetLanguageRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
}

// 报价明细管理
let quotationDetailRowIndex = 0;

export function addQuotationDetailRow() {
    const container = document.getElementById('quotationDetailsContainer');
    if (!container) return;
    
    const rowId = `quotation-detail-${quotationDetailRowIndex++}`;
    const form = document.getElementById('createProjectForm') || document.getElementById('editProjectForm');
    if (!form) return;
    
    const sourceLanguage = form.querySelector('[name="sourceLanguage"]')?.value || '';
    const sourceLanguageSelect = form.querySelector('[name="sourceLanguage"]');
    const sourceLanguageOptions = sourceLanguageSelect 
        ? Array.from(sourceLanguageSelect.options).map(opt => `<option value="${opt.value}" ${opt.value === sourceLanguage ? 'selected' : ''}>${opt.text}</option>`).join('')
        : '<option value="">请选择</option>';
    
    const targetLanguageSelects = form.querySelectorAll('.target-language-select');
    const targetLanguageOptions = targetLanguageSelects.length > 0
        ? Array.from(targetLanguageSelects[0].options).map(opt => `<option value="${opt.value}">${opt.text}</option>`).join('')
        : '<option value="">请选择</option>';
    
    const unitPrice = form.querySelector('[name="unitPrice"]')?.value || '';
    
    const row = document.createElement('div');
    row.id = rowId;
    row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr auto; gap: 8px; align-items: center; padding: 10px; background: #f9f9f9; border-radius: 4px; border: 1px solid #ddd;';
    row.innerHTML = `
        <input type="text" class="detail-filename" placeholder="文件名" style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-change="updateQuotationDetailAmount('${rowId}')">
        <select class="detail-source-language" style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-change="updateQuotationDetailAmount('${rowId}')">
            ${sourceLanguageOptions}
        </select>
        <select class="detail-target-language" style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-change="updateQuotationDetailAmount('${rowId}')">
            ${targetLanguageOptions}
        </select>
        <input type="number" class="detail-word-count" placeholder="字数" min="0" step="1" style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-change="updateQuotationDetailAmount('${rowId}')">
        <input type="number" class="detail-unit-price" placeholder="单价" min="0" step="0.01" value="${unitPrice}" style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-change="updateQuotationDetailAmount('${rowId}')">
        <input type="number" class="detail-amount" placeholder="金额" min="0" step="0.01" readonly style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px; background: #f0f0f0;">
        <button type="button" class="btn-small" data-click="removeQuotationDetailRow('${rowId}')" style="background: #ef4444; color: white;">删除</button>
    `;
    
    container.appendChild(row);
    updateQuotationDetailsSummary();
}

export function removeQuotationDetailRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        updateQuotationDetailsSummary();
    }
}

export function updateQuotationDetailAmount(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    
    const wordCountInput = row.querySelector('.detail-word-count');
    const unitPriceInput = row.querySelector('.detail-unit-price');
    const amountInput = row.querySelector('.detail-amount');
    
    if (!wordCountInput || !unitPriceInput || !amountInput) return;
    
    const wordCount = parseFloat(wordCountInput.value) || 0;
    const unitPrice = parseFloat(unitPriceInput.value) || 0;
    const amount = (wordCount / 1000) * unitPrice;
    
    amountInput.value = amount.toFixed(2);
    updateQuotationDetailsSummary();
}

export function updateQuotationDetailsSummary() {
    const container = document.getElementById('quotationDetailsContainer');
    if (!container) return;
    
    const rows = container.querySelectorAll('[id^="quotation-detail-"]');
    let totalWordCount = 0;
    let totalAmount = 0;
    
    rows.forEach(row => {
        const wordCountInput = row.querySelector('.detail-word-count');
        const amountInput = row.querySelector('.detail-amount');
        
        if (wordCountInput) {
            totalWordCount += parseFloat(wordCountInput.value) || 0;
        }
        if (amountInput) {
            totalAmount += parseFloat(amountInput.value) || 0;
        }
    });
    
    const summaryDiv = document.getElementById('quotationDetailsSummary');
    if (summaryDiv) {
        const wordCountSpan = summaryDiv.querySelector('#detailsTotalWordCount');
        const amountSpan = summaryDiv.querySelector('#detailsTotalAmount');
        
        if (wordCountSpan) {
            wordCountSpan.textContent = totalWordCount.toLocaleString('zh-CN');
        }
        if (amountSpan) {
            amountSpan.textContent = totalAmount.toFixed(2);
        }
    }
    
    // 如果有明细，自动同步总字数、总金额和平均单价，并禁用手动输入，同时隐藏源语种和目标语种字段
    if (rows.length > 0) {
        const wordCountInput = document.getElementById('wordCount');
        const projectAmountInput = document.getElementById('projectAmount');
        const unitPriceInput = document.getElementById('unitPrice');
        const sourceLanguageGroup = document.getElementById('sourceLanguageGroup');
        const targetLanguagesGroup = document.getElementById('targetLanguagesGroup');
        const wordCountHint = document.getElementById('wordCountHint');
        const unitPriceHint = document.getElementById('unitPriceHint');
        let unitPriceLabel = null;
        if (unitPriceInput) {
            // 尝试通过 for 属性查找
            unitPriceLabel = document.querySelector('label[for="unitPrice"]');
            // 如果没找到，尝试查找父级 form-group 中的 label
            if (!unitPriceLabel) {
                const formGroup = unitPriceInput.closest('.form-group');
                if (formGroup) {
                    unitPriceLabel = formGroup.querySelector('label');
                }
            }
        }
        
        // 隐藏源语种和目标语种字段（因为明细中已经有语种信息）
        if (sourceLanguageGroup) {
            sourceLanguageGroup.style.display = 'none';
        }
        if (targetLanguagesGroup) {
            targetLanguagesGroup.style.display = 'none';
        }
        
        if (wordCountInput) {
            wordCountInput.value = totalWordCount;
            wordCountInput.readOnly = true;
            wordCountInput.style.background = '#f0f0f0';
        }
        if (wordCountHint) {
            wordCountHint.textContent = '字数从报价明细自动计算，请修改明细以更新字数';
            wordCountHint.style.color = '#667eea';
        }
        if (projectAmountInput) {
            projectAmountInput.value = totalAmount.toFixed(2);
            projectAmountInput.readOnly = true;
            projectAmountInput.style.background = '#f0f0f0';
        }
        // 计算平均单价：总金额 / (总字数 / 1000)
        if (unitPriceInput && totalWordCount > 0) {
            const averageUnitPrice = (totalAmount / (totalWordCount / 1000)).toFixed(2);
            unitPriceInput.value = averageUnitPrice;
            unitPriceInput.readOnly = true;
            unitPriceInput.style.background = '#f0f0f0';
            // 更新标签提示
            if (unitPriceLabel) {
                const originalText = unitPriceLabel.textContent.replace(/（.*?）/, '').trim();
                unitPriceLabel.textContent = `${originalText}（平均单价，自动计算）`;
                unitPriceLabel.style.color = '#667eea';
            }
            if (unitPriceHint) {
                unitPriceHint.textContent = '单价从报价明细自动计算为平均单价，请修改明细以更新单价';
                unitPriceHint.style.color = '#667eea';
            }
        }
    } else {
        // 如果没有明细，恢复可编辑状态
        const wordCountInput = document.getElementById('wordCount');
        const projectAmountInput = document.getElementById('projectAmount');
        const unitPriceInput = document.getElementById('unitPrice');
        let unitPriceLabel = null;
        if (unitPriceInput) {
            // 尝试通过 for 属性查找
            unitPriceLabel = document.querySelector('label[for="unitPrice"]');
            // 如果没找到，尝试查找父级 form-group 中的 label
            if (!unitPriceLabel) {
                const formGroup = unitPriceInput.closest('.form-group');
                if (formGroup) {
                    unitPriceLabel = formGroup.querySelector('label');
                }
            }
        }
        
        // 显示源语种和目标语种字段（因为没有明细，需要手动选择语种）
        const sourceLanguageGroup = document.getElementById('sourceLanguageGroup');
        const targetLanguagesGroup = document.getElementById('targetLanguagesGroup');
        if (sourceLanguageGroup) {
            sourceLanguageGroup.style.display = '';
        }
        if (targetLanguagesGroup) {
            targetLanguagesGroup.style.display = '';
        }
        
        // 恢复 required 属性
        const sourceLanguageSelect = document.getElementById('sourceLanguageSelect');
        const targetLanguageSelects = document.querySelectorAll('.target-language-select');
        
        if (sourceLanguageSelect) {
            sourceLanguageSelect.setAttribute('required', 'required');
        }
        
        // 至少第一个目标语种选择框需要 required
        if (targetLanguageSelects.length > 0 && targetLanguageSelects[0]) {
            targetLanguageSelects[0].setAttribute('required', 'required');
        }
        
        if (wordCountInput) {
            wordCountInput.readOnly = false;
            wordCountInput.style.background = '';
        }
        const wordCountHint = document.getElementById('wordCountHint');
        if (wordCountHint) {
            wordCountHint.textContent = '如果填写了报价明细，字数将从明细自动计算';
            wordCountHint.style.color = '#666';
        }
        if (projectAmountInput) {
            projectAmountInput.readOnly = false;
            projectAmountInput.style.background = '';
        }
        if (unitPriceInput) {
            unitPriceInput.readOnly = false;
            unitPriceInput.style.background = '';
            // 恢复标签
            if (unitPriceLabel) {
                unitPriceLabel.textContent = unitPriceLabel.textContent.replace(/（.*?）/, '').trim();
                if (unitPriceLabel.textContent.includes('平均单价')) {
                    unitPriceLabel.textContent = '单价（每千字，元）';
                }
                unitPriceLabel.style.color = '';
            }
            const unitPriceHint = document.getElementById('unitPriceHint');
            if (unitPriceHint) {
                unitPriceHint.textContent = '如果填写了报价明细，单价将显示为平均单价（自动计算）';
                unitPriceHint.style.color = '#666';
            }
        }
    }
}

// 编辑项目时的报价明细管理
let editQuotationDetailRowIndex = 0;

export function addEditQuotationDetailRow(detail = null) {
    const container = document.getElementById('editQuotationDetailsContainer');
    if (!container) return;
    
    const rowId = `edit-quotation-detail-${editQuotationDetailRowIndex++}`;
    const form = document.getElementById('editProjectForm');
    if (!form) return;
    
    const sourceLanguage = form.querySelector('[name="sourceLanguage"]')?.value || '';
    const sourceLanguageSelect = form.querySelector('[name="sourceLanguage"]');
    const sourceLanguageOptions = sourceLanguageSelect 
        ? Array.from(sourceLanguageSelect.options).map(opt => `<option value="${opt.value}" ${opt.value === (detail?.sourceLanguage || sourceLanguage) ? 'selected' : ''}>${opt.text}</option>`).join('')
        : '<option value="">请选择</option>';
    
    const targetLanguageSelects = form.querySelectorAll('#editTargetLanguagesContainer .target-language-select');
    const targetLanguageOptions = targetLanguageSelects.length > 0
        ? Array.from(targetLanguageSelects[0].options).map(opt => `<option value="${opt.value}" ${opt.value === detail?.targetLanguage ? 'selected' : ''}>${opt.text}</option>`).join('')
        : '<option value="">请选择</option>';
    
    const unitPrice = form.querySelector('[name="unitPrice"]')?.value || detail?.unitPrice || '';
    
    const row = document.createElement('div');
    row.id = rowId;
    row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr auto; gap: 8px; align-items: center; padding: 10px; background: #f9f9f9; border-radius: 4px; border: 1px solid #ddd;';
    row.innerHTML = `
        <input type="text" class="detail-filename" placeholder="文件名" value="${detail?.filename || ''}" style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-change="updateEditQuotationDetailAmount('${rowId}')">
        <select class="detail-source-language" style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-change="updateEditQuotationDetailAmount('${rowId}')">
            ${sourceLanguageOptions}
        </select>
        <select class="detail-target-language" style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-change="updateEditQuotationDetailAmount('${rowId}')">
            ${targetLanguageOptions}
        </select>
        <input type="number" class="detail-word-count" placeholder="字数" min="0" step="1" value="${detail?.wordCount || ''}" style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-change="updateEditQuotationDetailAmount('${rowId}')">
        <input type="number" class="detail-unit-price" placeholder="单价" min="0" step="0.01" value="${detail?.unitPrice || unitPrice}" style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-change="updateEditQuotationDetailAmount('${rowId}')">
        <input type="number" class="detail-amount" placeholder="金额" min="0" step="0.01" value="${detail?.amount || ''}" readonly style="padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px; background: #f0f0f0;">
        <button type="button" class="btn-small" data-click="removeEditQuotationDetailRow('${rowId}')" style="background: #ef4444; color: white;">删除</button>
    `;
    
    container.appendChild(row);
    if (detail) {
        updateEditQuotationDetailAmount(rowId);
    }
    updateEditQuotationDetailsSummary();
}

export function removeEditQuotationDetailRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        updateEditQuotationDetailsSummary();
    }
}

export function updateEditQuotationDetailAmount(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    
    const wordCountInput = row.querySelector('.detail-word-count');
    const unitPriceInput = row.querySelector('.detail-unit-price');
    const amountInput = row.querySelector('.detail-amount');
    
    if (!wordCountInput || !unitPriceInput || !amountInput) return;
    
    const wordCount = parseFloat(wordCountInput.value) || 0;
    const unitPrice = parseFloat(unitPriceInput.value) || 0;
    const amount = (wordCount / 1000) * unitPrice;
    
    amountInput.value = amount.toFixed(2);
    updateEditQuotationDetailsSummary();
}

export function updateEditQuotationDetailsSummary() {
    const container = document.getElementById('editQuotationDetailsContainer');
    if (!container) return;
    
    const rows = container.querySelectorAll('[id^="edit-quotation-detail-"]');
    let totalWordCount = 0;
    let totalAmount = 0;
    
    rows.forEach(row => {
        const wordCountInput = row.querySelector('.detail-word-count');
        const amountInput = row.querySelector('.detail-amount');
        
        if (wordCountInput) {
            totalWordCount += parseFloat(wordCountInput.value) || 0;
        }
        if (amountInput) {
            totalAmount += parseFloat(amountInput.value) || 0;
        }
    });
    
    const summaryDiv = document.getElementById('editQuotationDetailsSummary');
    if (summaryDiv) {
        const wordCountSpan = summaryDiv.querySelector('#editDetailsTotalWordCount');
        const amountSpan = summaryDiv.querySelector('#editDetailsTotalAmount');
        
        if (wordCountSpan) {
            wordCountSpan.textContent = totalWordCount.toLocaleString('zh-CN');
        }
        if (amountSpan) {
            amountSpan.textContent = totalAmount.toFixed(2);
        }
    }
    
    // 如果有明细，自动同步总字数、总金额和平均单价，同时隐藏源语种和目标语种字段
    if (rows.length > 0) {
        const wordCountInput = document.getElementById('editWordCount');
        const projectAmountInput = document.getElementById('editProjectAmount');
        const unitPriceInput = document.getElementById('editUnitPrice');
        const sourceLanguageGroup = document.getElementById('editSourceLanguageGroup');
        const targetLanguagesGroup = document.getElementById('editTargetLanguagesGroup');
        const wordCountHint = document.getElementById('editWordCountHint');
        const unitPriceHint = document.getElementById('editUnitPriceHint');
        let unitPriceLabel = null;
        if (unitPriceInput) {
            // 尝试通过 for 属性查找
            unitPriceLabel = document.querySelector('label[for="editUnitPrice"]');
            // 如果没找到，尝试查找父级 form-group 中的 label
            if (!unitPriceLabel) {
                const formGroup = unitPriceInput.closest('.form-group');
                if (formGroup) {
                    unitPriceLabel = formGroup.querySelector('label');
                }
            }
        }
        
        // 隐藏源语种和目标语种字段（因为明细中已经有语种信息）
        if (sourceLanguageGroup) {
            sourceLanguageGroup.style.display = 'none';
        }
        if (targetLanguagesGroup) {
            targetLanguagesGroup.style.display = 'none';
        }
        
        if (wordCountInput) {
            wordCountInput.value = totalWordCount;
            wordCountInput.readOnly = true;
            wordCountInput.style.background = '#f0f0f0';
        }
        if (wordCountHint) {
            wordCountHint.textContent = '字数从报价明细自动计算，请修改明细以更新字数';
            wordCountHint.style.color = '#667eea';
        }
        if (projectAmountInput) {
            projectAmountInput.value = totalAmount.toFixed(2);
            projectAmountInput.readOnly = true;
            projectAmountInput.style.background = '#f0f0f0';
            // 触发相关计算
            if (typeof calculateEditPartTimeSalesCommission === 'function') {
                calculateEditPartTimeSalesCommission();
            }
            if (typeof validateEditLayoutCost === 'function') {
                validateEditLayoutCost();
            }
        }
        // 计算平均单价：总金额 / (总字数 / 1000)
        if (unitPriceInput && totalWordCount > 0) {
            const averageUnitPrice = (totalAmount / (totalWordCount / 1000)).toFixed(2);
            unitPriceInput.value = averageUnitPrice;
            unitPriceInput.readOnly = true;
            unitPriceInput.style.background = '#f0f0f0';
            // 更新标签提示
            if (unitPriceLabel) {
                const originalText = unitPriceLabel.textContent.replace(/（.*?）/, '').trim();
                unitPriceLabel.textContent = `${originalText}（平均单价，自动计算）`;
                unitPriceLabel.style.color = '#667eea';
            }
            if (unitPriceHint) {
                unitPriceHint.textContent = '单价从报价明细自动计算为平均单价，请修改明细以更新单价';
                unitPriceHint.style.color = '#667eea';
            }
        }
    } else {
        // 如果没有明细，恢复单价字段可编辑状态，并显示目标语种字段
        const unitPriceInput = document.getElementById('editUnitPrice');
        const targetLanguagesGroup = document.getElementById('editTargetLanguagesGroup');
        const wordCountInput = document.getElementById('editWordCount');
        const projectAmountInput = document.getElementById('editProjectAmount');
        const wordCountHint = document.getElementById('editWordCountHint');
        const unitPriceHint = document.getElementById('editUnitPriceHint');
        let unitPriceLabel = null;
        if (unitPriceInput) {
            // 尝试通过 for 属性查找
            unitPriceLabel = document.querySelector('label[for="editUnitPrice"]');
            // 如果没找到，尝试查找父级 form-group 中的 label
            if (!unitPriceLabel) {
                const formGroup = unitPriceInput.closest('.form-group');
                if (formGroup) {
                    unitPriceLabel = formGroup.querySelector('label');
                }
            }
        }
        
        // 显示目标语种字段（因为没有明细，需要手动选择语种）
        if (targetLanguagesGroup) {
            targetLanguagesGroup.style.display = '';
        }
        
        if (wordCountInput) {
            wordCountInput.readOnly = false;
            wordCountInput.style.background = '';
        }
        if (wordCountHint) {
            wordCountHint.textContent = '如果填写了报价明细，字数将从明细自动计算';
            wordCountHint.style.color = '#666';
        }
        if (projectAmountInput) {
            projectAmountInput.readOnly = false;
            projectAmountInput.style.background = '';
        }
        if (unitPriceInput) {
            unitPriceInput.readOnly = false;
            unitPriceInput.style.background = '';
            // 恢复标签
            if (unitPriceLabel) {
                unitPriceLabel.textContent = unitPriceLabel.textContent.replace(/（.*?）/, '').trim();
                if (unitPriceLabel.textContent.includes('平均单价')) {
                    unitPriceLabel.textContent = '单价（每千字）';
                }
                unitPriceLabel.style.color = '';
            }
            if (unitPriceHint) {
                unitPriceHint.textContent = '如果填写了报价明细，单价将显示为平均单价（自动计算）';
                unitPriceHint.style.color = '#666';
            }
        }
    }
}

export function toggleProjectFields() {
    const biz = document.getElementById('businessType')?.value;
    const projectTypeGroup = document.getElementById('projectTypeGroup');
    const wordCountGroup = document.getElementById('wordCountGroup');
    const unitPriceGroup = document.getElementById('unitPriceGroup');

    const showTranslationFields = biz === 'translation';
    if (projectTypeGroup) projectTypeGroup.style.display = showTranslationFields ? 'block' : 'none';
    if (wordCountGroup) wordCountGroup.style.display = showTranslationFields ? 'block' : 'none';
    if (unitPriceGroup) unitPriceGroup.style.display = showTranslationFields ? 'block' : 'none';
}

export function calculateAmount() {
    const biz = document.getElementById('businessType')?.value;
    if (biz !== 'translation') return;
    const wordCount = parseFloat(document.getElementById('wordCount')?.value || 0);
    const unitPrice = parseFloat(document.getElementById('unitPrice')?.value || 0);
    const amountInput = document.getElementById('projectAmount');
    if (!amountInput) return;
    const amount = (wordCount * unitPrice) / 1000;
    amountInput.value = isNaN(amount) ? '' : amount.toFixed(2);
    calculatePartTimeSalesCommission();
    validateLayoutCost();
}

export function togglePartTimeSalesFields() {
    const checkbox = document.getElementById('partTimeSalesCheckbox');
    const fields = document.getElementById('partTimeSalesFields');
    if (checkbox && fields) {
        fields.style.display = checkbox.checked ? 'flex' : 'none';
        if (!checkbox.checked) {
            const companyReceivableInput = document.getElementById('partTimeCompanyReceivable');
            if (companyReceivableInput) companyReceivableInput.value = '';
            const preview = document.getElementById('partTimeSalesCommissionPreview');
            if (preview) preview.textContent = '当前预估佣金：--';
        } else {
            calculatePartTimeSalesCommission();
        }
    }
}

export function calculatePartTimeSalesCommission() {
    const isPartTimeSales = document.querySelector('input[name="partTimeSales.isPartTime"]')?.checked;
    const companyReceivableInput = document.getElementById('partTimeCompanyReceivable');
    const preview = document.getElementById('partTimeSalesCommissionPreview');
    if (!isPartTimeSales || !companyReceivableInput || !preview) {
        if (preview) preview.textContent = '当前预估佣金：--';
        return;
    }
    const amount = parseFloat(document.getElementById('projectAmount')?.value || 0);
    const companyReceivable = parseFloat(companyReceivableInput.value || 0);
    const taxRate = parseFloat(document.getElementById('partTimeTaxRate')?.value || 0) / 100;
    if (!amount) {
        preview.textContent = '当前预估佣金：--（请先填写项目金额）';
        return;
    }
    const receivableAmount = amount - companyReceivable;
    const taxAmount = receivableAmount * taxRate;
    const commission = receivableAmount - taxAmount;
    preview.textContent = `当前预估佣金：¥${Math.max(0, commission).toFixed(2)}`;
}

export function validateLayoutCost() {
    const partTimeLayoutEnabled = document.querySelector('input[name="partTimeLayout.isPartTime"]')?.checked;
    const layoutCostInput = document.getElementById('layoutCost');
    const validationDiv = document.getElementById('layoutCostValidation');
    if (!partTimeLayoutEnabled || !layoutCostInput || !validationDiv) return true;
    const layoutCost = parseFloat(layoutCostInput.value || 0);
    const projectAmount = parseFloat(document.getElementById('projectAmount')?.value || 0);
    if (!layoutCost || layoutCost <= 0) {
        validationDiv.innerHTML = '<span style="color: #dc2626;">请输入排版费用</span>';
        return false;
    }
    if (!projectAmount) {
        validationDiv.innerHTML = '<span style="color: #dc2626;">项目金额未填写，无法校验</span>';
        return false;
    }
    const percentage = (layoutCost / projectAmount) * 100;
    if (percentage > 5) {
        validationDiv.innerHTML = `<span style="color: #dc2626;">排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%</span>`;
        return false;
    }
    validationDiv.innerHTML = '<span style="color: #10b981;">校验通过</span>';
    return true;
}

// 用于存储创建项目时的临时成员列表
let createProjectMembers = [];

// 保存创建项目表单的状态
let createProjectFormState = null;

function saveCreateProjectFormState() {
    const form = document.getElementById('createProjectForm');
    if (!form) return;
    
    const formData = new FormData(form);
    createProjectFormState = {};
    
    // 保存所有表单字段
    for (const [key, value] of formData.entries()) {
        createProjectFormState[key] = value;
    }
    
    // 保存复选框状态
    form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        createProjectFormState[checkbox.name] = checkbox.checked;
    });
    
    // 保存目标语言
    const targetLanguages = [];
    form.querySelectorAll('.target-language-select').forEach(select => {
        if (select.value) targetLanguages.push(select.value);
    });
    createProjectFormState._targetLanguages = targetLanguages;
    
    // 保存成员列表（已经在 createProjectMembers 中）
    createProjectFormState._members = [...createProjectMembers];
}

function restoreCreateProjectFormState() {
    if (!createProjectFormState) return;
    
    const form = document.getElementById('createProjectForm');
    if (!form) {
        console.warn('表单不存在，无法恢复状态');
        return;
    }
    
    console.log('恢复表单状态:', createProjectFormState);
    
    // 恢复表单字段
    Object.keys(createProjectFormState).forEach(key => {
        if (key.startsWith('_')) return; // 跳过内部状态
        
        // 处理嵌套字段（如 specialRequirements.xxx）
        const selector = `[name="${key}"]`;
        const element = form.querySelector(selector);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = createProjectFormState[key] === true || createProjectFormState[key] === 'true';
            } else if (element.tagName === 'TEXTAREA') {
                element.value = createProjectFormState[key] || '';
            } else if (element.tagName === 'SELECT') {
                element.value = createProjectFormState[key] || '';
            } else {
                element.value = createProjectFormState[key] || '';
            }
        }
    });
    
    // 恢复目标语言
    if (createProjectFormState._targetLanguages && createProjectFormState._targetLanguages.length > 0) {
        const container = document.getElementById('targetLanguagesContainer');
        if (container) {
            container.innerHTML = '';
            // 先创建所有行
            createProjectFormState._targetLanguages.forEach(() => {
                addTargetLanguageRow();
            });
            // 然后一次性设置所有值
            setTimeout(() => {
                const selects = container.querySelectorAll('.target-language-select');
                createProjectFormState._targetLanguages.forEach((lang, index) => {
                    if (selects[index]) {
                        selects[index].value = lang;
                    }
                });
            }, 50);
        }
    } else {
        // 如果没有保存的目标语言，添加一个默认行
        addTargetLanguageRow();
    }
    
    // 恢复成员列表
    if (createProjectFormState._members) {
        createProjectMembers = [...createProjectFormState._members];
        updateCreateProjectMembersList();
    }
    
    // 触发相关计算和UI更新
    setTimeout(() => {
        calculateAmount();
        toggleProjectFields();
        // 触发客户信息更新（如果有选择客户）
        const customerSelect = document.getElementById('projectCustomerSelect');
        if (customerSelect && customerSelect.value) {
            updateCustomerInfo();
        }
    }, 50);
}

export async function showCreateProjectModal() {
    console.log('showCreateProjectModal called');
    
    // 如果没有保存的状态，重置成员列表
    if (!createProjectFormState) {
        createProjectMembers = [];
    }
    
    if ((state.allCustomers || []).length === 0) {
        await loadCustomers();
    }
    if ((state.allUsers || []).length === 0) {
        try {
            const res = await apiFetch('/users');
            const data = await res.json();
            if (data.success) state.allUsers = data.data;
        } catch (err) {
            console.error('加载用户列表失败:', err);
        }
    }
    if ((state.languagesCache || []).length === 0) {
        await loadLanguages();
    }

    const languageOptions = (state.languagesCache || [])
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}">${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isPartTimeSalesRole = currentRole === 'part_time_sales';
    const isSalesRole = currentRole === 'sales';

    const content = `
        <form id="createProjectForm" data-submit="createProject(event)" novalidate>
            <div class="form-group">
                <label>项目编号（留空自动生成）</label>
                <input type="text" name="projectNumber" placeholder="留空将自动生成项目编号">
            </div>
            <div class="form-group">
                <label>项目名称 *</label>
                <input type="text" name="projectName" required>
            </div>
            <div class="form-group">
                <label>选择客户 *</label>
                <select name="customerId" id="projectCustomerSelect" required data-change="updateCustomerInfo()">
                    <option value="">请选择客户</option>
                    ${(state.allCustomers || []).filter(c => c.isActive).map(c => 
                        `<option value="${c._id}">${c.name}${c.shortName ? ' (' + c.shortName + ')' : ''}</option>`
                    ).join('')}
                </select>
                <button type="button" class="btn-small" data-click="showCreateCustomerModalFromProject()" style="margin-top: 5px;">创建新客户</button>
            </div>
            <div class="form-group" id="projectContactGroup" style="display: none;">
                <label>选择联系人</label>
                <select name="contactId" id="projectContactSelect">
                    <option value="">请选择联系人（可选）</option>
                </select>
            </div>
            <div class="form-group">
                <label>业务类型 *</label>
                <select name="businessType" id="businessType" required data-change="toggleProjectFields()">
                    <option value="translation">笔译</option>
                    <option value="interpretation">口译</option>
                    <option value="transcription">转录</option>
                    <option value="localization">本地化</option>
                    <option value="other">其他</option>
                </select>
            </div>
            <div class="form-group" id="projectTypeGroup">
                <label>项目类型（笔译项目）</label>
                <select name="projectType">
                    <option value="mtpe">MTPE</option>
                    <option value="deepedit">深度编辑</option>
                    <option value="review">审校项目</option>
                    <option value="mixed">混合类型</option>
                </select>
            </div>
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h4 style="margin: 0; font-size: 14px; color: #667eea;">报价明细（可选，精确录入）</h4>
                    <button type="button" class="btn-small" data-click="addQuotationDetailRow()" style="background: #667eea; color: white;">+ 添加明细</button>
                </div>
                <small style="color: #666; font-size: 12px; display: block; margin-bottom: 10px;">如果填写了明细，将使用明细数据生成报价单，总字数和总金额会自动计算；如果不填写明细，请手动录入项目字数和单价</small>
                <div id="quotationDetailsContainer" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px;">
                    <!-- 报价明细行将动态添加到这里 -->
                </div>
                <div id="quotationDetailsSummary" style="padding: 10px; background: #f5f5f5; border-radius: 4px; font-size: 12px; color: #666;">
                    <div>明细总字数：<span id="detailsTotalWordCount">0</span> 字</div>
                    <div>明细总金额：¥<span id="detailsTotalAmount">0.00</span></div>
                </div>
            </div>
            <div class="form-group" id="sourceLanguageGroup">
                <label>源语种 *</label>
                <select name="sourceLanguage" id="sourceLanguageSelect" required>
                    <option value="">请选择源语种</option>
                    ${languageOptions}
                </select>
                <small style="color: #666; font-size: 12px;" id="sourceLanguageHint">如果填写了报价明细，源语种将从明细自动获取，无需选择</small>
            </div>
            <div class="form-group" id="targetLanguagesGroup">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin-bottom: 0;">目标语言 *</label>
                    <button type="button" class="btn-small" data-click="addTargetLanguageRow()">+ 添加目标语种</button>
                </div>
                <div id="targetLanguagesContainer" style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- 目标语种行将动态添加到这里 -->
                </div>
                <small style="color:#666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个目标语种，支持一对多翻译</small>
                <small style="color: #666; font-size: 12px; display: block;" id="targetLanguagesHint">如果填写了报价明细，目标语种将从明细自动获取，无需选择</small>
                <div style="margin-top:8px;font-size:12px;color:#667eea;">
                    如需新增语种，请在"语种管理"中添加。
                </div>
            </div>
            <div class="form-group" id="wordCountGroup">
                <label>字数（笔译项目）</label>
                <input type="number" name="wordCount" id="wordCount" min="0" step="1" data-change="calculateAmount()">
                <small style="color: #666; font-size: 12px;" id="wordCountHint">如果填写了报价明细，字数将从明细自动计算</small>
            </div>
            <div class="form-group" id="unitPriceGroup">
                <label>单价（每千字，元）</label>
                <input type="number" name="unitPrice" id="unitPrice" min="0" step="0.01" data-change="calculateAmount(); updateQuotationDetailsSummary()">
                <small style="color: #666; font-size: 12px;" id="unitPriceHint">如果填写了报价明细，单价将显示为平均单价（自动计算）</small>
            </div>
            <div class="form-group">
                <label>项目总金额 *</label>
                <input type="number" name="projectAmount" id="projectAmount" step="0.01" min="0" required data-change="calculatePartTimeSalesCommission(); validateLayoutCost()">
                <small style="color: #666; font-size: 12px;">笔译项目：字数×单价/1000；其他项目：手动输入。如果填写了报价明细，建议使用明细总金额</small>
            </div>
            <div class="form-group">
                <label>交付时间 *</label>
                <input type="date" name="deadline" required>
            </div>
            <div class="form-group">
                <label>合同约定回款日期（协议付款日，未填默认创建日起 3 个月内）</label>
                <input type="date" name="expectedAt" id="createExpectedAt">
            </div>
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">其他信息（可选）</h4>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="isTaxIncluded">
                        是否含税
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                        <input type="checkbox" name="needInvoice">
                        需要发票
                    </label>
                </div>
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">特殊要求</h4>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    ${[
                        { name: 'terminology', label: '术语表' },
                        { name: 'nda', label: '签署保密协议' },
                        { name: 'referenceFiles', label: '参考文件' },
                        { name: 'pureTranslationDelivery', label: '仅交付译文' },
                        { name: 'bilingualDelivery', label: '双语对照交付' },
                        { name: 'printSealExpress', label: '打印盖章快递' }
                    ].map(item => `
                        <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
                            <input type="checkbox" name="specialRequirements.${item.name}">
                            ${item.label}
                        </label>
                    `).join('')}
                </div>
                <div class="form-group" style="margin-top: 10px;">
                    <label>备注</label>
                    <textarea name="specialRequirements.notes" rows="3" placeholder="补充说明（可选）"></textarea>
                </div>
            </div>

            ${isPartTimeSalesRole ? `
            <!-- 当前登录人本身是兼职销售：必须录入自己的分成信息，无需再勾选 -->
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职销售（当前角色）</h4>
                <input type="hidden" name="partTimeSales.isPartTime" value="on">
                <div id="partTimeSalesFields" style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        <div style="flex:1;min-width:220px;">
                            <label>公司应收（含税） *</label>
                            <input type="number" id="partTimeCompanyReceivable" name="partTimeSales.companyReceivable" step="0.01" min="0" required placeholder="请输入公司应收" data-change="calculatePartTimeSalesCommission()">
                        </div>
                        <div style="flex:1;min-width:220px;">
                            <label>税率(%)</label>
                            <input type="number" id="partTimeTaxRate" name="partTimeSales.taxRate" step="0.01" min="0" max="100" value="0" data-change="calculatePartTimeSalesCommission()">
                        </div>
                    </div>
                    <small style="color:#666;font-size:12px;">佣金 = 项目金额 - 公司应收 - 税费（仅用于预估分成展示，不影响项目金额）。</small>
                    <div id="partTimeSalesCommissionPreview" style="font-size:12px;color:#0369a1;margin-top:4px;">当前预估佣金：--</div>
                </div>
            </div>
            ` : (
                // 普通销售账号不允许在这里配置“兼职销售”，由管理员/PM 在需要时启用
                isSalesRole ? '' : `
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职销售</h4>
                <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                    <input type="checkbox" name="partTimeSales.isPartTime" id="partTimeSalesCheckbox" data-change="togglePartTimeSalesFields()">
                    启用兼职销售
                </label>
                <div id="partTimeSalesFields" style="display:none;flex-direction:column;gap:8px;margin-top:8px;">
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        <div style="flex:1;min-width:220px;">
                            <label>公司应收（含税）</label>
                            <input type="number" id="partTimeCompanyReceivable" name="partTimeSales.companyReceivable" step="0.01" min="0" placeholder="请输入公司应收">
                        </div>
                        <div style="flex:1;min-width:220px;">
                            <label>税率(%)</label>
                            <input type="number" id="partTimeTaxRate" name="partTimeSales.taxRate" step="0.01" min="0" max="100" value="0" data-change="calculatePartTimeSalesCommission()">
                        </div>
                    </div>
                    <small style="color:#666;font-size:12px;">佣金 = 项目金额 - 公司应收 - 税费（仅在勾选兼职销售时计算）。</small>
                    <div id="partTimeSalesCommissionPreview" style="font-size:12px;color:#0369a1;margin-top:4px;">当前预估佣金：--</div>
                </div>
            </div>
            `
            )}

            ${!(state.currentUser?.roles || []).some(r => r === 'sales' || r === 'part_time_sales') ? `
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职排版</h4>
                <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                    <input type="checkbox" name="partTimeLayout.isPartTime" data-change="validateLayoutCost()">
                    启用兼职排版
                </label>
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;">
                    <div style="flex:1;min-width:220px;">
                        <label>排版费用 *</label>
                        <input type="number" id="layoutCost" name="partTimeLayout.layoutCost" step="0.01" min="0" data-change="validateLayoutCost()">
                        <div id="layoutCostValidation" style="margin-top: 5px;"></div>
                    </div>
                    <div style="flex:1;min-width:220px;">
                        <label>排版员 *</label>
                        <select name="partTimeLayout.layoutAssignedTo">
                            <option value="">请选择排版员</option>
                            ${(state.allUsers || []).map(u => `<option value="${u._id}">${u.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <small style="color:#666;font-size:12px;">排版费用不得超过项目总金额的 5%。</small>
            </div>
            ` : ''}

            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">项目成员</h4>
                
                <!-- 添加成员表单 -->
                <div id="addMemberInlineForm" style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <div>
                            <label style="font-size: 12px; display: block; margin-bottom: 4px;">角色</label>
                            <select id="inlineCreateMemberRole" class="target-language-select" style="width: 100%; padding: 6px;" data-change="onInlineCreateMemberRoleChange()">
                                <option value="">请选择角色</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size: 12px; display: block; margin-bottom: 4px;">选择用户</label>
                            <select id="inlineCreateMemberUserId" style="width: 100%; padding: 6px;">
                                <option value="">请先选择角色</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- 翻译相关字段（仅翻译需要选择类型） -->
                    <div id="inlineCreateTranslatorTypeGroup" style="display: none; margin-bottom: 10px;">
                        <div>
                            <label style="font-size: 12px; display: block; margin-bottom: 4px;">翻译类型</label>
                            <select id="inlineCreateTranslatorType" style="width: 100%; padding: 6px;">
                                <option value="mtpe">MTPE</option>
                                <option value="deepedit">深度编辑</option>
                            </select>
                        </div>
                    </div>

                    <!-- 占比字段（翻译、审校、排版共用） -->
                    <div id="inlineCreateWordRatioGroup" style="display: none; margin-bottom: 10px;">
                        <div>
                            <label style="font-size: 12px; display: block; margin-bottom: 4px;">占比 (0-1)</label>
                            <input type="number" id="inlineCreateWordRatio" step="0.01" min="0" max="1" value="1.0" style="width: 100%; padding: 6px;">
                        </div>
                    </div>
                    
                    <!-- 排版费用字段 -->
                    <div id="inlineCreateLayoutCostGroup" style="display: none; margin-bottom: 10px;">
                        <div>
                            <label style="font-size: 12px; display: block; margin-bottom: 4px;">排版费用（元）</label>
                            <input type="number" id="inlineCreateLayoutCost" step="0.01" min="0" style="width: 100%; padding: 6px;" data-change="validateInlineCreateMemberLayoutCost()">
                            <small style="color: #666; font-size: 11px;">排版费用不能超过项目总金额的5%</small>
                            <div id="inlineCreateMemberLayoutCostValidation" style="margin-top: 4px; font-size: 11px;"></div>
                        </div>
                    </div>
                    
                    <button type="button" class="btn-small" data-click="addInlineMemberForCreate()" style="width: 100%;">+ 添加成员</button>
                </div>
                
                <!-- 已添加的成员列表 -->
                <div id="createProjectMembersList" style="min-height: 40px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
                    <p style="margin: 0; color: #999; font-size: 12px;">暂未添加成员，请在上方选择角色和用户后点击"添加成员"</p>
                </div>
            </div>

            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">项目附件（可选）</label>
                <input type="file" id="projectAttachments" multiple style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" accept="*/*">
                <small style="color: #666; font-size: 12px; display: block; margin-top: 4px;">
                    可上传多个文件，总大小不超过 15MB（Base64 编码后约为 20MB）。附件将通过邮件发送给项目成员，不会保存到服务器。
                </small>
                <div id="projectAttachmentsList" style="margin-top: 10px; font-size: 12px; color: #666;"></div>
            </div>

            <div class="form-group" style="text-align:right; margin-top: 20px; display:flex; gap:10px; justify-content:flex-end;">
                <button type="submit">创建项目</button>
                <button type="button" class="btn-secondary" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;

    showModal({ title: '创建项目', body: content });
    
    // 等待 DOM 更新后恢复状态
    setTimeout(() => {
        // 如果之前有保存的状态，恢复它
        if (createProjectFormState) {
            restoreCreateProjectFormState();
            createProjectFormState = null; // 恢复后清空
        } else {
            // 否则初始化默认值
            addTargetLanguageRow();
            updateCreateProjectMembersList();
        }
        toggleProjectFields();
        // 兼职销售角色：自动计算佣金，显示兼职销售区域
        if (isPartTimeSalesRole) {
            calculatePartTimeSalesCommission();
        }
        // 初始化内联添加成员表单
        initInlineCreateMemberForm();
        
        // 初始化创建项目时的附件上传功能
        const attachmentsInput = document.getElementById('projectAttachments');
        const attachmentsList = document.getElementById('projectAttachmentsList');
        if (attachmentsInput && attachmentsList) {
            attachmentsInput.addEventListener('change', function() {
                const files = Array.from(this.files);
                if (files.length === 0) {
                    attachmentsList.innerHTML = '';
                    return;
                }
                
                const listHtml = files.map((file, index) => {
                    const size = (file.size / 1024).toFixed(2);
                    return `<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: #f0f0f0; border-radius: 4px; margin-bottom: 4px;">
                        <span>${file.name} (${size} KB)</span>
                        <button type="button" data-click="removeProjectAttachment(${index})" style="background: #ef4444; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 11px;">移除</button>
                    </div>`;
                }).join('');
                attachmentsList.innerHTML = listHtml;
            });
        }
    }, 100);
}

// 移除项目附件
export function removeProjectAttachment(index) {
    const attachmentsInput = document.getElementById('projectAttachments');
    if (!attachmentsInput) return;
    
    const dt = new DataTransfer();
    const files = Array.from(attachmentsInput.files);
    files.forEach((file, i) => {
        if (i !== index) {
            dt.items.add(file);
        }
    });
    attachmentsInput.files = dt.files;
    
    // 触发 change 事件更新列表
    attachmentsInput.dispatchEvent(new Event('change'));
}

// 移除“添加成员”弹窗中的附件
export function removeAddMemberAttachment(index) {
    const attachmentsInput = document.getElementById('addMemberAttachments');
    if (!attachmentsInput) return;

    const dt = new DataTransfer();
    const files = Array.from(attachmentsInput.files);
    files.forEach((file, i) => {
        if (i !== index) {
            dt.items.add(file);
        }
    });
    attachmentsInput.files = dt.files;

    // 触发 change 事件更新列表
    attachmentsInput.dispatchEvent(new Event('change'));
}

// 评价相关函数（供项目详情页面调用）
window.showEvaluationModalForSales = async function(projectId, salesId, salesName) {
    await showEvaluationModal(projectId, 'pm_to_sales', salesId, 'sales', salesName);
}

window.showEvaluationModalForPM = async function(projectId, pmId, pmName) {
    await showEvaluationModal(projectId, 'executor_to_pm', pmId, 'pm', pmName);
}

window.showProjectEvaluationsList = async function(projectId) {
    await showProjectEvaluationsList(projectId);
}

export async function createProject(e) {
    e.preventDefault();
    
    console.log('[createProject] 开始处理表单提交');
    
    // 在表单提交前，如果有明细，移除源语种和目标语种的 required 属性，并填充值
    const quotationDetailsContainer = document.getElementById('quotationDetailsContainer');
    const hasQuotationDetails = quotationDetailsContainer && quotationDetailsContainer.querySelectorAll('[id^="quotation-detail-"]').length > 0;
    
    console.log('[createProject] 是否有明细:', hasQuotationDetails);
    console.log('[createProject] 明细容器:', quotationDetailsContainer);
    
    // 在函数作用域内定义这些变量，以便在多个 if 块中使用
    let sourceLanguagesSet = new Set();
    let targetLanguagesSet = new Set();
    
    if (hasQuotationDetails) {
        console.log('[createProject] 开始处理明细情况');
        const sourceLanguageSelect = document.getElementById('sourceLanguageSelect');
        const targetLanguageSelects = document.querySelectorAll('.target-language-select');
        
        // 从明细中提取源语种和目标语种
        sourceLanguagesSet = new Set();
        targetLanguagesSet = new Set();
        
        quotationDetailsContainer.querySelectorAll('[id^="quotation-detail-"]').forEach(row => {
            const sourceLangSelect = row.querySelector('.detail-source-language');
            const targetLangSelect = row.querySelector('.detail-target-language');
            if (sourceLangSelect && sourceLangSelect.value) {
                sourceLanguagesSet.add(sourceLangSelect.value);
            }
            if (targetLangSelect && targetLangSelect.value) {
                targetLanguagesSet.add(targetLangSelect.value);
            }
        });
        
        // 填充源语种 - 确保字段有值，并清除验证错误
        if (sourceLanguageSelect) {
            console.log('[createProject] 处理源语种字段');
            console.log('[createProject] 源语种字段当前值:', sourceLanguageSelect.value);
            console.log('[createProject] 源语种字段是否有 required:', sourceLanguageSelect.hasAttribute('required'));
            console.log('[createProject] 源语种字段是否有效:', sourceLanguageSelect.validity.valid);
            console.log('[createProject] 源语种字段验证消息:', sourceLanguageSelect.validationMessage);
            
            // 先确保字段可见
            const sourceLanguageGroup = document.getElementById('sourceLanguageGroup');
            if (sourceLanguageGroup) {
                console.log('[createProject] 显示源语种组');
                sourceLanguageGroup.style.display = '';
            }
            
            if (sourceLanguagesSet.size > 0) {
                const sourceLangValue = Array.from(sourceLanguagesSet)[0];
                console.log('[createProject] 设置源语种值:', sourceLangValue);
                sourceLanguageSelect.value = sourceLangValue;
            }
            
            console.log('[createProject] 移除 required 属性');
            sourceLanguageSelect.removeAttribute('required');
            
            console.log('[createProject] 清除验证错误');
            sourceLanguageSelect.setCustomValidity('');
            
            console.log('[createProject] 触发验证');
            const isValid = sourceLanguageSelect.checkValidity();
            console.log('[createProject] 验证后是否有效:', isValid);
            console.log('[createProject] 验证后验证消息:', sourceLanguageSelect.validationMessage);
        } else {
            console.log('[createProject] 源语种字段不存在');
        }
        
        // 填充目标语种 - 确保有足够的选择框并填充所有语种
        if (targetLanguagesSet.size > 0) {
            const targetLanguagesArray = Array.from(targetLanguagesSet);
            const container = document.getElementById('targetLanguagesContainer');
            
            // 如果选择框不够，动态添加
            let currentSelects = Array.from(document.querySelectorAll('.target-language-select'));
            while (currentSelects.length < targetLanguagesArray.length && container) {
                addTargetLanguageRow();
                // 重新获取选择框列表
                currentSelects = Array.from(document.querySelectorAll('.target-language-select'));
                if (currentSelects.length >= targetLanguagesArray.length) break;
            }
            
            // 确保目标语种容器可见
            const targetLanguagesGroup = document.getElementById('targetLanguagesGroup');
            if (targetLanguagesGroup) {
                targetLanguagesGroup.style.display = '';
            }
            
            // 重新获取最新的选择框列表并填充值
            const allTargetSelects = Array.from(document.querySelectorAll('.target-language-select'));
            targetLanguagesArray.forEach((lang, index) => {
                if (allTargetSelects[index]) {
                    allTargetSelects[index].value = lang;
                    allTargetSelects[index].removeAttribute('required');
                    // 清除任何验证错误
                    allTargetSelects[index].setCustomValidity('');
                    // 触发验证以清除错误
                    allTargetSelects[index].checkValidity();
                }
            });
            
            // 移除所有选择框的 required 属性并清除验证错误
            allTargetSelects.forEach(select => {
                select.removeAttribute('required');
                select.setCustomValidity('');
                select.checkValidity();
            });
        } else {
            targetLanguageSelects.forEach(select => {
                select.removeAttribute('required');
            });
        }
    }
    
    // 在获取 FormData 之前，确保表单验证通过
    const form = e.target;
    console.log('[createProject] 开始表单验证检查');
    
    // 如果有明细，确保源语种和目标语种字段组可见并清除验证错误
    if (hasQuotationDetails) {
        console.log('[createProject] 明细情况：确保字段组可见');
        
        // 重新提取源语种和目标语种（确保数据是最新的）
        sourceLanguagesSet = new Set();
        targetLanguagesSet = new Set();
        quotationDetailsContainer.querySelectorAll('[id^="quotation-detail-"]').forEach(row => {
            const sourceLangSelect = row.querySelector('.detail-source-language');
            const targetLangSelect = row.querySelector('.detail-target-language');
            if (sourceLangSelect && sourceLangSelect.value) {
                sourceLanguagesSet.add(sourceLangSelect.value);
            }
            if (targetLangSelect && targetLangSelect.value) {
                targetLanguagesSet.add(targetLangSelect.value);
            }
        });
        
        const sourceLanguageGroup = document.getElementById('sourceLanguageGroup');
        const targetLanguagesGroup = document.getElementById('targetLanguagesGroup');
        const sourceLanguageSelect = document.getElementById('sourceLanguageSelect');
        const targetLanguageSelects = document.querySelectorAll('.target-language-select');
        
        console.log('[createProject] 源语种组:', sourceLanguageGroup);
        console.log('[createProject] 目标语种组:', targetLanguagesGroup);
        console.log('[createProject] 源语种选择框:', sourceLanguageSelect);
        console.log('[createProject] 目标语种选择框数量:', targetLanguageSelects.length);
        console.log('[createProject] 提取的源语种:', Array.from(sourceLanguagesSet));
        console.log('[createProject] 提取的目标语种:', Array.from(targetLanguagesSet));
        
        // 临时显示字段组
        if (sourceLanguageGroup) {
            console.log('[createProject] 显示源语种组');
            sourceLanguageGroup.style.display = '';
        }
        if (targetLanguagesGroup) {
            console.log('[createProject] 显示目标语种组');
            targetLanguagesGroup.style.display = '';
        }
        
        // 确保字段有值并清除验证错误
        if (sourceLanguageSelect) {
            console.log('[createProject] 源语种字段当前值:', sourceLanguageSelect.value);
            console.log('[createProject] 源语种字段是否有 required:', sourceLanguageSelect.hasAttribute('required'));
            if (!sourceLanguageSelect.value && sourceLanguagesSet.size > 0) {
                const sourceLangValue = Array.from(sourceLanguagesSet)[0];
                console.log('[createProject] 设置源语种值:', sourceLangValue);
                sourceLanguageSelect.value = sourceLangValue;
            }
            sourceLanguageSelect.removeAttribute('required');
            sourceLanguageSelect.setCustomValidity('');
            const sourceValid = sourceLanguageSelect.checkValidity();
            console.log('[createProject] 源语种字段验证结果:', sourceValid, sourceLanguageSelect.validationMessage);
        }
        
        targetLanguageSelects.forEach((select, index) => {
            console.log(`[createProject] 处理目标语种选择框 ${index}:`, select.value, select.hasAttribute('required'));
            if (targetLanguagesSet.size > 0 && index < targetLanguagesSet.size) {
                const lang = Array.from(targetLanguagesSet)[index];
                if (!select.value) {
                    console.log(`[createProject] 设置目标语种 ${index} 值:`, lang);
                    select.value = lang;
                }
            }
            select.removeAttribute('required');
            select.setCustomValidity('');
            const targetValid = select.checkValidity();
            console.log(`[createProject] 目标语种 ${index} 验证结果:`, targetValid, select.validationMessage);
        });
    }
    
    // 检查表单验证
    console.log('[createProject] 检查表单整体验证');
    const formValid = form.checkValidity();
    console.log('[createProject] 表单验证结果:', formValid);
    
    if (!formValid) {
        console.log('[createProject] 表单验证失败，查找无效字段');
        // 如果表单验证失败，尝试清除所有验证错误
        const invalidFields = form.querySelectorAll(':invalid');
        console.log('[createProject] 无效字段数量:', invalidFields.length);
        invalidFields.forEach((field, index) => {
            console.log(`[createProject] 无效字段 ${index}:`, field.id, field.name, field.tagName, field.validationMessage);
            if (field.id === 'sourceLanguageSelect' || field.classList.contains('target-language-select')) {
                console.log(`[createProject] 清除字段 ${field.id || field.name} 的验证错误`);
                field.setCustomValidity('');
                const fieldValid = field.checkValidity();
                console.log(`[createProject] 字段 ${field.id || field.name} 验证结果:`, fieldValid, field.validationMessage);
            }
        });
        // 再次检查
        const formValidAfter = form.checkValidity();
        console.log('[createProject] 清除错误后表单验证结果:', formValidAfter);
        if (!formValidAfter) {
            console.log('[createProject] 表单验证仍然失败，显示验证错误');
            // 如果仍然失败，可能是其他字段的问题，显示验证错误
            form.reportValidity();
            return;
        }
    }
    
    console.log('[createProject] 表单验证通过，继续处理');
    
    // 清空保存的表单状态
    createProjectFormState = null;
    const formData = new FormData(e.target);
    
    // 使用临时成员列表
    const members = createProjectMembers.map(m => {
        const member = {
            userId: m.userId,
            role: m.role
        };
        if (m.role === 'translator') {
            member.translatorType = m.translatorType || 'mtpe';
            member.wordRatio = m.wordRatio || 1.0;
        } else if (m.role === 'reviewer' || m.role === 'layout') {
            // 审校与排版也支持占比
            member.wordRatio = m.wordRatio || 1.0;
        }
        if (m.role === 'layout' && m.layoutCost) {
            member.layoutCost = m.layoutCost;
        }
        return member;
    });
    
    // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许
    
    const specialRequirements = {
        terminology: formData.get('specialRequirements.terminology') === 'on',
        nda: formData.get('specialRequirements.nda') === 'on',
        referenceFiles: formData.get('specialRequirements.referenceFiles') === 'on',
        pureTranslationDelivery: formData.get('specialRequirements.pureTranslationDelivery') === 'on',
        bilingualDelivery: formData.get('specialRequirements.bilingualDelivery') === 'on',
        printSealExpress: formData.get('specialRequirements.printSealExpress') === 'on',
        notes: formData.get('specialRequirements.notes') || undefined
    };
    
    // 检查是否有报价明细（使用之前已声明的 hasQuotationDetails 和 quotationDetailsContainer）
    let sourceLanguage, targetLanguages;
    
    if (hasQuotationDetails) {
        // 如果有明细，从明细中提取源语种和目标语种
        const sourceLanguagesSet = new Set();
        const targetLanguagesSet = new Set();
        
        quotationDetailsContainer.querySelectorAll('[id^="quotation-detail-"]').forEach(row => {
            const sourceLangSelect = row.querySelector('.detail-source-language');
            const targetLangSelect = row.querySelector('.detail-target-language');
            if (sourceLangSelect && sourceLangSelect.value) {
                sourceLanguagesSet.add(sourceLangSelect.value);
            }
            if (targetLangSelect && targetLangSelect.value) {
                targetLanguagesSet.add(targetLangSelect.value);
            }
        });
        
        if (sourceLanguagesSet.size === 0) {
            alert('请至少填写一个报价明细的源语种');
            return;
        }
        if (targetLanguagesSet.size === 0) {
            alert('请至少填写一个报价明细的目标语种');
            return;
        }
        
        sourceLanguage = Array.from(sourceLanguagesSet)[0]; // 使用第一个源语种
        targetLanguages = Array.from(targetLanguagesSet);
    } else {
        // 如果没有明细，从表单中获取
        sourceLanguage = formData.get('sourceLanguage');
        const targetLanguageRows = document.querySelectorAll('.target-language-select');
        targetLanguages = Array.from(targetLanguageRows)
            .map(select => select.value)
            .filter(value => value && value.trim() !== '');
        
        if (!sourceLanguage) {
            alert('请选择源语种');
            return;
        }
        if (targetLanguages.length === 0) {
            alert('请至少添加并选择一个目标语种');
            return;
        }
    }

    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isPartTimeSalesRole = currentRole === 'part_time_sales';
    const isSalesRole = currentRole === 'sales';
    const partTimeSalesEnabled = isPartTimeSalesRole ? true : isSalesRole ? false : formData.get('partTimeSales.isPartTime') === 'on';
    
    // 兼职销售创建项目时，验证必填字段
    if (isPartTimeSalesRole) {
        const companyReceivable = parseFloat(formData.get('partTimeSales.companyReceivable') || 0);
        const projectAmount = parseFloat(formData.get('projectAmount') || 0);
        
        if (!companyReceivable || companyReceivable <= 0) {
            showToast('请填写公司应收金额', 'error');
            return;
        }
        
        if (companyReceivable > projectAmount) {
            showToast('公司应收金额不能大于项目总金额', 'error');
            return;
        }
    }
    
    const partTimeSales = partTimeSalesEnabled ? {
        isPartTime: true,
        companyReceivable: parseFloat(formData.get('partTimeSales.companyReceivable') || 0),
        taxRate: parseFloat(formData.get('partTimeSales.taxRate') || 0) / 100
    } : undefined;
    
    const partTimeLayoutEnabled = formData.get('partTimeLayout.isPartTime') === 'on';
    const layoutCost = parseFloat(formData.get('partTimeLayout.layoutCost') || 0);
    const layoutAssignedTo = formData.get('partTimeLayout.layoutAssignedTo');
    
    if (partTimeLayoutEnabled && layoutCost > 0) {
        const projectAmount = parseFloat(formData.get('projectAmount'));
        const percentage = (layoutCost / projectAmount) * 100;
        if (percentage > 5) {
            alert(`排版费用(${layoutCost})不能超过项目总金额(${projectAmount})的5%，当前占比为${percentage.toFixed(2)}%`);
            return;
        }
        if (!layoutAssignedTo) {
            alert('请选择排版员');
            return;
        }
    }
    
    const partTimeLayout = partTimeLayoutEnabled ? {
        isPartTime: true,
        layoutCost: layoutCost,
        layoutAssignedTo: layoutAssignedTo || undefined
    } : undefined;
    
    const expectedAtInput = formData.get('expectedAt');
    const defaultExpected = new Date();
    defaultExpected.setMonth(defaultExpected.getMonth() + 3);
    
    // 获取选中的联系人信息
    const contactIdStr = formData.get('contactId');
    let contactId = contactIdStr ? parseInt(contactIdStr) : null;
    let contactInfo = null;
    
    if (contactId !== null && contactId !== undefined && !isNaN(contactId)) {
        const customerId = formData.get('customerId');
        const customer = state.allCustomers.find(c => c._id === customerId);
        if (customer) {
            const contacts = customer.contacts && customer.contacts.length > 0 
                ? customer.contacts 
                : (customer.contactPerson ? [{
                    name: customer.contactPerson || '',
                    phone: customer.phone || '',
                    email: customer.email || '',
                    position: '',
                    isPrimary: true
                }] : []);
            
            if (contacts[contactId]) {
                contactInfo = {
                    name: contacts[contactId].name || '',
                    phone: contacts[contactId].phone || '',
                    email: contacts[contactId].email || '',
                    position: contacts[contactId].position || ''
                };
            }
        }
    }
    
    // 处理附件：将文件转换为 base64
    // 注意：Base64 编码会使文件大小增加约 33%，所以前端限制需要更小
    // 建议限制为 15MB，Base64 编码后约为 20MB，加上其他数据总大小约 25-30MB
    const attachmentsInput = document.getElementById('projectAttachments');
    let attachments = null;
    if (attachmentsInput && attachmentsInput.files && attachmentsInput.files.length > 0) {
        const files = Array.from(attachmentsInput.files);
        const maxSize = 15 * 1024 * 1024; // 15MB（Base64 编码后约 20MB）
        let totalSize = 0;
        
        // 检查文件大小
        for (const file of files) {
            totalSize += file.size;
            if (file.size > maxSize) {
                showToast(`文件 "${file.name}" 超过 15MB 限制（Base64 编码后约为 20MB）`, 'error');
                return;
            }
        }
        if (totalSize > maxSize) {
            showToast(`所有附件总大小不超过 15MB 限制（Base64 编码后约为 20MB）`, 'error');
            return;
        }
        
        // 转换为 base64
        try {
            const attachmentPromises = files.map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const base64 = reader.result.split(',')[1]; // 移除 data:type;base64, 前缀
                        resolve({
                            filename: file.name,
                            content: base64
                        });
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            });
            attachments = await Promise.all(attachmentPromises);
        } catch (error) {
            console.error('读取附件失败:', error);
            showToast('读取附件失败，请重试', 'error');
            return;
        }
    }

    const data = {
        projectNumber: formData.get('projectNumber') || undefined,
        projectName: formData.get('projectName'),
        contactId: contactId,
        contactInfo: contactInfo,
        customerId: formData.get('customerId'),
        businessType: formData.get('businessType'),
        projectType: formData.get('projectType') || undefined,
        sourceLanguage: sourceLanguage,
        targetLanguages: targetLanguages,
        wordCount: formData.get('wordCount') ? parseFloat(formData.get('wordCount')) : undefined,
        unitPrice: formData.get('unitPrice') ? parseFloat(formData.get('unitPrice')) : undefined,
        projectAmount: parseFloat(formData.get('projectAmount')),
        deadline: formData.get('deadline'),
        expectedAt: expectedAtInput || defaultExpected.toISOString().slice(0,10),
        isTaxIncluded: formData.get('isTaxIncluded') === 'on',
        needInvoice: formData.get('needInvoice') === 'on',
        specialRequirements: Object.keys(specialRequirements).some(k => specialRequirements[k]) ? specialRequirements : undefined,
        members: members.length > 0 ? members : undefined,
        partTimeSales: partTimeSales,
        partTimeLayout: partTimeLayout,
        attachments: attachments
    };

    // 收集报价明细
    const detailsContainer = document.getElementById('quotationDetailsContainer');
    if (detailsContainer) {
        const quotationDetails = [];
        const detailRows = detailsContainer.querySelectorAll('[id^="quotation-detail-"]');
        detailRows.forEach(row => {
            const filename = row.querySelector('.detail-filename')?.value?.trim();
            const sourceLanguage = row.querySelector('.detail-source-language')?.value?.trim();
            const targetLanguage = row.querySelector('.detail-target-language')?.value?.trim();
            const wordCount = parseFloat(row.querySelector('.detail-word-count')?.value) || 0;
            const unitPrice = parseFloat(row.querySelector('.detail-unit-price')?.value) || 0;
            const amount = parseFloat(row.querySelector('.detail-amount')?.value) || 0;
            
            if (filename && sourceLanguage && targetLanguage && wordCount > 0 && unitPrice > 0) {
                quotationDetails.push({
                    filename,
                    sourceLanguage,
                    targetLanguage,
                    wordCount,
                    unitPrice,
                    amount
                });
            }
        });
        if (quotationDetails.length > 0) {
            data.quotationDetails = quotationDetails;
        }
    }

    // 计算请求体大小（用于调试）
    const requestBody = JSON.stringify(data);
    const requestBodySize = new Blob([requestBody]).size;
    const requestBodySizeMB = (requestBodySize / (1024 * 1024)).toFixed(2);
    console.log('[createProject] 请求体大小:', requestBodySizeMB, 'MB');
    console.log('[createProject] 附件数量:', attachments ? attachments.length : 0);
    if (attachments && attachments.length > 0) {
        attachments.forEach((att, index) => {
            const attSize = (att.content.length * 3 / 4) / (1024 * 1024); // Base64 解码后大小
            console.log(`[createProject] 附件 ${index + 1} (${att.filename}): ${attSize.toFixed(2)} MB (Base64: ${(att.content.length / (1024 * 1024)).toFixed(2)} MB)`);
        });
    }
    console.log('[createProject] 报价明细数量:', data.quotationDetails ? data.quotationDetails.length : 0);

    try {
        const response = await apiFetch('/projects/create', {
            method: 'POST',
            body: requestBody
        });

        // 检查响应状态
        if (response.status === 413) {
            console.error('[createProject] 413 错误 - 请求体大小:', requestBodySizeMB, 'MB');
            showToast(`请求数据过大 (${requestBodySizeMB}MB)。请减少附件大小或联系管理员检查服务器配置（Nginx client_max_body_size）。`, 'error');
            return;
        }

        // 尝试解析 JSON 响应
        let result;
        try {
            const text = await response.text();
            if (!text) {
                throw new Error('服务器返回空响应');
            }
            result = JSON.parse(text);
        } catch (parseError) {
            // 如果不是 JSON 响应，可能是错误页面或纯文本错误
            console.error('[createProject] 响应解析失败:', parseError);
            console.error('[createProject] 响应状态:', response.status);
            console.error('[createProject] 响应文本前500字符:', text.substring(0, 500));
            if (response.status >= 400) {
                showToast(`创建失败: 服务器错误 (${response.status})。请求体大小: ${requestBodySizeMB}MB。如果包含附件，可能是文件过大或服务器配置限制。`, 'error');
            } else {
                showToast('创建失败: 服务器响应格式错误', 'error');
            }
            return;
        }
        
        if (result.success) {
            closeModal();
            loadProjects();
            showToast('项目创建成功' + (members.length > 0 ? `，已添加 ${members.length} 名成员` : ''), 'success');
        } else {
            showToast(result.message || '创建失败', 'error');
        }
    } catch (error) {
        // 处理 413 错误
        if (error.status === 413 || error.message.includes('413')) {
            showToast('附件文件过大，请减少文件大小或数量。建议单个文件不超过 10MB，总大小不超过 15MB。', 'error');
        } else {
            showToast('创建失败: ' + (error.message || '未知错误'), 'error');
        }
    }
}

export async function deleteProject(projectId) {
    if (!confirm('确认删除该项目？该操作不可撤销。')) return;
    try {
        const res = await apiFetch(`/projects/${projectId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('项目已删除', 'success');
            loadProjects();
        } else {
            showToast(data.message || '删除失败', 'error');
        }
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

export function addEditTargetLanguageRow(selectedValue = '') {
    if ((state.languagesCache || []).length === 0) {
        showToast('请先等待语种列表加载完成', 'error');
        return;
    }
    targetLanguageRowIndex++;
    const container = document.getElementById('editTargetLanguagesContainer');
    if (!container) return;
    const languageOptions = (state.languagesCache || [])
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}" ${selectedValue === lang.name ? 'selected' : ''}>${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    const row = document.createElement('div');
    row.className = 'target-language-row';
    row.id = `targetLanguageRow${targetLanguageRowIndex}`;
    row.style.cssText = 'display: flex; gap: 10px; align-items: flex-end; padding: 8px; background: #f8f9fa; border-radius: 4px;';
    const rowNumber = container.querySelectorAll('.target-language-row').length + 1;
    row.innerHTML = `
        <div style="flex: 1;">
            <label style="font-size: 12px; display: block; margin-bottom: 4px;">目标语种 ${rowNumber}</label>
            <select class="target-language-select" required style="width: 100%; padding: 6px;">
                <option value="">请选择目标语种</option>
                ${languageOptions}
            </select>
        </div>
        <div style="flex: 0 0 auto;">
            <button type="button" class="btn-small btn-danger" data-click="removeEditTargetLanguageRow('targetLanguageRow${targetLanguageRowIndex}')" style="margin-bottom: 0;">删除</button>
        </div>
    `;
    container.appendChild(row);
}

export function removeEditTargetLanguageRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        const container = document.getElementById('editTargetLanguagesContainer');
        if (container) {
            container.querySelectorAll('.target-language-row').forEach((r, index) => {
                const label = r.querySelector('label');
                if (label) label.textContent = `目标语种 ${index + 1}`;
            });
        }
    }
}

export function toggleEditPartTimeSalesFields() {
    const enabled = document.getElementById('editPartTimeSalesEnabled')?.checked;
    const fields = document.getElementById('editPartTimeSalesFields');
    if (fields) {
        fields.style.display = enabled ? 'block' : 'none';
        if (enabled) calculateEditPartTimeSalesCommission();
    }
}

export function calculateEditPartTimeSalesCommission() {
    const enabled = document.getElementById('editPartTimeSalesEnabled')?.checked;
    if (!enabled) {
        const display = document.getElementById('editPartTimeSalesCommissionDisplay');
        if (display) display.textContent = '¥0.00';
        return;
    }
    const totalAmount = parseFloat(document.querySelector('#editProjectForm [name="projectAmount"]')?.value || 0);
    const companyReceivable = parseFloat(document.getElementById('editCompanyReceivable')?.value || 0);
    const taxRatePercent = parseFloat(document.getElementById('editTaxRate')?.value || 0);
    const taxRate = taxRatePercent / 100;
    if (totalAmount <= 0) {
        const display = document.getElementById('editPartTimeSalesCommissionDisplay');
        if (display) display.textContent = '¥0.00';
        return;
    }
    const receivableAmount = totalAmount - companyReceivable;
    const taxAmount = receivableAmount * taxRate;
    const commission = receivableAmount - taxAmount;
    const finalCommission = Math.max(0, Math.round(commission * 100) / 100);
    const display = document.getElementById('editPartTimeSalesCommissionDisplay');
    if (display) {
        display.textContent = `¥${finalCommission.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

export function toggleEditPartTimeLayoutFields() {
    const enabled = document.getElementById('editPartTimeLayoutEnabled')?.checked;
    const fields = document.getElementById('editPartTimeLayoutFields');
    if (fields) {
        fields.style.display = enabled ? 'block' : 'none';
        if (enabled) validateEditLayoutCost();
    }
}

export function validateEditLayoutCost() {
    const enabled = document.getElementById('editPartTimeLayoutEnabled')?.checked;
    if (!enabled) {
        const display = document.getElementById('editLayoutCostPercentageDisplay');
        const validation = document.getElementById('editLayoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '';
        return;
    }
    const projectAmount = parseFloat(document.querySelector('#editProjectForm [name="projectAmount"]')?.value || 0);
    const layoutCost = parseFloat(document.getElementById('editLayoutCost')?.value || 0);
    if (projectAmount <= 0) {
        const display = document.getElementById('editLayoutCostPercentageDisplay');
        const validation = document.getElementById('editLayoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '<small style="color: #999;">请输入项目总金额</small>';
        return;
    }
    if (layoutCost <= 0) {
        const display = document.getElementById('editLayoutCostPercentageDisplay');
        const validation = document.getElementById('editLayoutCostValidation');
        if (display) display.textContent = '0%';
        if (validation) validation.innerHTML = '';
        return;
    }
    const percentage = (layoutCost / projectAmount) * 100;
    const roundedPercentage = Math.round(percentage * 100) / 100;
    const display = document.getElementById('editLayoutCostPercentageDisplay');
    const validation = document.getElementById('editLayoutCostValidation');
    if (display) {
        display.textContent = `${roundedPercentage}%`;
        display.style.color = roundedPercentage > 5 ? '#dc2626' : '#0369a1';
    }
    if (validation) {
        if (roundedPercentage > 5) {
            validation.innerHTML = `<small style="color: #dc2626; font-weight: 600;">⚠️ 排版费用超过项目总金额的5%，请调整费用</small>`;
        } else if (roundedPercentage > 4.5) {
            validation.innerHTML = `<small style="color: #f59e0b;">⚠️ 接近5%限制，请注意</small>`;
        } else {
            validation.innerHTML = `<small style="color: #059669;">✓ 费用在允许范围内</small>`;
        }
    }
}

export async function showEditProjectModal() {
    const p = currentProjectDetail;
    if (!p) return;
    if ((state.languagesCache || []).length === 0) {
        await loadLanguages();
    }
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isAdmin = currentRole === 'admin';
    const isPM = currentRole === 'pm';
    const isSales = currentRole === 'sales';
    const isPartTimeSales = currentRole === 'part_time_sales';
    // 销售创建的项目，销售可以管理成员；管理员和项目经理可以管理所有项目的成员
    const canManageMembers = isAdmin || isPM || (isSales || isPartTimeSales) && p.createdBy?._id === state.currentUser?._id;
    const targetLanguagesArray = Array.isArray(p.targetLanguages) ? p.targetLanguages : (p.targetLanguages ? [p.targetLanguages] : []);
    const sourceLanguageOptions = (state.languagesCache || [])
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}" ${p.sourceLanguage === lang.name ? 'selected' : ''}>${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    const content = `
        <form id="editProjectForm" data-submit="updateProject(event, '${p._id}')" novalidate>
            <div class="form-group">
                <label>项目名称 *</label>
                <input type="text" name="projectName" value="${p.projectName || ''}" required>
            </div>
            <div class="form-group">
                <label>业务类型</label>
                <select name="businessType">
                    <option value="translation" ${p.businessType === 'translation' ? 'selected' : ''}>笔译</option>
                    <option value="interpretation" ${p.businessType === 'interpretation' ? 'selected' : ''}>口译</option>
                    <option value="transcription" ${p.businessType === 'transcription' ? 'selected' : ''}>转录</option>
                    <option value="localization" ${p.businessType === 'localization' ? 'selected' : ''}>本地化</option>
                    <option value="other" ${p.businessType === 'other' ? 'selected' : ''}>其他</option>
                </select>
            </div>
            <div class="form-group">
                <label>项目类型</label>
                <select name="projectType">
                    <option value="mtpe" ${p.projectType === 'mtpe' ? 'selected' : ''}>MTPE</option>
                    <option value="deepedit" ${p.projectType === 'deepedit' ? 'selected' : ''}>深度编辑</option>
                    <option value="review" ${p.projectType === 'review' ? 'selected' : ''}>审校项目</option>
                    <option value="mixed" ${p.projectType === 'mixed' ? 'selected' : ''}>混合类型</option>
                </select>
            </div>
            ${canViewProjectAmount() ? `
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h4 style="margin: 0; font-size: 14px; color: #667eea;">报价明细（可选，精确录入）</h4>
                    <button type="button" class="btn-small" data-click="addEditQuotationDetailRow()" style="background: #667eea; color: white;">+ 添加明细</button>
                </div>
                <small style="color: #666; font-size: 12px; display: block; margin-bottom: 10px;">如果填写了明细，将使用明细数据生成报价单，总字数和总金额会自动计算；如果不填写明细，请手动录入项目字数和单价</small>
                <div id="editQuotationDetailsContainer" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px;">
                    <!-- 报价明细行将动态添加到这里 -->
                </div>
                <div id="editQuotationDetailsSummary" style="padding: 10px; background: #f5f5f5; border-radius: 4px; font-size: 12px; color: #666;">
                    <div>明细总字数：<span id="editDetailsTotalWordCount">0</span> 字</div>
                    <div>明细总金额：¥<span id="editDetailsTotalAmount">0.00</span></div>
                </div>
            </div>
            <div class="form-group" id="editSourceLanguageGroup">
                <label>源语种 *</label>
                <select name="sourceLanguage" id="editSourceLanguageSelect" required>
                    <option value="">请选择源语种</option>
                    ${sourceLanguageOptions}
                </select>
                <small style="color: #666; font-size: 12px;" id="editSourceLanguageHint">如果填写了报价明细，源语种将从明细自动获取，无需选择</small>
            </div>
            <div class="form-group" id="editTargetLanguagesGroup">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin-bottom: 0;">目标语言 *</label>
                    <button type="button" class="btn-small" data-click="addEditTargetLanguageRow()">+ 添加目标语种</button>
                </div>
                <div id="editTargetLanguagesContainer" style="display: flex; flex-direction: column; gap: 8px;"></div>
                <small style="color:#666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个目标语种，支持一对多翻译</small>
                <small style="color: #666; font-size: 12px; display: block;" id="editTargetLanguagesHint">如果填写了报价明细，目标语种将从明细自动获取，无需选择</small>
            </div>
            <div class="form-group">
                <label>字数（笔译）</label>
                <input type="number" name="wordCount" id="editWordCount" value="${p.wordCount || ''}" min="0" step="1">
                <small style="color: #666; font-size: 12px;" id="editWordCountHint">如果填写了报价明细，字数将从明细自动计算</small>
            </div>
            <div class="form-group">
                <label>单价（每千字）</label>
                <input type="number" name="unitPrice" id="editUnitPrice" value="${p.unitPrice || ''}" min="0" step="0.01" data-change="updateEditQuotationDetailsSummary()">
                <small style="color: #666; font-size: 12px;" id="editUnitPriceHint">如果填写了报价明细，单价将显示为平均单价（自动计算）</small>
            </div>
            <div class="form-group">
                <label>项目金额 *</label>
                <input type="number" name="projectAmount" id="editProjectAmount" value="${p.projectAmount || ''}" min="0" step="0.01" required onchange="calculateEditPartTimeSalesCommission(); validateEditLayoutCost();">
                <small style="color: #666; font-size: 12px;" id="editProjectAmountHint">如果填写了报价明细，金额将从明细自动计算</small>
            </div>
            ` : `
            <div class="form-group" id="editSourceLanguageGroup">
                <label>源语种 *</label>
                <select name="sourceLanguage" id="editSourceLanguageSelect" required>
                    <option value="">请选择源语种</option>
                    ${sourceLanguageOptions}
                </select>
            </div>
            <div class="form-group" id="editTargetLanguagesGroup">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin-bottom: 0;">目标语言 *</label>
                    <button type="button" class="btn-small" data-click="addEditTargetLanguageRow()">+ 添加目标语种</button>
                </div>
                <div id="editTargetLanguagesContainer" style="display: flex; flex-direction: column; gap: 8px;"></div>
                <small style="color:#666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个目标语种，支持一对多翻译</small>
            </div>
            `}
            <div class="form-group">
                <label>交付时间 *</label>
                <input type="date" name="deadline" value="${p.deadline ? new Date(p.deadline).toISOString().slice(0,10) : ''}" required>
            </div>
            <div class="form-group" style="display:flex;gap:12px;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                    <input type="checkbox" name="isTaxIncluded" ${p.isTaxIncluded ? 'checked' : ''}> 含税
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                    <input type="checkbox" name="needInvoice" ${p.needInvoice ? 'checked' : ''}> 需要发票
                </label>
            </div>
            <div class="form-group">
                <label>特殊要求</label>
                <div style="display:flex;gap:15px;flex-wrap:wrap;margin-top:5px;">
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.terminology" ${p.specialRequirements?.terminology ? 'checked' : ''}> 术语表
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.nda" ${p.specialRequirements?.nda ? 'checked' : ''}> 保密协议
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.referenceFiles" ${p.specialRequirements?.referenceFiles ? 'checked' : ''}> 参考文件
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.pureTranslationDelivery" ${p.specialRequirements?.pureTranslationDelivery ? 'checked' : ''}> 纯译文交付
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.bilingualDelivery" ${p.specialRequirements?.bilingualDelivery ? 'checked' : ''}> 对照版交付
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-weight:normal;">
                        <input type="checkbox" name="specialRequirements.printSealExpress" ${p.specialRequirements?.printSealExpress ? 'checked' : ''}> 打印盖章快递
                    </label>
                </div>
                <textarea name="specialRequirements.notes" rows="3" style="margin-top:8px;">${p.specialRequirements?.notes || ''}</textarea>
            </div>
            
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职销售（可选）</h4>
                <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" name="partTimeSales.isPartTime" id="editPartTimeSalesEnabled" ${p.partTimeSales?.isPartTime ? 'checked' : ''} onchange="toggleEditPartTimeSalesFields()">
                    启用兼职销售
                </label>
                <div id="editPartTimeSalesFields" style="display: ${p.partTimeSales?.isPartTime ? 'block' : 'none'}; padding-left: 20px; border-left: 2px solid #667eea;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>公司应收金额（元）</label>
                        <input type="number" name="partTimeSales.companyReceivable" id="editCompanyReceivable" step="0.01" min="0" value="${p.partTimeSales?.companyReceivable || 0}" onchange="calculateEditPartTimeSalesCommission()" style="width: 100%;">
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>税率（%）</label>
                        <input type="number" name="partTimeSales.taxRate" id="editTaxRate" step="0.01" min="0" max="100" value="${(p.partTimeSales?.taxRate || 0) * 100}" onchange="calculateEditPartTimeSalesCommission()" style="width: 100%;">
                        <small style="color: #666; font-size: 12px;">例如：10 表示 10%</small>
                    </div>
                    <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <label style="font-weight: 600; color: #0369a1;">返还佣金（自动计算）</label>
                        <div id="editPartTimeSalesCommissionDisplay" style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                            ¥${(p.partTimeSales?.partTimeSalesCommission || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <small style="color: #666; font-size: 12px; display: block; margin-top: 5px;">公式：成交额 - 公司应收 - 税费</small>
                    </div>
                </div>
            </div>
            
            ${(() => {
                const isSales = state.currentUser?.roles?.includes('sales') || state.currentUser?.roles?.includes('part_time_sales');
                const isAdmin = state.currentUser?.roles?.includes('admin');
                if (isSales && !isAdmin) return '';
                return `
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <h4 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">兼职排版（可选）</h4>
                <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" name="partTimeLayout.isPartTime" id="editPartTimeLayoutEnabled" ${p.partTimeLayout?.isPartTime ? 'checked' : ''} onchange="toggleEditPartTimeLayoutFields()">
                    启用兼职排版
                </label>
                <div id="editPartTimeLayoutFields" style="display: ${p.partTimeLayout?.isPartTime ? 'block' : 'none'}; padding-left: 20px; border-left: 2px solid #667eea;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>选择排版员</label>
                        <select name="partTimeLayout.layoutAssignedTo" id="editLayoutAssignedTo" style="width: 100%;">
                            <option value="">请选择排版员</option>
                            ${(state.allUsers || []).filter(u => u.isActive && (u.roles?.includes('layout') || u.roles?.includes('admin'))).map(u => {
                                const layoutAssignedTo = p.partTimeLayout?.layoutAssignedTo;
                                const isSelected = (() => {
                                    if (!layoutAssignedTo) return false;
                                    if (typeof layoutAssignedTo === 'object' && layoutAssignedTo._id) {
                                        return layoutAssignedTo._id.toString() === u._id.toString();
                                    }
                                    if (typeof layoutAssignedTo === 'string') {
                                        return layoutAssignedTo === u._id.toString();
                                    }
                                    if (p.members) {
                                        const layoutMember = p.members.find(m => m.role === 'layout' && m.userId?._id?.toString() === u._id.toString());
                                        return !!layoutMember;
                                    }
                                    return false;
                                })();
                                return `<option value="${u._id}" ${isSelected ? 'selected' : ''}>${u.name} (${u.username})</option>`;
                            }).join('')}
                        </select>
                        <small style="color: #666; font-size: 12px;">如果已通过添加成员指定了排版员，此处会显示已选择的排版员</small>
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label>排版费用（元）</label>
                        <input type="number" name="partTimeLayout.layoutCost" id="editLayoutCost" step="0.01" min="0" value="${p.partTimeLayout?.layoutCost || 0}" onchange="validateEditLayoutCost()" style="width: 100%;">
                        <small style="color: #666; font-size: 12px;">排版费用不能超过项目总金额的5%</small>
                    </div>
                    <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                        <label style="font-weight: 600; color: #0369a1;">费用占比（自动计算）</label>
                        <div id="editLayoutCostPercentageDisplay" style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                            ${(p.partTimeLayout?.layoutCostPercentage || 0).toFixed(2)}%
                        </div>
                        <div id="editLayoutCostValidation" style="margin-top: 5px;"></div>
                    </div>
                </div>
            </div>
                `;
            })()}
            
            ${canManageMembers ? `
            <div class="form-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <h4 style="margin:0;font-size:14px;color:#667eea;">项目成员</h4>
                    <button type="button" class="btn-small" data-click="showAddMemberModal('${p._id}')">添加成员</button>
                </div>
                <div id="editProjectMembersList" style="display:flex;flex-direction:column;gap:8px;background:#f8f9fa;padding:10px;border-radius:6px;">
                    ${p.members && Array.isArray(p.members) && p.members.length > 0 ? p.members.map(m => {
                        const userName = (m.userId && typeof m.userId === 'object') ? m.userId.name : (m.userId || '未知用户');
                        const employmentLabel = m.employmentType === 'part_time' || m.userId?.employmentType === 'part_time' ? '兼职' : '专职';
                        const roleText = getRoleText(m.role);
                        let extraInfo = '';
                        if (m.role === 'translator') {
                            extraInfo = ` (${m.translatorType === 'deepedit' ? '深度编辑' : 'MTPE'}, 字数占比: ${((m.wordRatio || 1) * 100).toFixed(0)}%)`;
                        } else if (m.role === 'layout' && m.layoutCost) {
                            extraInfo = ` (排版费用: ¥${(m.layoutCost || 0).toFixed(2)})`;
                        } else if (m.role === 'part_time_translator' && m.partTimeFee) {
                            extraInfo = ` (兼职翻译费用: ¥${(m.partTimeFee || 0).toFixed(2)})`;
                        }
                        return `<div class="member-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:4px;">
                            <div class="member-info" style="flex:1;">
                                <strong>${userName}</strong> - ${roleText} <span style="color:#6b7280;">(${employmentLabel})</span>${extraInfo}
                            </div>
                            <div class="member-actions" style="margin-left:10px;">
                                <button type="button" class="btn-small btn-danger" data-click="deleteMember('${p._id}', '${m._id}')" style="background:#dc2626;color:white;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;">删除</button>
                            </div>
                        </div>`;
                    }).join('') : '<p style="margin:0;color:#999;font-size:12px;">暂无成员，点击“添加成员”进行维护</p>'}
                </div>
                <small style="color:#666;font-size:12px;display:block;margin-top:6px;">成员增删使用上方按钮，操作完成后重新打开项目详情可看到最新状态。</small>
            </div>
            ` : ''}

            <div class="action-buttons">
                <button type="submit">保存</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '编辑项目', body: content });
    setTimeout(() => {
        calculateEditPartTimeSalesCommission();
        validateEditLayoutCost();
    }, 100);
    const container = document.getElementById('editTargetLanguagesContainer');
    if (container) {
        container.innerHTML = '';
        if (targetLanguagesArray.length > 0) {
            targetLanguagesArray.forEach(lang => addEditTargetLanguageRow(lang));
        } else {
            addEditTargetLanguageRow();
        }
    }
    
    // 加载报价明细
    const detailsContainer = document.getElementById('editQuotationDetailsContainer');
    const hasDetails = p.quotationDetails && Array.isArray(p.quotationDetails) && p.quotationDetails.length > 0;
    
    if (detailsContainer) {
        if (hasDetails) {
            detailsContainer.innerHTML = '';
            editQuotationDetailRowIndex = 0;
            p.quotationDetails.forEach(detail => {
                addEditQuotationDetailRow(detail);
            });
            // 更新汇总
            setTimeout(() => {
                updateEditQuotationDetailsSummary();
            }, 100);
        }
        
        // 如果有明细，禁用总字数和总金额输入，并自动同步，同时隐藏源语种和目标语种字段
        if (hasDetails) {
            const wordCountInput = document.getElementById('editWordCount');
            const projectAmountInput = document.getElementById('editProjectAmount');
            const wordCountHint = document.getElementById('editWordCountHint');
            const projectAmountHint = document.getElementById('editProjectAmountHint');
            const sourceLanguageGroup = document.getElementById('editSourceLanguageGroup');
            const targetLanguagesGroup = document.getElementById('editTargetLanguagesGroup');
            
            // 隐藏源语种和目标语种字段（因为明细中已经有语种信息）
            if (sourceLanguageGroup) {
                sourceLanguageGroup.style.display = 'none';
            }
            if (targetLanguagesGroup) {
                targetLanguagesGroup.style.display = 'none';
            }
            
            // 从明细中提取源语种和目标语种，并移除 required 属性
            const sourceLanguageSelect = document.getElementById('editSourceLanguageSelect');
            const targetLanguageSelects = document.querySelectorAll('#editTargetLanguagesContainer .target-language-select');
            
            // 从明细中提取唯一的源语种和目标语种
            const sourceLanguages = new Set();
            const targetLanguagesSet = new Set();
            
            detailsContainer.querySelectorAll('[id^="edit-quotation-detail-"]').forEach(row => {
                const sourceLangSelect = row.querySelector('.detail-source-language');
                const targetLangSelect = row.querySelector('.detail-target-language');
                if (sourceLangSelect && sourceLangSelect.value) {
                    sourceLanguages.add(sourceLangSelect.value);
                }
                if (targetLangSelect && targetLangSelect.value) {
                    targetLanguagesSet.add(targetLangSelect.value);
                }
            });
            
            // 如果有唯一的源语种，自动填充
            if (sourceLanguageSelect && sourceLanguages.size === 1) {
                sourceLanguageSelect.value = Array.from(sourceLanguages)[0];
                sourceLanguageSelect.removeAttribute('required');
            } else if (sourceLanguageSelect) {
                sourceLanguageSelect.removeAttribute('required');
            }
            
            // 如果有目标语种，自动填充第一个目标语种选择框
            if (targetLanguageSelects.length > 0 && targetLanguagesSet.size > 0) {
                const firstTargetLang = Array.from(targetLanguagesSet)[0];
                if (targetLanguageSelects[0]) {
                    targetLanguageSelects[0].value = firstTargetLang;
                    targetLanguageSelects[0].removeAttribute('required');
                }
            }
            
            // 移除所有目标语种选择框的 required 属性
            targetLanguageSelects.forEach(select => {
                select.removeAttribute('required');
            });
            
            if (wordCountInput) {
                wordCountInput.readOnly = true;
                wordCountInput.style.background = '#f0f0f0';
            }
            if (projectAmountInput) {
                projectAmountInput.readOnly = true;
                projectAmountInput.style.background = '#f0f0f0';
            }
            if (wordCountHint) {
                wordCountHint.textContent = '字数从报价明细自动计算，请修改明细以更新字数';
                wordCountHint.style.color = '#667eea';
            }
            if (projectAmountHint) {
                projectAmountHint.textContent = '金额从报价明细自动计算，请修改明细以更新金额';
                projectAmountHint.style.color = '#667eea';
            }
        } else {
            // 如果没有明细，显示源语种和目标语种字段
            const sourceLanguageGroup = document.getElementById('editSourceLanguageGroup');
            const targetLanguagesGroup = document.getElementById('editTargetLanguagesGroup');
            if (sourceLanguageGroup) {
                sourceLanguageGroup.style.display = '';
            }
            if (targetLanguagesGroup) {
                targetLanguagesGroup.style.display = '';
            }
            
            // 恢复 required 属性
            const sourceLanguageSelect = document.getElementById('editSourceLanguageSelect');
            const targetLanguageSelects = document.querySelectorAll('#editTargetLanguagesContainer .target-language-select');
            
            if (sourceLanguageSelect) {
                sourceLanguageSelect.setAttribute('required', 'required');
            }
            
            // 至少第一个目标语种选择框需要 required
            if (targetLanguageSelects.length > 0 && targetLanguageSelects[0]) {
                targetLanguageSelects[0].setAttribute('required', 'required');
            }
        }
    }
}

export async function updateProject(e, projectId) {
    e.preventDefault();
    
    // 在表单提交前，如果有明细，移除源语种和目标语种的 required 属性，并填充值
    const quotationDetailsContainer = document.getElementById('editQuotationDetailsContainer');
    const hasQuotationDetails = quotationDetailsContainer && quotationDetailsContainer.querySelectorAll('[id^="edit-quotation-detail-"]').length > 0;
    
    if (hasQuotationDetails) {
        const sourceLanguageSelect = document.getElementById('editSourceLanguageSelect');
        const targetLanguageSelects = document.querySelectorAll('#editTargetLanguagesContainer .target-language-select');
        
        // 从明细中提取源语种和目标语种
        const sourceLanguagesSet = new Set();
        const targetLanguagesSet = new Set();
        
        quotationDetailsContainer.querySelectorAll('[id^="edit-quotation-detail-"]').forEach(row => {
            const sourceLangSelect = row.querySelector('.detail-source-language');
            const targetLangSelect = row.querySelector('.detail-target-language');
            if (sourceLangSelect && sourceLangSelect.value) {
                sourceLanguagesSet.add(sourceLangSelect.value);
            }
            if (targetLangSelect && targetLangSelect.value) {
                targetLanguagesSet.add(targetLangSelect.value);
            }
        });
        
        // 填充源语种 - 确保字段有值，并创建隐藏字段避免验证
        if (sourceLanguageSelect) {
            if (sourceLanguagesSet.size > 0) {
                const sourceLangValue = Array.from(sourceLanguagesSet)[0];
                sourceLanguageSelect.value = sourceLangValue;
                // 创建隐藏字段存储值，避免浏览器验证
                let hiddenInput = document.getElementById('hiddenSourceLanguage');
                if (!hiddenInput) {
                    hiddenInput = document.createElement('input');
                    hiddenInput.type = 'hidden';
                    hiddenInput.id = 'hiddenSourceLanguage';
                    hiddenInput.name = 'sourceLanguage';
                    sourceLanguageSelect.parentNode.appendChild(hiddenInput);
                }
                hiddenInput.value = sourceLangValue;
            }
            sourceLanguageSelect.removeAttribute('required');
            sourceLanguageSelect.style.display = 'none'; // 隐藏原选择框
        }
        
        // 填充目标语种 - 确保有足够的选择框并填充所有语种
        if (targetLanguagesSet.size > 0) {
            const targetLanguagesArray = Array.from(targetLanguagesSet);
            const container = document.getElementById('editTargetLanguagesContainer');
            
            // 如果选择框不够，动态添加
            let currentSelects = Array.from(document.querySelectorAll('#editTargetLanguagesContainer .target-language-select'));
            while (currentSelects.length < targetLanguagesArray.length && container) {
                addEditTargetLanguageRow();
                // 重新获取选择框列表
                currentSelects = Array.from(document.querySelectorAll('#editTargetLanguagesContainer .target-language-select'));
                if (currentSelects.length >= targetLanguagesArray.length) break;
            }
            
            // 重新获取最新的选择框列表并填充值，创建隐藏字段
            const allTargetSelects = Array.from(document.querySelectorAll('#editTargetLanguagesContainer .target-language-select'));
            targetLanguagesArray.forEach((lang, index) => {
                if (allTargetSelects[index]) {
                    allTargetSelects[index].value = lang;
                    allTargetSelects[index].removeAttribute('required');
                    allTargetSelects[index].style.display = 'none'; // 隐藏原选择框
                    // 创建隐藏字段存储值
                    let hiddenInput = document.getElementById(`hiddenEditTargetLanguage_${index}`);
                    if (!hiddenInput && container) {
                        hiddenInput = document.createElement('input');
                        hiddenInput.type = 'hidden';
                        hiddenInput.id = `hiddenEditTargetLanguage_${index}`;
                        hiddenInput.name = 'targetLanguages[]';
                        container.appendChild(hiddenInput);
                    }
                    if (hiddenInput) {
                        hiddenInput.value = lang;
                    }
                }
            });
            
            // 移除所有选择框的 required 属性并隐藏
            allTargetSelects.forEach(select => {
                select.removeAttribute('required');
                select.style.display = 'none';
            });
        } else {
            targetLanguageSelects.forEach(select => {
                select.removeAttribute('required');
            });
        }
    }
    
    const formData = new FormData(e.target);
    
    // 检查是否有报价明细（用于提取语种信息）
    
    let sourceLanguage, targetLanguages;
    
    if (hasQuotationDetails) {
        // 如果有明细，从明细中提取源语种和目标语种
        const sourceLanguagesSet = new Set();
        const targetLanguagesSet = new Set();
        
        quotationDetailsContainer.querySelectorAll('[id^="edit-quotation-detail-"]').forEach(row => {
            const sourceLangSelect = row.querySelector('.detail-source-language');
            const targetLangSelect = row.querySelector('.detail-target-language');
            if (sourceLangSelect && sourceLangSelect.value) {
                sourceLanguagesSet.add(sourceLangSelect.value);
            }
            if (targetLangSelect && targetLangSelect.value) {
                targetLanguagesSet.add(targetLangSelect.value);
            }
        });
        
        if (sourceLanguagesSet.size === 0) {
            alert('请至少填写一个报价明细的源语种');
            return;
        }
        if (targetLanguagesSet.size === 0) {
            alert('请至少填写一个报价明细的目标语种');
            return;
        }
        
        sourceLanguage = Array.from(sourceLanguagesSet)[0]; // 使用第一个源语种
        targetLanguages = Array.from(targetLanguagesSet);
    } else {
        // 如果没有明细，从表单中获取，并恢复显示
        const sourceLanguageSelect = document.getElementById('editSourceLanguageSelect');
        if (sourceLanguageSelect) {
            sourceLanguageSelect.style.display = '';
            // 移除隐藏字段
            const hiddenInput = document.getElementById('hiddenEditSourceLanguage');
            if (hiddenInput) hiddenInput.remove();
        }
        // 移除所有隐藏的目标语种字段并恢复显示
        document.querySelectorAll('[id^="hiddenEditTargetLanguage_"]').forEach(el => el.remove());
        document.querySelectorAll('#editTargetLanguagesContainer .target-language-select').forEach(select => {
            select.style.display = '';
        });
        
        sourceLanguage = formData.get('sourceLanguage');
        const targetLanguageRows = document.querySelectorAll('#editTargetLanguagesContainer .target-language-select');
        targetLanguages = Array.from(targetLanguageRows)
            .map(select => select.value)
            .filter(value => value && value.trim() !== '');
        
        if (!sourceLanguage) {
            alert('请选择源语种');
            return;
        }
        if (targetLanguages.length === 0) {
            alert('请至少添加并选择一个目标语种');
            return;
        }
    }
    const editPartTimeSalesEnabled = formData.get('partTimeSales.isPartTime') === 'on';
    const editPartTimeSales = editPartTimeSalesEnabled ? {
        isPartTime: true,
        companyReceivable: parseFloat(formData.get('partTimeSales.companyReceivable') || 0),
        taxRate: parseFloat(formData.get('partTimeSales.taxRate') || 0) / 100
    } : { isPartTime: false, companyReceivable: 0, taxRate: 0 };
    const editPartTimeLayoutEnabled = formData.get('partTimeLayout.isPartTime') === 'on';
    const editLayoutCost = parseFloat(formData.get('partTimeLayout.layoutCost') || 0);
    const editLayoutAssignedTo = formData.get('partTimeLayout.layoutAssignedTo');
    if (editPartTimeLayoutEnabled && editLayoutCost > 0) {
        const projectAmount = parseFloat(formData.get('projectAmount'));
        const percentage = (editLayoutCost / projectAmount) * 100;
        if (percentage > 5) {
            alert(`排版费用(${editLayoutCost})不能超过项目总金额(${projectAmount})的5%，当前占比为${percentage.toFixed(2)}%`);
            return;
        }
        if (!editLayoutAssignedTo) {
            alert('请选择排版员');
            return;
        }
    }
    const editPartTimeLayout = editPartTimeLayoutEnabled ? {
        isPartTime: true,
        layoutCost: editLayoutCost,
        layoutAssignedTo: editLayoutAssignedTo || undefined
    } : { isPartTime: false, layoutCost: 0, layoutAssignedTo: null };
    const payload = {
        projectName: formData.get('projectName'),
        businessType: formData.get('businessType'),
        projectType: formData.get('projectType'),
        sourceLanguage: sourceLanguage,
        targetLanguages: targetLanguages,
        wordCount: formData.get('wordCount') ? parseFloat(formData.get('wordCount')) : undefined,
        unitPrice: formData.get('unitPrice') ? parseFloat(formData.get('unitPrice')) : undefined,
        projectAmount: formData.get('projectAmount') ? parseFloat(formData.get('projectAmount')) : undefined,
        deadline: formData.get('deadline'),
        isTaxIncluded: formData.get('isTaxIncluded') === 'on',
        needInvoice: formData.get('needInvoice') === 'on',
        specialRequirements: {
            terminology: formData.get('specialRequirements.terminology') === 'on',
            nda: formData.get('specialRequirements.nda') === 'on',
            referenceFiles: formData.get('specialRequirements.referenceFiles') === 'on',
            pureTranslationDelivery: formData.get('specialRequirements.pureTranslationDelivery') === 'on',
            bilingualDelivery: formData.get('specialRequirements.bilingualDelivery') === 'on',
            printSealExpress: formData.get('specialRequirements.printSealExpress') === 'on',
            notes: formData.get('specialRequirements.notes') || undefined
        },
        partTimeSales: editPartTimeSales,
        partTimeLayout: editPartTimeLayout
    };

    // 收集报价明细
    const editDetailsContainer = document.getElementById('editQuotationDetailsContainer');
    if (editDetailsContainer) {
        const quotationDetails = [];
        const detailRows = editDetailsContainer.querySelectorAll('[id^="edit-quotation-detail-"]');
        detailRows.forEach(row => {
            const filename = row.querySelector('.detail-filename')?.value?.trim();
            const sourceLanguage = row.querySelector('.detail-source-language')?.value?.trim();
            const targetLanguage = row.querySelector('.detail-target-language')?.value?.trim();
            const wordCount = parseFloat(row.querySelector('.detail-word-count')?.value) || 0;
            const unitPrice = parseFloat(row.querySelector('.detail-unit-price')?.value) || 0;
            const amount = parseFloat(row.querySelector('.detail-amount')?.value) || 0;
            
            if (filename && sourceLanguage && targetLanguage && wordCount > 0 && unitPrice > 0) {
                quotationDetails.push({
                    filename,
                    sourceLanguage,
                    targetLanguage,
                    wordCount,
                    unitPrice,
                    amount
                });
            }
        });
        if (quotationDetails.length > 0) {
            payload.quotationDetails = quotationDetails;
        }
    }

    try {
        const res = await apiFetch(`/projects/${projectId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadProjects();
            window.viewProject?.(projectId);
            showToast('项目已更新', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('更新失败: ' + error.message, 'error');
    }
}

export async function viewProject(projectId) {
    if (!projectId) {
        console.error('viewProject: projectId is required but got:', projectId);
        showToast('项目ID不能为空', 'error');
        return;
    }
    console.log('viewProject called with projectId:', projectId);
    try {
        // 添加时间戳防止缓存
        const response = await apiFetch(`/projects/${projectId}?_t=${Date.now()}`);
        const data = await response.json();

        if (!data.success) return alert('加载项目详情失败: ' + (data.message || '未知错误'));

        const project = data.data;
        currentProjectDetail = project;
        // 基于当前选择的角色判断UI权限，而不是用户拥有的所有角色
        const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
        const isAdmin = currentRole === 'admin';
        const isPM = currentRole === 'pm';
        const isSales = currentRole === 'sales';
        const isPartTimeSales = currentRole === 'part_time_sales';
        const isFinance = currentRole === 'finance';
        
        // 对于财务权限，应该基于当前选择的角色，而不是用户拥有的所有角色
        // 这样当管理员切换到销售角色时，财务相关功能会被隐藏
        const roles = state.currentUser?.roles || [];
        const hasFinanceRole = roles.includes('finance') || roles.includes('admin');

        const canStart = isAdmin || isSales || isPartTimeSales;
        const canSchedule = isAdmin || isPM;
        const canQualityOps = isAdmin || isPM || isSales || isPartTimeSales;
        // 对外交付（面向客户）：仅管理员 / 销售 / 兼职销售
        const canDeliver = (isAdmin || isSales || isPartTimeSales) && !isPM;
        const canEditDeleteExport = (isAdmin || isSales || isPartTimeSales) && !isPM;
        const canExportContract = isAdmin || isSales || isPartTimeSales || isPM;
        // 销售创建的项目，销售可以管理成员；管理员和项目经理可以管理所有项目的成员
        const canManageMembers = isAdmin || isPM || (isSales || isPartTimeSales) && project.createdBy?._id === state.currentUser?._id;
        // 财务相关功能应该基于当前选择的角色，而不是用户拥有的所有角色
        const canFinance = isAdmin || isFinance;

        // 销售只能查看回款信息，不能修改；只有财务和管理员可以修改回款
        // 这里仍然使用 hasFinanceRole，因为后端权限检查基于用户拥有的角色
        const canManagePayment = hasFinanceRole;
        const canViewPayment = canManagePayment || project.createdBy?._id === state.currentUser?._id;

        const memberRoles = (project.members || []).reduce((acc, m) => {
            if (!m || !m.userId || !state.currentUser?._id) return acc;
            const raw = typeof m.userId === 'object' ? m.userId._id : m.userId;
            if (!raw) return acc;
            const uidStr = raw.toString();
            if (uidStr === state.currentUser._id.toString()) acc.push(m.role);
            return acc;
        }, []);

        const isTranslatorMember = memberRoles.includes('translator');
        const isReviewerMember = memberRoles.includes('reviewer');
        const isLayoutMember = memberRoles.includes('layout');
        const canSetScheduled = canSchedule;
        const canSetTranslationDone = isAdmin || isPM || isTranslatorMember;
        const canSetReviewDone = isAdmin || isPM || isReviewerMember;
        const canSetLayoutDone = isAdmin || isPM || isLayoutMember;
        const statusOrder = ['pending','scheduled','in_progress','translation_done','review_done','layout_done','completed'];
        const currentStatusIdx = statusOrder.indexOf(project.status);
        const startReached = currentStatusIdx >= statusOrder.indexOf('scheduled');
        const translationReached = currentStatusIdx >= statusOrder.indexOf('translation_done');
        const reviewReached = currentStatusIdx >= statusOrder.indexOf('review_done');
        const layoutReached = currentStatusIdx >= statusOrder.indexOf('layout_done');

        const content = `
            <div class="project-detail">
                <div class="detail-section">
                    <h4>基本信息</h4>
                    <div class="detail-row"><div class="detail-label">项目编号:</div><div class="detail-value">${project.projectNumber || '-'}</div></div>
                    <div class="detail-row"><div class="detail-label">项目名称:</div><div class="detail-value">${project.projectName}</div></div>
                    <div class="detail-row"><div class="detail-label">客户名称:</div><div class="detail-value">${project.customerId?.name || project.clientName}</div></div>
                    ${project.customerId ? `
                        ${project.contactInfo ? `
                        <div class="detail-row"><div class="detail-label">项目联系人:</div><div class="detail-value">${project.contactInfo.name || '-'}${project.contactInfo.position ? ' (' + project.contactInfo.position + ')' : ''}</div></div>
                        <div class="detail-row"><div class="detail-label">联系人电话:</div><div class="detail-value">${project.contactInfo.phone || '-'}</div></div>
                        <div class="detail-row"><div class="detail-label">联系人邮箱:</div><div class="detail-value">${project.contactInfo.email || '-'}</div></div>
                    ` : `
                        <div class="detail-row"><div class="detail-label">客户联系人:</div><div class="detail-value">${project.customerId.contactPerson || '-'}</div></div>
                        <div class="detail-row"><div class="detail-label">客户电话:</div><div class="detail-value">${project.customerId.phone || '-'}</div></div>
                        <div class="detail-row"><div class="detail-label">客户邮箱:</div><div class="detail-value">${project.customerId.email || '-'}</div></div>
                    `}
                    ` : ''}
                    <div class="detail-row"><div class="detail-label">业务类型:</div><div class="detail-value">${getBusinessTypeText(project.businessType)}</div></div>
                    ${project.projectType ? `<div class="detail-row"><div class="detail-label">项目类型:</div><div class="detail-value">${getProjectTypeText(project.projectType)}</div></div>` : ''}
                    ${project.sourceLanguage ? `<div class="detail-row"><div class="detail-label">源语种:</div><div class="detail-value">${project.sourceLanguage}</div></div>` : ''}
                    ${project.targetLanguages?.length ? `<div class="detail-row"><div class="detail-label">目标语言:</div><div class="detail-value">${project.targetLanguages.join(', ')}</div></div>` : ''}
                    ${project.businessType === 'translation' && project.wordCount > 0 ? `
                        <div class="detail-row"><div class="detail-label">字数:</div><div class="detail-value">${project.wordCount.toLocaleString()}</div></div>
                        ${canViewProjectAmount() ? `<div class="detail-row"><div class="detail-label">单价（每千字）:</div><div class="detail-value">¥${project.unitPrice ? project.unitPrice.toLocaleString() : '-'}</div></div>` : ''}
                    ` : ''}
                    ${canViewProjectAmount() ? `<div class="detail-row"><div class="detail-label">项目金额:</div><div class="detail-value">¥${project.projectAmount.toLocaleString()}${project.isTaxIncluded ? '（含税）' : ''}</div></div>` : ''}
                    ${project.needInvoice ? `<div class="detail-row"><div class="detail-label">发票:</div><div class="detail-value"><span class="badge badge-info">需要发票</span></div></div>` : ''}
                    ${project.partTimeSales?.isPartTime && canViewProjectAmount() ? `
                        <div class="detail-row" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                            <div class="detail-label" style="font-weight: 600; color: #0369a1;">兼职销售信息:</div>
                            <div class="detail-value" style="color: #0369a1;">
                                <div>公司应收金额: ¥${(project.partTimeSales.companyReceivable || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                <div>税率: ${((project.partTimeSales.taxRate || 0) * 100).toFixed(2)}%</div>
                                <div style="font-weight: bold; margin-top: 5px;">返还佣金: ¥${(project.partTimeSales.partTimeSalesCommission || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </div>
                        </div>
                    ` : ''}
                    ${project.partTimeLayout?.isPartTime || project.partTimeLayout?.layoutAssignedTo ? `
                        <div class="detail-row" style="background: #f0f9ff; padding: 10px; border-radius: 4px; margin-top: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <div class="detail-label" style="font-weight: 600; color: #0369a1;">兼职排版信息:</div>
                                    <div class="detail-value" style="color: #0369a1;">
                                        <div>排版员: ${(() => {
                                            const layoutUser = project.partTimeLayout?.layoutAssignedTo;
                                            if (layoutUser && typeof layoutUser === 'object' && layoutUser.name) return layoutUser.name;
                                            if (project.members) {
                                                const layoutMember = project.members.find(m => m.role === 'layout' && (m.userId._id === layoutUser || m.userId._id?.toString() === layoutUser));
                                                if (layoutMember?.userId) return layoutMember.userId.name;
                                            }
                                            return layoutUser || '-';
                                        })()}</div>
                                        ${canViewProjectAmount() ? `
                                        <div>排版费用: ¥${(project.partTimeLayout?.layoutCost || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        <div>费用占比: ${(project.partTimeLayout?.layoutCostPercentage || 0).toFixed(2)}%</div>
                                        ` : ''}
                                    </div>
                                </div>
                                ${canManageMembers && project.status !== 'completed' ? `
                                    <button class="btn-small" data-click="showSetLayoutCostModal('${projectId}')" style="margin-left: 10px;">
                                        ${(project.partTimeLayout?.layoutCost || 0) > 0 ? '修改费用' : '设置费用'}
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                    ${project.specialRequirements && (project.specialRequirements.terminology || project.specialRequirements.nda || project.specialRequirements.referenceFiles || project.specialRequirements.pureTranslationDelivery || project.specialRequirements.bilingualDelivery || project.specialRequirements.printSealExpress || project.specialRequirements.notes) ? `
                        <div class="detail-row">
                            <div class="detail-label">特殊要求:</div>
                            <div class="detail-value">
                                ${project.specialRequirements.terminology ? '<span class="badge badge-info">术语表</span>' : ''}
                                ${project.specialRequirements.nda ? '<span class="badge badge-info">保密协议</span>' : ''}
                                ${project.specialRequirements.referenceFiles ? '<span class="badge badge-info">参考文件</span>' : ''}
                                ${project.specialRequirements.pureTranslationDelivery ? '<span class="badge badge-info">纯译文交付</span>' : ''}
                                ${project.specialRequirements.bilingualDelivery ? '<span class="badge badge-info">对照版交付</span>' : ''}
                                ${project.specialRequirements.printSealExpress ? '<span class="badge badge-info">打印盖章快递</span>' : ''}
                                ${project.specialRequirements.notes ? '<br><small>' + project.specialRequirements.notes + '</small>' : ''}
                            </div>
                        </div>
                    ` : ''}
                    <div class="detail-row"><div class="detail-label">交付时间:</div><div class="detail-value">${project.deadline ? new Date(project.deadline).toLocaleString() : '-'}</div></div>
                    ${project.startedAt ? `<div class="detail-row"><div class="detail-label">开始时间:</div><div class="detail-value">${new Date(project.startedAt).toLocaleString()}</div></div>` : ''}
                    <div class="detail-row"><div class="detail-label">状态:</div><div class="detail-value"><span class="badge ${getStatusBadgeClass(project.status)}">${getStatusText(project.status)}</span></div></div>
                    <div class="detail-row"><div class="detail-label">返修次数:</div><div class="detail-value">${project.revisionCount}</div></div>
                    <div class="detail-row"><div class="detail-label">是否延期:</div><div class="detail-value">${project.isDelayed ? '<span class="badge badge-warning">是</span>' : '<span class="badge badge-success">否</span>'}</div></div>
                    <div class="detail-row"><div class="detail-label">客户投诉:</div><div class="detail-value">${project.hasComplaint ? '<span class="badge badge-danger">是</span>' : '<span class="badge badge-success">否</span>'}</div></div>
                </div>

                <div class="detail-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4>回款信息</h4>
                        ${canManagePayment ? `<button class="btn-small" data-click="showPaymentModalForProject('${projectId}')">更新回款</button>` : ''}
                    </div>
                    <div class="detail-row"><div class="detail-label">合同约定回款日:</div><div class="detail-value">${project.payment?.expectedAt ? new Date(project.payment.expectedAt).toLocaleDateString() : '-'}</div></div>
                    <div class="detail-row"><div class="detail-label">已回款金额:</div><div class="detail-value">¥${(project.payment?.receivedAmount || 0).toLocaleString()}</div></div>
                    <div class="detail-row"><div class="detail-label">回款日期:</div><div class="detail-value">${project.payment?.receivedAt ? new Date(project.payment.receivedAt).toLocaleDateString() : '-'}</div></div>
                    <div class="detail-row"><div class="detail-label">是否回款完成:</div><div class="detail-value">${project.payment?.isFullyPaid ? '<span class="badge badge-success">是</span>' : '<span class="badge badge-warning">否</span>'}</div></div>
                </div>

                <div class="detail-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h4>项目成员</h4>
                        ${canManageMembers ? `<button class="btn-small" data-click="showAddMemberModal('${projectId}')">添加成员</button>` : ''}
                    </div>
                    ${project.memberAcceptance && project.memberAcceptance.pendingCount > 0 ? `
                        <div style="padding: 10px; background: #fff3cd; border-radius: 4px; margin-bottom: 10px; border-left: 4px solid #ffc107;">
                            <strong>确认进度：</strong>
                            <span>已接受 ${project.memberAcceptance.acceptedCount || 0} 人，</span>
                            <span>待确认 ${project.memberAcceptance.pendingCount || 0} 人</span>
                            ${project.memberAcceptance.rejectedCount > 0 ? `<span style="color: #dc2626;">，已拒绝 ${project.memberAcceptance.rejectedCount} 人</span>` : ''}
                        </div>
                    ` : ''}
                    <div id="projectMembers" style="display: flex; flex-direction: column; gap: 10px;">
                        ${project.members && Array.isArray(project.members) && project.members.length > 0 ? project.members.map(m => {
                            // 处理 userId 可能是对象或字符串的情况
                            const userName = (m.userId && typeof m.userId === 'object') ? m.userId.name : (m.userId || '未知用户');
                            const memberUserId = (m.userId && typeof m.userId === 'object') ? m.userId._id : m.userId;
                            const currentUserId = state.currentUser?._id;
                            const isCurrentUserMember = memberUserId && currentUserId && 
                                memberUserId.toString() === currentUserId.toString();
                            const memberEmploymentType = m.employmentType || (m.userId && typeof m.userId === 'object' ? m.userId.employmentType : null);
                            const employmentLabel = memberEmploymentType === 'part_time' ? '兼职' : '专职';
                            const roleText = getRoleText(m.role);
                            
                            // 兼容历史数据：如果没有 acceptanceStatus，根据角色判断
                            // 管理角色（isManagementRole为true）默认 accepted，其他角色默认 pending
                            let acceptanceStatus = m.acceptanceStatus;
                            if (!acceptanceStatus) {
                                // 尝试从角色信息中获取isManagementRole，如果没有则使用默认判断
                                let isManagementRole = false;
                                if (window.projectMemberRoles) {
                                    const roleInfo = window.projectMemberRoles.find(r => r.value === m.role);
                                    if (roleInfo && roleInfo.isManagementRole !== undefined) {
                                        isManagementRole = roleInfo.isManagementRole;
                                    } else {
                                        // 后备方案：使用传统管理角色列表
                                        const traditionalManagementRoles = ['pm', 'sales', 'part_time_sales', 'admin_staff', 'finance', 'admin'];
                                        isManagementRole = traditionalManagementRoles.includes(m.role);
                                    }
                                } else {
                                    // 后备方案：使用传统管理角色列表
                                    const traditionalManagementRoles = ['pm', 'sales', 'part_time_sales', 'admin_staff', 'finance', 'admin'];
                                    isManagementRole = traditionalManagementRoles.includes(m.role);
                                }
                                acceptanceStatus = isManagementRole ? 'accepted' : 'pending';
                            }
                            
                            let extraInfo = '';
                            if (m.role === 'translator') {
                                extraInfo = ` (${m.translatorType === 'deepedit' ? '深度编辑' : 'MTPE'}, 字数占比: ${((m.wordRatio || 1) * 100).toFixed(0)}%)`;
                            } else if (m.role === 'layout' && m.layoutCost) {
                                extraInfo = ` (排版费用: ¥${(m.layoutCost || 0).toFixed(2)})`;
                            } else if (m.role === 'part_time_translator' && m.partTimeFee) {
                                extraInfo = ` (兼职翻译费用: ¥${(m.partTimeFee || 0).toFixed(2)})`;
                            }
                            
                            // 生成状态显示HTML
                            // 如果成员需要确认（acceptanceStatus === 'pending'），显示确认/拒绝按钮
                            let statusHtml = '';
                            if (acceptanceStatus === 'pending') {
                                if (isCurrentUserMember) {
                                    // 当前用户的待确认成员，显示接受/拒绝按钮
                                    statusHtml = `
                                        <div class="member-status" style="margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                            <span class="status-badge pending">⏳ 待确认</span>
                                            <button class="btn-small btn-success" data-click="acceptMember('${projectId}', '${m._id}')" style="background: #10b981; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">接受</button>
                                            <button class="btn-small btn-danger" data-click="rejectMember('${projectId}', '${m._id}')" style="background: #dc2626; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">拒绝</button>
                                        </div>
                                    `;
                                } else {
                                    // 其他用户的待确认成员，只显示状态
                                    statusHtml = `
                                        <div class="member-status" style="margin-top: 8px;">
                                            <span class="status-badge pending">⏳ 待确认</span>
                                        </div>
                                    `;
                                }
                            } else if (acceptanceStatus === 'accepted') {
                                const acceptedDate = m.acceptanceAt ? new Date(m.acceptanceAt).toLocaleDateString('zh-CN') : '';
                                statusHtml = `
                                    <div class="member-status" style="margin-top: 8px;">
                                        <span class="status-badge accepted">✅ 已接受</span>
                                        ${acceptedDate ? `<small style="color: #6b7280; font-size: 11px; margin-left: 8px;">${acceptedDate}</small>` : ''}
                                    </div>
                                `;
                            } else if (acceptanceStatus === 'rejected') {
                                const rejectedDate = m.acceptanceAt ? new Date(m.acceptanceAt).toLocaleDateString('zh-CN') : '';
                                statusHtml = `
                                    <div class="member-status" style="margin-top: 8px;">
                                        <span class="status-badge rejected">❌ 已拒绝</span>
                                        ${rejectedDate ? `<small style="color: #6b7280; font-size: 11px; margin-left: 8px;">${rejectedDate}</small>` : ''}
                                        ${m.rejectionReason ? `<div style="color: #dc2626; font-size: 11px; margin-top: 4px;">原因：${m.rejectionReason}</div>` : ''}
                                    </div>
                                `;
                            }
                            
                            return `<div class="member-item" style="display: flex; flex-direction: column; padding: 10px; background: #f5f5f5; border-radius: 4px; margin-bottom: 8px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div class="member-info" style="flex: 1;">
                                        <strong>${userName}</strong> - ${roleText} <span style="color:#6b7280;">(${employmentLabel})</span>${extraInfo}
                                    </div>
                                    ${canManageMembers ? `<div class="member-actions" style="margin-left: 10px;"><button class="btn-small btn-danger" data-click="deleteMember('${projectId}', '${m._id}')" style="background: #dc2626; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">删除</button></div>` : ''}
                                </div>
                                ${statusHtml}
                            </div>`;
                        }).join('') : '<p style="color: #999; font-size: 14px;">暂无成员</p>'}
                    </div>
                </div>

                <div class="detail-section" id="realtimeKpiSection">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4>${state.currentRole === 'part_time_sales' ? '预估分成金额' : '预估KPI（分值）'}</h4>
                        <button class="btn-small" data-click="loadRealtimeKPI('${projectId}')">刷新</button>
                    </div>
                    <div id="realtimeKpiContent"><div class="card-desc">加载中...</div></div>
                </div>

                ${canFinance ? `
                <div class="detail-section">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <h4>回款管理</h4>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                        <input type="number" id="projectPaymentAmount" placeholder="回款金额" style="padding:6px; width:140px;">
                        <input type="date" id="projectPaymentDate" style="padding:6px;">
                        <input type="text" id="projectPaymentRef" placeholder="凭证号/备注" style="padding:6px; min-width:160px;">
                        <button class="btn-small" data-click="addProjectPayment('${projectId}')">新增回款</button>
                    </div>
                    <div id="projectPaymentList"><div class="card-desc">加载中...</div></div>
                </div>

                <div class="detail-section">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <h4>发票管理</h4>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                        <input type="text" id="projectInvoiceNumber" placeholder="发票号" style="padding:6px; min-width:120px;">
                        <input type="number" id="projectInvoiceAmount" placeholder="金额" style="padding:6px; width:120px;">
                        <input type="date" id="projectInvoiceDate" style="padding:6px;">
                        <select id="projectInvoiceType" style="padding:6px;">
                            <option value="vat">专票/增值税</option>
                            <option value="normal">普票</option>
                            <option value="other">其他</option>
                        </select>
                        <button class="btn-small" data-click="addProjectInvoice('${projectId}')">新增发票</button>
                    </div>
                    <div id="projectInvoiceList"><div class="card-desc">加载中...</div></div>
                </div>
                ` : ''}

                ${(canStart || canSchedule || canQualityOps || isTranslatorMember || isReviewerMember || isLayoutMember || isPM) && project.status !== 'completed' && project.status !== 'cancelled' ? `
                    <div class="detail-section">
                        <h4>项目管理</h4>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            ${canStart ? `<button class="btn-small btn-success" ${startReached ? 'disabled' : ''} data-click="startProject('${projectId}')">开始项目</button>` : ''}
                            ${canSetScheduled && project.status === 'scheduled' ? `<button class="btn-small" data-click="updateProjectStatus('${projectId}','in_progress','确认人员已安排完毕，项目开始执行？')">开始执行</button>` : ''}
                            ${canSetTranslationDone ? `<button class="btn-small" ${translationReached ? 'disabled' : ''} data-click="showDeliveryModal('${projectId}','translation_done')">翻译完成</button>` : ''}
                            ${canSetReviewDone ? `<button class="btn-small" ${reviewReached ? 'disabled' : ''} data-click="showDeliveryModal('${projectId}','review_done')">审校完成</button>` : ''}
                            ${canSetLayoutDone ? `<button class="btn-small" ${layoutReached ? 'disabled' : ''} data-click="showDeliveryModal('${projectId}','layout_done')">排版完成</button>` : ''}
                            ${isPM && (project.status === 'in_progress' || project.status === 'translation_done' || project.status === 'review_done' || project.status === 'layout_done') ? `
                                <button class="btn-small" data-click="showPmDeliveryModal('${projectId}')">提交给销售</button>
                            ` : ''}
                            ${(project.status === 'in_progress' || project.status === 'scheduled' || project.status === 'translation_done' || project.status === 'review_done' || project.status === 'layout_done') && canQualityOps ? `
                                <button class="btn-small" data-click="setRevision('${projectId}', ${project.revisionCount})">标记返修</button>
                                <button class="btn-small" data-click="setDelay('${projectId}')">标记延期</button>
                                <button class="btn-small" data-click="setComplaint('${projectId}')">标记客诉</button>
                            ` : ''}
                            ${(project.status === 'in_progress' || project.status === 'scheduled' || project.status === 'translation_done' || project.status === 'review_done' || project.status === 'layout_done') && canDeliver ? `<button class="btn-small btn-success" data-click="finishProject('${projectId}')">交付项目</button>` : ''}
                            ${canEditDeleteExport ? `
                              <button class="btn-small" data-click="exportProjectQuotation('${projectId}')" style="background: #10b981; margin-right: 5px;">📄 报价单(Excel)</button>
                              <button class="btn-small" data-click="exportProjectQuotationWord('${projectId}')" style="background: #3b82f6; margin-right: 5px;">📋 报价单(Word)</button>
                              ${canExportContract ? `<button class="btn-small" data-click="exportProjectContract('${projectId}')" style="background: #0ea5e9; color: white; margin-right: 5px;">📄 导出合同</button>` : ''}
                              <button class="btn-small" data-click="showEditProjectModal()">编辑项目</button>
                              <button class="btn-small btn-danger" data-click="deleteProject('${projectId}')">删除项目</button>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
                
                ${project.status === 'completed' ? `
                    <div class="detail-section">
                        <h4>项目评价</h4>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                            <button class="btn-small" data-click="showProjectEvaluationsList('${projectId}')" style="background: #8b5cf6; color: white;">查看评价</button>
                            ${(() => {
                                // 检查当前用户是否可以评价
                                const memberRoles = (project.members || []).reduce((acc, m) => {
                                    if (!m || !m.userId || !state.currentUser?._id) return acc;
                                    const raw = typeof m.userId === 'object' ? m.userId._id : m.userId;
                                    if (!raw) return acc;
                                    const uidStr = raw.toString();
                                    if (uidStr === state.currentUser._id.toString()) acc.push(m.role);
                                    return acc;
                                }, []);
                                
                                // PM评价销售：检查用户是否有PM角色（不仅是项目成员，只要用户有PM角色就可以评价）
                                const userRoles = state.currentUser?.roles || [];
                                const hasPMRole = userRoles.includes('pm');
                                const isPMMember = memberRoles.includes('pm');
                                const isExecutorMember = ['translator', 'reviewer', 'layout'].some(r => memberRoles.includes(r));
                                const salesId = project.createdBy?._id || project.createdBy;
                                // PM可以评价销售：用户有PM角色，且销售不是自己
                                const canEvalSales = (hasPMRole || isPMMember) && salesId && salesId.toString() !== state.currentUser?._id?.toString();
                                
                                // 查找PM成员
                                const pmMembers = (project.members || []).filter(m => {
                                    const raw = typeof m.userId === 'object' ? m.userId._id : m.userId;
                                    return raw && m.role === 'pm' && raw.toString() !== state.currentUser?._id?.toString();
                                });
                                const canEvalPM = isExecutorMember && pmMembers.length > 0;
                                
                                let buttons = [];
                                if (canEvalSales) {
                                    const salesName = project.createdBy?.name || '销售';
                                    buttons.push(`<button class="btn-small" data-click="showEvaluationModalForSales('${projectId}', '${salesId}', '${salesName}')" style="background: #10b981; color: white;">评价销售</button>`);
                                }
                                if (canEvalPM) {
                                    pmMembers.forEach(pm => {
                                        const pmId = typeof pm.userId === 'object' ? pm.userId._id : pm.userId;
                                        const pmName = typeof pm.userId === 'object' ? pm.userId.name : '项目经理';
                                        buttons.push(`<button class="btn-small" data-click="showEvaluationModalForPM('${projectId}', '${pmId}', '${pmName}')" style="background: #3b82f6; color: white;">评价PM (${pmName})</button>`);
                                    });
                                }
                                return buttons.join('');
                            })()}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        showModal({ title: '项目详情', body: content });
        // 直接调用导入的函数，而不是通过window
        loadRealtimeKPI(projectId);
        if (canFinance) {
            // 只有当有财务权限时才加载回款和发票数据
            loadProjectPayments(projectId);
            loadProjectInvoices(projectId);
        }
    } catch (error) {
        alert('加载项目详情失败: ' + error.message);
    }
}

export async function updateProjectStatus(projectId, status, confirmMessage) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    try {
        const response = await apiFetch(`/projects/${projectId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status })
        });
        const result = await response.json();
        if (result.success) {
            loadProjects();
            if (document.getElementById('modalOverlay')?.classList.contains('active')) {
                viewProject(projectId);
            }
            showToast('项目状态已更新', 'success');
        } else {
            showToast(result.message || '状态更新失败', 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

// 显示阶段性交付弹窗（翻译完成 / 审校完成 / 排版完成）
export async function showDeliveryModal(projectId, status) {
    const statusTextMap = {
        translation_done: '翻译完成交付',
        review_done: '审校完成交付',
        layout_done: '排版完成交付'
    };
    const title = statusTextMap[status] || '阶段性交付';
    const content = `
        <form id="deliveryForm" data-submit="submitDelivery(event, '${projectId}', '${status}')">
            <div class="form-group">
                <label>交付说明（可选）</label>
                <textarea id="deliveryNote" style="width:100%;min-height:80px;padding:8px;" placeholder="可以简单说明本次交付的内容、版本号等"></textarea>
            </div>
            <div class="form-group">
                <label>交付附件（可选，可多选）</label>
                <input type="file" id="deliveryAttachments" multiple>
                <small style="color:#666;font-size:12px;">仅用于发送给项目经理，建议总大小不超过 20MB。</small>
                <div id="deliveryAttachmentsList" style="margin-top:6px;"></div>
            </div>
            <div class="action-buttons">
                <button type="submit">确认交付</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title, body: content });

    setTimeout(() => {
        const attachmentsInput = document.getElementById('deliveryAttachments');
        const attachmentsList = document.getElementById('deliveryAttachmentsList');
        if (attachmentsInput && attachmentsList) {
            attachmentsInput.addEventListener('change', function () {
                const files = Array.from(this.files);
                if (files.length === 0) {
                    attachmentsList.innerHTML = '';
                    return;
                }
                const listHtml = files.map((file, index) => {
                    const size = (file.size / 1024).toFixed(2);
                    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#f0f0f0;border-radius:4px;margin-bottom:4px;">
                        <span>${file.name} (${size} KB)</span>
                        <button type="button" data-click="removeDeliveryAttachment(${index})" style="background:#ef4444;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:11px;">移除</button>
                    </div>`;
                }).join('');
                attachmentsList.innerHTML = listHtml;
            });
        }
    }, 50);
}

// 从阶段性交付弹窗中移除某个附件
export function removeDeliveryAttachment(index) {
    const attachmentsInput = document.getElementById('deliveryAttachments');
    if (!attachmentsInput) return;
    const dt = new DataTransfer();
    const files = Array.from(attachmentsInput.files);
    files.forEach((file, i) => {
        if (i !== index) dt.items.add(file);
    });
    attachmentsInput.files = dt.files;
    attachmentsInput.dispatchEvent(new Event('change'));
}

// 提交阶段性交付：更新状态 +（如有附件）给项目经理发交付邮件
export async function submitDelivery(e, projectId, status) {
    e.preventDefault();
    const noteEl = document.getElementById('deliveryNote');
    const note = noteEl?.value?.trim() || '';

    const attachmentsInput = document.getElementById('deliveryAttachments');
    let deliveryAttachments = null;

    if (attachmentsInput && attachmentsInput.files && attachmentsInput.files.length > 0) {
        const files = Array.from(attachmentsInput.files);
        const maxTotalSize = 20 * 1024 * 1024; // 20MB
        let totalSize = 0;
        for (const file of files) {
            totalSize += file.size;
            if (totalSize > maxTotalSize) {
                showToast('附件总大小不能超过 20MB', 'error');
                return;
            }
        }
        try {
            const promises = files.map(file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result.split(',')[1];
                    resolve({ filename: file.name, content: base64 });
                };
                reader.onerror = () => reject(new Error('读取附件失败'));
                reader.readAsDataURL(file);
            }));
            deliveryAttachments = await Promise.all(promises);
        } catch (err) {
            console.error('[Projects] 读取交付附件失败:', err);
            showToast('读取附件失败，请重试', 'error');
            return;
        }
    }

    try {
        const body = { status };
        if (note) body.deliveryNote = note;
        if (deliveryAttachments && deliveryAttachments.length > 0) {
            body.deliveryAttachments = deliveryAttachments;
        }

        const response = await apiFetch(`/projects/${projectId}/status`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.success) {
            closeModal();
            loadProjects();
            if (document.getElementById('modalOverlay')?.classList.contains('active')) {
                viewProject(projectId);
            }
            showToast('项目状态已更新', 'success');
        } else {
            showToast(result.message || '状态更新失败', 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

export async function exportProjectQuotation(projectId) {
    try {
        const response = await apiFetch(`/projects/${projectId}/quotation`);
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('spreadsheetml')) {
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = '报价单.xlsx';
            if (contentDisposition) {
                const utf8Match = contentDisposition.match(/filename\\*=UTF-8''(.+)/);
                if (utf8Match?.[1]) {
                    try { filename = decodeURIComponent(utf8Match[1]); } catch (e) { filename = utf8Match[1]; }
                } else {
                    const matches = contentDisposition.match(/filename[^;=\\n]*=((['\"]).*?\\2|[^;\\n]*)/);
                    if (matches?.[1]) {
                        filename = matches[1].replace(/['"]/g, '');
                        try { filename = decodeURIComponent(filename); } catch (e) { /* ignore */ }
                    }
                }
            }
            const blob = await response.blob();
            if (!blob || blob.size === 0) return alert('导出的文件为空，请重试');
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            showToast('报价单导出成功', 'success');
            return;
        }
        if (!response.ok) {
            const text = await response.text();
            let error;
            try { error = JSON.parse(text); } catch (e) { error = { message: text || '导出失败' }; }
            alert('导出失败: ' + (error.message || error.error?.message || '未知错误'));
        }
    } catch (error) {
        console.error('导出报价单失败:', error);
        alert('导出失败: ' + error.message);
    }
}

// 导出项目报价单（Word 格式，支持明细）
export async function exportProjectQuotationWord(projectId) {
    try {
        const response = await apiFetch(`/projects/${projectId}/quotation/word`, {
            method: 'GET',
            headers: {
                'Accept': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
        });

        if (!response.ok) {
            let msg = '导出报价单失败';
            try {
                const err = await response.json();
                msg = err.message || err.error?.message || msg;
            } catch (e) {
                msg = response.statusText || msg;
            }
            showToast(msg, 'error');
            return;
        }

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = '报价单.docx';
        if (contentDisposition) {
            const utf8Match = contentDisposition.match(/filename\\*=UTF-8''(.+)/);
            if (utf8Match?.[1]) {
                try { filename = decodeURIComponent(utf8Match[1]); } catch (e) { filename = utf8Match[1]; }
            } else {
                const matches = contentDisposition.match(/filename[^;=\\n]*=((['\"]).*?\\2|[^;\\n]*)/);
                if (matches?.[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                    try { filename = decodeURIComponent(filename); } catch (e) { /* ignore */ }
                }
            }
        }

        const blob = await response.blob();
        if (!blob || blob.size === 0) {
            showToast('导出的文件为空，请重试', 'error');
            return;
        }
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('报价单导出成功', 'success');
    } catch (error) {
        console.error('导出报价单失败:', error);
        showToast('导出报价单失败: ' + error.message, 'error');
    }
}

export async function exportProjectContract(projectId) {
    try {
        const response = await apiFetch(`/projects/${projectId}/contract`, {
            method: 'GET',
            headers: {
                'Accept': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
        });

        if (!response.ok) {
            let msg = '导出合同失败';
            try {
                const err = await response.json();
                msg = err.message || err.error?.message || msg;
            } catch (e) {
                msg = response.statusText || msg;
            }
            showToast(msg, 'error');
            return;
        }

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = '合同.docx';
        if (contentDisposition) {
            const utf8Match = contentDisposition.match(/filename\\*=UTF-8''(.+)/);
            if (utf8Match?.[1]) {
                try { filename = decodeURIComponent(utf8Match[1]); } catch (e) { filename = utf8Match[1]; }
            } else {
                const matches = contentDisposition.match(/filename[^;=\\n]*=((['\"]).*?\\2|[^;\\n]*)/);
                if (matches?.[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                    try { filename = decodeURIComponent(filename); } catch (e) { /* ignore */ }
                }
            }
        }

        const blob = await response.blob();
        if (!blob || blob.size === 0) {
            showToast('导出的文件为空，请重试', 'error');
            return;
        }
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('合同导出成功', 'success');
    } catch (error) {
        console.error('导出合同失败:', error);
        showToast('导出合同失败: ' + error.message, 'error');
    }
}

export async function startProject(projectId) {
    if (!confirm('确定要开始执行此项目吗？开始后项目状态将变为\"待安排\"，等待项目经理安排人员。')) return;
    try {
        const response = await apiFetch(`/projects/${projectId}/start`, { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            closeModal();
            loadProjects();
            showToast('项目已通知项目经理，等待安排', 'success');
        } else {
            alert(result.message || result.error?.message || '操作失败');
        }
    } catch (error) {
        alert('操作失败: ' + error.message);
    }
}

export async function showSetLayoutCostModal(projectId) {
    const project = currentProjectDetail;
    if (!project) return showToast('项目信息未加载', 'error');

    let layoutUser = null;
    if (project.partTimeLayout?.layoutAssignedTo) {
        if (typeof project.partTimeLayout.layoutAssignedTo === 'object' && project.partTimeLayout.layoutAssignedTo.name) {
            layoutUser = project.partTimeLayout.layoutAssignedTo;
        } else if (project.members) {
            const layoutMember = project.members.find(m => m.role === 'layout');
            if (layoutMember?.userId) layoutUser = layoutMember.userId;
        }
    }

    const content = `
        <form id="setLayoutCostForm" data-submit="setLayoutCost(event, '${projectId}')">
            <div class="form-group">
                <label>排版员</label>
                <input type="text" value="${layoutUser ? layoutUser.name + ' (' + layoutUser.username + ')' : '未指定'}" disabled style="background: #f5f5f5;">
                <small style="color: #666; font-size: 12px;">排版员已在添加成员时指定</small>
            </div>
            <div class="form-group">
                <label>排版费用（元） *</label>
                <input type="number" name="layoutCost" id="setLayoutCostInput" step="0.01" min="0" value="${project.partTimeLayout?.layoutCost || 0}" required onchange="validateSetLayoutCost()" style="width: 100%;">
                <small style="color: #666; font-size: 12px;">排版费用不能超过项目总金额的5%</small>
                <div id="setLayoutCostValidation" style="margin-top: 5px;"></div>
            </div>
            <div class="form-group" style="background: #f0f9ff; padding: 10px; border-radius: 4px;">
                <label style="font-weight: 600; color: #0369a1;">项目总金额</label>
                <div style="font-size: 18px; color: #0369a1; font-weight: bold; margin-top: 5px;">
                    ¥${(project.projectAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>
            <div class="action-buttons">
                <button type="submit">保存</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '设置排版费用', body: content });
    setTimeout(() => validateSetLayoutCost(), 100);
}

export function validateSetLayoutCost() {
    const layoutCostInput = document.getElementById('setLayoutCostInput');
    const validationDiv = document.getElementById('setLayoutCostValidation');
    const layoutCost = parseFloat(layoutCostInput?.value || 0);
    const project = currentProjectDetail;
    if (!layoutCost || layoutCost <= 0) {
        validationDiv.innerHTML = '<span style="color: #dc2626;">请输入排版费用</span>';
        return false;
    }
    if (!project || !project.projectAmount) {
        validationDiv.innerHTML = '<span style="color: #dc2626;">无法验证：项目金额未加载</span>';
        return false;
    }
    const percentage = (layoutCost / project.projectAmount) * 100;
    if (percentage > 5) {
        validationDiv.innerHTML = `<span style="color: #dc2626;">排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%</span>`;
        return false;
    }
    validationDiv.innerHTML = `<span style="color: #059669;">费用占比：${percentage.toFixed(2)}%</span>`;
    return true;
}

export async function setLayoutCost(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const layoutCost = parseFloat(formData.get('layoutCost') || 0);
    if (!layoutCost || layoutCost <= 0) return showToast('请输入排版费用', 'error');
    if (!validateSetLayoutCost()) return;
    try {
        const response = await apiFetch(`/projects/${projectId}`, {
            method: 'PUT',
            body: JSON.stringify({
                partTimeLayout: {
                    isPartTime: true,
                    layoutCost,
                    layoutAssignedTo: currentProjectDetail.partTimeLayout?.layoutAssignedTo || (currentProjectDetail.members?.find(m => m.role === 'layout')?.userId?._id)
                }
            })
        });
        const result = await response.json();
        if (result.success) {
            closeModal();
            await viewProject(projectId);
            showToast('排版费用设置成功', 'success');
        } else {
            showToast(result.message || '设置失败', 'error');
        }
    } catch (error) {
        showToast('设置失败: ' + error.message, 'error');
    }
}

// 初始化内联添加成员表单
async function initInlineCreateMemberForm() {
    const roleSelect = document.getElementById('inlineCreateMemberRole');
    if (!roleSelect) return;
    
    const dynamicProjectMemberRoles = await ensureProjectMemberRoles();

    // 获取可选择的角色 - 基于当前选择的角色判断
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isAdmin = currentRole === 'admin';
    const isPM = currentRole === 'pm';
    const isSales = currentRole === 'sales';
    const isPartTimeSales = currentRole === 'part_time_sales';
    
    let availableRoles;
    const baseAdminRoles = [
        { value: 'translator', label: '翻译' },
        { value: 'reviewer', label: '审校' },
        { value: 'pm', label: '项目经理' },
        { value: 'sales', label: '销售' },
        { value: 'admin_staff', label: '综合岗' },
        { value: 'part_time_sales', label: '兼职销售' },
        { value: 'layout', label: '兼职排版' }
    ];

    if (isAdmin) {
        // 管理员：内置角色 + 可用于项目成员的自定义角色
        availableRoles = [
            ...baseAdminRoles,
            ...dynamicProjectMemberRoles
                .filter(r => !baseAdminRoles.some(b => b.value === r.value))
        ];
    } else if (currentRole === 'pm') {
        availableRoles = [
            { value: 'translator', label: '翻译' },
            { value: 'reviewer', label: '审校' },
            { value: 'layout', label: '兼职排版' },
            ...dynamicProjectMemberRoles
                .filter(r => ['translator', 'reviewer', 'layout'].includes(r.value))
        ];
    } else if (isSales || isPartTimeSales) {
        // 当前角色为销售/兼职销售：只能添加项目经理
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    } else {
        // 其他情况默认只能添加项目经理
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    }
    
    roleSelect.innerHTML = '<option value="">请选择角色</option>' + 
        availableRoles.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
    
    // 重置用户选择
    const userIdSelect = document.getElementById('inlineCreateMemberUserId');
    if (userIdSelect) {
        userIdSelect.innerHTML = '<option value="">请先选择角色</option>';
    }
    
    // 隐藏所有额外字段
    const translatorGroup = document.getElementById('inlineCreateTranslatorTypeGroup');
    const wordRatioGroup = document.getElementById('inlineCreateWordRatioGroup');
    const layoutCostGroup = document.getElementById('inlineCreateLayoutCostGroup');
    if (translatorGroup) translatorGroup.style.display = 'none';
    if (wordRatioGroup) wordRatioGroup.style.display = 'none';
    if (layoutCostGroup) layoutCostGroup.style.display = 'none';
}

// 内联添加成员：角色变化处理
export function onInlineCreateMemberRoleChange() {
    const role = document.getElementById('inlineCreateMemberRole')?.value;
    const translatorGroup = document.getElementById('inlineCreateTranslatorTypeGroup');
    const wordRatioGroup = document.getElementById('inlineCreateWordRatioGroup');
    const layoutCostGroup = document.getElementById('inlineCreateLayoutCostGroup');
    
    if (role === 'translator') {
        if (translatorGroup) translatorGroup.style.display = 'block';
        if (wordRatioGroup) wordRatioGroup.style.display = 'block';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
    } else if (role === 'reviewer' || role === 'layout') {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'block';
        if (layoutCostGroup) layoutCostGroup.style.display = role === 'layout' ? 'block' : 'none';
    } else {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
    }
    
    filterInlineCreateUsersByRole();
}

// 内联添加成员：根据角色过滤用户
export function filterInlineCreateUsersByRole() {
    const role = document.getElementById('inlineCreateMemberRole')?.value;
    const userIdSelect = document.getElementById('inlineCreateMemberUserId');
    
    if (!role || !userIdSelect) {
        if (userIdSelect) userIdSelect.innerHTML = '<option value="">请先选择角色</option>';
        return;
    }
    
    // 确保用户列表已加载
    if (!state.allUsers || state.allUsers.length === 0) {
        if (userIdSelect) userIdSelect.innerHTML = '<option value="">加载用户列表中...</option>';
        // 尝试重新加载用户列表
        apiFetch('/users').then(res => res.json()).then(data => {
            if (data.success) {
                state.allUsers = data.data;
                // 重新过滤
                filterInlineCreateUsersByRole();
            } else {
                if (userIdSelect) userIdSelect.innerHTML = '<option value="">用户列表加载失败</option>';
            }
        }).catch(err => {
            console.error('加载用户列表失败:', err);
            if (userIdSelect) userIdSelect.innerHTML = '<option value="">用户列表加载失败</option>';
        });
        return;
    }
    
    const filteredUsers = state.allUsers.filter(user => {
        if (!user.isActive) return false; // 只显示激活的用户
        if (!user.roles || !Array.isArray(user.roles)) return false;
        return user.roles.includes(role);
    });
    
    if (filteredUsers.length === 0) {
        userIdSelect.innerHTML = '<option value="">没有符合条件的用户</option>';
        return;
    }
    
    userIdSelect.innerHTML = '<option value="">请选择用户</option>' +
        filteredUsers.map(u => {
            const employmentLabel = u.employmentType === 'part_time' ? '兼职' : '专职';
            return `<option value="${u._id}">${u.name}${u.username ? ' (' + u.username + ')' : ''} - ${employmentLabel}</option>`;
        }).join('');
}

// 内联添加成员：验证排版费用
export function validateInlineCreateMemberLayoutCost() {
    const layoutCostInput = document.getElementById('inlineCreateLayoutCost');
    const validationDiv = document.getElementById('inlineCreateMemberLayoutCostValidation');
    if (!layoutCostInput || !validationDiv) return true;
    
    const layoutCost = parseFloat(layoutCostInput.value) || 0;
    const projectAmountInput = document.getElementById('projectAmount');
    const projectAmount = projectAmountInput ? parseFloat(projectAmountInput.value) || 0 : 0;
    
    if (projectAmount > 0 && layoutCost > 0) {
        const percentage = (layoutCost / projectAmount) * 100;
        if (percentage > 5) {
            validationDiv.innerHTML = `<span style="color: #ff4444; font-size: 11px;">排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%</span>`;
            return false;
        } else {
            validationDiv.innerHTML = `<span style="color: #28a745; font-size: 11px;">占比: ${percentage.toFixed(2)}%</span>`;
        }
    } else {
        validationDiv.innerHTML = '';
    }
    return true;
}

// 内联添加成员：添加成员
export function addInlineMemberForCreate() {
    const roleSelect = document.getElementById('inlineCreateMemberRole');
    const userIdSelect = document.getElementById('inlineCreateMemberUserId');
    const role = roleSelect?.value;
    const userId = userIdSelect?.value;
    
    const currentRole = state.currentRole;
    if ((currentRole === 'sales' || currentRole === 'part_time_sales') && role !== 'pm') {
        showToast('当前角色只能添加项目经理', 'error');
        return;
    }
    
    if (!role || !userId) {
        showToast('请选择角色和用户', 'error');
        return;
    }
    
    // 检查是否已添加
    const exists = createProjectMembers.some(m => m.userId === userId && m.role === role);
    if (exists) {
        showToast('该用户已添加为此角色', 'error');
        return;
    }
    
    // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许
    
    const userInfo = (state.allUsers || []).find(u => u._id === userId);
    const member = {
        userId,
        role,
        employmentType: userInfo?.employmentType || 'full_time'
    };
    
    if (role === 'translator') {
        const translatorType = document.getElementById('inlineCreateTranslatorType')?.value || 'mtpe';
        const wordRatio = parseFloat(document.getElementById('inlineCreateWordRatio')?.value || 1.0);
        member.translatorType = translatorType;
        member.wordRatio = wordRatio;
    }
    
    if (role === 'layout') {
        const layoutCost = parseFloat(document.getElementById('inlineCreateLayoutCost')?.value || 0);
        if (layoutCost > 0) {
            const projectAmountInput = document.getElementById('projectAmount');
            const projectAmount = projectAmountInput ? parseFloat(projectAmountInput.value) || 0 : 0;
            if (projectAmount > 0) {
                const percentage = (layoutCost / projectAmount) * 100;
                if (percentage > 5) {
                    showToast(`排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%`, 'error');
                    return;
                }
            }
        }
        member.layoutCost = layoutCost;
    }
    
    createProjectMembers.push(member);
    updateCreateProjectMembersList();
    showToast('成员已添加', 'success');
    
    // 清空表单
    if (roleSelect) roleSelect.value = '';
    if (userIdSelect) userIdSelect.innerHTML = '<option value="">请先选择角色</option>';
    const translatorGroup = document.getElementById('inlineCreateTranslatorTypeGroup');
    const layoutCostGroup = document.getElementById('inlineCreateLayoutCostGroup');
    if (translatorGroup) translatorGroup.style.display = 'none';
    if (layoutCostGroup) {
        layoutCostGroup.style.display = 'none';
        const layoutCostInput = document.getElementById('inlineCreateLayoutCost');
        if (layoutCostInput) layoutCostInput.value = '';
        const validationDiv = document.getElementById('inlineCreateMemberLayoutCostValidation');
        if (validationDiv) validationDiv.innerHTML = '';
    }
    
    // 更新保存的状态中的成员列表
    if (createProjectFormState) {
        createProjectFormState._members = [...createProjectMembers];
    }
}

// 更新创建项目时的成员列表显示
export function updateCreateProjectMembersList() {
    const container = document.getElementById('createProjectMembersList');
    if (!container) return;
    
    if (createProjectMembers.length === 0) {
        container.innerHTML = '<p style="margin: 0; color: #999; font-size: 12px;">暂未添加成员，请在上方选择角色和用户后点击"添加成员"</p>';
        return;
    }
    
    const roleTextMap = {
        'pm': '项目经理',
        'translator': '翻译',
        'reviewer': '审校',
        'sales': '销售',
        'admin_staff': '综合岗',
        'part_time_sales': '兼职销售',
    'layout': '兼职排版',
    'part_time_translator': '兼职翻译'
    };
    
    container.innerHTML = createProjectMembers.map((member, index) => {
        const user = (state.allUsers || []).find(u => u._id === member.userId);
        const userName = user ? user.name : '未知用户';
        const roleText = roleTextMap[member.role] || member.role;
        const employmentLabel = (member.employmentType || user?.employmentType) === 'part_time' ? '兼职' : '专职';
        let extraInfo = '';
        if (member.role === 'translator') {
            extraInfo = ` (${member.translatorType === 'mtpe' ? 'MTPE' : '深度编辑'}, 占比: ${(member.wordRatio || 1.0).toFixed(2)})`;
        } else if (member.role === 'reviewer' && typeof member.wordRatio === 'number') {
            extraInfo = ` (占比: ${(member.wordRatio || 1.0).toFixed(2)})`;
        } else if (member.role === 'layout') {
            const ratioText = typeof member.wordRatio === 'number' ? `，占比: ${(member.wordRatio || 1.0).toFixed(2)}` : '';
            const costText = member.layoutCost ? `费用: ¥${member.layoutCost.toFixed(2)}` : '';
            const partTimeFeeText = member.partTimeFee ? `费用: ¥${member.partTimeFee.toFixed(2)}` : '';
            if (costText || partTimeFeeText || ratioText) {
                extraInfo = ` (${[costText || partTimeFeeText, ratioText].filter(Boolean).join('，')})`;
            }
        } else if (member.partTimeFee) {
            // 所有兼职角色（除兼职销售外）的费用
            extraInfo = ` (费用: ¥${member.partTimeFee.toFixed(2)})`;
        }
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: white; border-radius: 4px; margin-bottom: 8px;">
                <span style="font-size: 13px;">
                    <strong>${userName}</strong> - ${roleText} <span style="color:#6b7280;">(${employmentLabel})</span>${extraInfo}
                </span>
                <button type="button" class="btn-small" data-click="removeCreateProjectMember(${index})" style="background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">删除</button>
            </div>
        `;
    }).join('');
}

// 显示添加成员模态框（用于创建项目时）
export async function showAddMemberModalForCreate() {
    // 保存当前创建项目表单的状态
    saveCreateProjectFormState();
    
    if ((state.allUsers || []).length === 0) {
        try {
            const response = await apiFetch('/users');
            const data = await response.json();
            if (data.success) state.allUsers = data.data;
        } catch (err) {
            alert('加载用户列表失败: ' + err.message);
            return;
        }
    }
    
    // 检查用户角色，确定可选择的角色 - 基于当前选择的角色判断
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isAdmin = currentRole === 'admin';
    const isPM = currentRole === 'pm';
    const isSales = currentRole === 'sales';
    const isPartTimeSales = currentRole === 'part_time_sales';

    // 动态加载所有「可作为项目成员」的角色（含兼职翻译等）
    const dynamicProjectMemberRoles = await ensureProjectMemberRoles();

    // 权限控制（按当前角色）：
    // - 管理员：固定基础角色 + 所有动态角色
    // - 项目经理：基础执行角色 + 所有动态角色
    // - 销售/兼职销售：只能添加项目经理
    // - 其他：默认只能添加项目经理
    let availableRoles;
    if (isAdmin) {
        const baseAdminRoles = [
            { value: 'translator', label: '翻译' },
            { value: 'reviewer', label: '审校' },
            { value: 'pm', label: '项目经理' },
            { value: 'sales', label: '销售' },
            { value: 'admin_staff', label: '综合岗' },
            { value: 'part_time_sales', label: '兼职销售' },
            { value: 'layout', label: '兼职排版' }
        ];
        availableRoles = [
            ...baseAdminRoles,
            ...dynamicProjectMemberRoles.filter(r => !baseAdminRoles.some(b => b.value === r.value))
        ];
    } else if (isPM) {
        const pmBaseRoles = [
            { value: 'translator', label: '翻译' },
            { value: 'reviewer', label: '审校' },
            { value: 'layout', label: '兼职排版' }
        ];
        availableRoles = [
            ...pmBaseRoles,
            // 把所有动态角色里“不是这三个基础角色”的都加进来（例如：part_time_translator 等）
            ...dynamicProjectMemberRoles.filter(r => !pmBaseRoles.some(b => b.value === r.value))
        ];
    } else if (isSales || isPartTimeSales) {
        // 当前角色为销售/兼职销售：只能添加项目经理
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    } else {
        // 其他情况默认只能添加项目经理
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    }
    
    const projectAmountInput = document.getElementById('projectAmount');
    const projectAmount = projectAmountInput ? parseFloat(projectAmountInput.value) || 0 : 0;
    
    const content = `
        <form id="addMemberFormForCreate" data-project-amount="${projectAmount}" data-submit="addMemberForCreate(event)">
            <div class="form-group">
                <label>角色 *</label>
                <select name="role" id="createMemberRole" data-change="onCreateMemberRoleChange()" required>
                    <option value="">请选择</option>
                    ${availableRoles.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>选择用户 *</label>
                <select name="userId" id="createMemberUserId" data-change="onCreateMemberUserChange()" required>
                    <option value="">请先选择角色</option>
                </select>
            </div>
            <div class="form-group" id="createTranslatorTypeGroup" style="display: none;">
                <label>翻译类型</label>
                <select name="translatorType">
                    <option value="mtpe">MTPE</option>
                    <option value="deepedit">深度编辑</option>
                </select>
            </div>
            <div class="form-group" id="createWordRatioGroup" style="display: none;">
                <label>字数占比 (0-1，多个翻译时使用)</label>
                <input type="number" name="wordRatio" step="0.01" min="0" max="1" value="1.0">
            </div>
            <div class="form-group" id="createLayoutCostGroup" style="display: none;">
                <label>排版费用（元）</label>
                <input type="number" name="layoutCost" id="createMemberLayoutCost" step="0.01" min="0" data-change="validateCreateMemberLayoutCost()">
                <small style="color: #666; font-size: 12px;">排版费用不能超过项目总金额的5%</small>
                <div id="createMemberLayoutCostValidation" style="margin-top: 5px;"></div>
            </div>
            <div class="form-group" id="createPartTimeFeeGroup" style="display: none;">
                <label id="createPartTimeFeeLabel">兼职费用（元）</label>
                <input type="number" name="partTimeFee" id="createMemberPartTimeFee" step="0.01" min="0">
                <small style="color: #666; font-size: 12px;">用于兼职角色的实际支付金额（除兼职销售外，所有兼职角色都需要输入费用）</small>
                <div id="createMemberPartTimeFeeValidation" style="margin-top: 5px;"></div>
            </div>
            <div class="action-buttons">
                <button type="submit">添加</button>
                <button type="button" data-click="closeAddMemberModalAndReturnToCreate()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '添加项目成员', body: content });
}

// 添加成员（用于创建项目时）
export async function addMemberForCreate(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const role = formData.get('role');
    const userId = formData.get('userId');
    const currentRole = state.currentRole;
    // 当前角色为销售/兼职销售时，强制只能添加项目经理
    if ((currentRole === 'sales' || currentRole === 'part_time_sales') && role !== 'pm') {
        showToast('当前角色只能添加项目经理', 'error');
        return;
    }
    if (!role || !userId) {
        showToast('请选择角色和用户', 'error');
        return;
    }
    
    // 检查是否已添加
    const exists = createProjectMembers.some(m => m.userId === userId && m.role === role);
    if (exists) {
        showToast('该用户已添加为此角色', 'error');
        return;
    }
    
    // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许
    
    const member = {
        userId,
        role
    };
    
    if (role === 'translator') {
        member.translatorType = formData.get('translatorType') || 'mtpe';
        member.wordRatio = formData.get('wordRatio') ? parseFloat(formData.get('wordRatio')) : 1.0;
    }
    
    // 检查用户是否为兼职（除兼职销售外）
    const selectedUser = (state.allUsers || []).find(u => u._id === userId);
    const isPartTime = selectedUser?.employmentType === 'part_time';
    const isPartTimeSales = role === 'part_time_sales' || (role === 'sales' && isPartTime);
    
    // 兼职角色（除兼职销售外）需要输入费用
    if (isPartTime && !isPartTimeSales) {
        const partTimeFee = formData.get('partTimeFee') ? parseFloat(formData.get('partTimeFee')) : 0;
        const projectAmount = parseFloat(document.getElementById('addMemberFormForCreate')?.dataset?.projectAmount || 0);
        
        if (!partTimeFee || partTimeFee <= 0) {
            const roleName = role === 'layout' ? '排版' : role === 'part_time_translator' ? '翻译' : role;
            showToast(`请输入${roleName}费用，且必须大于0`, 'error');
            return;
        }
        if (projectAmount && partTimeFee > projectAmount) {
            showToast('费用不能大于项目总金额', 'error');
            return;
        }
        
        // 兼职排版还需要验证费用不超过项目总金额的5%
        if (role === 'layout') {
            if (projectAmount > 0) {
                const percentage = (partTimeFee / projectAmount) * 100;
                if (percentage > 5) {
                    showToast(`排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%`, 'error');
                    return;
                }
            }
        }
        
        member.partTimeFee = partTimeFee;
    } else if (role === 'layout' && !isPartTime) {
        // 专职排版：保持向后兼容，使用layoutCost
        const layoutCost = formData.get('layoutCost') ? parseFloat(formData.get('layoutCost')) : 0;
        if (layoutCost > 0) {
            const projectAmount = parseFloat(document.getElementById('addMemberFormForCreate')?.dataset?.projectAmount || 0);
            if (projectAmount > 0) {
                const percentage = (layoutCost / projectAmount) * 100;
                if (percentage > 5) {
                    showToast(`排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%`, 'error');
                    return;
                }
            }
        }
        member.layoutCost = layoutCost;
    }
    
    createProjectMembers.push(member);
    updateCreateProjectMembersList();
    showToast('成员已添加', 'success');
    
    // 更新保存的状态中的成员列表
    if (createProjectFormState) {
        createProjectFormState._members = [...createProjectMembers];
    }
    
    // 关闭添加成员的模态框，返回到创建项目界面
    // 由于模态框系统不支持嵌套，我们需要重新打开创建项目模态框
    closeModal();
    // 延迟一下，确保模态框完全关闭后再重新打开
    setTimeout(() => {
        showCreateProjectModal();
    }, 100);
}

// 关闭添加成员模态框并返回到创建项目界面
export function closeAddMemberModalAndReturnToCreate() {
    closeModal();
    setTimeout(() => {
        showCreateProjectModal();
    }, 100);
}

// 删除创建项目时的成员
export function removeCreateProjectMember(index) {
    if (index >= 0 && index < createProjectMembers.length) {
        createProjectMembers.splice(index, 1);
        updateCreateProjectMembersList();
        showToast('成员已移除', 'success');
    }
}

// 切换翻译字段显示（用于创建项目时）
export function toggleCreateTranslatorFields() {
    const role = document.getElementById('createMemberRole')?.value;
    const translatorGroup = document.getElementById('createTranslatorTypeGroup');
    const wordRatioGroup = document.getElementById('createWordRatioGroup');
    const layoutCostGroup = document.getElementById('createLayoutCostGroup');
    const partTimeFeeGroup = document.getElementById('createPartTimeFeeGroup');
    if (role === 'translator') {
        if (translatorGroup) translatorGroup.style.display = 'block';
        if (wordRatioGroup) wordRatioGroup.style.display = 'block';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'none';
    } else if (role === 'layout') {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'block';
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'none';
    } else if (role === 'part_time_translator') {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'block';
    } else {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'none';
    }
}

// 包装函数：当创建项目时角色选择改变时，同时调用 toggleCreateTranslatorFields 和 filterCreateUsersByRole
export function onCreateMemberRoleChange() {
    toggleCreateTranslatorFields();
    filterCreateUsersByRole();
    // 重置用户选择，以便重新检查兼职状态
    const userIdSelect = document.getElementById('createMemberUserId');
    if (userIdSelect) {
        userIdSelect.value = '';
        const partTimeFeeGroup = document.getElementById('createPartTimeFeeGroup');
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'none';
    }
}

// 当创建项目时用户选择改变时，检查是否为兼职并显示费用输入字段
export function onCreateMemberUserChange() {
    const role = document.getElementById('createMemberRole')?.value;
    const userId = document.getElementById('createMemberUserId')?.value;
    const partTimeFeeGroup = document.getElementById('createPartTimeFeeGroup');
    const partTimeFeeLabel = document.getElementById('createPartTimeFeeLabel');
    const partTimeFeeInput = document.getElementById('createMemberPartTimeFee');
    const layoutCostGroup = document.getElementById('createLayoutCostGroup');
    
    if (!role || !userId || !partTimeFeeGroup) return;
    
    // 查找选中的用户
    const selectedUser = (state.allUsers || []).find(u => u._id === userId);
    if (!selectedUser) return;
    
    // 判断是否为兼职角色（除兼职销售外）
    const isPartTime = selectedUser.employmentType === 'part_time';
    const isPartTimeSales = role === 'part_time_sales' || (role === 'sales' && isPartTime);
    
    // 如果是兼职角色（除兼职销售外），显示费用输入字段
    if (isPartTime && !isPartTimeSales) {
        partTimeFeeGroup.style.display = 'block';
        // 如果是layout角色且是兼职，隐藏layoutCostGroup（专职排版费用字段）
        if (role === 'layout' && layoutCostGroup) {
            layoutCostGroup.style.display = 'none';
        }
        if (partTimeFeeLabel) {
            const roleName = role === 'part_time_translator' ? '兼职翻译' : 
                           role === 'layout' ? '兼职排版' : 
                           `兼职${getRoleText(role)}`;
            partTimeFeeLabel.textContent = `${roleName}费用（元）`;
        }
        if (partTimeFeeInput) {
            partTimeFeeInput.required = true;
        }
    } else {
        // 专职角色或兼职销售，隐藏费用输入字段
        partTimeFeeGroup.style.display = 'none';
        // 如果是layout角色且是专职，显示layoutCostGroup（专职排版费用字段）
        if (role === 'layout' && layoutCostGroup) {
            layoutCostGroup.style.display = 'block';
        }
        if (partTimeFeeInput) {
            partTimeFeeInput.required = false;
            partTimeFeeInput.value = '';
        }
    }
}

// 根据角色过滤用户（用于创建项目时）
export function filterCreateUsersByRole() {
    const role = document.getElementById('createMemberRole')?.value;
    const userIdSelect = document.getElementById('createMemberUserId');
    
    if (!role || !userIdSelect) {
        if (userIdSelect) userIdSelect.innerHTML = '<option value="">请先选择角色</option>';
        return;
    }
    
    // 确保用户列表已加载
    if (!state.allUsers || state.allUsers.length === 0) {
        if (userIdSelect) userIdSelect.innerHTML = '<option value="">加载用户列表中...</option>';
        // 尝试重新加载用户列表
        apiFetch('/users').then(res => res.json()).then(data => {
            if (data.success) {
                state.allUsers = data.data;
                // 重新过滤
                filterCreateUsersByRole();
            } else {
                if (userIdSelect) userIdSelect.innerHTML = '<option value="">用户列表加载失败</option>';
            }
        }).catch(err => {
            console.error('加载用户列表失败:', err);
            if (userIdSelect) userIdSelect.innerHTML = '<option value="">用户列表加载失败</option>';
        });
        return;
    }
    
    let filteredUsers = (state.allUsers || []).filter(u => {
        if (!u.isActive) return false;
        // roles 是数组，检查是否包含该角色
        if (!u.roles || !Array.isArray(u.roles)) return false;
        return u.roles.includes(role);
    });
    
    // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许
    // 前端不再过滤用户列表，以保持与后端配置的一致性
    
    if (filteredUsers.length === 0) {
        userIdSelect.innerHTML = '<option value="">没有可用的用户</option>';
    } else {
        userIdSelect.innerHTML = '<option value="">请选择用户</option>' + 
            filteredUsers.map(u => `<option value="${u._id}">${u.name}</option>`).join('');
    }
}

// 验证创建项目时的排版费用
export function validateCreateMemberLayoutCost() {
    const layoutCostInput = document.getElementById('createMemberLayoutCost');
    const validationDiv = document.getElementById('createMemberLayoutCostValidation');
    if (!layoutCostInput || !validationDiv) return true;
    
    const layoutCost = parseFloat(layoutCostInput.value) || 0;
    const projectAmount = parseFloat(document.getElementById('addMemberFormForCreate')?.dataset?.projectAmount || 0);
    
    if (projectAmount > 0 && layoutCost > 0) {
        const percentage = (layoutCost / projectAmount) * 100;
        if (percentage > 5) {
            validationDiv.innerHTML = `<span style="color: #ff4444; font-size: 12px;">排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%</span>`;
            return false;
        } else {
            validationDiv.innerHTML = `<span style="color: #28a745; font-size: 12px;">占比: ${percentage.toFixed(2)}%</span>`;
        }
    } else {
        validationDiv.innerHTML = '';
    }
    return true;
}

export async function showAddMemberModal(projectId) {
    // 如果当前有打开的模态框，先关闭它
    if (document.getElementById('modalOverlay')?.classList.contains('active')) {
        closeModal();
        // 等待模态框关闭动画完成
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if ((state.allUsers || []).length === 0) {
        try {
            const response = await apiFetch('/users');
            const data = await response.json();
            if (data.success) state.allUsers = data.data;
        } catch (err) {
            alert('加载用户列表失败: ' + err.message);
            return;
        }
    }

    const projectAmount = currentProjectDetail?.projectAmount || 0;
    const dynamicProjectMemberRoles = await ensureProjectMemberRoles();
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isAdmin = currentRole === 'admin';
    const isPM = currentRole === 'pm';
    const isSales = currentRole === 'sales';
    const isPartTimeSales = currentRole === 'part_time_sales';
    let availableRoles;
    const baseAdminRoles = [
        { value: 'translator', label: '翻译' },
        { value: 'reviewer', label: '审校' },
        { value: 'pm', label: '项目经理' },
        { value: 'sales', label: '销售' },
        { value: 'admin_staff', label: '综合岗' },
        { value: 'part_time_sales', label: '兼职销售' },
        { value: 'layout', label: '兼职排版' }
    ];
    if (isAdmin) {
        availableRoles = [
            ...baseAdminRoles,
            ...dynamicProjectMemberRoles.filter(r => !baseAdminRoles.some(b => b.value === r.value))
        ];
    } else if (isPM) {
        // 项目经理：默认可以添加核心执行角色 + 任何「可作为项目成员」的动态角色
        const pmBaseRoles = [
            { value: 'translator', label: '翻译' },
            { value: 'reviewer', label: '审校' },
            { value: 'layout', label: '兼职排版' }
        ];
        availableRoles = [
            ...pmBaseRoles,
            // 把所有动态角色里“不是这三个基础角色”的都加进来（例如：part_time_translator 等）
            ...dynamicProjectMemberRoles.filter(r => !pmBaseRoles.some(b => b.value === r.value))
        ];
    } else if (isSales || isPartTimeSales) {
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    } else {
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    }
    const content = `
        <form id="addMemberForm" data-project-id="${projectId}" data-project-amount="${projectAmount}" data-submit="addMember(event, '${projectId}')">
            <div class="form-group">
                <label>角色 *</label>
                <select name="role" id="memberRole" data-change="onMemberRoleChange()" required>
                    <option value="">请选择</option>
                    ${availableRoles.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>选择用户 *</label>
                <select name="userId" id="memberUserId" data-change="onMemberUserChange()" required>
                    <option value="">请先选择角色</option>
                </select>
            </div>
            <div class="form-group" id="translatorTypeGroup" style="display: none;">
                <label>翻译类型</label>
                <select name="translatorType">
                    <option value="mtpe">MTPE</option>
                    <option value="deepedit">深度编辑</option>
                </select>
            </div>
            <div class="form-group" id="wordRatioGroup" style="display: none;">
                <label>字数占比 (0-1，多个翻译时使用)</label>
                <input type="number" name="wordRatio" step="0.01" min="0" max="1" value="1.0">
            </div>
            <div class="form-group" id="layoutCostGroup" style="display: none;">
                <label>排版费用（元）</label>
                <input type="number" name="layoutCost" id="addMemberLayoutCost" step="0.01" min="0" data-change="validateAddMemberLayoutCost()">
                <small style="color: #666; font-size: 12px;">排版费用不能超过项目总金额的5%</small>
                <div id="addMemberLayoutCostValidation" style="margin-top: 5px;"></div>
            </div>
            <div class="form-group" id="partTimeFeeGroup" style="display: none;">
                <label id="partTimeFeeLabel">兼职费用（元）</label>
                <input type="number" name="partTimeFee" id="addMemberPartTimeFee" step="0.01" min="0">
                <small style="color: #666; font-size: 12px;">用于兼职角色的实际支付金额（除兼职销售外，所有兼职角色都需要输入费用）</small>
                <div id="addMemberPartTimeFeeValidation" style="margin-top: 5px;"></div>
            </div>
            <div class="form-group">
                <label>邮件附件（可选，可多选）</label>
                <input type="file" id="addMemberAttachments" multiple>
                <small style="color: #666; font-size: 12px;">仅用于给该成员发送邮件，建议总大小不超过 10MB。</small>
                <div id="addMemberAttachmentsList" style="margin-top: 6px;"></div>
            </div>
            <div class="action-buttons">
                <button type="submit">添加</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '添加项目成员', body: content });
    
    // 如果已经选择了角色，立即过滤用户列表，并初始化附件列表
    setTimeout(() => {
        const roleSelect = document.getElementById('memberRole');
        if (roleSelect && roleSelect.value) {
            filterUsersByRole();
        }
        const attachmentsInput = document.getElementById('addMemberAttachments');
        const attachmentsList = document.getElementById('addMemberAttachmentsList');
        if (attachmentsInput && attachmentsList) {
            attachmentsInput.addEventListener('change', function () {
                const files = Array.from(this.files);
                if (files.length === 0) {
                    attachmentsList.innerHTML = '';
                    return;
                }
                const listHtml = files.map((file, index) => {
                    const size = (file.size / 1024).toFixed(2);
                    return `<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: #f0f0f0; border-radius: 4px; margin-bottom: 4px;">
                        <span>${file.name} (${size} KB)</span>
                        <button type="button" data-click="removeAddMemberAttachment(${index})" style="background: #ef4444; color: white; border: none; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 11px;">移除</button>
                    </div>`;
                }).join('');
                attachmentsList.innerHTML = listHtml;
            });
        }
    }, 100);
}

export function toggleTranslatorFields() {
    const role = document.getElementById('memberRole')?.value;
    const translatorGroup = document.getElementById('translatorTypeGroup');
    const wordRatioGroup = document.getElementById('wordRatioGroup');
    const layoutCostGroup = document.getElementById('layoutCostGroup');
    const partTimeFeeGroup = document.getElementById('partTimeFeeGroup');
    if (role === 'translator') {
        if (translatorGroup) translatorGroup.style.display = 'block';
        if (wordRatioGroup) wordRatioGroup.style.display = 'block';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'none';
    } else if (role === 'reviewer') {
        // 审校：只需要占比，不需要翻译类型和排版费用
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'block';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'none';
    } else if (role === 'layout') {
        // 排版：需要占比 + 排版费用
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'block';
        if (layoutCostGroup) layoutCostGroup.style.display = 'block';
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'none';
    } else if (role === 'part_time_translator') {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'block';
    } else {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'none';
    }
}

// 包装函数：当角色选择改变时，同时调用 toggleTranslatorFields 和 filterUsersByRole
export function onMemberRoleChange() {
    toggleTranslatorFields();
    filterUsersByRole();
    // 重置用户选择，以便重新检查兼职状态
    const userIdSelect = document.getElementById('memberUserId');
    if (userIdSelect) {
        userIdSelect.value = '';
        const partTimeFeeGroup = document.getElementById('partTimeFeeGroup');
        if (partTimeFeeGroup) partTimeFeeGroup.style.display = 'none';
    }
}

// 当用户选择改变时，检查是否为兼职并显示费用输入字段
export function onMemberUserChange() {
    const role = document.getElementById('memberRole')?.value;
    const userId = document.getElementById('memberUserId')?.value;
    const partTimeFeeGroup = document.getElementById('partTimeFeeGroup');
    const partTimeFeeLabel = document.getElementById('partTimeFeeLabel');
    const partTimeFeeInput = document.getElementById('addMemberPartTimeFee');
    const layoutCostGroup = document.getElementById('layoutCostGroup');
    
    if (!role || !userId || !partTimeFeeGroup) return;
    
    // 查找选中的用户
    const selectedUser = (state.allUsers || []).find(u => u._id === userId);
    if (!selectedUser) return;
    
    // 判断是否为兼职角色（除兼职销售外）
    const isPartTime = selectedUser.employmentType === 'part_time';
    const isPartTimeSales = role === 'part_time_sales' || (role === 'sales' && isPartTime);
    
    // 如果是兼职角色（除兼职销售外），显示费用输入字段
    if (isPartTime && !isPartTimeSales) {
        partTimeFeeGroup.style.display = 'block';
        // 如果是layout角色且是兼职，隐藏layoutCostGroup（专职排版费用字段）
        if (role === 'layout' && layoutCostGroup) {
            layoutCostGroup.style.display = 'none';
        }
        if (partTimeFeeLabel) {
            const roleName = role === 'part_time_translator' ? '兼职翻译' : 
                           role === 'layout' ? '兼职排版' : 
                           `兼职${getRoleText(role)}`;
            partTimeFeeLabel.textContent = `${roleName}费用（元）`;
        }
        if (partTimeFeeInput) {
            partTimeFeeInput.required = true;
        }
    } else {
        // 专职角色或兼职销售，隐藏费用输入字段
        partTimeFeeGroup.style.display = 'none';
        // 如果是layout角色且是专职，显示layoutCostGroup（专职排版费用字段）
        if (role === 'layout' && layoutCostGroup) {
            layoutCostGroup.style.display = 'block';
        }
        if (partTimeFeeInput) {
            partTimeFeeInput.required = false;
            partTimeFeeInput.value = '';
        }
    }
}

export function filterUsersByRole() {
    console.log('filterUsersByRole 被调用');
    const role = document.getElementById('memberRole')?.value;
    const userIdSelect = document.getElementById('memberUserId');
    
    console.log('选择的角色:', role);
    console.log('用户列表长度:', state.allUsers?.length || 0);
    console.log('当前用户:', state.currentUser?.name);
    
    if (!role || !userIdSelect) {
        console.log('角色或用户选择框不存在');
        if (userIdSelect) userIdSelect.innerHTML = '<option value="">请先选择角色</option>';
        return;
    }
    
    // 确保用户列表已加载
    if (!state.allUsers || state.allUsers.length === 0) {
        console.warn('用户列表未加载，尝试重新加载...');
        if (userIdSelect) userIdSelect.innerHTML = '<option value="">加载用户列表中...</option>';
        // 尝试重新加载用户列表
        apiFetch('/users').then(res => res.json()).then(data => {
            if (data.success) {
                state.allUsers = data.data;
                console.log('用户列表已重新加载，数量:', state.allUsers.length);
                // 重新过滤
                filterUsersByRole();
            } else {
                if (userIdSelect) userIdSelect.innerHTML = '<option value="">用户列表加载失败</option>';
            }
        }).catch(err => {
            console.error('加载用户列表失败:', err);
            if (userIdSelect) userIdSelect.innerHTML = '<option value="">用户列表加载失败</option>';
        });
        return;
    }
    
    // 显示所有用户信息（用于调试）
    console.log('所有用户:', state.allUsers.map(u => ({ name: u.name, roles: u.roles, isActive: u.isActive })));
    
    let filteredUsers = (state.allUsers || []).filter(u => {
        if (!u.isActive) {
            console.log(`用户 ${u.name} 未激活`);
            return false;
        }
        // roles 是数组，检查是否包含该角色
        if (!u.roles || !Array.isArray(u.roles)) {
            console.log(`用户 ${u.name} 没有角色或角色不是数组:`, u.roles);
            return false;
        }
        const hasRole = u.roles.includes(role);
        console.log(`用户 ${u.name} 角色:`, u.roles, `包含 ${role}:`, hasRole);
        return hasRole;
    });
    
    console.log(`角色 ${role} 的可用用户:`, filteredUsers.length, filteredUsers.map(u => u.name));
    
    // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许
    // 前端不再过滤用户列表，以保持与后端配置的一致性
    
    if (filteredUsers.length === 0) {
        userIdSelect.innerHTML = '<option value="">没有可用的用户</option>';
        console.warn('没有找到符合条件的用户');
    } else {
        userIdSelect.innerHTML = '<option value="">请选择用户</option>' + filteredUsers.map(u => `<option value="${u._id}">${u.name}</option>`).join('');
        console.log('用户列表已更新，选项数量:', filteredUsers.length);
    }
}

export function validateAddMemberLayoutCost() {
    const layoutCostInput = document.getElementById('addMemberLayoutCost');
    const validationDiv = document.getElementById('addMemberLayoutCostValidation');
    const layoutCost = parseFloat(layoutCostInput?.value || 0);
    const projectAmount = currentProjectDetail?.projectAmount || parseFloat(document.getElementById('addMemberForm')?.dataset?.projectAmount || 0);
    if (!layoutCost || layoutCost <= 0) {
        if (validationDiv) validationDiv.innerHTML = '<span style="color: #dc2626;">请输入排版费用</span>';
        return false;
    }
    if (!projectAmount) {
        if (validationDiv) validationDiv.innerHTML = '<span style="color: #dc2626;">无法验证：项目金额未加载</span>';
        return false;
    }
    const percentage = (layoutCost / projectAmount) * 100;
    if (validationDiv) {
        if (percentage > 5) {
            validationDiv.innerHTML = `<span style="color: #dc2626;">排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%</span>`;
            return false;
        }
        validationDiv.innerHTML = `<span style="color: #059669;">费用占比：${percentage.toFixed(2)}%</span>`;
    }
    return true;
}

export function validateAddMemberPartTimeFee() {
    const feeInput = document.getElementById('addMemberPartTimeFee');
    const validationDiv = document.getElementById('addMemberPartTimeFeeValidation');
    const fee = parseFloat(feeInput?.value || 0);
    const projectAmount = currentProjectDetail?.projectAmount || parseFloat(document.getElementById('addMemberForm')?.dataset?.projectAmount || 0);
    if (!fee || fee <= 0) {
        if (validationDiv) validationDiv.innerHTML = '<span style="color: #dc2626;">请输入兼职翻译费用</span>';
        return false;
    }
    if (projectAmount && fee > projectAmount) {
        if (validationDiv) validationDiv.innerHTML = '<span style="color: #dc2626;">兼职翻译费用不能大于项目总金额</span>';
        return false;
    }
    if (validationDiv) validationDiv.innerHTML = `<span style="color: #059669;">费用：¥${fee.toFixed(2)}</span>`;
    return true;
}

export async function addMember(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const role = formData.get('role');
    const userId = formData.get('userId');
    if (!role || !userId) return alert('请选择角色和用户');

    // 注意：自分配限制检查已移至后端，后端会根据配置（allow_self_assignment）决定是否允许

    // 检查用户是否为兼职（除兼职销售外）
    const selectedUser = (state.allUsers || []).find(u => u._id === userId);
    const isPartTime = selectedUser?.employmentType === 'part_time';
    const isPartTimeSales = role === 'part_time_sales' || (role === 'sales' && isPartTime);
    
    let payload = { role, userId };
    if (role === 'translator') {
        payload.translatorType = formData.get('translatorType') || 'mtpe';
        payload.wordRatio = formData.get('wordRatio') ? parseFloat(formData.get('wordRatio')) : 1.0;
    }
    
    // 兼职角色（除兼职销售外）需要输入费用
    if (isPartTime && !isPartTimeSales) {
        const partTimeFee = formData.get('partTimeFee') ? parseFloat(formData.get('partTimeFee')) : 0;
        const projectAmount = parseFloat(document.getElementById('addMemberForm')?.dataset?.projectAmount || 0);
        
        if (!partTimeFee || partTimeFee <= 0) {
            const roleName = role === 'layout' ? '排版' : role === 'part_time_translator' ? '翻译' : role;
            showToast(`请输入${roleName}费用，且必须大于0`, 'error');
            return;
        }
        if (projectAmount && partTimeFee > projectAmount) {
            showToast('费用不能大于项目总金额', 'error');
            return;
        }
        
        // 兼职排版还需要验证费用不超过项目总金额的5%
        if (role === 'layout') {
            if (projectAmount > 0) {
                const percentage = (partTimeFee / projectAmount) * 100;
                if (percentage > 5) {
                    showToast(`排版费用不能超过项目总金额的5%，当前占比为${percentage.toFixed(2)}%`, 'error');
                    return;
                }
            }
        }
        
        payload.partTimeFee = partTimeFee;
    } else if (role === 'layout' && !isPartTime) {
        // 专职排版：保持向后兼容，使用layoutCost
        const layoutCost = formData.get('layoutCost') ? parseFloat(formData.get('layoutCost')) : 0;
        if (layoutCost > 0 && !validateAddMemberLayoutCost()) return;
        payload.layoutCost = layoutCost;
    }

    // 处理多附件：与创建项目时逻辑类似
    const attachmentsInput = document.getElementById('addMemberAttachments');
    if (attachmentsInput && attachmentsInput.files && attachmentsInput.files.length > 0) {
        const files = Array.from(attachmentsInput.files);
        const maxTotalSize = 10 * 1024 * 1024; // 10MB
        let totalSize = 0;

        for (const file of files) {
            totalSize += file.size;
            if (totalSize > maxTotalSize) {
                showToast('附件总大小不能超过 10MB', 'error');
                return;
            }
        }

        try {
            const attachmentPromises = files.map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const base64 = reader.result.split(',')[1];
                        resolve({
                            filename: file.name,
                            content: base64
                        });
                    };
                    reader.onerror = () => reject(new Error('读取附件失败'));
                    reader.readAsDataURL(file);
                });
            });
            const attachments = await Promise.all(attachmentPromises);
            if (attachments && attachments.length > 0) {
                payload.attachments = attachments;
            }
        } catch (err) {
            console.error('[Projects] 读取成员附件失败:', err);
            showToast('读取附件失败，请重试', 'error');
            return;
        }
    }

    try {
        const res = await apiFetch(`/projects/${projectId}/add-member`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        // 先处理非 2xx 情况，展示后端返回的错误信息
        if (!res.ok) {
            let errorMessage = '添加失败';
            try {
                const errorData = await res.json();
                // 处理错误信息：可能是 errorData.message 或 errorData.error.message
                if (errorData) {
                    if (errorData.message) {
                        errorMessage = errorData.message;
                    } else if (errorData.error) {
                        if (typeof errorData.error === 'string') {
                            errorMessage = errorData.error;
                        } else if (errorData.error.message) {
                            errorMessage = errorData.error.message;
                        }
                    } else if (errorData.msg) {
                        errorMessage = errorData.msg;
                    }
                }
            } catch (parseErr) {
                // 如果解析失败，就退回到状态码提示
                errorMessage = `添加失败 (HTTP ${res.status})`;
            }
            showToast(errorMessage, 'error');
            return;
        }

        const data = await res.json();
        if (!data.success) {
            // 处理错误信息：可能是 data.message 或 data.error.message
            let errorMessage = '添加失败';
            if (data.message) {
                errorMessage = data.message;
            } else if (data.error) {
                if (typeof data.error === 'string') {
                    errorMessage = data.error;
                } else if (data.error.message) {
                    errorMessage = data.error.message;
                }
            }
            showToast(errorMessage, 'error');
            return;
        }
        closeModal();
        // 重新加载项目详情以获取最新的成员列表
        await viewProject(projectId);
        showToast('成员已添加', 'success');
    } catch (err) {
        const errorMessage = err?.message || (typeof err === 'string' ? err : '未知错误');
        showToast('添加失败: ' + errorMessage, 'error');
    }
}

// 显示回款管理模态框（用于项目详情）
export async function showPaymentModalForProject(projectId) {
    // 如果当前有打开的模态框，先关闭它
    if (document.getElementById('modalOverlay')?.classList.contains('active')) {
        closeModal();
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 导入 finance 模块的函数
    const { loadPaymentRecordsForProject } = await import('./finance.js');
    
    // 创建一个临时容器ID用于模态框
    const tempContainerId = `projectPaymentModalContent_${projectId}`;
    const content = `
        <div id="${tempContainerId}">
            <div class="card-desc">加载中...</div>
        </div>
    `;
    
    showModal({ title: '回款管理', body: content });
    
    // 临时修改 loadPaymentRecordsForProject 使用的容器ID
    const originalContainerId = `payment-records-detail-${projectId}`;
    
    // 加载回款记录到模态框容器
    try {
        const res = await apiFetch(`/finance/payment/${projectId}`);
        const data = await res.json();
        if (!data.success) {
            document.getElementById(tempContainerId).innerHTML = `<div style="text-align: center; color: #ef4444;">加载失败: ${data.message || '未知错误'}</div>`;
            return;
        }

        const projectRes = await apiFetch(`/projects/${projectId}`);
        const projectData = await projectRes.json();
        const project = projectData.success ? projectData.data : null;

        const paymentStatusText = { unpaid: '未支付', partially_paid: '部分支付', paid: '已支付' };
        const canManageFinance = (state.currentUser?.roles || []).includes('admin') || (state.currentUser?.roles || []).includes('finance');

        // 如果没有回款记录，显示新增表单
        if (!data.data || data.data.length === 0) {
            const projectAmount = project?.projectAmount || 0;
            const projectPaymentStatus = project?.payment?.paymentStatus || 'unpaid';
            document.getElementById(tempContainerId).innerHTML = `
                <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
                    <div><div style="font-size: 12px; color: #666;">项目金额</div><div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div></div>
                    <div><div style="font-size: 12px; color: #666;">已回款</div><div style="font-size: 16px; font-weight: bold; color: #10b981;">¥0</div></div>
                    <div><div style="font-size: 12px; color: #666;">剩余应收</div><div style="font-size: 16px; font-weight: bold; color: #f59e0b;">¥${projectAmount.toLocaleString()}</div></div>
                    <div>
                        <div style="font-size: 12px; color: #666;">回款状态</div>
                        <div><span class="badge ${projectPaymentStatus === 'paid' ? 'badge-success' : projectPaymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">${paymentStatusText[projectPaymentStatus] || projectPaymentStatus}</span></div>
                    </div>
                </div>
                ${canManageFinance ? `
                <div class="card" style="margin-bottom: 12px; background: #f9fafb;">
                    <div class="card-title" style="font-size: 14px; margin-bottom: 8px;">新增回款记录</div>
                    <form id="addPaymentForm_${projectId}" data-submit="addPaymentRecordForProject(event, '${projectId}')" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">回款日期 <span style="color: #e74c3c;">*</span></label>
                            <input type="date" id="paymentDate_${projectId}" required style="padding: 6px; width: 100%;" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">金额 <span style="color: #e74c3c;">*</span></label>
                            <input type="number" step="0.01" id="paymentAmount_${projectId}" required style="padding: 6px; width: 100%;" placeholder="0.00">
                        </div>
                        <div style="flex: 1; min-width: 100px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">支付方式</label>
                            <select id="paymentMethod_${projectId}" style="padding: 6px; width: 100%;">
                                <option value="bank">银行转账</option>
                                <option value="cash">现金</option>
                                <option value="alipay">支付宝</option>
                                <option value="wechat">微信</option>
                            </select>
                        </div>
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">凭证号</label>
                            <input type="text" id="paymentReference_${projectId}" style="padding: 6px; width: 100%;" placeholder="可选">
                        </div>
                        <div style="flex: 1; min-width: 120px;">
                            <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">关联发票号</label>
                            <input type="text" id="paymentInvoiceNumber_${projectId}" style="padding: 6px; width: 100%;" placeholder="可选">
                        </div>
                        <div>
                            <button type="submit" style="padding: 6px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">新增回款</button>
                        </div>
                    </form>
                </div>
                ` : ''}
                <div class="card-desc">暂无回款记录</div>
            `;
            return;
        }

        const rows = data.data.map(r => `
            <tr>
                <td>${new Date(r.receivedAt).toLocaleDateString()}</td>
                <td>¥${(r.amount || 0).toLocaleString()}</td>
                <td>${r.method === 'bank' ? '银行转账' : r.method === 'cash' ? '现金' : r.method === 'alipay' ? '支付宝' : r.method === 'wechat' ? '微信' : r.method || '-'}</td>
                <td>${r.reference || '-'}</td>
                <td>${r.invoiceNumber || '-'}</td>
                <td>${r.recordedBy?.name || '-'}</td>
                ${canManageFinance ? `<td><button class="btn-small btn-danger" data-click="removePaymentRecord('${r._id}', '${projectId}')">删除</button></td>` : ''}
            </tr>
        `).join('');

        const totalReceived = data.data.reduce((sum, r) => sum + (r.amount || 0), 0);
        const projectAmount = project?.projectAmount || 0;
        const remainingAmount = Math.max(0, projectAmount - totalReceived);
        const projectPaymentStatus = project?.payment?.paymentStatus || 'unpaid';

        document.getElementById(tempContainerId).innerHTML = `
            <div style="background: #f0f9ff; padding: 12px; border-radius: 4px; margin-bottom: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
                <div><div style="font-size: 12px; color: #666;">项目金额</div><div style="font-size: 16px; font-weight: bold;">¥${projectAmount.toLocaleString()}</div></div>
                <div><div style="font-size: 12px; color: #666;">已回款</div><div style="font-size: 16px; font-weight: bold; color: #10b981;">¥${totalReceived.toLocaleString()}</div></div>
                <div><div style="font-size: 12px; color: #666;">剩余应收</div><div style="font-size: 16px; font-weight: bold; color: ${remainingAmount > 0 ? '#f59e0b' : '#10b981'};">¥${remainingAmount.toLocaleString()}</div></div>
                <div>
                    <div style="font-size: 12px; color: #666;">回款状态</div>
                    <div><span class="badge ${projectPaymentStatus === 'paid' ? 'badge-success' : projectPaymentStatus === 'partially_paid' ? 'badge-warning' : 'badge-danger'}">${paymentStatusText[projectPaymentStatus] || projectPaymentStatus}</span></div>
                </div>
            </div>
            ${canManageFinance ? `
            <div class="card" style="margin-bottom: 12px; background: #f9fafb;">
                <div class="card-title" style="font-size: 14px; margin-bottom: 8px;">新增回款记录</div>
                <form id="addPaymentForm_${projectId}" data-submit="addPaymentRecordForProject(event, '${projectId}')" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">回款日期 <span style="color: #e74c3c;">*</span></label>
                        <input type="date" id="paymentDate_${projectId}" required style="padding: 6px; width: 100%;" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">金额 <span style="color: #e74c3c;">*</span></label>
                        <input type="number" step="0.01" id="paymentAmount_${projectId}" required style="padding: 6px; width: 100%;" placeholder="0.00">
                    </div>
                    <div style="flex: 1; min-width: 100px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">支付方式</label>
                        <select id="paymentMethod_${projectId}" style="padding: 6px; width: 100%;">
                            <option value="bank">银行转账</option>
                            <option value="cash">现金</option>
                            <option value="alipay">支付宝</option>
                            <option value="wechat">微信</option>
                        </select>
                    </div>
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">凭证号</label>
                        <input type="text" id="paymentReference_${projectId}" style="padding: 6px; width: 100%;" placeholder="可选">
                    </div>
                    <div style="flex: 1; min-width: 120px;">
                        <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">关联发票号</label>
                        <input type="text" id="paymentInvoiceNumber_${projectId}" style="padding: 6px; width: 100%;" placeholder="可选">
                    </div>
                    <div>
                        <button type="submit" style="padding: 6px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">新增回款</button>
                    </div>
                </form>
            </div>
            ` : ''}
            <table class="table-sticky">
                <thead>
                    <tr>
                        <th>日期</th><th>金额</th><th>方式</th><th>凭证</th><th>发票号</th><th>记录人</th>${canManageFinance ? '<th>操作</th>' : ''}
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (error) {
        document.getElementById(tempContainerId).innerHTML = `<div style="text-align: center; color: #ef4444;">加载失败: ${error.message}</div>`;
    }
}

export async function deleteMember(projectId, memberId) {
    if (!confirm('确定删除该成员吗？')) return;
    try {
        const res = await apiFetch(`/projects/${projectId}/member/${memberId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            viewProject(projectId);
            showToast('成员已删除', 'success');
        } else {
            showToast(data.message || '删除失败', 'error');
        }
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

export async function loadProjectPayments(projectId) {
    const container = document.getElementById('projectPaymentList');
    if (!container) return;
    container.innerHTML = '<div class="card-desc">加载中...</div>';
    try {
        const res = await apiFetch(`/finance/payment/${projectId}`);
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div class="alert alert-error">${data.message || '加载失败'}</div>`;
            return;
        }
        const rows = (data.data || []).map(p => `
            <tr>
                <td>${p.receivedAt ? new Date(p.receivedAt).toLocaleDateString() : '-'}</td>
                <td>¥${(p.amount || 0).toLocaleString()}</td>
                <td>${p.method || '-'}</td>
                <td>${p.reference || ''}</td>
                <td>${p.note || ''}</td>
            </tr>
        `).join('');
        container.innerHTML = `
            <table>
                <thead><tr><th>日期</th><th>金额</th><th>方式</th><th>凭证</th><th>备注</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="text-align:center;">暂无回款</td></tr>'}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">加载失败: ${error.message}</div>`;
    }
}

export async function addProjectPayment(projectId) {
    const amount = document.getElementById('projectPaymentAmount')?.value;
    const receivedAt = document.getElementById('projectPaymentDate')?.value;
    const reference = document.getElementById('projectPaymentRef')?.value;
    if (!amount || !receivedAt) return alert('请填写金额和回款日期');
    const payload = { amount: parseFloat(amount), receivedAt, reference };
    try {
        const res = await apiFetch(`/finance/payment/${projectId}`, { method: 'POST', body: JSON.stringify(payload) });
        const data = await res.json();
        if (!data.success) return alert(data.message || '新增失败');
        loadProjectPayments(projectId);
        window.loadReceivables?.();
        showToast('回款已记录', 'success');
    } catch (error) {
        alert('新增失败: ' + error.message);
    }
}

export async function loadProjectInvoices(projectId) {
    const container = document.getElementById('projectInvoiceList');
    if (!container) return;
    container.innerHTML = '<div class="card-desc">加载中...</div>';
    try {
        const res = await apiFetch(`/finance/invoice?projectId=${projectId}`);
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div class="alert alert-error">${data.message || '加载失败'}</div>`;
            return;
        }
        const rows = (data.data || []).map(i => `
            <tr>
                <td>${i.invoiceNumber}</td>
                <td>¥${(i.amount || 0).toLocaleString()}</td>
                <td>${i.issueDate ? new Date(i.issueDate).toLocaleDateString() : '-'}</td>
                <td>${i.status || '-'}</td>
                <td>${i.type || '-'}</td>
                <td>${i.note || ''}</td>
            </tr>
        `).join('');
        container.innerHTML = `
            <table>
                <thead><tr><th>发票号</th><th>金额</th><th>开票日期</th><th>状态</th><th>类型</th><th>备注</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="6" style="text-align:center;">暂无发票</td></tr>'}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">加载失败: ${error.message}</div>`;
    }
}

export async function addProjectInvoice(projectId) {
    const invoiceNumber = document.getElementById('projectInvoiceNumber')?.value;
    const amount = document.getElementById('projectInvoiceAmount')?.value;
    const issueDate = document.getElementById('projectInvoiceDate')?.value;
    const type = document.getElementById('projectInvoiceType')?.value || 'vat';
    if (!invoiceNumber || !amount || !issueDate) return alert('请填写发票号、金额、日期');
    const payload = { invoiceNumber, amount: parseFloat(amount), issueDate, type };
    try {
        const res = await apiFetch(`/finance/invoice/${projectId}`, { method: 'POST', body: JSON.stringify(payload) });
        const data = await res.json();
        if (!data.success) return showToast(data.message || '新增失败', 'error');
        loadProjectInvoices(projectId);
        showToast('发票已新增', 'success');
    } catch (error) {
        showToast('新增失败: ' + error.message, 'error');
    }
}

export async function setRevision(projectId, currentCount) {
    const count = prompt('请输入返修次数:', (currentCount || 0) + 1);
    if (count === null) return;
    try {
        const response = await apiFetch(`/projects/${projectId}/set-revision`, { method: 'POST', body: JSON.stringify({ count: parseInt(count, 10) }) });
        const result = await response.json();
        if (result.success) {
            loadProjects();
            if (document.getElementById('modalOverlay')?.classList.contains('active')) viewProject(projectId);
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

export async function setDelay(projectId) {
    if (!confirm('确定要标记为延期吗？')) return;
    try {
        const response = await apiFetch(`/projects/${projectId}/set-delay`, { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            loadProjects();
            if (document.getElementById('modalOverlay')?.classList.contains('active')) viewProject(projectId);
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

export async function setComplaint(projectId) {
    if (!confirm('确定要标记为客户投诉吗？')) return;
    try {
        const response = await apiFetch(`/projects/${projectId}/set-complaint`, { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            loadProjects();
            if (document.getElementById('modalOverlay')?.classList.contains('active')) viewProject(projectId);
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

export async function finishProject(projectId) {
    // 显示最终交付弹窗（PM 将文件交给销售）
    const content = `
        <form id="finalDeliveryForm" data-submit="submitFinalDelivery(event, '${projectId}')">
            <div class="form-group">
                <label>最终交付说明（可选）</label>
                <textarea id="finalDeliveryNote" style="width:100%;min-height:80px;padding:8px;" placeholder="可填写给销售查看的交付说明、版本、注意事项等"></textarea>
            </div>
            <div class="form-group">
                <label>最终交付附件（可选，可多选）</label>
                <input type="file" id="finalDeliveryAttachments" multiple>
                <small style="color:#666;font-size:12px;">将通过邮件发送给项目创建人（销售），建议总大小不超过 20MB。</small>
                <div id="finalDeliveryAttachmentsList" style="margin-top:6px;"></div>
            </div>
            <div class="action-buttons">
                <button type="submit">确认项目完成并发送</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '项目最终交付', body: content });

    setTimeout(() => {
        const attachmentsInput = document.getElementById('finalDeliveryAttachments');
        const attachmentsList = document.getElementById('finalDeliveryAttachmentsList');
        if (attachmentsInput && attachmentsList) {
            attachmentsInput.addEventListener('change', function () {
                const files = Array.from(this.files);
                if (files.length === 0) {
                    attachmentsList.innerHTML = '';
                    return;
                }
                const listHtml = files.map((file, index) => {
                    const size = (file.size / 1024).toFixed(2);
                    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#f0f0f0;border-radius:4px;margin-bottom:4px;">
                        <span>${file.name} (${size} KB)</span>
                        <button type="button" data-click="removeFinalDeliveryAttachment(${index})" style="background:#ef4444;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:11px;">移除</button>
                    </div>`;
                }).join('');
                attachmentsList.innerHTML = listHtml;
            });
        }
    }, 50);
}

export function removeFinalDeliveryAttachment(index) {
    const attachmentsInput = document.getElementById('finalDeliveryAttachments');
    if (!attachmentsInput) return;
    const dt = new DataTransfer();
    const files = Array.from(attachmentsInput.files);
    files.forEach((file, i) => {
        if (i !== index) dt.items.add(file);
    });
    attachmentsInput.files = dt.files;
    attachmentsInput.dispatchEvent(new Event('change'));
}

export async function submitFinalDelivery(e, projectId) {
    e.preventDefault();
    if (!confirm('确定要交付此项目吗？交付后将无法修改。')) return;

    const noteEl = document.getElementById('finalDeliveryNote');
    const finalNote = noteEl?.value?.trim() || '';

    const attachmentsInput = document.getElementById('finalDeliveryAttachments');
    let finalAttachments = null;

    if (attachmentsInput && attachmentsInput.files && attachmentsInput.files.length > 0) {
        const files = Array.from(attachmentsInput.files);
        const maxTotalSize = 20 * 1024 * 1024; // 20MB
        let totalSize = 0;
        for (const file of files) {
            totalSize += file.size;
            if (totalSize > maxTotalSize) {
                showToast('附件总大小不能超过 20MB', 'error');
                return;
            }
        }
        try {
            const promises = files.map(file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result.split(',')[1];
                    resolve({ filename: file.name, content: base64 });
                };
                reader.onerror = () => reject(new Error('读取附件失败'));
                reader.readAsDataURL(file);
            }));
            finalAttachments = await Promise.all(promises);
        } catch (err) {
            console.error('[Projects] 读取最终交付附件失败:', err);
            showToast('读取附件失败，请重试', 'error');
            return;
        }
    }

    try {
        const body = {};
        if (finalNote) body.finalNote = finalNote;
        if (finalAttachments && finalAttachments.length > 0) body.finalAttachments = finalAttachments;

        const response = await apiFetch(`/projects/${projectId}/finish`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.success) {
            closeModal();
            loadProjects();
            showToast('项目已完成', 'success');
        } else {
            showToast(result.message || '项目完成失败', 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

// PM 内部交付：项目经理把整理好的翻译件提交给销售（项目创建人），不改变项目状态
export function showPmDeliveryModal(projectId) {
    const content = `
        <form id="pmDeliveryForm" data-submit="submitPmDelivery(event, '${projectId}')">
            <div class="form-group">
                <label>提交说明（可选）</label>
                <textarea id="pmDeliveryNote" style="width:100%;min-height:80px;padding:8px;" placeholder="例如：已合并所有生产文件，版本号、注意事项等"></textarea>
            </div>
            <div class="form-group">
                <label>提交附件（可选，可多选）</label>
                <input type="file" id="pmDeliveryAttachments" multiple>
                <small style="color:#666;font-size:12px;">将通过邮件发送给项目创建人（销售），不改变项目状态，建议总大小不超过 20MB。</small>
                <div id="pmDeliveryAttachmentsList" style="margin-top:6px;"></div>
            </div>
            <div class="action-buttons">
                <button type="submit">发送给销售</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '提交给销售（内部交付）', body: content });

    setTimeout(() => {
        const attachmentsInput = document.getElementById('pmDeliveryAttachments');
        const attachmentsList = document.getElementById('pmDeliveryAttachmentsList');
        if (attachmentsInput && attachmentsList) {
            attachmentsInput.addEventListener('change', function () {
                const files = Array.from(this.files);
                if (files.length === 0) {
                    attachmentsList.innerHTML = '';
                    return;
                }
                const listHtml = files.map((file, index) => {
                    const size = (file.size / 1024).toFixed(2);
                    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#f0f0f0;border-radius:4px;margin-bottom:4px;">
                        <span>${file.name} (${size} KB)</span>
                        <button type="button" data-click="removePmDeliveryAttachment(${index})" style="background:#ef4444;color:white;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:11px;">移除</button>
                    </div>`;
                }).join('');
                attachmentsList.innerHTML = listHtml;
            });
        }
    }, 50);
}

export function removePmDeliveryAttachment(index) {
    const attachmentsInput = document.getElementById('pmDeliveryAttachments');
    if (!attachmentsInput) return;
    const dt = new DataTransfer();
    const files = Array.from(attachmentsInput.files);
    files.forEach((file, i) => {
        if (i !== index) dt.items.add(file);
    });
    attachmentsInput.files = dt.files;
    attachmentsInput.dispatchEvent(new Event('change'));
}

export async function submitPmDelivery(e, projectId) {
    e.preventDefault();

    const noteEl = document.getElementById('pmDeliveryNote');
    const note = noteEl?.value?.trim() || '';

    const attachmentsInput = document.getElementById('pmDeliveryAttachments');
    let attachments = null;

    if (attachmentsInput && attachmentsInput.files && attachmentsInput.files.length > 0) {
        const files = Array.from(attachmentsInput.files);
        const maxTotalSize = 20 * 1024 * 1024; // 20MB
        let totalSize = 0;
        for (const file of files) {
            totalSize += file.size;
            if (totalSize > maxTotalSize) {
                showToast('附件总大小不能超过 20MB', 'error');
                return;
            }
        }
        try {
            const promises = files.map(file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result.split(',')[1];
                    resolve({ filename: file.name, content: base64 });
                };
                reader.onerror = () => reject(new Error('读取附件失败'));
                reader.readAsDataURL(file);
            }));
            attachments = await Promise.all(promises);
        } catch (err) {
            console.error('[Projects] 读取PM内部交付附件失败:', err);
            showToast('读取附件失败，请重试', 'error');
            return;
        }
    }

    try {
        const body = {};
        if (note) body.note = note;
        if (attachments && attachments.length > 0) body.attachments = attachments;

        const response = await apiFetch(`/projects/${projectId}/pm-delivery`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.success) {
            closeModal();
            showToast('已发送给销售', 'success');
        } else {
            showToast(result.message || '发送失败', 'error');
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

export async function loadRealtimeKPI(projectId) {
    const container = document.getElementById('realtimeKpiContent');
    if (!container) return;
    container.innerHTML = '<div class="card-desc">加载中...</div>';
    try {
        const res = await apiFetch(`/kpi/project/${projectId}/realtime`);
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<div class="alert alert-error">${data.message || '加载失败'}</div>`;
            return;
        }
        // 后端返回的数据结构：{ success: true, data: { count, month, project, results: [...] } }
        const results = data.data?.results || [];
        const isPartTimeSalesView = state.currentRole === 'part_time_sales';
        const rows = results.map(r => {
            const roleStr = String(r.role || '').trim();
            const isPartTimeRole = roleStr === 'part_time_sales' || roleStr === 'layout';
            const unit = isPartTimeRole ? '元' : '分';
            const prefix = isPartTimeRole ? '¥' : '';
            const salesBonusUnit = r.role === 'sales' ? '分' : (r.role === 'part_time_sales' ? '元' : '');
            const salesCommissionUnit = r.role === 'sales' ? '分' : (r.role === 'part_time_sales' ? '元' : '');
            const displayKpiValue = isPartTimeSalesView && roleStr === 'part_time_sales'
                ? (r.details?.salesCommission || r.kpiValue || 0)
                : (r.kpiValue || 0);
            return `
            <tr>
                <td>${r.userName}</td>
                <td>${getRoleText(r.role)}</td>
                <td>${r.details?.salesBonus !== undefined ? (r.role === 'sales' ? '' : '¥') + (r.details.salesBonus || 0).toLocaleString() + (salesBonusUnit ? ' ' + salesBonusUnit : '') : '-'}</td>
                <td>${r.details?.salesCommission !== undefined ? (r.role === 'sales' ? '' : '¥') + (r.details.salesCommission || 0).toLocaleString() + (salesCommissionUnit ? ' ' + salesCommissionUnit : '') : '-'}</td>
                <td>${prefix}${displayKpiValue.toLocaleString()} ${unit}</td>
                <td style="font-size:12px;">${r.formula || ''}</td>
            </tr>
        `;
        }).join('');
        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table>
                    <thead>
                        <tr>
                            <th>成员</th>
                            <th>角色</th>
                            <th>销售提成</th>
                            <th>销售佣金</th>
                            <th>KPI</th>
                            <th>计算公式</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td colspan="6" style="text-align:center;">暂无数据</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">获取失败: ${error.message}</div>`;
    }
}

// --- 核心逻辑 ---

// 初始化角色筛选器
export async function initProjectRoleFilter() {
    const roleFilter = document.getElementById('projectRoleFilter');
    if (!roleFilter) {
        console.warn('[Projects] 角色筛选器元素不存在');
        return;
    }
    
    const userRoles = state.currentUser?.roles || [];
    console.log('[Projects] 初始化角色筛选器，用户角色:', userRoles);
    
    // 从API获取项目成员角色列表（包含角色名称）
    let roleNameMap = {};
    try {
        const res = await apiFetch('/roles/project-member-roles');
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
            // 构建角色代码到名称的映射
            data.data.forEach(role => {
                if (role.isActive && role.canBeProjectMember) {
                    roleNameMap[role.code] = role.name;
                }
            });
        }
    } catch (err) {
        console.error('[Projects] 加载角色列表失败，使用默认名称:', err);
        // 如果API失败，使用默认的角色名称映射
        const { ROLE_NAMES } = await import('../core/config.js');
        roleNameMap = ROLE_NAMES;
    }
    
    // 只显示用户实际拥有的角色，并且是项目成员相关的角色
    const projectMemberRoles = Object.keys(roleNameMap);
    const availableRoles = userRoles.filter(role => projectMemberRoles.includes(role));
    
    console.log('[Projects] 可用角色:', availableRoles);
    
    // 如果用户只有一个角色或没有相关角色，隐藏筛选器
    if (availableRoles.length <= 1) {
        roleFilter.style.display = 'none';
        console.log('[Projects] 用户只有一个或没有相关角色，隐藏筛选器');
        return;
    }
    
    // 显示筛选器并填充选项
    roleFilter.style.display = '';
    roleFilter.innerHTML = '<option value="">全部角色</option>';
    
    availableRoles.forEach(role => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = roleNameMap[role] || role;
        roleFilter.appendChild(option);
    });
    
    console.log('[Projects] 角色筛选器已初始化，选项数:', availableRoles.length);
}

// 处理角色筛选器变化
export async function onProjectRoleFilterChange() {
    const roleFilter = document.getElementById('projectRoleFilter');
    if (!roleFilter) return;
    
    const selectedRole = roleFilter.value || '';
    state.projectPage = 1; // 重置页码
    
    // 重新加载项目，包含角色筛选
    const filters = {};
    const status = document.getElementById('projectStatusFilter')?.value || '';
    const biz = document.getElementById('projectBizFilter')?.value || '';
    const invoiceStatusFilter = document.getElementById('projectInvoiceStatusFilter')?.value || '';
    const paymentStatusFilter = document.getElementById('projectPaymentStatusFilter')?.value || '';
    
    if (state.projectFilterMonth) filters.month = state.projectFilterMonth;
    if (status) filters.status = status;
    if (biz) filters.businessType = biz;
    if (invoiceStatusFilter) filters.invoiceStatus = invoiceStatusFilter;
    if (paymentStatusFilter) filters.paymentStatus = paymentStatusFilter;
    if (selectedRole) filters.role = selectedRole;
    
    await loadProjects(filters);
}

export async function loadProjects(filters = {}) {
    try {
        // 如果没有明确指定角色筛选，且用户有多个项目成员相关角色，根据当前角色自动过滤
        if (!filters.role) {
            const userRoles = state.currentUser?.roles || [];
            const projectMemberRoles = ['translator', 'reviewer', 'layout', 'part_time_translator', 'pm', 'sales', 'part_time_sales'];
            const availableRoles = userRoles.filter(role => projectMemberRoles.includes(role));
            
            // 如果用户有多个项目成员相关角色，且当前角色是其中之一，自动使用当前角色过滤
            if (availableRoles.length > 1 && state.currentRole && availableRoles.includes(state.currentRole)) {
                filters.role = state.currentRole;
                console.log('[Projects] 自动根据当前角色过滤项目:', state.currentRole);
            }
        }
        
        // 确保客户列表已加载（用于筛选下拉框）
        if (!state.allCustomers || state.allCustomers.length === 0) {
            await loadCustomers();
        }
        
        // 构建查询参数
        const params = new URLSearchParams();
        if (filters.month) params.append('month', filters.month);
        if (filters.status) params.append('status', filters.status);
        if (filters.businessType) params.append('businessType', filters.businessType);
        if (filters.role) params.append('role', filters.role);
        if (filters.customerId) params.append('customerId', filters.customerId);
        if (filters.invoiceStatus) params.append('invoiceStatus', filters.invoiceStatus);
        if (filters.paymentStatus) params.append('paymentStatus', filters.paymentStatus);
        
        const url = `/projects${params.toString() ? '?' + params.toString() : ''}`;
        console.log('[Projects] loadProjects request', { url, filters });
        const response = await apiFetch(url);
        const data = await response.json();

        if (data.success) {
            state.allProjectsCache = data.data || [];
            // 保存后端筛选条件，用于前端判断是否需要再次过滤
            state.backendFilters = filters;
            console.log('[Projects] loadProjects success', {
                total: state.allProjectsCache.length,
                filters,
                projectFilterMonth: state.projectFilterMonth,
                projectFilterDeliveryOverdue: state.projectFilterDeliveryOverdue,
                projectFilterRecentCompleted: state.projectFilterRecentCompleted
            });
            
            // 加载项目的发票申请状态
            await loadProjectInvoiceRequestStatuses();
            
            // 填充客户筛选下拉框（确保客户数据已加载）
            fillProjectCustomerFilter();
            
            renderProjects();
            // fillFinanceProjectSelects 在后续批次完成
        } else {
            console.warn('[Projects] loadProjects failed', data);
        }
    } catch (error) {
        console.error('加载项目失败:', error);
        // showAlert 在此批未引入，先用 toast
        showToast('加载项目失败: ' + error.message, 'error');
    }
}

// 加载项目的发票申请状态
async function loadProjectInvoiceRequestStatuses() {
    try {
        const projects = state.allProjectsCache || [];
        if (projects.length === 0) {
            state.projectInvoiceRequestStatuses = {};
            return;
        }
        
        const projectIds = projects.map(p => p._id?.toString() || p._id).filter(Boolean);
        if (projectIds.length === 0) {
            state.projectInvoiceRequestStatuses = {};
            return;
        }
        
        // 批量查询发票申请状态
        const params = new URLSearchParams();
        params.append('projectIds', projectIds.join(','));
        
        const response = await apiFetch(`/invoice-requests/by-projects?${params.toString()}`);
        const data = await response.json();
        
        if (data.success) {
            state.projectInvoiceRequestStatuses = data.data || {};
            console.log('[Projects] 发票申请状态加载完成:', {
                totalProjects: projectIds.length,
                statusCount: Object.keys(state.projectInvoiceRequestStatuses).length
            });
        } else {
            console.warn('[Projects] 加载发票申请状态失败:', data);
            state.projectInvoiceRequestStatuses = {};
        }
    } catch (error) {
        console.error('[Projects] 加载发票申请状态异常:', error);
        state.projectInvoiceRequestStatuses = {};
    }
}

export function renderProjects() {
    console.log('[Projects] renderProjects start');
    const search = document.getElementById('projectSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('projectStatusFilter')?.value || '';
    const biz = document.getElementById('projectBizFilter')?.value || '';
    const cust = document.getElementById('projectCustomerFilter')?.value || '';
    const invoiceStatusFilter = document.getElementById('projectInvoiceStatusFilter')?.value || '';
    const paymentStatusFilter = document.getElementById('projectPaymentStatusFilter')?.value || '';
    const pageSizeSel = document.getElementById('projectPageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value, 10) || 10 : 10;
    const invoiceStatuses = state.projectInvoiceRequestStatuses || {};
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // 读取角色筛选器
    let roleFilter = document.getElementById('projectRoleFilter')?.value || '';
    
    // 如果角色筛选器为空，且用户有多个项目成员相关角色，根据当前角色自动设置
    if (!roleFilter) {
        const userRoles = state.currentUser?.roles || [];
        const projectMemberRoles = ['translator', 'reviewer', 'layout', 'part_time_translator', 'pm', 'sales', 'part_time_sales'];
        const availableRoles = userRoles.filter(role => projectMemberRoles.includes(role));
        
        // 如果用户有多个项目成员相关角色，且当前角色是其中之一，自动使用当前角色
        if (availableRoles.length > 1 && state.currentRole && availableRoles.includes(state.currentRole)) {
            roleFilter = state.currentRole;
            // 同步更新筛选器的显示值
            const roleFilterElement = document.getElementById('projectRoleFilter');
            if (roleFilterElement) {
                roleFilterElement.value = state.currentRole;
            }
        }
    }
    
    // 如果用户手动修改了筛选条件（状态、业务类型、月份、开票/回款状态、角色），需要重新从后端加载数据
    if (state.backendFilters) {
        const currentFilters = {};
        if (state.projectFilterMonth) currentFilters.month = state.projectFilterMonth;
        if (status) currentFilters.status = status;
        if (biz) currentFilters.businessType = biz;
        if (invoiceStatusFilter) currentFilters.invoiceStatus = invoiceStatusFilter;
        if (paymentStatusFilter) currentFilters.paymentStatus = paymentStatusFilter;
        if (roleFilter) currentFilters.role = roleFilter;
        
        // 检查筛选条件是否与后端不一致
        // 需要比较：月份、状态、业务类型、开票/回款状态、角色 是否都一致
        const monthMatch = !state.projectFilterMonth ? !state.backendFilters.month : (state.backendFilters.month === state.projectFilterMonth);
        const statusMatch = !status ? !state.backendFilters.status : (state.backendFilters.status === status);
        const bizMatch = !biz ? !state.backendFilters.businessType : (state.backendFilters.businessType === biz);
        const invoiceMatch = !invoiceStatusFilter ? !state.backendFilters.invoiceStatus : (state.backendFilters.invoiceStatus === invoiceStatusFilter);
        const paymentMatch = !paymentStatusFilter ? !state.backendFilters.paymentStatus : (state.backendFilters.paymentStatus === paymentStatusFilter);
        const roleMatch = !roleFilter ? !state.backendFilters.role : (state.backendFilters.role === roleFilter);
        const filtersMatch = monthMatch && statusMatch && bizMatch && invoiceMatch && paymentMatch && roleMatch;
        
        if (!filtersMatch) {
            console.log('[Projects] Filters changed, reloading from backend', {
                oldFilters: state.backendFilters,
                newFilters: { month: state.projectFilterMonth, status, businessType: biz, invoiceStatus: invoiceStatusFilter, paymentStatus: paymentStatusFilter },
                monthMatch,
                statusMatch,
                bizMatch,
                invoiceMatch,
                paymentMatch
            });
            // 重新从后端加载数据，而不是在前端已筛选的结果上继续筛选
            const newFilters = {};
            if (state.projectFilterMonth) newFilters.month = state.projectFilterMonth;
            if (status) newFilters.status = status;
            if (biz) newFilters.businessType = biz;
            if (invoiceStatusFilter) newFilters.invoiceStatus = invoiceStatusFilter;
            if (paymentStatusFilter) newFilters.paymentStatus = paymentStatusFilter;
            if (roleFilter) newFilters.role = roleFilter;
            // 重置页码
            state.projectPage = 1;
            // 重新加载项目
            loadProjects(newFilters);
            return; // 提前返回，loadProjects会调用renderProjects
        }
    }

    // 如果后端已经筛选过，前端只做搜索和客户过滤，不再过滤月份、状态、业务类型
    const backendFiltered = state.backendFilters && Object.keys(state.backendFilters).length > 0;
    
    const warningIdSet = state.projectFilterPaymentWarningIds instanceof Set ? state.projectFilterPaymentWarningIds : null;
    const filtered = (state.allProjectsCache || []).filter(p => {
        const projectId = p._id?.toString() || p._id;
        const matchesWarning = warningIdSet ? warningIdSet.has(projectId) : true;
        const matchesSearch = !search || (p.projectName?.toLowerCase().includes(search)) || (p.projectNumber?.toLowerCase().includes(search)) || ((p.customerId?.name || p.customerId?.shortName || p.clientName || '').toLowerCase().includes(search));
        const matchesCust = !cust || (p.customerId && (p.customerId._id === cust || p.customerId === cust));
        const invoiceStatus = invoiceStatuses[projectId]?.status || 'none';
        const paymentStatus = p.payment?.paymentStatus || 'unpaid';
        
        // 如果后端已经筛选过，前端只做搜索和客户过滤
        if (backendFiltered) {
            // 交付逾期和近7天完成仍需前端过滤（后端不处理这些）
            const matchesDeliveryOverdue = !state.projectFilterDeliveryOverdue && !state.projectFilterRecentDeliveryOverdue ? true : (
                p.deadline &&
                new Date(p.deadline) < now &&
                // 与后端保持一致：只统计pending和in_progress状态的项目
                (p.status === 'pending' || p.status === 'in_progress') &&
                // 如果是近7天交付逾期，需要限制deadline在近7天内
                (!state.projectFilterRecentDeliveryOverdue || (new Date(p.deadline) >= sevenDaysAgo))
            );
            const matchesRecentCompleted = !state.projectFilterRecentCompleted || (
                p.status === 'completed' &&
                p.completedAt &&
                new Date(p.completedAt) >= sevenDaysAgo
            );
            const matchesInvoice = !invoiceStatusFilter || invoiceStatus === invoiceStatusFilter;
            const matchesPayment = !paymentStatusFilter || paymentStatus === paymentStatusFilter;
            return matchesWarning && matchesSearch && matchesCust && matchesDeliveryOverdue && matchesRecentCompleted && matchesInvoice && matchesPayment;
        }
        
        // 否则，前端需要完整过滤（兼容手动筛选）
        const matchesStatus = (state.projectFilterDeliveryOverdue || state.projectFilterRecentDeliveryOverdue || state.projectFilterRecentCompleted)
            ? true
            : (!status || p.status === status);
        const matchesBiz = !biz || p.businessType === biz;
        // 月份筛选：与后端 dashboard 保持一致
        // - 交付逾期或近7天完成跳转时不过滤月份（看全局）
        // - 否则：已完成项目用 completedAt 所在月份，未完成项目用 createdAt 所在月份
        let matchesMonth = true;
        if (!(state.projectFilterDeliveryOverdue || state.projectFilterRecentDeliveryOverdue || state.projectFilterRecentCompleted)) {
            if (state.projectFilterMonth) {
                const monthStr = state.projectFilterMonth;
                const createdMonth = p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 7) : null;
                const completedMonth = p.completedAt ? new Date(p.completedAt).toISOString().slice(0, 7) : null;
                if (p.status === 'completed') {
                    matchesMonth = !!completedMonth && completedMonth === monthStr;
                } else {
                    matchesMonth = !!createdMonth && createdMonth === monthStr;
                }
            } else {
                matchesMonth = true;
            }
        }
        const matchesDeliveryOverdue = !state.projectFilterDeliveryOverdue && !state.projectFilterRecentDeliveryOverdue ? true : (
            p.deadline &&
            new Date(p.deadline) < now &&
            // 与后端保持一致：只统计pending和in_progress状态的项目
            (p.status === 'pending' || p.status === 'in_progress') &&
            // 如果是近7天交付逾期，需要限制deadline在近7天内
            (!state.projectFilterRecentDeliveryOverdue || (new Date(p.deadline) >= sevenDaysAgo))
        );
        const matchesRecentCompleted = !state.projectFilterRecentCompleted || (
            p.status === 'completed' &&
            p.completedAt &&
            new Date(p.completedAt) >= sevenDaysAgo
        );
        const matchesInvoice = !invoiceStatusFilter || invoiceStatus === invoiceStatusFilter;
        const matchesPayment = !paymentStatusFilter || paymentStatus === paymentStatusFilter;
        return matchesWarning && matchesSearch && matchesStatus && matchesBiz && matchesCust && matchesMonth && matchesDeliveryOverdue && matchesRecentCompleted && matchesInvoice && matchesPayment;
    });

    console.log('[Projects] renderProjects filters:', {
        search,
        status,
        biz,
        cust,
        projectFilterMonth: state.projectFilterMonth,
        projectFilterDeliveryOverdue: state.projectFilterDeliveryOverdue,
        projectFilterRecentCompleted: state.projectFilterRecentCompleted,
        totalCache: (state.allProjectsCache || []).length,
        filteredCount: filtered.length
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (state.projectPage > totalPages) state.projectPage = totalPages;
    const start = (state.projectPage - 1) * pageSize;
    const pageData = filtered.slice(start, start + pageSize);
    const showAmount = canViewProjectAmount();
    // 判断是否为销售/兼职销售角色
    const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
    const isSalesRole = currentRole === 'sales' || currentRole === 'part_time_sales';
    
    // 调试信息
    console.log('[Projects] 角色和权限检查:', {
        currentRole,
        isSalesRole,
        currentUser: state.currentUser?._id,
        userRoles: state.currentUser?.roles,
        pageDataCount: pageData.length,
        projects: pageData.map(p => ({
            id: p._id,
            name: p.projectName,
            status: p.status,
            createdBy: p.createdBy?._id || p.createdBy
        }))
    });
    
    // 批量申请开票的选中项目ID列表（存储在模块级别）
    if (!window.selectedProjectsForInvoice) {
        window.selectedProjectsForInvoice = new Set();
    }
    
    document.getElementById('projectsList').innerHTML = `
        ${isSalesRole ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
                <button class="btn-small" data-click="selectAllProjectsForInvoice()" style="background:#667eea;color:white;border:none;padding:6px 12px;">全选</button>
                <button class="btn-small" data-click="deselectAllProjectsForInvoice()" style="background:#ccc;color:white;border:none;padding:6px 12px;">取消全选</button>
                <span id="selectedProjectsCount" style="color:#666;font-size:14px;">已选择 0 个项目</span>
            </div>
            <button class="btn-small" data-click="batchRequestInvoice()" id="batchRequestInvoiceBtn" disabled style="background:#10b981;color:white;border:none;padding:6px 12px;">批量申请开票</button>
        </div>
        ` : ''}
        <table class="table-sticky">
                    <thead>
                        <tr>
                            ${isSalesRole ? '<th style="width:50px;"><input type="checkbox" id="selectAllProjectsCheckbox" data-change="toggleSelectAllProjects(event)"></th>' : ''}
                            <th>项目编号</th>
                            <th>项目名称</th>
                            <th>开票状态</th>
                            <th>回款状态</th>
                            <th>客户名称</th>
                            <th>业务类型</th>
                            ${showAmount ? '<th>项目金额</th>' : ''}
                            <th>交付时间</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                ${(pageData.length ? pageData : []).map(p => {
                    // 只有销售/兼职销售创建的项目且状态为进行中或已完成时，才显示申请开票相关功能
                    // 处理 createdBy 可能是对象（有 _id）或字符串ID的情况
                    const projectCreatedBy = p.createdBy?._id || p.createdBy;
                    const currentUserId = state.currentUser?._id;
                    
                    // 调试信息（仅对第一个项目输出）
                    if (pageData.indexOf(p) === 0) {
                        console.log('[Projects] 项目权限检查:', {
                            projectId: p._id,
                            projectName: p.projectName,
                            projectStatus: p.status,
                            projectCreatedBy,
                            currentUserId,
                            isSalesRole,
                            canRequestInvoice: isSalesRole && 
                                currentUserId && 
                                projectCreatedBy && 
                                (projectCreatedBy.toString() === currentUserId.toString()) &&
                                // 前端仅排除已取消项目，其余状态都允许尝试申请发票
                                (p.status !== 'cancelled' && p.status !== 'canceled')
                        });
                    }
                    
                    const projectIdStr = (p._id?.toString() || p._id || '').toString();
                    
                    // 检查项目是否有发票申请状态
                    const invoiceRequestStatus = state.projectInvoiceRequestStatuses?.[projectIdStr];
                    const hasPendingRequest = invoiceRequestStatus?.status === 'pending';
                    const hasApprovedRequest = invoiceRequestStatus?.status === 'approved';
                    const hasRejectedRequest = invoiceRequestStatus?.status === 'rejected';
                    
                    // 判断是否可以申请开票：
                    // 1. 必须是销售/兼职销售角色
                    // 2. 必须是当前用户创建的项目
                    // 3. 项目状态不能是“已取消”（其余状态均可发起申请）
                    // 4. 不能有待审批或已批准的申请（已拒绝的可以重新申请）
                    const canRequestInvoice = isSalesRole && 
                        currentUserId && 
                        projectCreatedBy && 
                        (projectCreatedBy.toString() === currentUserId.toString()) &&
                        (p.status !== 'cancelled' && p.status !== 'canceled') &&
                        !hasPendingRequest &&
                        !hasApprovedRequest;
                    
                    const isSelected = window.selectedProjectsForInvoice.has(projectIdStr);
                    const paymentStatusText = { unpaid: '未支付', partially_paid: '部分支付', paid: '已支付' };
                    const paymentStatus = p.payment?.paymentStatus || 'unpaid';
                    
                    // 生成发票申请状态标签（单独一列展示）
                    let invoiceStatusBadge = '';
                    if (hasPendingRequest) {
                        invoiceStatusBadge = '<span class="badge" style="background:#f59e0b;color:white;">待审批</span>';
                    } else if (hasApprovedRequest) {
                        const invoiceNumber = invoiceRequestStatus?.linkedInvoiceNumber;
                        invoiceStatusBadge = `<span class="badge" style="background:#10b981;color:white;">已开票${invoiceNumber ? ` (${invoiceNumber})` : ''}</span>`;
                    } else if (hasRejectedRequest) {
                        invoiceStatusBadge = '<span class="badge" style="background:#ef4444;color:white;">已拒绝</span>';
                    }
                    
                    return `
                    <tr class="row-striped">
                            ${isSalesRole ? `
                                <td>
                                    ${canRequestInvoice ? `<input type="checkbox" class="project-invoice-checkbox" data-project-id="${projectIdStr}" ${isSelected ? 'checked' : ''} data-change="toggleProjectForInvoice(event)">` : ''}
                                </td>
                            ` : ''}
                                <td>${p.projectNumber || '-'}</td>
                                <td>${p.projectName}</td>
                                <td style="min-width: 96px;">${invoiceStatusBadge || '<span style="color:#9ca3af;font-size:12px;">未申请</span>'}</td>
                                <td style="min-width: 88px;">
                                    <span class="badge ${
                                        paymentStatus === 'paid' 
                                            ? 'badge-success' 
                                            : paymentStatus === 'partially_paid' 
                                                ? 'badge-warning' 
                                                : 'badge-danger'
                                    }">
                                        ${paymentStatusText[paymentStatus] || paymentStatus}
                                    </span>
                                </td>
                                <td>${p.customerId?.name || p.clientName}</td>
                                <td>${getBusinessTypeText(p.businessType)}</td>
                                ${showAmount ? `<td>¥${p.projectAmount?.toLocaleString()}</td>` : ''}
                                <td>${p.deadline ? new Date(p.deadline).toLocaleDateString() : '-'}</td>
                                <td><span class="badge ${getStatusBadgeClass(p.status)}">${getStatusText(p.status)}</span></td>
                        <td style="display:flex;gap:4px;flex-wrap:wrap;">
                            <button class="btn-small" data-click="viewProject('${p._id || ''}')">查看</button>
                            ${canRequestInvoice ? `<button class="btn-small" data-click="quickRequestInvoice('${p._id || ''}')" style="background:#667eea;color:white;border:none;">申请开票</button>` : ''}
                            ${hasPendingRequest || hasApprovedRequest || hasRejectedRequest ? `<button class="btn-small" data-click="viewProjectInvoiceRequest('${invoiceRequestStatus?.requestId || ''}')" style="background:#8b5cf6;color:white;border:none;">查看申请</button>` : ''}
                        </td>
                            </tr>
                `;
                }).join('') || `<tr><td colspan="${isSalesRole ? (showAmount ? 9 : 8) : (showAmount ? 8 : 7)}" style="text-align:center;">暂无项目</td></tr>`}
                    </tbody>
                </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${state.projectPage<=1?'disabled':''} data-click="prevProjectPage()">上一页</button>
            <span style="align-self:center;">${state.projectPage} / ${totalPages}</span>
            <button class="btn-small" ${state.projectPage>=totalPages?'disabled':''} data-click="nextProjectPage()">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${state.projectPage}" style="width:70px;padding:6px;" data-change="jumpProjectPage(this.value, ${totalPages})">
        </div>
    `;
    
    // 初始化选中项目计数（复选框事件通过 data-change 声明式处理）
    if (isSalesRole) {
        updateSelectedProjectsCount();
    }
}

export function jumpProjectPage(val, total) {
    const page = Math.min(Math.max(parseInt(val || 1, 10), 1), total);
    state.projectPage = page;
    renderProjects();
}

// 更新选中项目计数
function updateSelectedProjectsCount() {
    const count = window.selectedProjectsForInvoice?.size || 0;
    const countSpan = document.getElementById('selectedProjectsCount');
    const batchBtn = document.getElementById('batchRequestInvoiceBtn');
    
    if (countSpan) {
        countSpan.textContent = `已选择 ${count} 个项目`;
    }
    
    if (batchBtn) {
        batchBtn.disabled = count === 0;
    }
    
    // 更新全选复选框状态
    const selectAllCheckbox = document.getElementById('selectAllProjectsCheckbox');
    if (selectAllCheckbox) {
        const checkboxes = document.querySelectorAll('.project-invoice-checkbox');
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        selectAllCheckbox.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    }
}

// 全选项目（用于申请开票）
export function selectAllProjectsForInvoice() {
    console.log('[Projects] selectAllProjectsForInvoice 被调用');
    if (!window.selectedProjectsForInvoice) {
        window.selectedProjectsForInvoice = new Set();
    }
    
    const checkboxes = document.querySelectorAll('.project-invoice-checkbox');
    console.log('[Projects] 找到复选框数量:', checkboxes.length);
    
    checkboxes.forEach(cb => {
        cb.checked = true;
        const projectId = cb.dataset.projectId;
        if (projectId) {
            window.selectedProjectsForInvoice.add(projectId);
        }
    });
    
    const selectAllCheckbox = document.getElementById('selectAllProjectsCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = checkboxes.length > 0;
        selectAllCheckbox.indeterminate = false;
    } else {
        console.warn('[Projects] 未找到全选复选框元素');
    }
    
    updateSelectedProjectsCount();
    console.log('[Projects] 已选择项目数量:', window.selectedProjectsForInvoice.size);
}

// 取消全选项目
export function deselectAllProjectsForInvoice() {
    if (!window.selectedProjectsForInvoice) {
        window.selectedProjectsForInvoice = new Set();
    }
    
    const checkboxes = document.querySelectorAll('.project-invoice-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = false;
        window.selectedProjectsForInvoice.delete(cb.dataset.projectId);
    });
    
    const selectAllCheckbox = document.getElementById('selectAllProjectsCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
    
    updateSelectedProjectsCount();
}

// 切换单个项目的选中状态（通过事件对象获取checkbox状态）
export function toggleProjectForInvoice(event) {
    if (!window.selectedProjectsForInvoice) {
        window.selectedProjectsForInvoice = new Set();
    }
    
    // 从事件对象获取checkbox元素和状态
    const checkbox = event?.target;
    if (checkbox && checkbox.classList.contains('project-invoice-checkbox')) {
        const projectId = checkbox.dataset.projectId;
        const isChecked = checkbox.checked;
        
        if (projectId) {
            if (isChecked) {
                window.selectedProjectsForInvoice.add(projectId);
            } else {
                window.selectedProjectsForInvoice.delete(projectId);
            }
            updateSelectedProjectsCount();
        }
    }
}

// 切换全选状态（通过事件对象获取checkbox状态）
export function toggleSelectAllProjects(event) {
    const selectAllCheckbox = event?.target || document.getElementById('selectAllProjectsCheckbox');
    if (selectAllCheckbox) {
        if (selectAllCheckbox.checked) {
            selectAllProjectsForInvoice();
        } else {
            deselectAllProjectsForInvoice();
        }
    }
}

// 批量申请开票
export async function batchRequestInvoice() {
    console.log('[Projects] batchRequestInvoice 被调用');
    const selectedIds = Array.from(window.selectedProjectsForInvoice || []);
    console.log('[Projects] 选中的项目ID:', selectedIds);
    
    if (selectedIds.length === 0) {
        showToast('请至少选择一个项目', 'error');
        return;
    }
    
    // 保存选中的项目ID，供 showCreateInvoiceRequestModal 使用
    window.pendingSelectedProjectsForInvoice = new Set(selectedIds);
    
    // 导入发票申请相关函数
    const { showCreateInvoiceRequestModal } = await import('./finance.js');
    
    try {
        // 打开申请表单
        await showCreateInvoiceRequestModal();
        
        // 预选所有选中的项目（使用 setTimeout 确保 DOM 已渲染）
        setTimeout(() => {
            const projectsSelect = document.getElementById('invoiceRequestProjects');
            if (projectsSelect && window.pendingSelectedProjectsForInvoice) {
                // 清除之前的选择
                Array.from(projectsSelect.options).forEach(opt => opt.selected = false);
                
                // 选中所有已选项目
                window.pendingSelectedProjectsForInvoice.forEach(projectId => {
                    const option = Array.from(projectsSelect.options).find(opt => opt.value === projectId || opt.value === projectId.toString());
                    if (option) {
                        option.selected = true;
                    }
                });
                
                // 触发change事件以更新金额提示
                projectsSelect.dispatchEvent(new Event('change'));
                
                // 自动计算总金额
                const selectedOptions = Array.from(projectsSelect.selectedOptions);
                const totalAmount = selectedOptions.reduce((sum, opt) => {
                    return sum + (parseFloat(opt.dataset.amount) || 0);
                }, 0);
                
                const amountInput = document.getElementById('invoiceRequestAmount');
                if (amountInput && totalAmount > 0) {
                    amountInput.value = totalAmount;
                }
                
                // 清空临时变量
                delete window.pendingSelectedProjectsForInvoice;
            }
        }, 100);
        
        // 清空选择
        window.selectedProjectsForInvoice.clear();
        updateSelectedProjectsCount();
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
        delete window.pendingSelectedProjectsForInvoice;
    }
}

// 查看项目的发票申请详情
export async function viewProjectInvoiceRequest(requestId) {
    if (!requestId) {
        showToast('申请ID无效', 'error');
        return;
    }
    
    try {
        const { viewInvoiceRequest } = await import('./finance.js');
        await viewInvoiceRequest(requestId);
    } catch (error) {
        console.error('[Projects] 查看发票申请失败:', error);
        showToast('查看申请失败: ' + error.message, 'error');
    }
}

// 快速申请开票（从项目列表发起，单项目）
export async function quickRequestInvoice(projectId) {
    // 导入发票申请相关函数
    const { showCreateInvoiceRequestModal } = await import('./finance.js');
    
    // 先获取项目信息，然后打开申请表单并预选该项目
    try {
        const res = await apiFetch(`/projects/${projectId}`);
        const data = await res.json();
        
        if (!data.success) {
            showToast('获取项目信息失败', 'error');
            return;
        }
        
        const project = data.data;
        
        // 打开申请表单
        await showCreateInvoiceRequestModal();
        
        // 预选该项目
        const projectsSelect = document.getElementById('invoiceRequestProjects');
        if (projectsSelect) {
            // 找到对应的选项并选中
            const option = Array.from(projectsSelect.options).find(opt => opt.value === projectId);
            if (option) {
                option.selected = true;
                // 触发change事件以更新金额提示
                projectsSelect.dispatchEvent(new Event('change'));
            }
            
            // 自动填充申请金额为项目金额
            const amountInput = document.getElementById('invoiceRequestAmount');
            if (amountInput && project.projectAmount) {
                amountInput.value = project.projectAmount;
            }
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
    }
}

export function prevProjectPage() {
    if (state.projectPage > 1) {
        state.projectPage = Math.max(1, state.projectPage - 1);
        renderProjects();
    }
}

export function nextProjectPage() {
    const search = document.getElementById('projectSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('projectStatusFilter')?.value || '';
    const biz = document.getElementById('projectBizFilter')?.value || '';
    const cust = document.getElementById('projectCustomerFilter')?.value || '';
    const pageSizeSel = document.getElementById('projectPageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value, 10) || 10 : 10;
    const now = new Date();
    const filtered = (state.allProjectsCache || []).filter(p => {
        const matchesSearch = !search || (p.projectName?.toLowerCase().includes(search)) || (p.projectNumber?.toLowerCase().includes(search)) || ((p.customerId?.name || p.clientName || '').toLowerCase().includes(search));
        const matchesStatus = (state.projectFilterDeliveryOverdue || state.projectFilterRecentDeliveryOverdue) ? true : (!status || p.status === status);
        const matchesBiz = !biz || p.businessType === biz;
        const matchesCust = !cust || (p.customerId && p.customerId._id === cust);
        const matchesMonth = !state.projectFilterMonth || (p.createdAt && new Date(p.createdAt).toISOString().slice(0,7) === state.projectFilterMonth);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const matchesDeliveryOverdue = (!state.projectFilterDeliveryOverdue && !state.projectFilterRecentDeliveryOverdue) || (
            p.deadline && 
            new Date(p.deadline) < now && 
            // 与后端保持一致：只统计pending和in_progress状态的项目
            (p.status === 'pending' || p.status === 'in_progress') &&
            // 如果是近7天交付逾期，需要限制deadline在近7天内
            (!state.projectFilterRecentDeliveryOverdue || (new Date(p.deadline) >= sevenDaysAgo))
        );
        return matchesSearch && matchesStatus && matchesBiz && matchesCust && matchesMonth && matchesDeliveryOverdue;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (state.projectPage < totalPages) {
        state.projectPage = Math.min(totalPages, state.projectPage + 1);
        renderProjects();
    }
}

// 通用CSV导出函数，解决Excel中文乱码问题
// 注意：此函数使用UTF-8 BOM，但Excel可能仍显示乱码
// 建议使用后端API导出（GBK编码）以获得更好的兼容性
export function exportToCSV(data, filename) {
    try {
        // 将数据转换为CSV格式
        const csv = data.map(row => 
            row.map(cell => {
                const str = (cell ?? '').toString();
                // 转义引号和换行符
                return `"${str.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '')}"`;
            }).join(',')
        ).join('\r\n'); // 使用Windows换行符
        
        // 使用UTF-8 BOM
        const BOM = '\uFEFF';
        const csvWithBOM = BOM + csv;
        
        // 使用TextEncoder确保UTF-8编码正确
        const encoder = new TextEncoder();
        const csvBytes = encoder.encode(csvWithBOM);
        
        // 创建Blob
        const blob = new Blob([csvBytes], { 
            type: 'text/csv;charset=utf-8;' 
        });
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('CSV导出失败:', error);
        showToast('导出失败: ' + error.message, 'error');
    }
}

export function exportProjects() {
    const search = document.getElementById('projectSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('projectStatusFilter')?.value || '';
    const biz = document.getElementById('projectBizFilter')?.value || '';
    const cust = document.getElementById('projectCustomerFilter')?.value || '';
    const filtered = (state.allProjectsCache || []).filter(p => {
        const matchesSearch = !search || (p.projectName?.toLowerCase().includes(search)) || (p.projectNumber?.toLowerCase().includes(search)) || ((p.customerId?.name || p.clientName || '').toLowerCase().includes(search));
        const matchesStatus = !status || p.status === status;
        const matchesBiz = !biz || p.businessType === biz;
        const matchesCust = !cust || (p.customerId && p.customerId._id === cust);
        return matchesSearch && matchesStatus && matchesBiz && matchesCust;
    });
    const showAmount = canViewProjectAmount();
    const rows = filtered.map(p => {
        const baseRow = [
        p.projectNumber || '-',
        p.projectName,
        p.customerId?.name || p.clientName,
            getBusinessTypeText(p.businessType)
        ];
        if (showAmount) {
            baseRow.push(p.projectAmount);
        }
        baseRow.push(
        p.deadline ? new Date(p.deadline).toLocaleDateString() : '-',
        getStatusText(p.status)
        );
        return baseRow;
    });
    const header = showAmount 
        ? ['项目编号','项目名称','开票状态','回款状态','客户','业务类型','项目金额','交付时间','状态']
        : ['项目编号','项目名称','开票状态','回款状态','客户','业务类型','交付时间','状态'];
    exportToCSV([header, ...rows], 'projects.csv');
}

export function fillProjectCustomerFilter() {
    const sel = document.getElementById('projectCustomerFilter');
    if (!sel) {
        console.warn('[Projects] 客户筛选下拉框不存在');
        return;
    }
    
    const customers = state.allCustomers || [];
    console.log('[Projects] 填充客户筛选下拉框，客户数量:', customers.length);
    
    if (customers.length === 0) {
        console.warn('[Projects] 客户列表为空，无法填充筛选下拉框');
        sel.innerHTML = '<option value="">全部客户（暂无客户数据）</option>';
        return;
    }
    
    sel.innerHTML = '<option value="">全部客户</option>' + customers.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    console.log('[Projects] 客户筛选下拉框已填充，选项数量:', customers.length + 1);
}

export function fillFinanceFilters() {
    const custSel = document.getElementById('financeCustomer');
    if (custSel) {
        custSel.innerHTML = '<option value="">全部客户</option>' + (state.allCustomers || []).map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    }
    const salesSel = document.getElementById('financeSales');
    if (salesSel && state.allUsers?.length) {
        // 包含销售和兼职销售
        const sales = state.allUsers.filter(u => {
            const roles = u.roles || [];
            return roles.includes('sales') || roles.includes('part_time_sales');
        });
        salesSel.innerHTML = '<option value="">全部销售</option>' + sales.map(s => `<option value="${s._id}">${s.name}${(s.roles || []).includes('part_time_sales') ? ' (兼职)' : ''}</option>`).join('');
    } else if (salesSel && !state.allUsers?.length) {
        // 如果用户列表还没加载，显示提示
        salesSel.innerHTML = '<option value="">加载中...</option>';
    }
    
    // 填充回款记录部分的筛选下拉框
    const paymentCustSel = document.getElementById('paymentCustomer');
    if (paymentCustSel) {
        paymentCustSel.innerHTML = '<option value="">全部客户</option>' + (state.allCustomers || []).map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    }
    const paymentSalesSel = document.getElementById('paymentSales');
    if (paymentSalesSel && state.allUsers?.length) {
        const sales = state.allUsers.filter(u => {
            const roles = u.roles || [];
            return roles.includes('sales') || roles.includes('part_time_sales');
        });
        paymentSalesSel.innerHTML = '<option value="">全部销售</option>' + sales.map(s => `<option value="${s._id}">${s.name}${(s.roles || []).includes('part_time_sales') ? ' (兼职)' : ''}</option>`).join('');
    } else if (paymentSalesSel && !state.allUsers?.length) {
        paymentSalesSel.innerHTML = '<option value="">加载中...</option>';
    }
    
    // 填充发票管理部分的筛选下拉框
    const invoiceCustSel = document.getElementById('invoiceCustomer');
    if (invoiceCustSel) {
        invoiceCustSel.innerHTML = '<option value="">全部客户</option>' + (state.allCustomers || []).map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    }
    const invoiceSalesSel = document.getElementById('invoiceSales');
    if (invoiceSalesSel && state.allUsers?.length) {
        const sales = state.allUsers.filter(u => {
            const roles = u.roles || [];
            return roles.includes('sales') || roles.includes('part_time_sales');
        });
        invoiceSalesSel.innerHTML = '<option value="">全部销售</option>' + sales.map(s => `<option value="${s._id}">${s.name}${(s.roles || []).includes('part_time_sales') ? ' (兼职)' : ''}</option>`).join('');
    } else if (invoiceSalesSel && !state.allUsers?.length) {
        invoiceSalesSel.innerHTML = '<option value="">加载中...</option>';
    }
}

export function fillFinanceProjectSelects() {
    const selects = [
        document.getElementById('paymentProjectId'),
        document.getElementById('invoiceProjectId'),
        document.getElementById('reconciliationProject')
    ].filter(Boolean);
    if (!selects.length) return;
    const options = (state.allProjectsCache || []).map(p => `<option value="${p._id}">${p.projectName}</option>`).join('');
    selects.forEach(sel => {
        sel.innerHTML = '<option value="">请选择项目</option>' + options;
    });
}

// 评价相关函数（供项目详情页面调用）
window.showEvaluationModalForSales = async function(projectId, salesId, salesName) {
    await showEvaluationModal(projectId, 'pm_to_sales', salesId, 'sales', salesName);
}

window.showEvaluationModalForPM = async function(projectId, pmId, pmName) {
    await showEvaluationModal(projectId, 'executor_to_pm', pmId, 'pm', pmName);
}

window.showProjectEvaluationsList = async function(projectId) {
    await showProjectEvaluationsList(projectId);
}

// --- 暴露给 Window ---

// 接受项目分配
export async function acceptMember(projectId, memberId) {
    try {
        const res = await apiFetch(`/projects/${projectId}/members/${memberId}/accept`, {
            method: 'POST'
        });
        
        const data = await res.json();
        
        if (data.success) {
            showToast('已接受项目分配', 'success');
            // 刷新项目详情
            await viewProject(projectId);
        } else {
            showToast(data.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('接受项目分配失败:', error);
        showToast(error.message || '操作失败', 'error');
    }
}

// 拒绝项目分配
export async function rejectMember(projectId, memberId) {
    // 显示拒绝原因输入弹窗（使用更友好的方式）
    const reason = prompt('请输入拒绝原因（可选，可直接点击确定跳过）：');
    if (reason === null) return; // 用户取消
    
    try {
        const res = await apiFetch(`/projects/${projectId}/members/${memberId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason ? reason.trim() : null })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showToast('已拒绝项目分配', 'success');
            // 刷新项目详情
            await viewProject(projectId);
        } else {
            showToast(data.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('拒绝项目分配失败:', error);
        showToast(error.message || '操作失败', 'error');
    }
}
