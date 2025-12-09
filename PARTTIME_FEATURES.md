# 兼职销售和兼职排版功能实现文档

## 功能概述

本系统实现了两个新功能：
1. **兼职销售**：成交额扣税后返给销售
2. **兼职排版**：排版员选择和排版费校验（不超过项目总金额的5%）

---

## 1. 兼职销售功能

### 1.1 业务逻辑

兼职销售的佣金计算逻辑：
- **成交额**：销售人员签单金额（项目总金额）
- **公司应收金额**：公司需要收回的款项（含税）
- **应收金额** = 成交额 - 公司应收金额
- **税费** = 应收金额 × 税率
- **税后金额** = 应收金额 - 税费
- **返还佣金** = 税后金额（100%返还给兼职销售）

### 1.2 数据模型

在 `Project` 模型中新增字段：

```javascript
partTimeSales: {
  isPartTime: Boolean,           // 是否为兼职销售项目
  companyReceivable: Number,      // 公司应收金额（含税）
  taxRate: Number,                // 税率（0-1之间，如0.1表示10%）
  partTimeSalesCommission: Number // 兼职销售员佣金（税后部分，自动计算）
}
```

### 1.3 计算公式

```javascript
// 计算应收金额
应收金额 = 成交额 - 公司应收金额

// 计算税费
税费 = 应收金额 × 税率

// 计算税后金额
税后金额 = 应收金额 - 税费

// 返还佣金
返还佣金 = 税后金额
```

### 1.4 KPI计算

兼职销售的KPI值 = 返还佣金

在项目完成时，系统会自动：
1. 计算兼职销售佣金
2. 生成KPI记录（角色：`part_time_sales`）
3. 记录计算详情和公式

---

## 2. 兼职排版功能

### 2.1 业务逻辑

兼职排版的费用管理：
- PM在项目中选择排版员并设置排版费用
- **排版费用不能超过项目总金额的5%**
- 系统自动校验并提示错误

### 2.2 数据模型

在 `Project` 模型中新增字段：

```javascript
partTimeLayout: {
  isPartTime: Boolean,            // 是否为兼职排版项目
  layoutCost: Number,             // 排版费用
  layoutAssignedTo: ObjectId,     // 排版员ID（关联User）
  layoutCostPercentage: Number    // 排版费占总金额的百分比（自动计算）
}
```

### 2.3 校验逻辑

```javascript
排版费用百分比 = (排版费用 / 项目总金额) × 100

限制条件：排版费用百分比 <= 5%
```

### 2.4 KPI计算

兼职排版的KPI值 = 排版费用

在项目完成时，系统会自动：
1. 校验排版费用是否超过5%
2. 生成KPI记录（角色：`layout`）
3. 记录排版费用作为KPI值

---

## 3. 系统实现

### 3.1 模型更新

#### Project模型 (`models/Project.js`)

新增方法：
- `calculatePartTimeSalesCommission()`: 计算兼职销售佣金
- `validateLayoutCost(layoutCost)`: 校验排版费用

新增pre-save钩子：
- 自动计算兼职销售佣金
- 自动计算排版费用百分比

#### KpiRecord模型 (`models/KpiRecord.js`)

新增角色支持：
- `part_time_sales`: 兼职销售
- `layout`: 兼职排版

### 3.2 服务层更新

#### KPI服务 (`services/kpiService.js`)

在以下函数中添加了兼职销售和排版员的KPI计算：
- `generateMonthlyKPIRecords()`: 生成月度KPI记录
- `generateProjectKPI()`: 生成项目KPI记录
- `calculateProjectRealtime()`: 实时计算项目KPI

计算逻辑：
- **兼职销售**：使用 `project.calculatePartTimeSalesCommission()` 计算佣金
- **兼职排版**：直接使用 `project.partTimeLayout.layoutCost` 作为KPI值

### 3.3 路由更新

#### 项目路由 (`routes/projects.js`)

**创建项目** (`POST /api/projects/create`):
- 接收 `partTimeSales` 和 `partTimeLayout` 参数
- 校验排版费用（如果启用）
- 保存兼职销售和排版相关字段

