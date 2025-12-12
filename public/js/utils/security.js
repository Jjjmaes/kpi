/**
 * 安全工具函数
 */

/**
 * HTML 转义函数，防止 XSS 攻击
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  if (text == null || text === undefined) {
    return '';
  }
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 转义 HTML 属性值
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtmlAttribute(text) {
  if (text == null || text === undefined) {
    return '';
  }
  
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * 安全地设置元素的文本内容（自动转义）
 * @param {HTMLElement} element - DOM 元素
 * @param {string} text - 要设置的文本
 */
function setTextContent(element, text) {
  if (element && element.textContent !== undefined) {
    element.textContent = text;
  }
}

/**
 * 安全地设置元素的 HTML 内容（需要手动转义）
 * @param {HTMLElement} element - DOM 元素
 * @param {string} html - 要设置的 HTML（已转义）
 */
function setInnerHTML(element, html) {
  if (element && element.innerHTML !== undefined) {
    element.innerHTML = html;
  }
}

// 导出函数（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
    escapeHtmlAttribute,
    setTextContent,
    setInnerHTML
  };
}

