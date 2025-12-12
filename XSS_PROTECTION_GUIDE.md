# XSS 防护实施指南

## ✅ 已完成

### 1. 创建安全工具函数
**文件**：`public/js/utils/security.js`

**功能**：
- `escapeHtml(text)` - HTML 转义函数，防止 XSS 攻击
- `escapeHtmlAttribute(text)` - HTML 属性值转义
- `setTextContent(element, text)` - 安全地设置文本内容
- `setInnerHTML(element, html)` - 安全地设置 HTML 内容

### 2. 在 HTML 中引入安全工具
**文件**：`public/index.html`
- 已添加 `<script src="js/utils/security.js"></script>`

## 📋 使用指南

### 基本用法

#### 1. 转义用户输入
```javascript
// ❌ 不安全：直接使用 innerHTML
element.innerHTML = userInput;

// ✅ 安全：使用 escapeHtml
element.innerHTML = escapeHtml(userInput);

// ✅ 更安全：使用 textContent（自动转义）
element.textContent = userInput;
```

#### 2. 设置 HTML 属性
```javascript
// ❌ 不安全
element.setAttribute('title', userInput);

// ✅ 安全
element.setAttribute('title', escapeHtmlAttribute(userInput));
```

#### 3. 构建 HTML 字符串
```javascript
// ❌ 不安全
const html = `<div>${userInput}</div>`;
element.innerHTML = html;

// ✅ 安全
const html = `<div>${escapeHtml(userInput)}</div>`;
element.innerHTML = html;
```

### 需要更新的位置

以下位置需要逐步更新以使用安全函数：

#### `public/app.js`

1. **第 474 行** - 通知列表
   ```javascript
   // 当前
   listEl.innerHTML = '<div class="notification-empty">暂无通知</div>';
   
   // 建议：使用 textContent 或 escapeHtml
   listEl.innerHTML = '<div class="notification-empty">暂无通知</div>'; // 静态内容，安全
   ```

2. **第 477 行** - 清空通知列表
   ```javascript
   // 当前
   listEl.innerHTML = '';
   
   // 建议：保持不变（清空操作安全）
   ```

3. **第 818 行** - 提示信息
   ```javascript
   // 需要检查 userInput 是否包含用户数据
   // 如果包含，使用 escapeHtml
   ```

4. **第 839 行** - 提示 HTML
   ```javascript
   // 需要检查 hintHtml 的来源
   // 如果包含用户输入，使用 escapeHtml
   ```

5. **第 947 行** - 角色切换器
   ```javascript
   // 需要检查是否包含用户数据
   ```

6. **第 1288 行** - 语言列表
   ```javascript
   // 需要检查是否包含用户输入
   ```

7. **第 1421 行** - 模态框内容
   ```javascript
   // 需要检查 content 的来源
   // 如果包含用户输入，使用 escapeHtml
   ```

8. **第 1470 行** - 用户列表
   ```javascript
   // 需要检查 html 是否包含用户数据
   // 如果包含，使用 escapeHtml
   ```

9. **第 1487 行** - 选择框
   ```javascript
   // 需要检查是否包含用户输入
   ```

## 🔍 检查清单

### 需要检查的模式

1. **直接使用 innerHTML**
   ```javascript
   element.innerHTML = variable;
   ```
   → 如果 `variable` 包含用户输入，需要使用 `escapeHtml()`

2. **模板字符串构建 HTML**
   ```javascript
   element.innerHTML = `<div>${userInput}</div>`;
   ```
   → 需要使用 `escapeHtml(userInput)`

3. **setAttribute 设置用户数据**
   ```javascript
   element.setAttribute('title', userInput);
   ```
   → 需要使用 `escapeHtmlAttribute(userInput)`

### 安全的位置

以下情况通常是安全的（不需要转义）：

1. **静态 HTML**
   ```javascript
   element.innerHTML = '<div>静态内容</div>';
   ```

2. **使用 textContent**
   ```javascript
   element.textContent = userInput; // 自动转义
   ```

3. **数字或布尔值**
   ```javascript
   element.innerHTML = `<div>${number}</div>`;
   ```

## 📝 实施建议

### 优先级 1：高风险位置
- 显示用户输入的地方（用户名、项目名称、客户名称等）
- 从 API 获取并直接显示的数据

### 优先级 2：中风险位置
- 动态构建的 HTML 内容
- 包含变量的模板字符串

### 优先级 3：低风险位置
- 静态 HTML 内容
- 纯数字或布尔值

## ⚠️ 注意事项

1. **不要过度转义**：已经转义的内容不要再次转义
2. **保留 HTML 格式**：如果需要保留 HTML 格式（如富文本），考虑使用 DOMPurify
3. **性能考虑**：转义操作有性能开销，但安全性更重要
4. **测试**：更新后测试所有用户输入场景

## 🔄 后续优化

1. **使用 DOMPurify**：对于需要保留 HTML 的场景，考虑使用 DOMPurify 库
2. **CSP 策略**：添加内容安全策略（Content Security Policy）
3. **输入验证**：在服务端也进行输入验证和清理

---

**状态**：✅ 安全工具已创建并引入
**下一步**：逐步更新 `app.js` 中的高风险位置

