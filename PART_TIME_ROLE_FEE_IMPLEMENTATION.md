# 兼职角色费用实现说明

## 概述

完善了数据模型和业务逻辑，确保除兼职销售外的所有兼职角色都需要项目经理输入项目费用，而不是计算KPI。

## 实现内容

### 1. 数据模型完善

#### ProjectMember模型
- **字段**：`partTimeFee`（已存在）
- **用途**：所有兼职角色（除兼职销售外）的费用统一使用此字段
- **位置**：`models/ProjectMember.js` 第38-42行

### 2. 后端业务逻辑

#### 添加项目成员（`services/projectService.js`）

**修改点**：
- 第519-557行：添加了兼职角色费用校验逻辑
- 判断逻辑：
  ```javascript
  const isPartTime = employmentType === 'part_time';
  const isPartTimeSales = role === 'part_time_sales' || (role === 'sales' && isPartTime);
  
  if (isPartTime && !isPartTimeSales) {
    // 所有兼职角色（除兼职销售外）都需要输入费用
    // 验证费用必须大于0且不超过项目总金额
  }
  ```
- 第614-617行：保存 `partTimeFee` 到 `ProjectMember`

**费用验证规则**：
- 费用必须大于0
- 费用不能超过项目总金额
- 兼职排版费用不能超过项目总金额的5%

#### KPI计算逻辑（`services/kpiService.js`）

**修改点**：
- `generateMonthlyKPIRecords`（第270-318行）
- `generateProjectKPI`（第719-750行）
- `calculateProjectKPIRealtime`（第915-960行）
- `calculateProjectKPIRealtime`（第1128-1171行）

**统一逻辑**：
```javascript
const isPartTime = member.employmentType === 'part_time';
const isPartTimeSales = roleForCalc === 'part_time_sales';

if (isPartTime && !isPartTimeSales) {
  // 所有兼职角色（除兼职销售外）：直接使用partTimeFee，不计算KPI
  const fee = member.partTimeFee || 0;
  kpiResult = {
    kpiValue: fee,
    formula: `兼职${roleName}费用：${fee}元`
  };
}
```

### 3. 前端实现

#### 创建项目时添加成员（`public/js/modules/project.js`）

**修改点**：
- 第2393行：添加用户选择监听 `data-change="onCreateMemberUserChange()"`
- 第2421-2426行：更新费用输入字段标签和说明
- 第2585-2627行：添加 `onCreateMemberUserChange` 函数
- 第2479-2520行：修改 `addMemberForCreate` 函数，添加兼职角色费用验证

**功能**：
- 选择用户后，自动检查用户的 `employmentType`
- 如果是兼职（除兼职销售外），显示费用输入字段
- 费用输入字段标签根据角色动态更新

#### 编辑项目时添加成员

**修改点**：
- 第2817行：添加用户选择监听 `data-change="onMemberUserChange()"`
- 第2838-2843行：更新费用输入字段标签和说明
- 第2898-2943行：添加 `onMemberUserChange` 函数
- 第3111-3125行：修改 `addMember` 函数，添加兼职角色费用验证

**功能**：
- 与创建项目时的逻辑一致
- 支持动态显示费用输入字段

#### 成员列表显示

**修改点**：
- 第2301-2309行：更新 `updateCreateProjectMembersList` 函数
- 显示所有兼职角色（除兼职销售外）的费用信息

## 业务规则

### 兼职角色判断
1. **兼职销售**：`role === 'part_time_sales'` 或 `(role === 'sales' && employmentType === 'part_time')`
   - 通过项目配置计算分成，不需要输入费用
   
2. **其他兼职角色**：`employmentType === 'part_time'` 且不是兼职销售
   - 必须输入费用
   - 费用直接作为KPI值，不参与系数计算

### 费用验证规则
1. **通用规则**：
   - 费用必须大于0
   - 费用不能超过项目总金额

2. **兼职排版特殊规则**：
   - 费用不能超过项目总金额的5%

### KPI计算规则
1. **专职角色**：使用系数计算KPI
   - 公式：`项目金额 × 系数 × 完成系数 × 占比（如适用）`

2. **兼职销售**：通过项目配置计算分成
   - 公式：`(成交额 - 公司应收) - (成交额 - 公司应收) × 税率`

3. **其他兼职角色**：直接使用输入的费用
   - KPI值 = `partTimeFee`

## 兼容性说明

### 向后兼容
1. **专职排版**：继续支持 `layoutCost` 字段（在Project模型中）
   - 兼职排版统一使用 `partTimeFee` 字段

2. **历史数据**：如果 `employmentType` 为空，默认为 `'full_time'`
   - 不会影响历史项目的KPI计算

## 测试建议

1. **添加兼职成员**：
   - 选择兼职用户（`employmentType === 'part_time'`）
   - 选择非销售角色
   - 验证费用输入字段是否显示
   - 验证费用验证规则是否生效

2. **KPI计算**：
   - 创建包含兼职成员的项目
   - 完成项目并生成KPI
   - 验证兼职成员的KPI值是否等于输入的费用

3. **兼职销售**：
   - 验证兼职销售仍然通过项目配置计算分成
   - 验证不需要输入费用

4. **专职角色**：
   - 验证专职角色仍然使用系数计算KPI
   - 验证不显示费用输入字段


