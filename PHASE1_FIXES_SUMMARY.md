# 阶段1修复总结

## 已完成的修复

### 1. 移除数据模型中的enum限制 ✅

#### 1.1 Project.capacityRecords.role
**文件**：`models/Project.js`
- **修改前**：`enum: ['translator', 'reviewer']`
- **修改后**：移除enum限制，改为在业务逻辑中验证
- **影响**：现在支持所有角色记录产能（需要在业务逻辑中验证角色是否允许）

#### 1.2 ProjectEvaluation.evaluatorRole
**文件**：`models/ProjectEvaluation.js`
- **修改前**：`enum: ['pm', 'translator', 'reviewer', 'layout']`
- **修改后**：移除enum限制，改为在业务逻辑中验证
- **影响**：现在支持所有角色作为评价人（需要在业务逻辑中验证角色是否允许）

#### 1.3 ProjectEvaluation.evaluatedRole
**文件**：`models/ProjectEvaluation.js`
- **修改前**：`enum: ['sales', 'part_time_sales', 'pm']`
- **修改后**：移除enum限制，改为在业务逻辑中验证
- **影响**：现在支持所有角色被评价（需要在业务逻辑中验证角色是否允许）

### 2. 在Role模型中添加新字段 ✅

**文件**：`models/Role.js`

新增字段：
- `isManagementRole` (Boolean, default: false, indexed)
  - 用于判断是否为管理角色（用于判断是否需要成员确认等）
- `isFixedRole` (Boolean, default: false)
  - 用于判断是否为固定角色（固定角色的KPI系数在KPI配置页面中配置）
- `isSpecialRole` (Boolean, default: false)
  - 用于判断是否为特殊角色（有特殊处理逻辑，如part_time_sales、part_time_translator、layout）
- `canRecordCapacity` (Boolean, default: false)
  - 用于判断是否可用于产能记录（如翻译、审校等需要记录工作量的角色）
- `canBeEvaluator` (Boolean, default: false)
  - 用于判断是否可以作为评价人（如pm、translator、reviewer、layout等）
- `canBeEvaluated` (Boolean, default: false)
  - 用于判断是否可以被评价（如sales、part_time_sales、pm等）

### 3. 更新评价服务使用动态判断 ✅

**文件**：`services/evaluationService.js`

**修改内容**：
- 移除硬编码的角色列表检查
- 使用Role模型的`canBeEvaluator`和`canBeEvaluated`字段动态判断
- 支持新角色参与评价功能

### 4. 更新initRoles脚本 ✅

**文件**：`scripts/initRoles.js`

**修改内容**：
- 为所有默认角色添加新字段的默认值
- 确保新创建的角色具有正确的属性设置

### 5. 创建数据迁移脚本 ✅

**文件**：`scripts/migrateRoleFields.js`

**功能**：
- 为现有角色添加新字段
- 根据角色代码自动设置字段值
- 支持增量更新（只更新缺失的字段）

**运行方式**：
```bash
node scripts/migrateRoleFields.js
```

## 字段默认值配置

### 管理角色 (isManagementRole = true)
- admin, finance, pm, admin_staff, sales, part_time_sales

### 固定角色 (isFixedRole = true)
- translator, reviewer, pm, sales, admin_staff, finance

### 特殊角色 (isSpecialRole = true)
- part_time_sales, part_time_translator, layout

### 可记录产能 (canRecordCapacity = true)
- translator, reviewer

### 可作为评价人 (canBeEvaluator = true)
- pm, translator, reviewer, layout

### 可被评价 (canBeEvaluated = true)
- sales, part_time_sales, pm

## 下一步工作

### 阶段2：业务逻辑修复
1. 统一兼职排版费用存储
2. 修复KPI计算逻辑
3. 动态化角色列表判断（使用新字段）

### 阶段3：前端对齐
1. 使用Role模型的新字段
2. 移除硬编码的角色列表
3. 更新UI显示

## 注意事项

1. **数据迁移**：运行迁移脚本前，建议备份数据库
2. **向后兼容**：新字段都有默认值，不会影响现有功能
3. **业务逻辑**：需要在业务逻辑中添加角色验证（使用新字段）

## 测试建议

1. **数据迁移测试**
   - 运行迁移脚本
   - 验证现有角色的新字段是否正确设置

2. **功能测试**
   - 测试产能记录功能（使用新角色）
   - 测试评价功能（使用新角色）
   - 验证角色判断逻辑

3. **兼容性测试**
   - 验证现有功能不受影响
   - 验证新角色可以正常使用


