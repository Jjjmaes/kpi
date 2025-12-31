# 合同模板示例

## 正确的模板写法

### 1. 文稿名称（Title）

**写法：**
```docx
文稿名称（Title）：{projectName}
```

**说明：**
- `{projectName}` 会被替换为实际的项目名称
- 如果项目名称后面需要固定文字（如"法律文件"），应该在项目数据中处理，或者分开写

**如果需要显示固定后缀：**
```docx
文稿名称（Title）：{projectName} 法律文件
```
这样会显示为：`文稿名称（Title）：XXX项目 法律文件`

---

### 2. 翻译类型（使用 else 分支）

**写法：**
```docx
翻译类型：{#if isInterpretation}●{else}○{/if}口译    {#if isTranslation}●{else}○{/if}笔译
```

**说明：**
- `{#if isInterpretation}●{else}○{/if}` 表示：如果是口译，显示 ●，否则显示 ○
- `{#if isTranslation}●{else}○{/if}` 表示：如果是笔译，显示 ●，否则显示 ○
- 这样可以根据项目类型自动勾选对应的选项

**效果：**
- 如果是笔译项目：`翻译类型：○口译    ●笔译`
- 如果是口译项目：`翻译类型：●口译    ○笔译`

---

### 3. 翻译语种

**写法：**
```docx
原语种：{sourceLanguage}    目标语种：{targetLanguagesText}
```

**说明：**
- `{sourceLanguage}` 会被替换为实际的源语种（如"英文"、"日文"等）
- `{targetLanguagesText}` 会被替换为实际的目标语种（如"中文"、"英文"等，多个语种用"、"分隔）
- **不要在变量后面再加固定文字**，因为变量本身已经包含了完整的语种名称

**错误写法：**
```docx
原语种：{sourceLanguage}英文          <!-- 错误：变量后面不应该再加"英文" -->
目标语种：{targetLanguagesText}中文   <!-- 错误：变量后面不应该再加"中文" -->
```

**正确写法：**
```docx
原语种：{sourceLanguage}    目标语种：{targetLanguagesText}
```

**效果示例：**
- `原语种：英文    目标语种：中文`
- `原语种：日文    目标语种：中文、英文`

---

### 4. 交付时间

**写法1：只显示日期**
```docx
交付时间：{deadlineText}
```

**写法2：只显示天数**
```docx
交付时间：{deliveryDaysText}
```

**写法3：同时显示日期和天数（推荐）**
```docx
交付时间：{deadlineText}（{deliveryDaysText}）
```

**写法4：带固定说明文字**
```docx
交付时间：{deadlineText}（{deliveryDaysText}），合同签署后5个工作日交付。
```

**说明：**
- `{deadlineText}` 显示具体日期，格式：`YYYY-MM-DD`
- `{deliveryDaysText}` 显示天数，格式：`XX 个工作日`
- 如果项目没有设置截止日期，会显示 `—`

**效果示例：**
- `交付时间：2025-01-15（5 个工作日）`
- `交付时间：2025-01-15（5 个工作日），合同签署后5个工作日交付。`

---

## 完整示例

### 项目说明部分

```docx
二、项目说明

1. 文稿名称（Title）：{projectName}

2. 翻译类型：
   {#if isInterpretation}●{else}○{/if}口译    {#if isTranslation}●{else}○{/if}笔译

3. 翻译语种：
   原语种：{sourceLanguage}    目标语种：{targetLanguagesText}

4. 交付时间：
   {deadlineText}（{deliveryDaysText}），合同签署后5个工作日交付。
```

---

## 注意事项

1. **变量替换**：所有 `{变量名}` 都会被替换为实际值，不需要在后面再加固定文字
2. **条件判断**：使用 `{#if}...{else}...{/if}` 可以根据条件显示不同内容
3. **格式保持**：Word 中的格式（字体、字号、颜色等）会被保留
4. **空值处理**：如果变量值为空，会显示 `—`

---

## 常见错误

### ❌ 错误1：变量后加固定文字
```docx
原语种：{sourceLanguage}英文
```
**问题：** 如果 `{sourceLanguage}` 的值是"英文"，会显示为"英文英文"

### ❌ 错误2：条件判断语法错误
```docx
{#if isTranslation}●{#else}○{/if}笔译
```
**问题：** 应该是 `{else}` 而不是 `{#else}`

### ✅ 正确写法
```docx
原语种：{sourceLanguage}
{#if isTranslation}●{else}○{/if}笔译
```





