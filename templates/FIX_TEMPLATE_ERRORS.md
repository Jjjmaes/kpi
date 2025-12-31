# 修复模板标签错误

## 问题诊断

根据错误信息，所有 `{#if}` 标签的闭合标签不匹配。错误信息显示：
```
Closing tag does not match opening tag
The tag "if isInterpretation" is closed by the tag "if"
```

## 原因

在 Word 模板中，`{#if}` 标签的语法可能不正确。docxtemplater 要求：
- 开始标签：`{#if variable}`
- 结束标签：`{/if}`（注意：**不需要**变量名）

## 正确的语法

### ✅ 正确写法

```docx
{#if isTranslation}☑{/if} 笔译    {#if isInterpretation}☑{/if} 口译
```

或者分行写：

```docx
{#if isTranslation}
☑
{/if} 笔译

{#if isInterpretation}
☑
{/if} 口译
```

### ❌ 错误写法

```docx
{#if isTranslation}☑{#/if} 笔译          <!-- 错误：使用了 {#/if} -->
{#if isTranslation}☑{/if isTranslation}  <!-- 错误：闭合标签包含变量名 -->
{#if isTranslation}☑{/if isTranslation}   <!-- 错误：闭合标签包含变量名 -->
```

## 修复步骤

1. **打开模板文件** `templates/contract-template.docx`

2. **查找所有 `{#if` 标签**，确保对应的闭合标签是 `{/if}`（不带变量名）

3. **检查以下位置**：
   - `{#if isTranslation}` ... `{/if}`
   - `{#if isInterpretation}` ... `{/if}`
   - `{#if hasElectronic}` ... `{/if}`
   - `{#if hasEmail}` ... `{/if}`
   - `{#if hasFax}` ... `{/if}`
   - `{#if hasPrint}` ... `{/if}`

4. **确保每个 `{#if variable}` 都有对应的 `{/if}`**

## 完整示例

### 翻译类型部分

```docx
2. 翻译类型：
   {#if isInterpretation}☑{/if} 口译    {#if isTranslation}☑{/if} 笔译
```

### 交付方式部分

```docx
1. 交付方式（可多选）：
   {#if hasElectronic}☑{/if} 电子版    
   {#if hasEmail}☑{/if} 电子邮件    
   {#if hasFax}☑{/if} 传真    
   {#if hasPrint}☑{/if} 打印稿
```

## 重要提示

1. **闭合标签格式**：`{/if}` 是固定的，**不要**写成 `{/if variable}` 或 `{#/if}`
2. **标签配对**：每个 `{#if}` 必须有且仅有一个 `{/if}` 对应
3. **标签位置**：开始和结束标签必须在同一个段落或相邻位置
4. **空格处理**：标签前后的空格会被保留，注意格式

## 验证方法

修复后，重新测试导出功能。如果还有错误，检查：
1. 是否所有 `{#if}` 都有对应的 `{/if}`
2. 闭合标签是否写成了 `{/if}`（不是 `{#/if}` 或 `{/if variable}`）
3. 标签是否在正确的段落中





