import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, getStatusBadgeClass, getStatusText, getBusinessTypeText, getRoleText } from '../core/utils.js';
import { loadCustomers } from './customer.js';
import { loadLanguages } from './language.js';

// --- 辅助 ---
const canViewProjectAmount = () => {
    const restricted = ['translator', 'reviewer', 'layout'];
    if (!state.currentRole) return true;
    return !restricted.includes(state.currentRole);
};

let targetLanguageRowIndex = 0;
let currentProjectDetail = null; // 查看/编辑时缓存当前项目

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
        <form id="createProjectForm" data-submit="createProject(event)">
            <div class="form-group">
                <label>项目编号（留空自动生成）</label>
                <input type="text" name="projectNumber" placeholder="如：PRJ2024010001">
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
            <div class="form-group">
                <label>源语种 *</label>
                <select name="sourceLanguage" id="sourceLanguageSelect" required>
                    <option value="">请选择源语种</option>
                    ${languageOptions}
                </select>
                </div>
            <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin-bottom: 0;">目标语言 *</label>
                    <button type="button" class="btn-small" data-click="addTargetLanguageRow()">+ 添加目标语种</button>
                </div>
                <div id="targetLanguagesContainer" style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- 目标语种行将动态添加到这里 -->
                </div>
                <small style="color:#666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个目标语种，支持一对多翻译</small>
                <div style="margin-top:8px;font-size:12px;color:#667eea;">
                    如需新增语种，请在"语种管理"中添加。
                </div>
            </div>
            <div class="form-group" id="wordCountGroup">
                <label>字数（笔译项目）</label>
                <input type="number" name="wordCount" id="wordCount" min="0" step="1" data-change="calculateAmount()">
            </div>
            <div class="form-group" id="unitPriceGroup">
                <label>单价（每千字，元）</label>
                <input type="number" name="unitPrice" id="unitPrice" min="0" step="0.01" data-change="calculateAmount()">
            </div>
            <div class="form-group">
                <label>项目总金额 *</label>
                <input type="number" name="projectAmount" id="projectAmount" step="0.01" min="0" required data-change="calculatePartTimeSalesCommission(); validateLayoutCost()">
                <small style="color: #666; font-size: 12px;">笔译项目：字数×单价/1000；其他项目：手动输入</small>
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
                        { name: 'bilingualDelivery', label: '双语对照交付' }
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
            ` : isSalesRole ? '' : `
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
            `}

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
                    
                    <!-- 翻译相关字段 -->
                    <div id="inlineCreateTranslatorTypeGroup" style="display: none; margin-bottom: 10px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div>
                                <label style="font-size: 12px; display: block; margin-bottom: 4px;">翻译类型</label>
                                <select id="inlineCreateTranslatorType" style="width: 100%; padding: 6px;">
                                    <option value="mtpe">MTPE</option>
                                    <option value="deepedit">深度编辑</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size: 12px; display: block; margin-bottom: 4px;">字数占比 (0-1)</label>
                                <input type="number" id="inlineCreateWordRatio" step="0.01" min="0" max="1" value="1.0" style="width: 100%; padding: 6px;">
                            </div>
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
    }, 100);
}

export async function createProject(e) {
    e.preventDefault();
    
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
        }
        if (m.role === 'layout' && m.layoutCost) {
            member.layoutCost = m.layoutCost;
        }
        return member;
    });
    
    // 验证成员分配规则
    for (const member of members) {
        if (state.currentUser) {
            const isPM = state.currentUser.roles?.includes('pm');
            const isTranslator = state.currentUser.roles?.includes('translator');
            const isReviewer = state.currentUser.roles?.includes('reviewer');
            const isSelfAssignment = member.userId === state.currentUser._id;
            if (isPM && isSelfAssignment) {
                if ((member.role === 'translator' && isTranslator) || (member.role === 'reviewer' && isReviewer)) {
                    showToast('作为项目经理，不能将翻译或审校任务分配给自己', 'error');
                    return;
                }
            }
            const isSales = state.currentUser.roles?.includes('sales') || state.currentUser.roles?.includes('part_time_sales');
            const hasPMRole = state.currentUser.roles?.includes('pm');
            if (isSales && hasPMRole && isSelfAssignment && member.role === 'pm') {
                showToast('作为销售，不能将项目经理角色分配给自己', 'error');
                return;
            }
        }
    }
    
    const specialRequirements = {
        terminology: formData.get('specialRequirements.terminology') === 'on',
        nda: formData.get('specialRequirements.nda') === 'on',
        referenceFiles: formData.get('specialRequirements.referenceFiles') === 'on',
        pureTranslationDelivery: formData.get('specialRequirements.pureTranslationDelivery') === 'on',
        bilingualDelivery: formData.get('specialRequirements.bilingualDelivery') === 'on',
        notes: formData.get('specialRequirements.notes') || undefined
    };
    
    const targetLanguageRows = document.querySelectorAll('.target-language-select');
    const targetLanguages = Array.from(targetLanguageRows)
        .map(select => select.value)
        .filter(value => value && value.trim() !== '');
    
    if (targetLanguages.length === 0) {
        alert('请至少添加并选择一个目标语种');
        return;
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
    
    const data = {
        projectNumber: formData.get('projectNumber') || undefined,
        projectName: formData.get('projectName'),
        contactId: contactId,
        contactInfo: contactInfo,
        customerId: formData.get('customerId'),
        businessType: formData.get('businessType'),
        projectType: formData.get('projectType') || undefined,
        sourceLanguage: formData.get('sourceLanguage'),
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
        partTimeLayout: partTimeLayout
    };

    try {
        const response = await apiFetch('/projects/create', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            loadProjects();
            showToast('项目创建成功' + (members.length > 0 ? `，已添加 ${members.length} 名成员` : ''), 'success');
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert('创建失败: ' + error.message);
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
            <button type="button" class="btn-small btn-danger" onclick="removeEditTargetLanguageRow('targetLanguageRow${targetLanguageRowIndex}')" style="margin-bottom: 0;">删除</button>
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
    const targetLanguagesArray = Array.isArray(p.targetLanguages) ? p.targetLanguages : (p.targetLanguages ? [p.targetLanguages] : []);
    const sourceLanguageOptions = (state.languagesCache || [])
        .filter(lang => lang.isActive)
        .map(lang => `<option value="${lang.name}" ${p.sourceLanguage === lang.name ? 'selected' : ''}>${lang.name}${lang.code ? ' (' + lang.code + ')' : ''}${lang.nativeName ? ' - ' + lang.nativeName : ''}</option>`)
        .join('');
    const content = `
        <form id="editProjectForm" data-submit="updateProject(event, '${p._id}')">
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
            <div class="form-group">
                <label>源语种 *</label>
                <select name="sourceLanguage" id="editSourceLanguageSelect" required>
                    <option value="">请选择源语种</option>
                    ${sourceLanguageOptions}
                </select>
            </div>
            <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin-bottom: 0;">目标语言 *</label>
                    <button type="button" class="btn-small" onclick="addEditTargetLanguageRow()">+ 添加目标语种</button>
                </div>
                <div id="editTargetLanguagesContainer" style="display: flex; flex-direction: column; gap: 8px;"></div>
                <small style="color:#666; font-size: 12px; margin-top: 8px; display: block;">至少需要添加一个目标语种，支持一对多翻译</small>
            </div>
            <div class="form-group">
                <label>字数（笔译）</label>
                <input type="number" name="wordCount" value="${p.wordCount || ''}" min="0" step="1">
            </div>
            ${canViewProjectAmount() ? `
            <div class="form-group">
                <label>单价（每千字）</label>
                <input type="number" name="unitPrice" value="${p.unitPrice || ''}" min="0" step="0.01">
            </div>
            <div class="form-group">
                <label>项目金额 *</label>
                <input type="number" name="projectAmount" value="${p.projectAmount || ''}" min="0" step="0.01" required onchange="calculateEditPartTimeSalesCommission(); validateEditLayoutCost();">
            </div>
            ` : ''}
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
            
            <div class="action-buttons">
                <button type="submit">保存</button>
                <button type="button" onclick="closeModal()">取消</button>
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
}