**更新项目** (`PUT /api/projects/:id`):
- 支持更新 `partTimeSales` 和 `partTimeLayout` 字段
- 更新时重新校验排版费用

---

## 4. 使用流程

### 4.1 兼职销售项目流程

1. **创建项目时**：
   - 设置 `partTimeSales.isPartTime = true`
   - 填写 `companyReceivable`（公司应收金额）
   - 填写 `taxRate`（税率，如0.1表示10%）
   - 系统自动计算 `partTimeSalesCommission`

2. **项目完成时**：
   - 系统自动生成兼职销售的KPI记录
   - KPI值 = 计算出的佣金

### 4.2 兼职排版项目流程

1. **创建/编辑项目时**：
   - 设置 `partTimeLayout.isPartTime = true`
   - 选择 `layoutAssignedTo`（排版员）
   - 填写 `layoutCost`（排版费用）
   - 系统自动校验费用是否超过5%

2. **校验失败时**：
   - 返回错误提示
   - 要求PM调整排版费用

3. **项目完成时**：
   - 系统自动生成排版员的KPI记录
   - KPI值 = 排版费用

---

## 5. API接口

### 5.1 创建项目（包含兼职销售/排版）

```javascript
POST /api/projects/create

{
  // ... 其他项目字段
  "partTimeSales": {
    "isPartTime": true,
    "companyReceivable": 10000,  // 公司应收金额
    "taxRate": 0.1                // 税率10%
  },
  "partTimeLayout": {
    "isPartTime": true,
    "layoutCost": 500,           // 排版费用
    "layoutAssignedTo": "userId"  // 排版员ID
  }
}
```

### 5.2 更新项目（包含兼职销售/排版）

```javascript
PUT /api/projects/:id

{
  // ... 其他项目字段
  "partTimeSales": {
    "isPartTime": true,
    "companyReceivable": 10000,
    "taxRate": 0.1
  },
  "partTimeLayout": {
    "isPartTime": true,
    "layoutCost": 500,
    "layoutAssignedTo": "userId"
  }
}
```

---

## 6. 计算示例

### 6.1 兼职销售佣金计算示例

假设：
- 成交额：100,000元
- 公司应收：20,000元
- 税率：10%

计算过程：
1. 应收金额 = 100,000 - 20,000 = 80,000元
2. 税费 = 80,000 × 0.1 = 8,000元
3. 税后金额 = 80,000 - 8,000 = 72,000元
4. 返还佣金 = 72,000元

**兼职销售KPI = 72,000元**

### 6.2 兼职排版费用校验示例

假设：
- 项目总金额：10,000元
- 排版费用：600元

计算：
- 排版费用百分比 = (600 / 10,000) × 100 = 6%

**结果**：超过5%限制，系统返回错误提示

---

## 7. 注意事项

1. **兼职销售**：
   - 佣金在项目保存时自动计算
   - 税率范围：0-1（如0.1表示10%）
   - 佣金不能为负数（自动取0）

2. **兼职排版**：
   - 排版费用必须在创建/更新时校验
   - 超过5%会阻止保存
   - 排版员必须是系统中的有效用户

3. **KPI生成**：
   - 兼职销售和排版员的KPI在项目完成时自动生成
   - 需要将相关人员添加为项目成员（角色分别为 `part_time_sales` 和 `layout`）

---

## 8. 后续开发建议

1. **前端界面**：
   - 在项目创建/编辑表单中添加兼职销售和排版相关字段
   - 实时显示佣金计算结果
   - 实时显示排版费用百分比

2. **财务模块**：
   - 添加兼职销售佣金发放记录
   - 添加排版费用支付记录

3. **报表统计**：
   - 兼职销售佣金统计报表
   - 排版费用统计报表

---

## 9. 测试建议

1. **兼职销售测试**：
   - 测试不同税率下的佣金计算
   - 测试边界情况（税率为0、公司应收等于成交额等）

2. **兼职排版测试**：
   - 测试5%边界值（刚好5%、超过5%）
   - 测试排版员选择功能

3. **KPI生成测试**：
   - 测试项目完成时KPI记录是否正确生成
   - 测试KPI值计算是否正确



