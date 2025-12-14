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
        return response;
    } catch (error) {
        console.error('API Request Failed:', error);
        showToast('网络请求失败', 'error');
        throw error;
    }
}

