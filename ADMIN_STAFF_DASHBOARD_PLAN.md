# 综合岗（admin_staff）看板和功能模块调整方案

## 一、综合岗职责范围

综合岗主要负责：
1. **快递管理** - 处理所有用户的快递申请
2. **办公用品采购** - 申请办公用品采购
3. **章证使用管理** - 处理所有用户的章证使用申请

## 二、需要隐藏的功能模块

### 2.1 导航按钮隐藏
- ❌ **项目管理** - 综合岗不需要管理项目
- ❌ **客户管理** - 综合岗不需要管理客户
- ✅ **KPI查询** - 保留，但只能查看自己的KPI（不能查看所有人的）
- ✅ **业务看板** - 保留，但内容需要调整
- ✅ **快递管理** - 保留
- ✅ **办公用品采购** - 保留
- ✅ **章证使用** - 保留
- ✅ **个人中心** - 保留

### 2.2 业务看板内容调整

#### 需要隐藏的卡片：
- ❌ 当月项目数
- ❌ 成交额合计/项目金额合计
- ❌ KPI合计
- ❌ 完成率
- ❌ 进行中
- ❌ 已完成
- ❌ 待开始
- ❌ 回款预警
- ❌ 交付逾期
- ❌ 回款完成率
- ❌ 近7天完成
- ❌ 近7天回款预警
- ❌ 近7天交付预警

#### 需要显示的卡片（综合岗职责相关）：
- ✅ **待处理快递申请** - 显示待处理数量，点击跳转到快递管理
- ✅ **待审批办公用品采购** - 显示待审批数量（仅当综合岗有申请时显示）
- ✅ **待处理章证使用申请** - 显示待处理数量，点击跳转到章证使用管理
- ✅ **今日待办事项** - 汇总所有待处理事项
- ✅ **我的KPI** - 显示综合岗自己的KPI统计（可选，如果有KPI数据）

#### 图表调整：
- ❌ 隐藏所有项目相关的图表（项目状态分布、项目类型分布等）
- ✅ 可以显示综合岗职责范围内的统计图表（可选）

## 三、实现方案

### 3.1 修改导航按钮显示逻辑

**文件：`public/js/main.js` - `updateNavVisibility()` 函数**

```javascript
// 在 updateNavVisibility() 函数中添加
const currentRole = state.currentRole;
const isAdminStaff = currentRole === 'admin_staff';

// 项目管理按钮 - 综合岗隐藏
const projectsBtn = document.querySelector('button[data-click*="projects"]');
if (projectsBtn && isAdminStaff) {
    projectsBtn.style.display = 'none';
}

// KPI查询按钮 - 综合岗保留（可以查看自己的KPI）
// 注意：KPI查询页面会自动限制综合岗只能查看自己的KPI，不能查看所有人的
```

### 3.2 修改业务看板内容

**文件：`public/js/modules/dashboard.js` - `renderDashboardCards()` 函数**

```javascript
// 在 renderDashboardCards() 函数开头添加
const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
const isAdminStaff = currentRole === 'admin_staff';

if (isAdminStaff) {
    // 综合岗专用看板
    return renderAdminStaffDashboard(data);
}
```

**新增函数：`renderAdminStaffDashboard()`**

显示综合岗职责范围内的统计信息：
- 待处理快递申请数量
- 待处理章证使用申请数量
- 待审批办公用品采购数量（如果有申请权限）
- 今日待办事项汇总

### 3.3 修改看板图表

**文件：`public/js/modules/dashboard.js` - `renderDashboardCharts()` 函数**

```javascript
const currentRole = state.currentRole || (state.currentUser?.roles?.[0] || '');
const isAdminStaff = currentRole === 'admin_staff';

if (isAdminStaff) {
    // 综合岗不需要显示项目相关图表
    return;
}
```

### 3.4 修改后端看板数据接口

**文件：`routes/kpi.js` - `/kpi/dashboard` 路由**

当角色为 `admin_staff` 时，返回综合岗相关的统计数据：
- 待处理快递申请数量
- 待处理章证使用申请数量
- 待审批办公用品采购数量（如果有）
- 综合岗自己的KPI统计（如果有）

### 3.5 KPI查询页面限制

**文件：`public/js/modules/kpi.js` - `loadKPI()` 函数**

综合岗在KPI查询页面：
- ✅ 可以查看自己的KPI
- ❌ 不能选择其他用户（用户选择下拉框应该隐藏）
- ❌ 不能查看全部用户汇总

当前代码已经实现了这个逻辑（只有管理员和财务可以查看所有用户的KPI），综合岗会自动限制为只能查看自己的KPI。

## 四、具体修改步骤

### 步骤1：修改导航按钮显示
- 在 `updateNavVisibility()` 中添加综合岗判断
- 隐藏"项目管理"按钮
- 保留"KPI查询"按钮（综合岗可以查看自己的KPI）

### 步骤2：修改看板卡片渲染
- 在 `renderDashboardCards()` 中添加综合岗判断
- 创建 `renderAdminStaffDashboard()` 函数
- 只显示综合岗职责范围内的卡片

### 步骤3：修改看板图表渲染
- 在 `renderDashboardCharts()` 中添加综合岗判断
- 综合岗不显示任何图表

### 步骤4：修改后端接口
- 在 `/kpi/dashboard` 路由中添加综合岗数据
- 返回待处理事项统计

### 步骤5：修改看板今日信息
- 在 `renderDashboardTodayInfo()` 中添加综合岗判断
- 综合岗不显示项目相关的今日信息

## 五、综合岗看板卡片设计

### 卡片1：待处理快递申请
- 图标：📦
- 数值：待处理快递申请数量
- 点击：跳转到快递管理页面，筛选"待处理"状态

### 卡片2：待处理章证使用申请
- 图标：🔐
- 数值：待处理章证使用申请数量
- 点击：跳转到章证使用管理页面，筛选"待处理"状态

### 卡片3：待审批办公用品采购（可选）
- 图标：🛒
- 数值：待审批办公用品采购数量（仅当综合岗有申请时显示）
- 点击：跳转到办公用品采购页面，筛选"待审批"状态

### 卡片4：今日待办事项
- 图标：📋
- 数值：所有待处理事项总数
- 描述：汇总所有需要综合岗处理的事项

### 卡片5：我的KPI（可选）
- 图标：📈
- 数值：综合岗自己的KPI统计
- 点击：跳转到KPI查询页面，自动筛选为当前用户
- 描述：显示当前月份的KPI得分

## 六、注意事项

1. **权限检查**：所有修改都要基于 `state.currentRole`，而不是用户拥有的所有角色
2. **角色切换**：当用户从其他角色切换到综合岗时，界面应该自动更新
3. **数据加载**：综合岗的看板数据应该从对应的模块获取（快递、章证、办公用品）
4. **向后兼容**：确保管理员（admin）角色不受影响，仍然可以看到所有功能
5. **KPI查询限制**：综合岗在KPI查询页面只能查看自己的KPI，用户选择下拉框应该隐藏（当前代码已实现此逻辑）

