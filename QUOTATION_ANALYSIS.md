# 报价单多文件、多目标语种明细报价实现方案

## 当前状态分析

### 现有数据结构

1. **项目模型（Project）**：
   - `targetLanguages`: 数组，支持多个目标语种
   - `projectFiles`: 数组，支持多个文件
   - `wordCount`: 单个数字，总字数
   - `unitPrice`: 单个数字，单价
   - `projectAmount`: 单个数字，总金额

2. **当前报价单**：
   - 使用 ExcelJS 生成 Excel 文件
   - 显示汇总信息（总字数、总金额）
   - 不显示明细（每个文件、每个语种）

## 需求分析

### 目标功能

1. **多文件明细**：每个文件单独一行，显示文件名、字数、单价、金额
2. **多目标语种明细**：每个语种单独一行，或文件×语种组合
3. **使用 docxtemplater**：改用 Word 模板，便于格式调整

### 数据结构设计

#### 方案一：基于现有数据计算（推荐）

**优点**：
- 不需要修改数据库结构
- 向后兼容
- 实现简单

**缺点**：
- 无法精确记录每个文件/语种的实际字数
- 需要按比例分配

**实现方式**：
```javascript
// 假设有 3 个文件，2 个目标语种
// 总字数：10000 字
// 平均分配：每个文件 3333 字，每个语种 5000 字
// 或按文件数量/语种数量分配
```

#### 方案二：新增明细字段（更精确）

**优点**：
- 可以精确记录每个文件、每个语种的字数和金额
- 支持不同的单价（不同语种、不同文件类型可能有不同单价）

**缺点**：
- 需要修改数据库结构
- 需要迁移历史数据
- 前端需要修改录入界面

**数据结构**：
```javascript
// 在 Project 模型中新增
quotationDetails: [{
  filename: String,              // 文件名
  sourceLanguage: String,       // 源语种
  targetLanguage: String,       // 目标语种
  wordCount: Number,             // 字数
  unitPrice: Number,             // 单价（每千字）
  amount: Number,                // 金额
  fileType: String,              // 文件类型（可选）
  notes: String                  // 备注（可选）
}]
```

## 推荐实现方案

### 阶段一：基于现有数据（快速实现）

1. **使用 docxtemplater 生成 Word 报价单**
2. **明细计算逻辑**：
   - 如果有 `projectFiles`，按文件数量平均分配字数
   - 如果有多个 `targetLanguages`，按语种数量平均分配字数
   - 如果既有多个文件又有多个语种，生成文件×语种的组合明细

3. **模板变量设计**：
```javascript
{
  // 基本信息（同合同）
  projectNumber, projectName, customerName, ...
  
  // 明细列表
  quotationDetails: [
    {
      filename: "文件1.docx",
      sourceLanguage: "英文",
      targetLanguage: "中文",
      wordCount: 3333,
      unitPrice: 100,
      amount: 333.30
    },
    {
      filename: "文件1.docx",
      sourceLanguage: "英文",
      targetLanguage: "日文",
      wordCount: 3333,
      unitPrice: 120,
      amount: 399.96
    },
    // ...
  ],
  
  // 汇总信息
  totalWordCount: 10000,
  totalAmount: 10000.00
}
```

### 阶段二：精确明细（后续优化）

1. **新增数据库字段**：`quotationDetails`
2. **修改前端界面**：允许用户录入每个文件、每个语种的明细
3. **使用精确数据**：直接使用录入的明细数据

## 实现步骤

### 第一步：改用 docxtemplater

1. 创建报价单模板文件：`templates/quotation-template.docx`
2. 创建报价单服务：`services/quotationService.js`
3. 修改路由：使用新服务生成 Word 文件

### 第二步：实现明细计算

1. 在 `quotationService.js` 中实现明细计算逻辑
2. 根据 `projectFiles` 和 `targetLanguages` 生成明细数组
3. 计算每个明细项的字数和金额

### 第三步：模板设计

1. 基本信息部分（同合同）
2. 明细表格部分（使用 `{#each quotationDetails}` 循环）
3. 汇总部分（总计金额、总字数等）

## 明细计算逻辑示例

