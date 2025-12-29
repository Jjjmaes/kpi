import { apiFetch } from '../core/api.js';
import { state } from '../core/state.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, getRoleText } from '../core/utils.js';

// ==================== KPI查询 ====================
export async function loadKPI() {
    const month = document.getElementById('kpiMonth')?.value || new Date().toISOString().slice(0, 7);
    const userId = document.getElementById('kpiUserSelect')?.value;

    try {
        let response;
        if (!userId || userId === '') {
            const roles = state.currentUser?.roles || [];
            const isAdminOrFinance = roles.includes('admin') || roles.includes('finance');
            if (!isAdminOrFinance) {
                response = await apiFetch(`/kpi/user/${state.currentUser?._id}?month=${month}`);
            } else {
                response = await apiFetch(`/kpi/month/${month}`);
            }
        } else {
            // 只有管理员和财务可以选择其他用户
            const roles = state.currentUser?.roles || [];
            const isAdminOrFinance = roles.includes('admin') || roles.includes('finance');
            if (!isAdminOrFinance) {
                // 非管理员/财务用户即使选择了userId，也强制查看自己的
                response = await apiFetch(`/kpi/user/${state.currentUser?._id}?month=${month}`);
            } else {
                response = await apiFetch(`/kpi/user/${userId}?month=${month}`);
            }
        }

        const data = await response.json();
        if (!data.success) return;

        const isAllUsers = !userId || userId === '';
        // 只有管理员和财务可以查看全部用户汇总
        const roles = state.currentUser?.roles || [];
        const isAdminOrFinance = roles.includes('admin') || roles.includes('finance');
        if (isAllUsers && data.data?.summary && isAdminOrFinance) {
            // 判断是否为兼职角色的函数（统一使用employmentType判断）
            const isPartTimeRole = (record) => {
                // 优先使用employmentType字段（最准确）
                if (record.employmentType === 'part_time') {
                    return true;
                }
                // 后备方案：通过角色代码判断（兼容历史数据）
                const roleStr = String(record.role || '').trim();
                return roleStr === 'part_time_sales' || 
                       roleStr === 'part_time_translator' ||
                       roleStr.includes('part_time');
            };

            const html = `
                <h3>全部用户KPI汇总 - ${month}</h3>
                <table>
                    <thead>
                        <tr>
                            <th>用户</th>
                            <th>角色</th>
                            <th>专职KPI（分）</th>
                            <th>兼职费用（元）</th>
                            <th>总计</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.data.summary.map(user => {
                            // 分离专职和兼职（需要从records中获取employmentType信息）
                            const roleEmploymentMap = {};
                            (data.data?.records || []).forEach(r => {
                                if (r.userId?._id === user.userId || r.userId === user.userId) {
                                    roleEmploymentMap[r.role] = r.employmentType || 'full_time';
                                }
                            });
                            
                            const partTimeRoles = Object.keys(user.byRole).filter(role => {
                                const empType = roleEmploymentMap[role];
                                return empType === 'part_time' || role.includes('part_time');
                            });
                            const fullTimeRoles = Object.keys(user.byRole).filter(role => {
                                const empType = roleEmploymentMap[role];
                                return empType !== 'part_time' && !role.includes('part_time');
                            });
                            const partTimeTotal = partTimeRoles.reduce((sum, role) => sum + (user.byRole[role] || 0), 0);
                            const fullTimeTotal = fullTimeRoles.reduce((sum, role) => sum + (user.byRole[role] || 0), 0);

                            // 构建专职KPI显示
                            const fullTimeDisplay = fullTimeRoles.length > 0 
                                ? fullTimeRoles.map(role => {
                                    const value = user.byRole[role] || 0;
                                    return `${getRoleText(role)}: ${value.toLocaleString()} 分`;
                                }).join('<br>')
                                : '-';

                            // 构建兼职费用显示
                            const partTimeDisplay = partTimeRoles.length > 0 
                                ? partTimeRoles.map(role => {
                                    const value = user.byRole[role] || 0;
                                    return `${getRoleText(role)}: ¥${value.toLocaleString()} 元`;
                                }).join('<br>')
                                : '-';

                            // 总计显示
                            let totalDisplay = '';
                            if (partTimeRoles.length > 0 && fullTimeRoles.length === 0) {
                                totalDisplay = `<strong>¥${partTimeTotal.toLocaleString()} 元</strong>`;
                            } else if (partTimeRoles.length === 0 && fullTimeRoles.length > 0) {
                                totalDisplay = `<strong>${fullTimeTotal.toLocaleString()} 分</strong>`;
                            } else if (partTimeRoles.length > 0 && fullTimeRoles.length > 0) {
                                totalDisplay = `<strong>兼职: ¥${partTimeTotal.toLocaleString()} 元<br>专职: ${fullTimeTotal.toLocaleString()} 分</strong>`;
                            } else {
                                totalDisplay = `<strong>-</strong>`;
                            }

                            return `
                            <tr>
                                <td>${user.userName}</td>
                                <td>${user.roles.map(r => getRoleText(r)).join(', ')}</td>
                                <td style="font-size: 12px; color: #1e40af;">${fullTimeDisplay}</td>
                                <td style="font-size: 12px; color: #0f766e;">${partTimeDisplay}</td>
                                <td>${totalDisplay}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                ${data.data?.monthlyRoleKPIs && data.data?.monthlyRoleKPIs.length > 0 ? `
                    <div style="margin-top: 20px;">
                        <h4>月度汇总KPI（综合岗/财务岗）</h4>
                        <table>
                            <thead>
                                <tr>
                                    <th>用户</th>
                                    <th>角色</th>
                                    <th>全公司当月项目总金额</th>
                                    <th>系数</th>
                                    <th>完成系数（评价）</th>
                                    <th>KPI值</th>
                                    <th>计算公式</th>
                                    ${(state.currentUser?.roles || []).includes('admin') ? '<th>操作</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${data.data?.monthlyRoleKPIs.map(r => `
                                    <tr>
                                        <td>${r.userId?.name || 'N/A'}</td>
                                        <td>${getRoleText(r.role)}</td>
                                        <td>¥${r.totalCompanyAmount.toLocaleString()}</td>
                                        <td>${r.ratio}</td>
                                        <td>
                                            ${r.evaluationLevel === 'good' ? '<span style="color:#10b981;">好 (1.1)</span>' :
                                              r.evaluationLevel === 'poor' ? '<span style="color:#ef4444;">差 (0.8)</span>' : '<span>中 (1.0)</span>'}
                                            ${r.evaluatedBy ? `<br><small style="color:#666;">评价人: ${r.evaluatedBy.name || '管理员'}</small>` : '<br><small style="color:#999;">未评价</small>'}
                                        </td>
                                        <td>${r.kpiValue.toLocaleString()} 分</td>
                                        <td style="font-size: 12px;">${r.calculationDetails?.formula || ''}</td>
                                        ${(state.currentUser?.roles || []).includes('admin') ? `
                                            <td>
                                                <button class="btn-small" data-click="showEvaluateModal('${r._id}', '${r.role}', '${r.evaluationLevel || 'medium'}')">
                                                    ${r.evaluatedBy ? '修改评价' : '评价'}
                                                </button>
                                            </td>
                                        ` : ''}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
            `;
            const container = document.getElementById('kpiResults');
            if (container) container.innerHTML = html;
        } else {
            const user = (state.allUsers || []).find(u => u._id === userId) || state.currentUser;
            const canViewAmount = data.data?.canViewAmount !== false;
            const userRoles = state.currentUser?.roles || [];
            const isSensitiveRole = userRoles.includes('pm') || userRoles.includes('translator') || userRoles.includes('reviewer');
            const shouldHideAmount = !canViewAmount || (isSensitiveRole && !userRoles.includes('admin') && !userRoles.includes('finance'));

            let monthlyRoleKPIHtml = '';
            if (data.data?.monthlyRoleKPIs && data.data?.monthlyRoleKPIs.length > 0) {
                monthlyRoleKPIHtml = `
                    <div style="margin-top: 20px;">
                        <h4>月度汇总KPI（综合岗/财务岗）</h4>
                        <table>
                            <thead>
                                <tr>
                                    <th>角色</th>
                                    <th>全公司当月项目总金额</th>
                                    <th>系数</th>
                                    <th>完成系数（评价）</th>
                                    <th>KPI值</th>
                                    <th>计算公式</th>
                                    ${(state.currentUser?.roles || []).includes('admin') ? '<th>操作</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${data.data?.monthlyRoleKPIs.map(r => `
                                    <tr>
                                        <td>${getRoleText(r.role)}</td>
                                        <td>¥${r.totalCompanyAmount.toLocaleString()}</td>
                                        <td>${r.ratio}</td>
                                        <td>
                                            ${r.evaluationLevel === 'good' ? '<span style="color:#10b981;">好 (1.1)</span>' :
                                              r.evaluationLevel === 'poor' ? '<span style="color:#ef4444;">差 (0.8)</span>' : '<span>中 (1.0)</span>'}
                                            ${r.evaluatedBy ? `<br><small style="color:#666;">评价人: ${r.evaluatedBy.name || '管理员'}</small>` : '<br><small style="color:#999;">未评价</small>'}
                                        </td>
                                        <td>${r.kpiValue.toLocaleString()} 分</td>
                                        <td style="font-size: 12px;">${r.calculationDetails?.formula || ''}</td>
                                        ${(state.currentUser?.roles || []).includes('admin') ? `
                                            <td>
                                                <button class="btn-small" data-click="showEvaluateModal('${r._id}', '${r.role}', '${r.evaluationLevel || 'medium'}')">
                                                    ${r.evaluatedBy ? '修改评价' : '评价'}
                                                </button>
                                            </td>
                                        ` : ''}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            // 按角色拆分专职KPI分值与兼职费用合计
            const byRole = {};
            (data.data?.records || []).forEach(r => {
                const role = String(r.role || '').trim();
                if (!byRole[role]) byRole[role] = 0;
                byRole[role] += r.kpiValue || 0;
            });
            (data.data?.monthlyRoleKPIs || []).forEach(r => {
                const role = String(r.role || '').trim();
                if (!byRole[role]) byRole[role] = 0;
                byRole[role] += r.kpiValue || 0;
            });

            // 统一使用employmentType判断兼职角色
            const isPartTimeRole = (record) => {
                // 优先使用employmentType字段（最准确）
                if (record.employmentType === 'part_time') {
                    return true;
                }
                // 后备方案：通过角色代码判断（兼容历史数据）
                const roleStr = String(record.role || '').trim();
                return roleStr === 'part_time_sales' || 
                       roleStr === 'part_time_translator' ||
                       roleStr.includes('part_time');
            };

            const partTimeRolesForUser = Object.keys(byRole).filter(role => {
                // 从records中找到对应的记录来判断employmentType
                const record = (data.data?.records || []).find(r => String(r.role || '').trim() === role);
                if (!record) return false;
                return isPartTimeRole(record);
            });
            const fullTimeRolesForUser = Object.keys(byRole).filter(role => {
                const record = (data.data?.records || []).find(r => String(r.role || '').trim() === role);
                if (!record) return true; // 如果没有记录，默认视为专职
                return !isPartTimeRole(record);
            });
            const partTimeTotalForUser = partTimeRolesForUser.reduce((sum, role) => sum + (byRole[role] || 0), 0);
            const fullTimeTotalForUser = fullTimeRolesForUser.reduce((sum, role) => sum + (byRole[role] || 0), 0);

            let totalDisplay = '';
            if (partTimeRolesForUser.length > 0 && fullTimeRolesForUser.length === 0) {
                // 纯兼职：显示“本月兼职费用合计（元）”
                totalDisplay = `本月兼职费用合计：¥${partTimeTotalForUser.toLocaleString()} 元`;
            } else if (partTimeRolesForUser.length === 0 && fullTimeRolesForUser.length > 0) {
                // 纯专职：显示KPI分值
                totalDisplay = `总计：${fullTimeTotalForUser.toLocaleString()} 分`;
            } else if (partTimeRolesForUser.length > 0 && fullTimeRolesForUser.length > 0) {
                // 既有专职又有兼职，分行展示
                totalDisplay = `兼职：¥${partTimeTotalForUser.toLocaleString()} 元；专职：${fullTimeTotalForUser.toLocaleString()} 分`;
            } else {
                // 默认回退（无记录）
                totalDisplay = `总计：0 分`;
            }

            const summaryHtml = `
                <div style="margin: 10px 0 16px; padding: 10px 14px; background: #f1f5f9; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                    <div style="font-weight: 600; color: #0f172a;">人员总计</div>
                    <div style="text-align: right;">
                        <div style="font-size: 14px; font-weight: 600; color: #0f766e;">${totalDisplay}</div>
                        <div style="font-size: 12px; color: #64748b;">（兼职岗位按元计算，专职岗位按分计算）</div>
                    </div>
                </div>
            `;

            // 将记录分为专职KPI和兼职费用两类（统一使用employmentType判断）
            const isPartTimeRecord = (record) => {
                // 优先使用employmentType字段
                if (record.employmentType === 'part_time') {
                    return true;
                }
                // 后备方案：通过角色代码判断（兼容历史数据）
                const roleStr = String(record.role || '').trim();
                return roleStr === 'part_time_sales' || 
                       roleStr === 'part_time_translator' ||
                       roleStr.includes('part_time');
            };
            
            const fullTimeRecords = (data.data?.records || []).filter(r => !isPartTimeRecord(r));
            const partTimeRecords = (data.data?.records || []).filter(r => isPartTimeRecord(r));

            const renderRecordsTable = (records, title, isPartTime) => {
                if (!records || records.length === 0) return '';
                const unit = isPartTime ? '元' : '分';
                const prefix = isPartTime ? '¥' : '';
                return `
                    <div style="margin-top: 20px;">
                        <h4 style="margin-bottom: 10px; color: ${isPartTime ? '#0f766e' : '#1e40af'};">
                            ${title} ${isPartTime ? '(按元计算)' : '(按分计算)'}
                        </h4>
                        <table>
                            <thead>
                                <tr>
                                    <th>项目名称</th>
                                    <th>客户名称</th>
                                    ${shouldHideAmount ? '' : '<th>项目金额</th>'}
                                    <th>角色</th>
                                    <th>${isPartTime ? '费用' : 'KPI值'}</th>
                                    <th>计算公式</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${records.map(r => `
                                    <tr>
                                        <td>${r.projectId?.projectName || '-'}</td>
                                        <td>${r.projectId?.clientName || '-'}</td>
                                        ${shouldHideAmount ? '' : `<td>¥${(r.projectId?.projectAmount || 0).toLocaleString()}</td>`}
                                        <td>${getRoleText(r.role)}</td>
                                        <td>${prefix}${(r.kpiValue || 0).toLocaleString()} ${unit}</td>
                                        <td style="font-size: 12px;">${r.calculationDetails?.formula || ''}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            };

            const html = `
                <h3>${user?.name || ''} 的KPI - ${month}</h3>
                ${summaryHtml}
                ${(!data.data?.records || data.data.records.length === 0) && (!data.data?.monthlyRoleKPIs || data.data?.monthlyRoleKPIs.length === 0) ? '<p>该月暂无KPI记录</p>' : `
                    ${renderRecordsTable(partTimeRecords, '兼职费用', true)}
                    ${renderRecordsTable(fullTimeRecords, '专职KPI', false)}
                `}
                ${monthlyRoleKPIHtml}
            `;
            const container = document.getElementById('kpiResults');
            if (container) container.innerHTML = html;
        }
    } catch (error) {
        showToast('加载KPI失败: ' + error.message, 'error');
    }
}

export async function generateMonthlyKPI() {
    const month = document.getElementById('kpiMonth')?.value || new Date().toISOString().slice(0, 7);
    
    if (!month) {
        showToast('请先选择月份', 'error');
        return;
    }
    
    // 询问是否强制更新已存在的记录
    const forceUpdate = confirm(
        `确定要生成 ${month} 的月度KPI吗？\n\n` +
        `点击"确定"：强制更新已存在的记录（适用于修改KPI参数后重新计算）\n` +
        `点击"取消"：跳过已存在的记录（仅生成新记录，不更新已有数据）`
    );
    
    const force = forceUpdate; // 用户点击确定表示强制更新
    
    try {
        const res = await apiFetch('/kpi/generate-monthly', {
            method: 'POST',
            body: JSON.stringify({ month, force })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'KPI生成成功', 'success');
            loadKPI();
        } else {
            showToast(data.message || '生成失败', 'error');
        }
    } catch (error) {
        showToast('生成失败: ' + error.message, 'error');
    }
}

export async function exportKPI() {
    const month = document.getElementById('kpiMonth')?.value || new Date().toISOString().slice(0, 7);
    const userId = document.getElementById('kpiUserSelect')?.value || '';
    
    // 权限检查：只有管理员和财务可以导出所有用户的KPI
    const roles = state.currentUser?.roles || [];
    const isAdminOrFinance = roles.includes('admin') || roles.includes('finance');
    
    let url;
    let filename;
    
    if (userId && isAdminOrFinance) {
        // 管理员/财务导出指定用户的KPI
        url = `/kpi/export/user/${userId}?month=${encodeURIComponent(month)}`;
        filename = `KPI-${month}-${userId}.xlsx`;
    } else if (!userId && isAdminOrFinance) {
        // 管理员/财务导出月度汇总
        url = `/kpi/export/month/${month}`;
        filename = `KPI工资表-${month}.xlsx`;
    } else {
        // 普通用户只能导出自己的KPI
        url = `/kpi/export/user/${state.currentUser?._id}?month=${encodeURIComponent(month)}`;
        filename = `KPI-${month}.xlsx`;
    }
    
    try {
        const res = await apiFetch(url);
        if (!res.ok) {
            const errorData = await res.json();
            showToast(errorData.message || '导出失败', 'error');
            return;
        }
        const blob = await res.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        showToast('导出成功', 'success');
    } catch (error) {
        showToast('导出失败: ' + error.message, 'error');
    }
}

export function showEvaluateModal(recordId, role, currentLevel) {
    const content = `
        <form id="evaluateForm" data-submit="submitEvaluation(event, '${recordId}')">
            <div class="form-group">
                <label>评价等级</label>
                <select name="evaluationLevel">
                    <option value="good" ${currentLevel === 'good' ? 'selected' : ''}>好 (1.1)</option>
                    <option value="medium" ${!currentLevel || currentLevel === 'medium' ? 'selected' : ''}>中 (1.0)</option>
                    <option value="poor" ${currentLevel === 'poor' ? 'selected' : ''}>差 (0.8)</option>
                </select>
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea name="comment" rows="3" placeholder="可选"></textarea>
            </div>
            <div class="action-buttons">
                <button type="submit">提交</button>
                <button type="button" class="btn-secondary" data-click="closeModal()">取消</button>
            </div>
        </form>
    `;
    showModal({ title: `评价 - ${getRoleText(role)}`, body: content });
}

export async function submitEvaluation(e, recordId) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
        evaluationLevel: formData.get('evaluationLevel') || 'medium',
        comment: formData.get('comment') || ''
    };
    try {
        const res = await apiFetch(`/kpi/evaluate/${recordId}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            showToast('评价已提交', 'success');
            loadKPI();
        } else {
            showToast(data.message || '提交失败', 'error');
        }
    } catch (error) {
        showToast('提交失败: ' + error.message, 'error');
    }
}

// 挂载
// KPI module placeholder



