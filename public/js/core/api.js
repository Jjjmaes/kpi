import { API_BASE } from './config.js';
import { state, setToken } from './state.js';
import { showToast } from './utils.js';

export async function apiFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    if (state.currentRole) headers['X-Role'] = state.currentRole;

    try {
        const response = await fetch(url, { ...options, headers });

        // 处理 token 过期
        if (response.status === 401) {
            // 如果是在登录页面或正在登录流程中，不显示警告（可能是正常的未认证状态）
            const isLoginPage = document.getElementById('loginSection')?.style.display !== 'none';
            const isLoginEndpoint = endpoint.includes('/auth/login');
            const isMeEndpoint = endpoint.includes('/auth/me');
            
            // 只有在非登录相关请求且不在登录页面时才显示警告并重定向
            if (!isLoginPage && !isLoginEndpoint && !isMeEndpoint) {
                console.warn('Token expired or unauthorized');
                setToken(null);
                window.location.reload();
            }
            return response;
        }

        // 处理请求体过大错误（413）
        if (response.status === 413) {
            const error = new Error('请求数据过大，请减少附件文件大小或数量。如果问题持续，请联系管理员检查服务器配置。');
            error.status = 413;
            throw error;
        }

        return response;
    } catch (error) {
        // 如果是我们抛出的 413 错误，直接抛出
        if (error.status === 413) {
            throw error;
        }
        console.error('API Request Failed:', error);
        showToast('网络请求失败', 'error');
        throw error;
    }
}

