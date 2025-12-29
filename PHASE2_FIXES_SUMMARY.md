# 阶段2修复总结

## 已完成的修复

### 1. 统一兼职排版费用存储 ✅

#### 1.1 修复KPI计算中的layoutCost引用
**文件**：`services/kpiService.js`
- **修改前**：`layoutCost: roleForCalc === 'layout' ? kpiResult.kpiValue : undefined`
- **修改后**：`partTimeFee: isPartTime && !isPartTimeSales ? member.partTimeFee : undefined`
- **影响**：统一使用`member.partTimeFee`存储兼职费用，不再单独保存`layoutCost`

#### 1.2 统一兼职排版费用存储逻辑
**文件**：`services/projectService.js`
- **修改前**：兼职排版时同时更新`Project.partTimeLayout.layoutCost`和`ProjectMember.partTimeFee`
- **修改后**：
  - 兼职排版：费用统一存储在`ProjectMember.partTimeFee`中
  - `Project.partTimeLayout.layoutCost`设置为0（保留用于向后兼容）
  - `Project.partTimeLayout.isPartTime`保留用于标记是否为兼职排版项目

#### 1.3 统一专职排版处理逻辑
**文件**：`services/projectService.js`
- **修改前**：专职排版可能设置`layoutCost`
- **修改后**：专职排版走KPI计算，不存储费用，仅更新`layoutAssignedTo`和`isPartTime`标记

### 2. 动态化角色列表判断 ✅

#### 2.1 移除硬编码的managementRoles列表
**文件**：`services/projectService.js`
- **修改前**：
  ```javascript
  const managementRoles = ['pm', 'sales', 'part_time_sales', 'admin_staff', 'finance', 'admin'];
  const isProductionRole = traditionalProductionRoles.includes(role) || 
                           (!managementRoles.includes(role) && roleDoc.canBeProjectMember);
  ```
- **修改后**：
  ```javascript
  const isManagementRole = roleDoc.isManagementRole === true;
  const isProductionRole = !isManagementRole && roleDoc.canBeProjectMember === true;
  ```
- **影响**：使用Role模型的`isManagementRole`字段动态判断，支持新角色

#### 2.2 动态判断生产角色
**文件**：`services/projectService.js` (completeProject方法)
- **修改前**：硬编码`productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator']`
- **修改后**：使用Role模型的`isManagementRole`字段动态判断生产角色
- **影响**：支持新创建的生产角色自动参与项目完成检查

#### 2.3 修复路由中的硬编码角色列表
**文件**：`routes/projects.js`
- **修改前**：硬编码`managementRoles`和`productionRoles`列表
- **修改后**：使用Role模型的`isManagementRole`字段动态判断
- **影响**：支持新角色自动参与成员接受状态检查

#### 2.4 修复前端硬编码角色列表
**文件**：`public/js/modules/project.js`
- **修改前**：硬编码`managementRoles = ['pm', 'sales', 'part_time_sales', 'admin_staff', 'finance', 'admin']`
- **修改后**：
  - 从API获取角色信息时保存`isManagementRole`字段
  - 使用`isManagementRole`动态判断，保留传统列表作为后备方案
- **影响**：前端支持动态判断管理角色，兼容历史数据

### 3. 前端显示优化 ✅

#### 3.1 更新兼职排版费用显示
**文件**：`public/js/modules/project.js`
- **修改前**：`m.role === 'layout' && m.layoutCost`
- **修改后**：`m.role === 'layout' && m.partTimeFee`
- **影响**：统一使用`partTimeFee`显示兼职排版费用

## 修改的文件列表

1. `services/kpiService.js` - 修复KPI计算中的layoutCost引用
2. `services/projectService.js` - 统一费用存储，动态化角色判断
3. `routes/projects.js` - 动态化角色判断
4. `public/js/modules/project.js` - 动态化角色判断，更新费用显示

## 数据一致性改进

### 兼职排版费用存储
- **统一数据源**：`ProjectMember.partTimeFee`
- **标记字段**：`Project.partTimeLayout.isPartTime`（用于标记是否为兼职排版项目）
- **向后兼容**：保留`Project.partTimeLayout.layoutCost`字段（设置为0），但不使用

### 专职排版处理
- **专职排版**：走KPI计算，不存储费用
- **兼职排版**：使用`partTimeFee`存储费用，不走KPI计算

## 角色判断逻辑改进

### 管理角色判断
- **后端**：使用`Role.isManagementRole`字段
- **前端**：从API获取`isManagementRole`字段，动态判断
- **后备方案**：如果无法获取角色信息，使用传统管理角色列表

### 生产角色判断
- **后端**：`!isManagementRole && canBeProjectMember`
- **前端**：使用`isManagementRole`字段判断

## 注意事项

1. **数据迁移**：现有项目中的`Project.partTimeLayout.layoutCost`字段仍然存在，但不再使用
2. **向后兼容**：前端保留了传统管理角色列表作为后备方案，确保历史数据正常显示
3. **新角色支持**：新创建的角色如果设置了`isManagementRole`字段，会自动参与相应的业务逻辑

## 测试建议

1. **兼职排版费用测试**
   - 创建项目并添加兼职排版成员
   - 验证费用存储在`ProjectMember.partTimeFee`中
   - 验证KPI计算使用`partTimeFee`

2. **角色判断测试**
   - 创建新角色并设置`isManagementRole`
   - 验证新角色在项目成员添加时的接受状态
   - 验证新角色在项目完成检查中的行为

3. **专职排版测试**
   - 添加专职排版成员
   - 验证不走费用存储，走KPI计算

4. **前端显示测试**
   - 验证兼职排版费用正确显示
   - 验证管理角色自动接受，生产角色需要确认