export async function updateProject(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const targetLanguageRows = document.querySelectorAll('#editTargetLanguagesContainer .target-language-select');
    const targetLanguages = Array.from(targetLanguageRows)
        .map(select => select.value)
        .filter(value => value && value.trim() !== '');
    if (targetLanguages.length === 0) {
        alert('请至少添加并选择一个目标语种');
        return;
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
        sourceLanguage: formData.get('sourceLanguage'),
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
            notes: formData.get('specialRequirements.notes') || undefined
        },
        partTimeSales: editPartTimeSales,
        partTimeLayout: editPartTimeLayout
    };
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
        const roles = state.currentUser?.roles || [];
        const isAdmin = roles.includes('admin');
        const isPM = roles.includes('pm');
        const isSales = roles.includes('sales');
        const isPartTimeSales = roles.includes('part_time_sales');

        const canStart = isAdmin || isSales || isPartTimeSales;
        const canSchedule = isAdmin || isPM;
        const canQualityOps = isAdmin || isPM || isSales || isPartTimeSales;
        const canDeliver = (isAdmin || isSales || isPartTimeSales) && !isPM;
        const canEditDeleteExport = (isAdmin || isSales || isPartTimeSales) && !isPM;
        // 销售创建的项目，销售可以管理成员；管理员和项目经理可以管理所有项目的成员
        const canManageMembers = isAdmin || isPM || (isSales || isPartTimeSales) && project.createdBy?._id === state.currentUser?._id;
        const canFinance = isFinanceRole();

        // 销售只能查看回款信息，不能修改；只有财务和管理员可以修改回款
        const canManagePayment = roles.includes('admin') || roles.includes('finance');
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
                                    <button class="btn-small" onclick="showSetLayoutCostModal('${projectId}')" style="margin-left: 10px;">
                                        ${(project.partTimeLayout?.layoutCost || 0) > 0 ? '修改费用' : '设置费用'}
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                    ${project.specialRequirements && (project.specialRequirements.terminology || project.specialRequirements.nda || project.specialRequirements.referenceFiles || project.specialRequirements.pureTranslationDelivery || project.specialRequirements.bilingualDelivery || project.specialRequirements.notes) ? `
                        <div class="detail-row">
                            <div class="detail-label">特殊要求:</div>
                            <div class="detail-value">
                                ${project.specialRequirements.terminology ? '<span class="badge badge-info">术语表</span>' : ''}
                                ${project.specialRequirements.nda ? '<span class="badge badge-info">保密协议</span>' : ''}
                                ${project.specialRequirements.referenceFiles ? '<span class="badge badge-info">参考文件</span>' : ''}
                                ${project.specialRequirements.pureTranslationDelivery ? '<span class="badge badge-info">纯译文交付</span>' : ''}
                                ${project.specialRequirements.bilingualDelivery ? '<span class="badge badge-info">对照版交付</span>' : ''}
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
                    <div id="projectMembers" style="display: flex; flex-direction: column; gap: 10px;">
                        ${project.members && Array.isArray(project.members) && project.members.length > 0 ? project.members.map(m => {
                            // 处理 userId 可能是对象或字符串的情况
                            const userName = (m.userId && typeof m.userId === 'object') ? m.userId.name : (m.userId || '未知用户');
                            const roleText = getRoleText(m.role);
                            return `<div class="member-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f5f5f5; border-radius: 4px;">
                                <div class="member-info" style="flex: 1;">
                                    <strong>${userName}</strong> - ${roleText}
                                    ${m.role === 'translator' ? ` (${m.translatorType === 'deepedit' ? '深度编辑' : 'MTPE'}, 字数占比: ${((m.wordRatio || 1) * 100).toFixed(0)}%)` : ''}
                                    ${m.role === 'layout' && m.layoutCost ? ` (排版费用: ¥${(m.layoutCost || 0).toFixed(2)})` : ''}
                                </div>
                                ${canManageMembers ? `<div class="member-actions" style="margin-left: 10px;"><button class="btn-small btn-danger" data-click="deleteMember('${projectId}', '${m._id}')" style="background: #dc2626; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">删除</button></div>` : ''}
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
                        <button class="btn-small" onclick="addProjectPayment('${projectId}')">新增回款</button>
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
                        <button class="btn-small" onclick="addProjectInvoice('${projectId}')">新增发票</button>
                    </div>
                    <div id="projectInvoiceList"><div class="card-desc">加载中...</div></div>
                </div>
                ` : ''}

                ${(canStart || canSchedule || canQualityOps || isTranslatorMember || isReviewerMember || isLayoutMember) && project.status !== 'completed' && project.status !== 'cancelled' ? `
                    <div class="detail-section">
                        <h4>项目管理</h4>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            ${canStart ? `<button class="btn-small btn-success" ${startReached ? 'disabled' : ''} onclick="startProject('${projectId}')">开始项目</button>` : ''}
                            ${canSetScheduled && project.status === 'scheduled' ? `<button class="btn-small" data-click="updateProjectStatus('${projectId}','in_progress','确认人员已安排完毕，项目开始执行？')">开始执行</button>` : ''}
                            ${canSetTranslationDone ? `<button class="btn-small" ${translationReached ? 'disabled' : ''} data-click="updateProjectStatus('${projectId}','translation_done','确认标记翻译完成？')">翻译完成</button>` : ''}
                            ${canSetReviewDone ? `<button class="btn-small" ${reviewReached ? 'disabled' : ''} data-click="updateProjectStatus('${projectId}','review_done','确认标记审校完成？')">审校完成</button>` : ''}
                            ${canSetLayoutDone ? `<button class="btn-small" ${layoutReached ? 'disabled' : ''} data-click="updateProjectStatus('${projectId}','layout_done','确认标记排版完成？')">排版完成</button>` : ''}
                            ${(project.status === 'in_progress' || project.status === 'scheduled' || project.status === 'translation_done' || project.status === 'review_done' || project.status === 'layout_done') && canQualityOps ? `
                                <button class="btn-small" data-click="setRevision('${projectId}', ${project.revisionCount})">标记返修</button>
                                <button class="btn-small" data-click="setDelay('${projectId}')">标记延期</button>
                                <button class="btn-small" data-click="setComplaint('${projectId}')">标记客诉</button>
                            ` : ''}
                            ${(project.status === 'in_progress' || project.status === 'scheduled' || project.status === 'translation_done' || project.status === 'review_done' || project.status === 'layout_done') && canDeliver ? `<button class="btn-small btn-success" data-click="finishProject('${projectId}')">交付项目</button>` : ''}
                            ${canEditDeleteExport ? `
                              <button class="btn-small" onclick="exportProjectQuotation('${projectId}')" style="background: #10b981;">📄 导出报价单</button>
                              <button class="btn-small" onclick="showEditProjectModal()">编辑项目</button>
                              <button class="btn-small btn-danger" onclick="deleteProject('${projectId}')">删除项目</button>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        showModal({ title: '项目详情', body: content });
        // 直接调用导入的函数，而不是通过window
        loadRealtimeKPI(projectId);
        if (canFinance) {
            window.loadProjectPayments?.(projectId);
            window.loadProjectInvoices?.(projectId);
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
            alert('导出失败: ' + (error.message || '未知错误'));
        }
    } catch (error) {
        console.error('导出报价单失败:', error);
        alert('导出失败: ' + error.message);
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
            alert(result.message);
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
                <button type="button" onclick="closeModal()">取消</button>
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
function initInlineCreateMemberForm() {
    const roleSelect = document.getElementById('inlineCreateMemberRole');
    if (!roleSelect) return;
    
    // 获取可选择的角色
    const roles = state.currentUser?.roles || [];
    const currentRole = state.currentRole;
    const isAdmin = roles.includes('admin');
    const isPM = roles.includes('pm');
    const isSales = roles.includes('sales');
    const isPartTimeSales = roles.includes('part_time_sales');
    const isCurrentSales = currentRole === 'sales';
    const isCurrentPartTimeSales = currentRole === 'part_time_sales';
    
    let availableRoles;
    if (isAdmin) {
        availableRoles = [
            { value: 'translator', label: '翻译' },
            { value: 'reviewer', label: '审校' },
            { value: 'pm', label: '项目经理' },
            { value: 'sales', label: '销售' },
            { value: 'admin_staff', label: '综合岗' },
            { value: 'part_time_sales', label: '兼职销售' },
            { value: 'layout', label: '兼职排版' }
        ];
    } else if (currentRole === 'pm' || isPM && !isCurrentSales && !isCurrentPartTimeSales) {
        availableRoles = [
            { value: 'translator', label: '翻译' },
            { value: 'reviewer', label: '审校' },
            { value: 'layout', label: '兼职排版' }
        ];
    } else if (isCurrentSales || isCurrentPartTimeSales) {
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    } else if (isSales || isPartTimeSales) {
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    } else {
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
    const layoutCostGroup = document.getElementById('inlineCreateLayoutCostGroup');
    if (translatorGroup) translatorGroup.style.display = 'none';
    if (layoutCostGroup) layoutCostGroup.style.display = 'none';
}

// 内联添加成员：角色变化处理
export function onInlineCreateMemberRoleChange() {
    const role = document.getElementById('inlineCreateMemberRole')?.value;
    const translatorGroup = document.getElementById('inlineCreateTranslatorTypeGroup');
    const layoutCostGroup = document.getElementById('inlineCreateLayoutCostGroup');
    
    if (role === 'translator') {
        if (translatorGroup) translatorGroup.style.display = 'block';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
    } else if (role === 'layout') {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'block';
    } else {
        if (translatorGroup) translatorGroup.style.display = 'none';
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
    
    if (!state.allUsers || state.allUsers.length === 0) {
        if (userIdSelect) userIdSelect.innerHTML = '<option value="">加载用户列表中...</option>';
        return;
    }
    
    const filteredUsers = state.allUsers.filter(user => {
        if (!user.roles || !Array.isArray(user.roles)) return false;
        return user.roles.includes(role);
    });
    
    if (filteredUsers.length === 0) {
        userIdSelect.innerHTML = '<option value="">没有符合条件的用户</option>';
        return;
    }
    
    userIdSelect.innerHTML = '<option value="">请选择用户</option>' +
        filteredUsers.map(u => `<option value="${u._id}">${u.name}${u.username ? ' (' + u.username + ')' : ''}</option>`).join('');
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
    
    // 自我分配限制
    const me = state.currentUser;
    if (me) {
        const isSelf = userId === me._id;
        if (isSelf && me.roles?.includes('pm')) {
            const isTranslator = me.roles?.includes('translator');
            const isReviewer = me.roles?.includes('reviewer');
            if ((role === 'translator' && isTranslator) || (role === 'reviewer' && isReviewer)) {
                showToast('作为项目经理，不能将翻译或审校任务分配给自己', 'error');
                return;
            }
        }
        const isSales = me.roles?.includes('sales') || me.roles?.includes('part_time_sales');
        const hasPMRole = me.roles?.includes('pm');
        if (isSelf && role === 'pm' && isSales && hasPMRole) {
            showToast('作为销售，不能将项目经理角色分配给自己', 'error');
            return;
        }
    }
    
    const member = {
        userId,
        role
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
        'layout': '兼职排版'
    };
    
    container.innerHTML = createProjectMembers.map((member, index) => {
        const user = (state.allUsers || []).find(u => u._id === member.userId);
        const userName = user ? user.name : '未知用户';
        const roleText = roleTextMap[member.role] || member.role;
        let extraInfo = '';
        if (member.role === 'translator') {
            extraInfo = ` (${member.translatorType === 'mtpe' ? 'MTPE' : '深度编辑'}, 占比: ${(member.wordRatio || 1.0).toFixed(2)})`;
        } else if (member.role === 'layout' && member.layoutCost) {
            extraInfo = ` (费用: ¥${member.layoutCost.toFixed(2)})`;
        }
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: white; border-radius: 4px; margin-bottom: 8px;">
                <span style="font-size: 13px;">
                    <strong>${userName}</strong> - ${roleText}${extraInfo}
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
    
    // 检查用户角色，确定可选择的角色
    const roles = state.currentUser?.roles || [];
    const currentRole = state.currentRole;
    const isAdmin = roles.includes('admin');
    const isPM = roles.includes('pm');
    const isSales = roles.includes('sales');
    const isPartTimeSales = roles.includes('part_time_sales');
    const isCurrentSales = currentRole === 'sales';
    const isCurrentPartTimeSales = currentRole === 'part_time_sales';
    
    // 权限控制（按当前角色优先）：
    // - 管理员：可以添加所有角色
    // - 当前角色为项目经理：只能添加翻译、审校、兼职排版
    // - 当前角色为销售或兼职销售：只能添加项目经理
    // - 其他情况按原有角色列表回退
    let availableRoles;
    if (isAdmin) {
        availableRoles = [
            { value: 'translator', label: '翻译' },
            { value: 'reviewer', label: '审校' },
            { value: 'pm', label: '项目经理' },
            { value: 'sales', label: '销售' },
            { value: 'admin_staff', label: '综合岗' },
            { value: 'part_time_sales', label: '兼职销售' },
            { value: 'layout', label: '兼职排版' }
        ];
    } else if (currentRole === 'pm' || isPM && !isCurrentSales && !isCurrentPartTimeSales) {
        availableRoles = [
            { value: 'translator', label: '翻译' },
            { value: 'reviewer', label: '审校' },
            { value: 'layout', label: '兼职排版' }
        ];
    } else if (isCurrentSales || isCurrentPartTimeSales) {
        // 兼职销售/销售当前角色：只能添加PM
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    } else if (isSales || isPartTimeSales) {
        // 拥有销售/兼职销售角色但当前角色不是它们，仍然限制为PM，避免越权
        availableRoles = [{ value: 'pm', label: '项目经理' }];
    } else {
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
                <select name="userId" id="createMemberUserId" required>
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
    
    // 自我分配限制
    const me = state.currentUser;
    if (me) {
        const isSelf = userId === me._id;
        if (isSelf && me.roles?.includes('pm')) {
            const isTranslator = me.roles?.includes('translator');
            const isReviewer = me.roles?.includes('reviewer');
            if ((role === 'translator' && isTranslator) || (role === 'reviewer' && isReviewer)) {
                showToast('作为项目经理，不能将翻译或审校任务分配给自己', 'error');
                return;
            }
        }
        const isSales = me.roles?.includes('sales') || me.roles?.includes('part_time_sales');
        const hasPMRole = me.roles?.includes('pm');
        if (isSelf && role === 'pm' && isSales && hasPMRole) {
            showToast('作为销售，不能将项目经理角色分配给自己', 'error');
            return;
        }
    }
    
    const member = {
        userId,
        role
    };
    
    if (role === 'translator') {
        member.translatorType = formData.get('translatorType') || 'mtpe';
        member.wordRatio = formData.get('wordRatio') ? parseFloat(formData.get('wordRatio')) : 1.0;
    }
    
    if (role === 'layout') {
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
    if (role === 'translator') {
        if (translatorGroup) translatorGroup.style.display = 'block';
        if (wordRatioGroup) wordRatioGroup.style.display = 'block';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
    } else if (role === 'layout') {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'block';
    } else {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
    }
}

// 包装函数：当创建项目时角色选择改变时，同时调用 toggleCreateTranslatorFields 和 filterCreateUsersByRole
export function onCreateMemberRoleChange() {
    toggleCreateTranslatorFields();
    filterCreateUsersByRole();
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
    
    // 自身限制
    const me = state.currentUser;
    if (me && (role === 'translator' || role === 'reviewer')) {
        const isPM = me.roles?.includes('pm');
        const isTranslator = me.roles?.includes('translator');
        const isReviewer = me.roles?.includes('reviewer');
        if (isPM) {
            if (role === 'translator' && isTranslator) {
                filteredUsers = filteredUsers.filter(u => u._id !== me._id);
            }
            if (role === 'reviewer' && isReviewer) {
                filteredUsers = filteredUsers.filter(u => u._id !== me._id);
            }
        }
    }
    if (me && role === 'pm') {
        const isSales = me.roles?.includes('sales') || me.roles?.includes('part_time_sales');
        const hasPMRole = me.roles?.includes('pm');
        if (isSales && hasPMRole) {
            filteredUsers = filteredUsers.filter(u => u._id !== me._id);
        }
    }
    
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

    // 检查用户角色，确定可选择的角色
    const roles = state.currentUser?.roles || [];
    const isAdmin = roles.includes('admin');
    const isPM = roles.includes('pm');
    const isSales = roles.includes('sales') || roles.includes('part_time_sales');
    
    // 销售只能添加项目经理
    const availableRoles = isAdmin || isPM ? [
        { value: 'translator', label: '翻译' },
        { value: 'reviewer', label: '审校' },
        { value: 'pm', label: '项目经理' },
        { value: 'sales', label: '销售' },
        { value: 'admin_staff', label: '综合岗' },
        { value: 'part_time_sales', label: '兼职销售' },
        { value: 'layout', label: '兼职排版' }
    ] : [
        { value: 'pm', label: '项目经理' }
    ];

    const projectAmount = currentProjectDetail?.projectAmount || 0;
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
                <select name="userId" id="memberUserId" required>
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
            <div class="action-buttons">
                <button type="submit">添加</button>
                <button type="button" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: '添加项目成员', body: content });
    
    // 如果已经选择了角色，立即过滤用户列表
    setTimeout(() => {
        const roleSelect = document.getElementById('memberRole');
        if (roleSelect && roleSelect.value) {
            filterUsersByRole();
        }
    }, 100);
}

export function toggleTranslatorFields() {
    const role = document.getElementById('memberRole')?.value;
    const translatorGroup = document.getElementById('translatorTypeGroup');
    const wordRatioGroup = document.getElementById('wordRatioGroup');
    const layoutCostGroup = document.getElementById('layoutCostGroup');
    if (role === 'translator') {
        if (translatorGroup) translatorGroup.style.display = 'block';
        if (wordRatioGroup) wordRatioGroup.style.display = 'block';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
    } else if (role === 'layout') {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'block';
    } else {
        if (translatorGroup) translatorGroup.style.display = 'none';
        if (wordRatioGroup) wordRatioGroup.style.display = 'none';
        if (layoutCostGroup) layoutCostGroup.style.display = 'none';
    }
}

// 包装函数：当角色选择改变时，同时调用 toggleTranslatorFields 和 filterUsersByRole
export function onMemberRoleChange() {
    toggleTranslatorFields();
    filterUsersByRole();
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
    
    console.log(`角色 ${role} 的可用用户 (过滤前):`, filteredUsers.length, filteredUsers.map(u => u.name));
    
    // 自身限制
    const me = state.currentUser;
    if (me && (role === 'translator' || role === 'reviewer')) {
        const isPM = me.roles?.includes('pm');
        const isTranslator = me.roles?.includes('translator');
        const isReviewer = me.roles?.includes('reviewer');
        if (isPM) {
            if (role === 'translator' && isTranslator) {
                console.log('过滤掉自己（PM不能分配翻译给自己）');
                filteredUsers = filteredUsers.filter(u => u._id !== me._id);
            }
            if (role === 'reviewer' && isReviewer) {
                console.log('过滤掉自己（PM不能分配审校给自己）');
                filteredUsers = filteredUsers.filter(u => u._id !== me._id);
            }
        }
    }
    if (me && role === 'pm') {
        const isSales = me.roles?.includes('sales') || me.roles?.includes('part_time_sales');
        const hasPMRole = me.roles?.includes('pm');
        if (isSales && hasPMRole) {
            console.log('过滤掉自己（销售不能分配PM给自己）');
            filteredUsers = filteredUsers.filter(u => u._id !== me._id);
        }
    }
    
    console.log(`角色 ${role} 的可用用户 (过滤后):`, filteredUsers.length, filteredUsers.map(u => u.name));
    
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

export async function addMember(e, projectId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const role = formData.get('role');
    const userId = formData.get('userId');
    if (!role || !userId) return alert('请选择角色和用户');

    // 自我分配限制
    const me = state.currentUser;
    if (me) {
        const isSelf = userId === me._id;
        if (isSelf && me.roles?.includes('pm')) {
            const isTranslator = me.roles?.includes('translator');
            const isReviewer = me.roles?.includes('reviewer');
            if ((role === 'translator' && isTranslator) || (role === 'reviewer' && isReviewer)) {
                showToast('作为项目经理，不能将翻译或审校任务分配给自己', 'error');
                return;
            }
        }
        const isSales = me.roles?.includes('sales') || me.roles?.includes('part_time_sales');
        const hasPMRole = me.roles?.includes('pm');
        if (isSelf && role === 'pm' && isSales && hasPMRole) {
            showToast('作为销售，不能将项目经理角色分配给自己', 'error');
            return;
        }
    }

    let payload = { role, userId };
    if (role === 'translator') {
        payload.translatorType = formData.get('translatorType') || 'mtpe';
        payload.wordRatio = formData.get('wordRatio') ? parseFloat(formData.get('wordRatio')) : 1.0;
    }
    if (role === 'layout') {
        const layoutCost = formData.get('layoutCost') ? parseFloat(formData.get('layoutCost')) : 0;
        if (layoutCost > 0 && !validateAddMemberLayoutCost()) return;
        payload.layoutCost = layoutCost;
    }

    try {
        const res = await apiFetch(`/projects/${projectId}/add-member`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || '添加失败', 'error');
            return;
        }
        closeModal();
        // 重新加载项目详情以获取最新的成员列表
        await viewProject(projectId);
        showToast('成员已添加', 'success');
    } catch (err) {
        showToast('添加失败: ' + err.message, 'error');
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
    if (!confirm('确定要交付此项目吗？交付后将无法修改。')) return;
    try {
        const response = await apiFetch(`/projects/${projectId}/finish`, { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            closeModal();
            loadProjects();
            showToast('项目已完成', 'success');
        } else {
            showToast(result.message, 'error');
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

export async function loadProjects(filters = {}) {
    try {
        // 构建查询参数
        const params = new URLSearchParams();
        if (filters.month) params.append('month', filters.month);
        if (filters.status) params.append('status', filters.status);
        if (filters.businessType) params.append('businessType', filters.businessType);
        if (filters.role) params.append('role', filters.role);
        if (filters.customerId) params.append('customerId', filters.customerId);
        
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

export function renderProjects() {
    console.log('[Projects] renderProjects start');
    const search = document.getElementById('projectSearch')?.value?.toLowerCase() || '';
    const status = document.getElementById('projectStatusFilter')?.value || '';
    const biz = document.getElementById('projectBizFilter')?.value || '';
    const cust = document.getElementById('projectCustomerFilter')?.value || '';
    const pageSizeSel = document.getElementById('projectPageSize');
    const pageSize = pageSizeSel ? parseInt(pageSizeSel.value, 10) || 10 : 10;
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // 如果用户手动修改了筛选条件（状态、业务类型、月份），需要重新从后端加载数据
    if (state.backendFilters) {
        const currentFilters = {};
        if (state.projectFilterMonth) currentFilters.month = state.projectFilterMonth;
        if (status) currentFilters.status = status;
        if (biz) currentFilters.businessType = biz;
        
        // 检查筛选条件是否与后端不一致
        // 需要比较：月份、状态、业务类型是否都一致
        const monthMatch = !state.projectFilterMonth ? !state.backendFilters.month : (state.backendFilters.month === state.projectFilterMonth);
        const statusMatch = !status ? !state.backendFilters.status : (state.backendFilters.status === status);
        const bizMatch = !biz ? !state.backendFilters.businessType : (state.backendFilters.businessType === biz);
        const filtersMatch = monthMatch && statusMatch && bizMatch;
        
        if (!filtersMatch) {
            console.log('[Projects] Filters changed, reloading from backend', {
                oldFilters: state.backendFilters,
                newFilters: { month: state.projectFilterMonth, status, businessType: biz },
                monthMatch,
                statusMatch,
                bizMatch
            });
            // 重新从后端加载数据，而不是在前端已筛选的结果上继续筛选
            const newFilters = {};
            if (state.projectFilterMonth) newFilters.month = state.projectFilterMonth;
            if (status) newFilters.status = status;
            if (biz) newFilters.businessType = biz;
            // 重置页码
            state.projectPage = 1;
            // 重新加载项目
            loadProjects(newFilters);
            return; // 提前返回，loadProjects会调用renderProjects
        }
    }

    // 如果后端已经筛选过，前端只做搜索和客户过滤，不再过滤月份、状态、业务类型
    const backendFiltered = state.backendFilters && Object.keys(state.backendFilters).length > 0;
    
    const filtered = (state.allProjectsCache || []).filter(p => {
        const matchesSearch = !search || (p.projectName?.toLowerCase().includes(search)) || (p.projectNumber?.toLowerCase().includes(search)) || ((p.customerId?.name || p.customerId?.shortName || p.clientName || '').toLowerCase().includes(search));
        const matchesCust = !cust || (p.customerId && (p.customerId._id === cust || p.customerId === cust));
        
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
            return matchesSearch && matchesCust && matchesDeliveryOverdue && matchesRecentCompleted;
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
        return matchesSearch && matchesStatus && matchesBiz && matchesCust && matchesMonth && matchesDeliveryOverdue && matchesRecentCompleted;
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
    document.getElementById('projectsList').innerHTML = `
        <table class="table-sticky">
                    <thead>
                        <tr>
                            <th>项目编号</th>
                            <th>项目名称</th>
                            <th>客户名称</th>
                            <th>业务类型</th>
                            ${showAmount ? '<th>项目金额</th>' : ''}
                            <th>交付时间</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                ${(pageData.length ? pageData : []).map(p => `
                    <tr class="row-striped">
                                <td>${p.projectNumber || '-'}</td>
                                <td>${p.projectName}</td>
                                <td>${p.customerId?.name || p.clientName}</td>
                                <td>${getBusinessTypeText(p.businessType)}</td>
                                ${showAmount ? `<td>¥${p.projectAmount?.toLocaleString()}</td>` : ''}
                                <td>${p.deadline ? new Date(p.deadline).toLocaleDateString() : '-'}</td>
                                <td><span class="badge ${getStatusBadgeClass(p.status)}">${getStatusText(p.status)}</span></td>
                        <td><button class="btn-small" data-click="viewProject('${p._id || ''}')">查看</button></td>
                            </tr>
                `).join('') || `<tr><td colspan="${showAmount ? 8 : 7}" style="text-align:center;">暂无项目</td></tr>`}
                    </tbody>
                </table>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">
            <button class="btn-small" ${state.projectPage<=1?'disabled':''} data-click="prevProjectPage()">上一页</button>
            <span style="align-self:center;">${state.projectPage} / ${totalPages}</span>
            <button class="btn-small" ${state.projectPage>=totalPages?'disabled':''} data-click="nextProjectPage()">下一页</button>
            <input type="number" min="1" max="${totalPages}" value="${state.projectPage}" style="width:70px;padding:6px;" data-change="jumpProjectPage(this.value, ${totalPages})">
        </div>
    `;
}

export function jumpProjectPage(val, total) {
    const page = Math.min(Math.max(parseInt(val || 1, 10), 1), total);
    state.projectPage = page;
    renderProjects();
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
    const header = showAmount ? ['项目编号','项目名称','客户','业务类型','项目金额','交付时间','状态'] : ['项目编号','项目名称','客户','业务类型','交付时间','状态'];
    exportToCSV([header, ...rows], 'projects.csv');
}

export function fillProjectCustomerFilter() {
    const sel = document.getElementById('projectCustomerFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="">全部客户</option>' + (state.allCustomers || []).map(c => `<option value="${c._id}">${c.name}</option>`).join('');
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

// --- 暴露给 Window ---
