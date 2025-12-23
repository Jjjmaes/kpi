import { apiFetch } from '../core/api.js';
import { showModal, closeModal } from '../core/ui.js';
import { showToast, showAlert } from '../core/utils.js';
import { state } from '../core/state.js';

/**
 * 评价模块
 * 处理项目成员之间的相互评价
 */

/**
 * 显示评价表单
 * @param {String} projectId - 项目ID
 * @param {String} evaluationType - 评价类型 (pm_to_sales | executor_to_pm)
 * @param {String} evaluatedUserId - 被评价人ID
 * @param {String} evaluatedRole - 被评价人角色
 * @param {String} evaluatedName - 被评价人姓名
 */
export async function showEvaluationModal(projectId, evaluationType, evaluatedUserId, evaluatedRole, evaluatedName) {
    try {
        // 先检查评价资格
        const checkRes = await apiFetch(`/evaluations/check/${projectId}?evaluationType=${evaluationType}`);
        const checkData = await checkRes.json();

        if (!checkData.success) {
            showToast(checkData.message || '无法评价', 'error');
            return;
        }

        const isPmToSales = evaluationType === 'pm_to_sales';
        const scoreLabels = isPmToSales ? {
            informationCompleteness: '信息完整性',
            communicationQuality: '沟通质量',
            problemSolving: '问题解决',
            overallSatisfaction: '整体满意度'
        } : {
            projectManagement: '项目管理',
            communicationQuality: '沟通协调',
            technicalSupport: '技术支持',
            overallSatisfaction: '整体满意度'
        };

        const content = `
            <form id="evaluationForm" data-submit="submitProjectEvaluation(event, '${projectId}', '${evaluationType}', '${evaluatedUserId}')">
                <div style="margin-bottom: 20px; padding: 15px; background: #f0f9ff; border-radius: 6px; border-left: 4px solid #3b82f6;">
                    <div style="font-weight: 600; color: #1e40af; margin-bottom: 8px;">评价对象</div>
                    <div style="color: #1e3a8a;">
                        <strong>${evaluatedName}</strong> (${evaluatedRole === 'sales' || evaluatedRole === 'part_time_sales' ? '销售' : '项目经理'})
                    </div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
                        项目：${checkData.data.project.name}
                    </div>
                </div>

                <div class="form-group">
                    <label style="font-weight: 600; margin-bottom: 15px; display: block;">评分（1-5分，5分为最高）</label>
                    ${Object.entries(scoreLabels).map(([key, label]) => `
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-size: 14px;">${label} *</label>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                ${[1, 2, 3, 4, 5].map(score => `
                                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 8px 12px; border: 2px solid #e5e7eb; border-radius: 6px; transition: all 0.2s;" 
                                           onmouseover="this.style.borderColor='#3b82f6'; this.style.backgroundColor='#eff6ff';" 
                                           onmouseout="this.style.borderColor='#e5e7eb'; this.style.backgroundColor='transparent';">
                                        <input type="radio" name="scores.${key}" value="${score}" required style="cursor: pointer;">
                                        <span style="font-size: 18px;">${'⭐'.repeat(score)}</span>
                                        <span style="font-size: 14px; color: #6b7280;">${score}分</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="form-group">
                    <label>评语（可选）</label>
                    <textarea name="comments" rows="4" placeholder="请输入您的评价意见..." maxlength="500" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; resize: vertical;"></textarea>
                    <small style="color: #666; font-size: 12px;">最多500字</small>
                </div>

                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: normal;">
                        <input type="checkbox" name="isAnonymous" checked style="cursor: pointer;">
                        <span>匿名评价（默认勾选，评价人信息将被隐藏）</span>
                    </label>
                </div>

                <div style="margin-top: 20px; padding: 12px; background: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b;">
                    <div style="font-size: 12px; color: #92400e;">
                        <strong>提示：</strong>评价提交后不可修改，请谨慎填写。评价仅用于团队改进和反馈，不影响KPI计算。
                    </div>
                </div>

                <div class="action-buttons" style="margin-top: 20px;">
                    <button type="submit" style="background: #3b82f6; color: white;">提交评价</button>
                    <button type="button" class="btn-secondary" data-click="closeModal()">取消</button>
                </div>
            </form>
        `;

        showModal({ title: '项目评价', body: content });
    } catch (error) {
        console.error('显示评价表单失败:', error);
        showToast('加载评价表单失败: ' + (error.message || '网络错误'), 'error');
    }
}

/**
 * 提交项目评价
 */
export async function submitProjectEvaluation(e, projectId, evaluationType, evaluatedUserId) {
    e.preventDefault();
    const formData = new FormData(e.target);

    // 收集评分
    const scores = {};
    const isPmToSales = evaluationType === 'pm_to_sales';
    const scoreKeys = isPmToSales 
        ? ['informationCompleteness', 'communicationQuality', 'problemSolving', 'overallSatisfaction']
        : ['projectManagement', 'communicationQuality', 'technicalSupport', 'overallSatisfaction'];

    for (const key of scoreKeys) {
        const value = formData.get(`scores.${key}`);
        if (!value) {
            showToast(`请选择${key}的评分`, 'error');
            return;
        }
        scores[key] = parseInt(value);
    }

    const payload = {
        projectId,
        evaluatedUserId,
        evaluationType,
        scores,
        comments: formData.get('comments') || undefined,
        isAnonymous: formData.get('isAnonymous') === 'on'
    };

    try {
        const res = await apiFetch('/evaluations', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            closeModal();
            showToast('评价提交成功', 'success');
            // 刷新项目详情或评价列表
            if (window.viewProject) {
                window.viewProject(projectId);
            }
        } else {
            showToast(result.message || '评价提交失败', 'error');
        }
    } catch (error) {
        console.error('提交评价失败:', error);
        showToast('提交评价失败: ' + (error.message || '网络错误'), 'error');
    }
}

/**
 * 获取项目的评价列表
 */
export async function loadProjectEvaluations(projectId) {
    try {
        const res = await apiFetch(`/evaluations/project/${projectId}`);
        const result = await res.json();

        if (result.success) {
            return result.data;
        }
        return [];
    } catch (error) {
        console.error('加载评价列表失败:', error);
        return [];
    }
}

/**
 * 显示项目评价列表
 */
export async function showProjectEvaluationsList(projectId) {
    try {
        const evaluations = await loadProjectEvaluations(projectId);

        if (evaluations.length === 0) {
            showModal({ 
                title: '项目评价', 
                body: '<p style="text-align: center; color: #666; padding: 20px;">暂无评价记录</p>' 
            });
            return;
        }

        const content = `
            <div style="max-height: 500px; overflow-y: auto;">
                ${evaluations.map(evaluation => {
                    const evaluatorName = evaluation.isAnonymous ? '匿名' : (evaluation.evaluatorId?.name || '未知');
                    const evaluatedName = evaluation.evaluatedUserId?.name || '未知';
                    const evalTypeText = evaluation.evaluationType === 'pm_to_sales' ? 'PM评价销售' : '执行人员评价PM';
                    const scores = evaluation.scores || {};
                    
                    return `
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: #f9fafb;">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                                <div>
                                    <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${evalTypeText}</div>
                                    <div style="font-size: 12px; color: #6b7280;">
                                        评价人：${evaluatorName} | 被评价人：${evaluatedName}
                                    </div>
                                </div>
                                <div style="font-size: 12px; color: #9ca3af;">
                                    ${new Date(evaluation.evaluatedAt).toLocaleString('zh-CN')}
                                </div>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px;">
                                ${Object.entries(scores).map(([key, value]) => {
                                    const labels = {
                                        informationCompleteness: '信息完整性',
                                        projectManagement: '项目管理',
                                        communicationQuality: '沟通质量',
                                        problemSolving: '问题解决',
                                        technicalSupport: '技术支持',
                                        overallSatisfaction: '整体满意度'
                                    };
                                    return `
                                        <div style="padding: 8px; background: white; border-radius: 4px;">
                                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">${labels[key] || key}</div>
                                            <div style="font-size: 18px; font-weight: 600; color: #3b82f6;">
                                                ${'⭐'.repeat(value)} ${value}/5
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            
                            ${evaluation.comments ? `
                                <div style="padding: 10px; background: white; border-radius: 4px; margin-top: 10px;">
                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 6px;">评语：</div>
                                    <div style="color: #374151; line-height: 1.6;">${evaluation.comments}</div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        showModal({ title: '项目评价列表', body: content });
    } catch (error) {
        console.error('显示评价列表失败:', error);
        showToast('加载评价列表失败: ' + (error.message || '网络错误'), 'error');
    }
}

/**
 * 检查并显示待评价提示
 */
export async function checkPendingEvaluations() {
    try {
        const res = await apiFetch('/evaluations/pending');
        const result = await res.json();

        if (result.success && result.data && result.data.length > 0) {
            const count = result.data.length;
            // 可以在这里显示通知或提示
            console.log(`[Evaluation] 您有 ${count} 个待评价项目`);
            return result.data;
        }
        return [];
    } catch (error) {
        console.error('检查待评价失败:', error);
        return [];
    }
}

/**
 * 显示用户评价统计
 * @param {String} userId - 用户ID（可选，默认当前用户）
 */
export async function showEvaluationStats(userId) {
    try {
        // 如果没有传入userId，尝试从currentUser获取
        let targetUserId = userId;
        if (!targetUserId) {
            // 尝试多种可能的字段名（后端可能返回 id 或 _id）
            targetUserId = state.currentUser?.id || state.currentUser?._id;
            
            // 如果还是没有，尝试重新获取用户信息
            if (!targetUserId) {
                try {
                    const meRes = await apiFetch('/auth/me');
                    const meData = await meRes.json();
                    if (meData.success && meData.user) {
                        targetUserId = meData.user.id || meData.user._id;
                        // 更新state中的用户信息
                        if (meData.user && !state.currentUser) {
                            state.currentUser = meData.user;
                        }
                    }
                } catch (e) {
                    console.error('获取用户信息失败:', e);
                }
            }
        }
        
        if (!targetUserId) {
            showToast('无法获取用户ID，请重新登录', 'error');
            return;
        }
        
        // 确保targetUserId是字符串
        targetUserId = String(targetUserId);

        const res = await apiFetch(`/evaluations/user/${targetUserId}/stats`);
        const result = await res.json();

        if (!result.success) {
            showToast(result.message || '加载评价统计失败', 'error');
            return;
        }

        const stats = result.data;
        const isSelf = !userId || userId === state.currentUser?._id;
        const userName = isSelf ? '我' : (state.allUsers?.find(u => u._id === userId)?.name || '用户');

        // 构建统计内容
        const content = `
            <div style="max-width: 900px;">
                <div style="margin-bottom: 30px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; color: white;">
                    <h3 style="margin: 0 0 10px 0; font-size: 24px;">${userName}的评价统计</h3>
                    <div style="display: flex; gap: 30px; flex-wrap: wrap; margin-top: 15px;">
                        <div>
                            <div style="font-size: 14px; opacity: 0.9;">总评价数</div>
                            <div style="font-size: 32px; font-weight: bold; margin-top: 5px;">${stats.totalCount}</div>
                        </div>
                        <div>
                            <div style="font-size: 14px; opacity: 0.9;">PM评价销售</div>
                            <div style="font-size: 32px; font-weight: bold; margin-top: 5px;">${stats.pmToSalesCount}</div>
                        </div>
                        <div>
                            <div style="font-size: 14px; opacity: 0.9;">执行人员评价PM</div>
                            <div style="font-size: 32px; font-weight: bold; margin-top: 5px;">${stats.executorToPmCount}</div>
                        </div>
                    </div>
                </div>

                ${stats.totalCount > 0 ? `
                    <div style="margin-bottom: 30px;">
                        <h4 style="margin-bottom: 20px; color: #1f2937; font-size: 18px;">平均评分</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                            ${Object.entries(stats.averages).map(([key, value]) => {
                                if (value === null || value === undefined) return '';
                                const labels = {
                                    informationCompleteness: '信息完整性',
                                    projectManagement: '项目管理',
                                    communicationQuality: '沟通质量',
                                    problemSolving: '问题解决',
                                    technicalSupport: '技术支持',
                                    overallSatisfaction: '整体满意度'
                                };
                                const percentage = (value / 5) * 100;
                                return `
                                    <div style="padding: 15px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                                        <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">${labels[key] || key}</div>
                                        <div style="display: flex; align-items: center; gap: 10px;">
                                            <div style="flex: 1; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                                                <div style="height: 100%; width: ${percentage}%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); transition: width 0.3s;"></div>
                                            </div>
                                            <div style="font-size: 18px; font-weight: 600; color: #3b82f6; min-width: 50px; text-align: right;">
                                                ${value.toFixed(2)}/5
                                            </div>
                                        </div>
                                        <div style="margin-top: 8px; font-size: 20px; color: #fbbf24;">
                                            ${'⭐'.repeat(Math.round(value))}${value % 1 >= 0.5 ? '⭐' : ''}
                                        </div>
                                    </div>
                                `;
                            }).filter(Boolean).join('')}
                        </div>
                    </div>

                    ${stats.recentEvaluations && stats.recentEvaluations.length > 0 ? `
                        <div>
                            <h4 style="margin-bottom: 20px; color: #1f2937; font-size: 18px;">最近评价</h4>
                            <div style="max-height: 400px; overflow-y: auto;">
                                ${stats.recentEvaluations.map(evaluation => {
                                    const evalTypeText = evaluation.evaluationType === 'pm_to_sales' ? 'PM评价销售' : '执行人员评价PM';
                                    return `
                                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 12px; background: #f9fafb;">
                                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                                                <div>
                                                    <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${evaluation.projectName || evaluation.projectNumber || '未知项目'}</div>
                                                    <div style="font-size: 12px; color: #6b7280;">${evalTypeText}</div>
                                                </div>
                                                <div style="text-align: right;">
                                                    <div style="font-size: 20px; color: #fbbf24; margin-bottom: 4px;">
                                                        ${'⭐'.repeat(evaluation.overallSatisfaction)}
                                                    </div>
                                                    <div style="font-size: 12px; color: #9ca3af;">
                                                        ${new Date(evaluation.evaluatedAt).toLocaleDateString('zh-CN')}
                                                    </div>
                                                </div>
                                            </div>
                                            ${evaluation.comments ? `
                                                <div style="padding: 10px; background: white; border-radius: 4px; margin-top: 10px;">
                                                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">评语：</div>
                                                    <div style="color: #374151; line-height: 1.6; font-size: 14px;">${evaluation.comments}</div>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
                ` : `
                    <div style="text-align: center; padding: 40px; color: #6b7280;">
                        <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
                        <div style="font-size: 18px; margin-bottom: 10px;">暂无评价记录</div>
                        <div style="font-size: 14px;">完成项目后，其他成员可以对您进行评价</div>
                    </div>
                `}
            </div>
        `;

        showModal({ 
            title: '评价统计', 
            body: content,
            width: '900px'
        });
    } catch (error) {
        console.error('显示评价统计失败:', error);
        showToast('加载评价统计失败: ' + (error.message || '网络错误'), 'error');
    }
}

