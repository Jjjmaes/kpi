# 动态角色管理指南

## 概述

系统支持动态角色管理，管理员可以创建自定义角色，无需修改代码。新创建的角色可以自动参与项目成员管理、KPI计算、权限控制等业务逻辑。

## 角色属性说明

### 基础属性

- **角色代码（code）**：唯一标识，只能包含小写字母、数字和下划线，且必须以字母开头
- **角色名称（name）**：显示名称
- **描述（description）**：角色说明
- **优先级（priority）**：用于排序，数字越大优先级越高
- **是否启用（isActive）**：控制角色是否可用

### 功能属性

- **是否可用于项目成员（canBeProjectMember）**：
  - `true`：可以作为项目成员添加
  - `false`：不能作为项目成员

- **是否可用于KPI记录（canBeKpiRole）**：
  - `true`：可以用于KPI记录和计算
  - `false`：不能用于KPI记录

### 业务属性

- **是否为管理角色（isManagementRole）**：
  - `true`：管理角色，添加为项目成员时自动接受，无需确认
  - `false`：生产角色，添加为项目成员时需要成员确认
  - **影响**：决定成员是否需要确认接受项目分配

- **是否为固定角色（isFixedRole）**：
  - `true`：固定角色，KPI系数在KPI配置页面的固定角色区域配置
  - `false`：新角色，KPI系数在KPI配置页面的新角色区域配置
  - **影响**：决定KPI系数配置的位置

- **是否为特殊角色（isSpecialRole）**：
  - `true`：特殊角色，有特殊处理逻辑（如part_time_sales、part_time_translator、layout）
  - `false`：普通角色，使用标准KPI计算逻辑
  - **影响**：决定是否使用特殊KPI计算逻辑

### 扩展属性

- **是否可记录产能（canRecordCapacity）**：
  - `true`：可以记录产能（如翻译、审校等需要记录工作量的角色）
  - `false`：不记录产能

- **是否可作为评价人（canBeEvaluator）**：
  - `true`：可以作为评价人（如pm、translator、reviewer、layout等）
  - `false`：不能作为评价人

- **是否可被评价（canBeEvaluated）**：
  - `true`：可以被评价（如sales、part_time_sales、pm等）
  - `false`：不能被评价

## 创建新角色

### 操作步骤

1. 进入"系统配置" → "角色管理"
2. 点击"创建角色"按钮
3. 填写角色信息：
   - **角色代码**：如 `test_role`
   - **角色名称**：如 `测试角色`
   - **描述**：角色说明
   - **优先级**：数字，用于排序
4. 设置功能属性：
   - 是否可用于项目成员
   - 是否可用于KPI记录
5. 设置业务属性：
   - 是否为管理角色
   - 是否为固定角色
   - 是否为特殊角色
6. 设置扩展属性（可选）：
   - 是否可记录产能
   - 是否可作为评价人
   - 是否可被评价
7. 配置权限（选择每个权限的值）
8. 点击"创建"按钮

### 示例：创建生产角色

**场景**：创建一个新的生产角色"质检员"

1. **角色代码**：`quality_checker`
2. **角色名称**：`质检员`
3. **功能属性**：
   - `canBeProjectMember = true`
   - `canBeKpiRole = true`
4. **业务属性**：
   - `isManagementRole = false`（生产角色，需要确认）
   - `isFixedRole = false`（新角色，在KPI配置页面配置系数）
   - `isSpecialRole = false`（普通角色）
5. **扩展属性**：
   - `canRecordCapacity = true`（可以记录产能）
   - `canBeEvaluator = true`（可以作为评价人）
   - `canBeEvaluated = false`（不能被评价）

**结果**：
- 质检员可以作为项目成员添加
- 添加后需要成员确认接受
- 可以在KPI配置页面配置KPI系数
- 可以记录产能
- 可以作为评价人评价项目经理

### 示例：创建管理角色

**场景**：创建一个新的管理角色"项目助理"

1. **角色代码**：`project_assistant`
2. **角色名称**：`项目助理`
3. **功能属性**：
   - `canBeProjectMember = true`
   - `canBeKpiRole = false`（管理角色通常不参与KPI计算）
4. **业务属性**：
   - `isManagementRole = true`（管理角色，自动接受）
   - `isFixedRole = false`
   - `isSpecialRole = false`

**结果**：
- 项目助理可以作为项目成员添加
- 添加后自动接受，无需确认
- 不参与KPI计算

## 配置新角色KPI系数

### 操作步骤

1. 创建新角色并设置`canBeKpiRole = true`
2. 进入"系统配置" → "KPI系数配置"
3. 在"角色KPI系数配置"区域找到新创建的角色
4. 在"KPI系数"列输入系数值（0-1之间）
5. 点击"更新配置"按钮保存

### 注意事项

- 只有满足以下条件的角色才会显示在配置列表中：
  - 不是系统角色（`isSystem !== true`）
  - 不是固定角色（`isFixedRole !== true`）
  - 不是特殊角色（`isSpecialRole !== true`）
  - 可用于KPI记录（`canBeKpiRole === true`）
- 系数配置后，在项目创建时会自动锁定到项目中
- 已创建的项目不受系数变更影响

## 使用新角色

### 作为项目成员

1. 创建或编辑项目
2. 添加成员时，选择新创建的角色
3. 选择用户
4. 如果是兼职角色（除兼职销售外），输入费用
5. 添加成员

**行为说明**：
- 如果角色是管理角色（`isManagementRole = true`），成员自动接受
- 如果角色是生产角色（`isManagementRole = false`），成员需要确认

### 参与KPI计算

1. 确保角色设置了`canBeKpiRole = true`
2. 在KPI配置页面配置系数
3. 创建项目并添加该角色成员
4. 完成项目后生成KPI

**计算逻辑**：
- 如果角色是特殊角色（`isSpecialRole = true`），使用特殊计算逻辑
- 如果角色是普通角色，使用标准KPI计算公式：`KPI = 项目金额 × 系数 × 完成系数`

## 常见问题

### Q: 为什么新创建的角色没有显示在KPI配置页面？

**A:** 检查以下几点：
1. 角色是否设置了`canBeKpiRole = true`
2. 角色是否设置了`isFixedRole = true`（固定角色不显示在新角色配置区域）
3. 角色是否设置了`isSystem = true`（系统角色不显示）
4. 角色是否设置了`isSpecialRole = true`（特殊角色不显示）

### Q: 新角色添加为项目成员后，为什么需要确认？

**A:** 检查角色的`isManagementRole`属性：
- 如果`isManagementRole = false`，成员需要确认（生产角色）
- 如果`isManagementRole = true`，成员自动接受（管理角色）

### Q: 新角色的KPI如何计算？

**A:** 
1. 确保角色设置了`canBeKpiRole = true`
2. 在KPI配置页面配置系数
3. 创建项目时，系数会自动锁定到项目中
4. KPI计算时使用锁定的系数

### Q: 如何让新角色参与评价功能？

**A:** 设置角色的扩展属性：
- `canBeEvaluator = true`：可以作为评价人
- `canBeEvaluated = true`：可以被评价

## 最佳实践

1. **角色代码命名**：使用有意义的代码，如`quality_checker`而不是`qc`
2. **属性设置**：根据角色的实际用途设置属性，不要随意设置
3. **权限配置**：只授予必要的权限，遵循最小权限原则
4. **测试验证**：创建新角色后，测试其在各个功能模块中的行为
5. **文档记录**：记录新角色的用途和配置，便于后续维护

---

**文档版本：** 1.0  
**最后更新：** 2025-01-15

