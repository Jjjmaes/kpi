# 报价单模板创建指南

## 模板文件位置

报价单模板文件应放置在 `templates/quotation-template.docx`

## 快速开始

1. 使用 Microsoft Word 创建一个新的 `.docx` 文档
2. 按照你的报价单格式要求编写内容
3. 在需要插入动态数据的位置，使用 `{变量名}` 语法
4. 保存文件为 `quotation-template.docx` 并放置在 `templates/` 目录下

## 可用变量列表

### 基本信息
- `{projectNumber}` - 项目编号
- `{projectName}` - 项目名称
- `{sourceLanguage}` - 源语种
- `{targetLanguagesText}` - 目标语种（多个用"、"分隔）

### 客户信息（甲方）
- `{customerName}` - 客户名称
- `{customerShortName}` - 客户简称
- `{customerAddress}` - 客户地址
- `{contactName}` - 联系人姓名
- `{contactPhone}` - 联系电话
- `{contactEmail}` - 联系邮箱

### 乙方信息
- `{companyName}` - 公司名称
- `{companyAddress}` - 公司地址
- `{companyPhone}` - 公司电话
- `{companyEmail}` - 公司邮箱
- `{creatorName}` - 项目创建者姓名
- `{creatorEmail}` - 项目创建者邮箱
- `{creatorPhone}` - 项目创建者电话

### 业务信息
- `{businessTypeText}` - 业务类型（笔译/口译等）
- `{projectTypeText}` - 项目类型（MTPE/深度编辑等）

### 费用信息
- `{unitPriceText}` - 单价（格式：¥XX.XX / 千字）
- `{wordCountText}` - 总字数（格式：XX,XXX 字）
- `{amountText}` - 总金额（格式：¥XX.XX）
- `{taxIncludedText}` - 是否含税（含税/不含税）
- `{needInvoiceText}` - 是否需要发票（是/否）

### 时间信息
- `{deadlineText}` - 交付截止日期（格式：YYYY-MM-DD）
- `{payDueDateText}` - 付款到期日期（格式：YYYY-MM-DD）

### 特殊要求
- `{terminologyText}` - 术语表要求（是/否）
- `{referenceFilesText}` - 参考文件（是/否）
- `{bilingualDeliveryText}` - 双语交付（是/否）
- `{pureTranslationDeliveryText}` - 纯翻译交付（是/否）
- `{printSealExpressText}` - 打印盖章快递（是/否）
- `{notesText}` - 备注说明

### 报价明细（循环）

**条件判断：**
- `{hasDetails}` - 是否有明细（布尔值，用于条件判断）

**循环变量：**
- `{#each quotationDetails}` - 循环报价明细
  - `{index}` - 序号
  - `{filename}` - 文件名
  - `{sourceLanguage}` - 源语种
  - `{targetLanguage}` - 目标语种
  - `{wordCount}` - 字数（数字）
  - `{wordCountText}` - 字数（格式化，带千分位）
  - `{unitPrice}` - 单价（格式：XX.XX）
  - `{amount}` - 金额（数字）
  - `{amountText}` - 金额（格式化，¥XX.XX）
- `{/each}` - 结束循环

### 汇总信息
- `{totalWordCount}` - 总字数（格式化，带千分位）
- `{totalAmount}` - 总金额（数字，格式：XX.XX）
- `{totalAmountText}` - 总金额（格式化，¥XX.XX）

## 模板示例

### 完整模板结构

```
项目报价单

项目编号：{projectNumber}
项目名称：{projectName}

---

甲方信息：
客户名称：{customerName}
客户简称：{customerShortName}
联系人：{contactName}
联系电话：{contactPhone}
联系邮箱：{contactEmail}
地址：{customerAddress}

---

乙方信息：
公司名称：{companyName}
地址：{companyAddress}
电话：{companyPhone}
邮箱：{companyEmail}
联系人：{creatorName}
联系人邮箱：{creatorEmail}

---

项目信息：
业务类型：{businessTypeText}
项目类型：{projectTypeText}
源语种：{sourceLanguage}
目标语种：{targetLanguagesText}
单价：{unitPriceText}
总字数：{wordCountText}
总金额：{amountText}
是否含税：{taxIncludedText}
需要发票：{needInvoiceText}
交付时间：{deadlineText}
付款日期：{payDueDateText}

---

报价明细：

{#if hasDetails}
| 序号 | 文件名 | 源语种 | 目标语种 | 字数 | 单价（元/千字） | 金额（元） |
|------|--------|--------|----------|------|----------------|------------|
{#each quotationDetails}
| {index} | {filename} | {sourceLanguage} | {targetLanguage} | {wordCountText} | {unitPrice} | {amountText} |
{/each}

合计：
总字数：{totalWordCount} 字
总金额：{totalAmountText}
{/if}

---

特殊要求：
术语表支持：{terminologyText}
参考文件：{referenceFilesText}
对照版交付：{bilingualDeliveryText}
仅交付译文：{pureTranslationDeliveryText}
打印盖章并快递：{printSealExpressText}
备注：{notesText}
```

## 明细计算逻辑说明

系统会根据项目的实际情况自动生成明细：

1. **多个文件 + 单个语种**：按文件数量平均分配字数
2. **单个文件 + 多个语种**：按语种数量平均分配字数
3. **多个文件 + 多个语种**：生成文件×语种的组合明细
4. **单个文件 + 单个语种**：显示单行明细

## 注意事项

1. **变量语法**：使用 `{变量名}` 格式，注意花括号必须是英文半角
2. **条件判断**：使用 `{#if 变量}内容{/if}` 格式
3. **循环**：使用 `{#each 数组}内容{/each}` 格式
4. **文件位置**：模板文件必须命名为 `quotation-template.docx` 并放在 `templates/` 目录
5. **格式保持**：Word 中的格式（字体、字号、颜色、对齐等）会被保留
6. **明细表格**：建议使用 Word 的表格功能创建明细表格，确保格式美观

## 常见问题

**Q: 明细表格如何创建？**
A: 在 Word 中插入表格，第一行作为表头，第二行使用循环变量，例如：
```
| 序号 | 文件名 | ... |
| {#each quotationDetails} |
| {index} | {filename} | ... |
| {/each} |
```

**Q: 如果没有明细怎么办？**
A: 使用 `{#if hasDetails}...{/if}` 包裹明细部分，如果没有明细则不会显示。

**Q: 如何显示汇总信息？**
A: 在明细表格下方使用 `{totalWordCount}` 和 `{totalAmountText}` 变量。





