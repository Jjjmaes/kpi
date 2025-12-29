# 角色权限保存问题分析

## 问题描述
编辑角色权限后，保存成功，但再次打开时权限配置恢复为修改前的状态。

## 数据流程分析

### 1. 数据获取阶段
- **后端**：`Role.find()` 返回角色数据，`permissions` 字段是 `mongoose.Schema.Types.Mixed`，默认值是 `{}`
- **前端**：`rolesCache = data.data`，`permissions` 是一个对象
- **问题**：如果某个权限在数据库中不存在（`permissions` 对象中没有这个键），那么 `permissions[perm.key]` 返回 `undefined`

### 2. HTML生成阶段
```javascript
const currentValue = permissions[perm.key]; // 可能是 undefined
const normalizedValue = currentValue === undefined || currentValue === null ? false : currentValue;
const currentValueStr = JSON.stringify(normalizedValue); // 如果是 false，结果是 "false"
```

**问题**：如果 `permissions` 对象中没有某个权限的键，`currentValue` 是 `undefined`，`normalizedValue` 是 `false`，`currentValueStr` 是 `"false"`。

但是，选择器的第一个选项的值也是 `JSON.stringify(false)` = `"false"`，应该匹配。

### 3. 选择器初始化问题
**可能的原因**：
1. HTML生成时，`selected` 属性可能没有正确设置
2. 选择器在DOM渲染后，值被重置为空
3. `setTimeout` 中的修复逻辑没有正确执行

### 4. 数据保存阶段
```javascript
permissions[permKey] = value; // 如果 value 是 false，应该保存 false
```

**问题**：如果前端收集权限时，某些权限的值是 `undefined` 或空字符串，那么这些权限可能没有被收集到 `permissions` 对象中，导致后端保存时，这些权限的键被省略。

### 5. 后端保存逻辑
```javascript
if (permissions !== undefined) {
  role.permissions = permissions; // 直接替换整个对象
}
```

**问题**：如果前端发送的 `permissions` 对象中缺少某些权限的键，那么这些权限在数据库中的值会被删除（因为整个对象被替换了）。

## 根本原因

**关键问题**：前端在收集权限时，如果选择器的值为空，会跳过该权限，导致 `permissions` 对象中缺少该权限的键。后端保存时，整个 `permissions` 对象被替换，导致缺少的权限被删除。

## 解决方案

1. **确保所有权限都被收集**：即使值为 `false`，也要在 `permissions` 对象中显式存储
2. **修复选择器初始化**：确保选择器在HTML生成时就有正确的 `selected` 属性
3. **后端合并逻辑**：不要直接替换整个 `permissions` 对象，而是合并更新