```javascript
function buildQuotationDetails(project) {
  const files = project.projectFiles || [];
  const targetLanguages = project.targetLanguages || [];
  const totalWordCount = project.wordCount || 0;
  const unitPrice = project.unitPrice || 0;
  
  const details = [];
  
  // 情况1：有多个文件，单个语种
  if (files.length > 1 && targetLanguages.length === 1) {
    const wordCountPerFile = Math.floor(totalWordCount / files.length);
    files.forEach((file, index) => {
      const isLast = index === files.length - 1;
      const wordCount = isLast 
        ? totalWordCount - (wordCountPerFile * (files.length - 1))
        : wordCountPerFile;
      const amount = (wordCount / 1000) * unitPrice;
      
      details.push({
        filename: file.filename || `文件${index + 1}`,
        sourceLanguage: project.sourceLanguage,
        targetLanguage: targetLanguages[0],
        wordCount,
        unitPrice,
        amount: Math.round(amount * 100) / 100
      });
    });
  }
  // 情况2：单个文件，多个语种
  else if (files.length === 1 && targetLanguages.length > 1) {
    const wordCountPerLanguage = Math.floor(totalWordCount / targetLanguages.length);
    targetLanguages.forEach((lang, index) => {
      const isLast = index === targetLanguages.length - 1;
      const wordCount = isLast 
        ? totalWordCount - (wordCountPerLanguage * (targetLanguages.length - 1))
        : wordCountPerLanguage;
      const amount = (wordCount / 1000) * unitPrice;
      
      details.push({
        filename: files[0].filename || '项目文件',
        sourceLanguage: project.sourceLanguage,
        targetLanguage: lang,
        wordCount,
        unitPrice,
        amount: Math.round(amount * 100) / 100
      });
    });
  }
  // 情况3：多个文件，多个语种（组合）
  else if (files.length > 1 && targetLanguages.length > 1) {
    const wordCountPerItem = Math.floor(totalWordCount / (files.length * targetLanguages.length));
    files.forEach((file, fileIndex) => {
      targetLanguages.forEach((lang, langIndex) => {
        const isLast = fileIndex === files.length - 1 && langIndex === targetLanguages.length - 1;
        const wordCount = isLast 
          ? totalWordCount - (wordCountPerItem * (files.length * targetLanguages.length - 1))
          : wordCountPerItem;
        const amount = (wordCount / 1000) * unitPrice;
        
        details.push({
          filename: file.filename || `文件${fileIndex + 1}`,
          sourceLanguage: project.sourceLanguage,
          targetLanguage: lang,
          wordCount,
          unitPrice,
          amount: Math.round(amount * 100) / 100
        });
      });
    });
  }
  // 情况4：单个文件，单个语种（默认情况）
  else {
    details.push({
      filename: files[0]?.filename || '项目文件',
      sourceLanguage: project.sourceLanguage,
      targetLanguage: targetLanguages[0] || '—',
      wordCount: totalWordCount,
      unitPrice,
      amount: (totalWordCount / 1000) * unitPrice
    });
  }
  
  return details;
}
```

## 模板示例

### Word 模板结构

```
项目报价单

项目编号：{projectNumber}
项目名称：{projectName}

甲方信息：
客户名称：{customerName}
...

乙方信息：
公司名称：{companyName}
...

报价明细：

| 序号 | 文件名 | 源语种 | 目标语种 | 字数 | 单价（元/千字） | 金额（元） |
|------|--------|--------|----------|------|----------------|------------|
{#each quotationDetails}
| {#} | {filename} | {sourceLanguage} | {targetLanguage} | {wordCount} | {unitPrice} | {amount} |
{/each}

合计：
总字数：{totalWordCount} 字
总金额：¥{totalAmount}
```

## 注意事项

1. **数据精度**：按比例分配时，最后一个项目需要补齐，确保总字数准确
2. **单价处理**：不同语种可能有不同单价，需要扩展数据结构
3. **向后兼容**：保持原有 Excel 导出功能，新增 Word 导出
4. **模板维护**：Word 模板便于业务人员调整格式

## 后续优化方向

1. **精确录入**：允许用户在创建项目时录入每个文件、每个语种的明细
2. **单价差异化**：支持不同语种、不同文件类型使用不同单价
3. **批量导入**：支持从 Excel 导入明细数据
4. **历史版本**：保存报价单历史版本，便于对比





