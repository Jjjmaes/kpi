# 专职/兼职处理逻辑说明

## 1. 数据模型

### User模型
- **字段**：`employmentType`
- **类型**：`String`
- **枚举值**：`'full_time'`（专职）、`'part_time'`（兼职）
- **默认值**：`'full_time'`
- **位置**：`models/User.js` 第36-40行

### ProjectMember模型
- **字段**：`employmentType`
- **类型**：`String`
- **枚举值**：`'full_time'`（专职）、`'part_time'`（兼职）
- **默认值**：`'full_time'`
- **说明**：作为快照保存，在添加成员时从User带入，便于历史追溯
- **位置**：`models/ProjectMember.js` 第19-23行

## 2. 添加项目成员时的处理

### 流程（`services/projectService.js`）
1. **获取用户信息**（第469行）：
   ```javascript
   const memberUser = await User.findById(userId).select('employmentType roles name');
   ```

2. **设置employmentType**（第473行）：
   ```javascript
   const employmentType = memberUser.employmentType || 'full_time';
   ```

3. **保存到ProjectMember**（第608行）：
   ```javascript
   const member = await ProjectMember.create({
     projectId,
     userId,
     role,
     employmentType,  // 从User带入
     // ... 其他字段
   });
   ```

## 3. KPI计算时的处理

### 销售角色的特殊处理（`services/kpiService.js`）
在三个KPI计算函数中都有相同的逻辑：

1. **generateMonthlyKPIRecords**（第270行）
2. **generateProjectKPI**（第719行）
3. **calculateProjectKPIRealtime**（第907行）

**逻辑**：
```javascript
const roleForCalc = member.role === 'sales' && member.employmentType === 'part_time'
  ? 'part_time_sales'
  : member.role;
```

**说明**：
- 如果角色是 `'sales'` 且 `employmentType` 是 `'part_time'`，则使用 `'part_time_sales'` 角色计算
- 专职销售：走销售KPI（金额奖励 + 回款奖励）
- 兼职销售：走兼职销售分成（成交额 - 公司应收 - 税费）

## 4. 前端显示

### 项目成员列表显示
- **位置**：`public/js/modules/project.js`
- **显示逻辑**：
  ```javascript
  const employmentLabel = memberEmploymentType === 'part_time' ? '兼职' : '专职';
  ```
- **显示位置**：
  - 项目详情页（第1572行）
  - 编辑项目模态框（第1256行）
  - 创建项目时的成员列表（第2295行）

## 5. 潜在问题

### 问题1：新角色没有考虑employmentType
当前只有销售角色会根据 `employmentType` 进行特殊处理，其他新角色（如 `test`）不会根据 `employmentType` 区分计算方式。

### 问题2：employmentType的默认值
如果User的 `employmentType` 为空或未设置，会使用默认值 `'full_time'`，这可能导致兼职用户被误判为专职。

### 问题3：历史数据兼容
如果历史项目成员没有 `employmentType` 字段，会使用默认值 `'full_time'`，可能不准确。

## 6. 建议

1. **确保User的employmentType正确设置**：在用户管理界面，确保每个用户的专/兼职状态正确设置。

2. **新角色的处理**：如果新角色也需要区分专/兼职，需要在KPI计算逻辑中添加相应的处理。

3. **历史数据修复**：如果有历史数据需要修复，可以编写脚本根据用户的当前 `employmentType` 更新历史项目成员的 `employmentType`。



