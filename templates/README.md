# 合同模板说明

## 模板文件位置

合同模板文件应放置在 `templates/contract-template.docx`

## 如何创建模板

1. 使用 Microsoft Word 创建合同文档
2. 在需要插入变量的位置使用以下语法：
   - 简单变量：`{变量名}`
   - 条件判断：`{#if 条件变量}显示内容{/if}`
   - 循环：`{#each 数组变量}循环内容{/each}`

## 可用变量列表

### 基本信息
- `{projectNumber}` - 项目编号
- `{projectName}` - 项目名称
- `{sourceLanguage}` - 源语种
- `{targetLanguagesText}` - 目标语种（多个用"、"分隔）

### 客户信息
- `{customerName}` - 客户名称
- `{customerAddress}` - 客户地址
- `{contactName}` - 联系人姓名
- `{contactPhone}` - 联系电话
- `{contactEmail}` - 联系邮箱

### 乙方信息（项目创建者）
- `{creatorEmail}` - 项目创建者邮箱（乙方邮箱）
- `{creatorName}` - 项目创建者姓名

### 业务信息
- `{businessTypeText}` - 业务类型（笔译/口译等）
- `{projectTypeText}` - 项目类型（MTPE/深度编辑等）
- `{isTranslation}` - 是否为笔译（布尔值，用于条件判断）
- `{isInterpretation}` - 是否为口译（布尔值，用于条件判断）

### 费用信息
- `{unitPriceText}` - 单价（格式：¥XX.XX / 千字）
- `{wordCountText}` - 字数（格式：XX 字）
- `{amountText}` - 总费用（格式：人民币 ¥XX.XX（含税/不含税））
- `{taxIncludedText}` - 是否含税（含税/不含税）

### 时间信息
- `{deadlineText}` - 交付截止日期（格式：YYYY-MM-DD）
- `{deliveryDaysText}` - 交付天数（格式：XX 个工作日）
- `{payDueDateText}` - 付款到期日期（格式：YYYY-MM-DD）
- `{payDueDaysText}` - 付款天数（格式：XX 个工作日）

### 付款信息
- `{paymentStatusText}` - 付款状态（中文：已支付/部分支付/未支付）

### 交付方式（布尔值，用于条件判断）
- `{hasElectronic}` - 是否有电子版
- `{hasEmail}` - 是否有电子邮件
- `{hasFax}` - 是否有传真
- `{hasPrint}` - 是否有打印稿

### 特殊要求
- `{terminologyText}` - 术语表要求（是/否）
- `{referenceFilesText}` - 参考文件（是/否）
- `{bilingualDeliveryText}` - 双语交付（是/否）
- `{pureTranslationDeliveryText}` - 纯翻译交付（是/否）
- `{printSealExpressText}` - 打印盖章快递（是/否）
- `{notesText}` - 备注说明

### 项目成员（循环）
- `{hasMembers}` - 是否有成员（布尔值，用于条件判断）
- `{#each members}` - 循环项目成员
  - `{role}` - 角色名称
  - `{name}` - 成员姓名
  - `{username}` - 用户名
  - `{email}` - 邮箱
  - `{phone}` - 电话
- `{/each}` - 结束循环

## 使用示例

### 简单变量
```
项目编号：{projectNumber}
项目名称：{projectName}
```

### 条件判断
```
{#if isTranslation}
☑ 笔译
{/if}
{#if isInterpretation}
☑ 口译
{/if}
```

### 循环
```
{#each members}
角色：{role}，姓名：{name}，用户名：{username}
{/each}
```

## 注意事项

1. 变量名区分大小写
2. 使用 `{#if}` 和 `{#each}` 时，必须正确闭合标签
3. 如果变量值为空，会显示为 `—`
4. 模板文件必须是 `.docx` 格式
5. 建议在创建模板时，先使用示例数据测试变量替换是否正确

## 模板文件示例结构

建议的合同模板应包含以下部分：

1. **合同标题和编号**
   - 翻译服务合同
   - 编号：{projectNumber}

2. **合同主体**
   - 甲方（委托方）信息
   - 乙方（服务方）信息

3. **项目说明**
   - 文稿名称、翻译类型、翻译语种、交付时间等

4. **服务费用**
   - 单价、字数、总费用

5. **付款方式**
   - 付款安排、收款信息、违约责任

6. **交付与验收**
   - 交付方式、验收标准

7. **质量标准与修改**

8. **知识产权**

9. **争议解决**

10. **其他条款**

11. **签署页**

