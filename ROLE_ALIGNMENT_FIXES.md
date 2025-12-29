# 角色对齐修复总结

## 问题描述
创建新角色（如 `test`）后，在项目中添加为成员时提示"未知的角色类型: test"，说明代码中还有很多地方硬编码了角色列表。

## 修复内容

### 1. KPI计算器 (`utils/kpiCalculator.js`)
**问题**：`calculateKPIByRole` 函数使用 `switch` 语句，只处理固定角色，新角色会抛出"未知的角色类型"错误。

**修复**：
- 在 `default` 分支中添加通用计算逻辑
- 对于新角色，使用公式：`项目金额 × 系数 × 完成系数`（如果提供了 `wordRatio`，也参与计算）
- 添加了对 `layout`、`part_time_sales`、`finance` 等角色的处理

**代码变更**：
```javascript
default:
  // 对于新角色，使用通用的KPI计算方式
  if (wordRatio && wordRatio !== 1) {
    kpiValue = projectAmount * ratio * wordRatio * completionFactor;
    formula = `项目金额(${projectAmount}) × 系数(${ratio}) × 占比(${wordRatio}) × 完成系数(${completionFactor})`;
  } else {
    kpiValue = projectAmount * ratio * completionFactor;
    formula = `项目金额(${projectAmount}) × 系数(${ratio}) × 完成系数(${completionFactor})`;
  }
  break;
```

### 2. 项目服务层 (`services/projectService.js`)
**问题**：硬编码了生产角色列表 `['translator', 'reviewer', 'layout', 'part_time_translator']`，新角色无法被识别为生产角色。

**修复**：
- 修改生产角色判断逻辑，支持新角色
- 管理角色（pm, sales, admin_staff等）不需要确认
- 其他 `canBeProjectMember: true` 的角色视为生产角色（需要确认）

**代码变更**：
```javascript
// 判断是否为生产人员（需要确认的角色）
const managementRoles = ['pm', 'sales', 'part_time_sales', 'admin_staff', 'finance', 'admin'];
const traditionalProductionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
const isProductionRole = traditionalProductionRoles.includes(role) || 
                         (!managementRoles.includes(role) && roleDoc.canBeProjectMember);
```

### 3. 项目路由 (`routes/projects.js`)
**问题**：硬编码了生产角色列表，用于检查项目成员接受状态。

**修复**：
- 从数据库动态获取所有 `canBeProjectMember: true` 的角色
- 排除管理角色，剩余角色视为生产角色
- 保留传统角色列表作为后备方案

**代码变更**：
```javascript
// 获取所有需要确认的角色（生产角色）
const Role = require('../models/Role');
const allRoles = await Role.find({ isActive: true, canBeProjectMember: true });
const managementRoles = ['pm', 'sales', 'part_time_sales', 'admin_staff', 'finance', 'admin'];
const productionRoles = allRoles
  .filter(r => !managementRoles.includes(r.code))
  .map(r => r.code);

// 如果数据库中没有角色配置，使用传统角色列表作为后备
const traditionalProductionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
const finalProductionRoles = productionRoles.length > 0 ? productionRoles : traditionalProductionRoles;
```

## 仍需检查的地方

以下位置可能仍有硬编码的角色列表，需要根据实际使用情况决定是否修复：

1. **`services/projectService.js`**：
   - 第334行：`wordRatio: ['translator', 'reviewer', 'layout'].includes(role)`
   - 第597行：`wordRatio: ['translator', 'reviewer', 'layout'].includes(role)`
   - 第1025行：`const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];`

2. **`services/evaluationService.js`**：
   - 第78行：`const executorRoles = ['translator', 'reviewer', 'layout'];`
   - 第349行：`if (['translator', 'reviewer', 'layout'].includes(memberRole))`

3. **`utils/permissionChecker.js`**：
   - 第98行：`const restricted = ['pm', 'translator', 'reviewer', 'layout', 'part_time_translator'];`
   - 第103行：`const restricted = ['pm', 'translator', 'reviewer', 'layout', 'part_time_translator'];`

4. **前端代码**：
   - `public/js/modules/project.js`：多处硬编码角色列表
   - `public/js/core/config.js`：`ROLE_NAMES` 对象（用于显示名称，可能需要动态获取）

## 测试建议

1. **创建新角色测试**：
   - 创建一个新角色（如 `test`），设置 `canBeProjectMember: true`
   - 在项目中添加该角色为成员，应该能够成功添加
   - 成员应该能够接受/拒绝任务
   - 项目状态应该能够正确流转

2. **KPI计算测试**：
   - 为新角色配置KPI系数
   - 创建项目并添加新角色成员
   - 完成项目后，检查KPI是否正确计算

3. **生产角色确认测试**：
   - 确认新角色成员需要确认（pending状态）
   - 确认管理角色成员自动接受（accepted状态）

## 后续优化建议

1. **统一角色管理**：
   - 创建一个工具函数，统一管理"生产角色"、"管理角色"等分类
   - 从数据库动态获取，避免硬编码

2. **角色属性扩展**：
   - 在 `Role` 模型中添加 `requiresConfirmation` 属性，明确标识哪些角色需要确认
   - 在 `Role` 模型中添加 `isManagementRole` 属性，明确标识管理角色

3. **前端角色列表**：
   - 前端角色名称列表（`ROLE_NAMES`）应该从后端API动态获取
   - 避免前端硬编码角色列表

### 4. 前端项目成员显示 (`public/js/modules/project.js`)
**问题**：硬编码了生产角色列表 `['translator', 'reviewer', 'layout', 'part_time_translator']`，导致新角色成员无法显示确认/拒绝按钮。

**修复**：
- 移除了对硬编码生产角色列表的依赖
- 直接根据 `acceptanceStatus` 判断是否显示确认/拒绝按钮
- 如果 `acceptanceStatus === 'pending'`，就显示按钮，不管角色是什么

**代码变更**：
```javascript
// 之前：依赖硬编码的生产角色列表
const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
const isProductionRole = productionRoles.includes(m.role);
if (isProductionRole && acceptanceStatus === 'pending') {
    // 显示按钮
}

// 修复后：直接根据 acceptanceStatus 判断
if (acceptanceStatus === 'pending') {
    // 显示按钮（适用于所有角色，包括新角色）
}
```

## 修复日期
2024年（具体日期根据实际情况填写）

