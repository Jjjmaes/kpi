# 客户经理业务逻辑分析与修改方案

## 当前实现分析

### 1. 税率配置问题
**现状：**
- 税率在前端表单中由用户（销售/客户经理）手动填写
- 税率存储在 `Project.partTimeSales.taxRate` 字段中
- 前端表单位置：创建项目/编辑项目时的"客户经理"部分

**问题：**
- 税率应该由后台统一配置，不应该让销售自己填写
- 不同项目可能填写不同的税率，导致不一致

### 2. 营收金额计算问题
**当前计算公式：**
```javascript
// 计算应收金额（成交额 - 公司应收）
const receivableAmount = totalAmount - companyReceivable;

// 计算税后金额（应收金额 - 税费）
const taxDeductedAmount = receivableAmount - (receivableAmount * taxRate);

// 返还给销售的佣金 = 税后金额
commission = taxDeductedAmount;
```

**简化公式：**
```
佣金 = (项目总金额 - 公司应收) * (1 - 税率)
```

**用户需求理解：**
- "营收金额应该是公司应得部分"：`companyReceivable` 就是公司应得的部分
- "不应该是总金额"：不应该从总金额中减去公司应收再计算税费
- **新公式应该是：** `佣金 = 项目总金额 - 公司应收金额`（公司应收就是公司应得部分，直接相减即可）

## 修改方案

### 方案一：简化计算（推荐）
**核心逻辑：**
- 公司应收金额 = 公司应得部分（直接就是公司应收）
- 客户经理佣金 = 项目总金额 - 公司应收金额
- 税率从后台配置读取，但不参与佣金计算（仅用于其他用途，如税费统计）

**优点：**
- 逻辑简单清晰
- 符合用户需求："营收金额应该是公司应得部分"

### 方案二：保留税费计算
**核心逻辑：**
- 公司应收金额 = 公司应得部分
- 客户经理佣金 = (项目总金额 - 公司应收金额) * (1 - 税率)
- 税率从后台配置读取

**优点：**
- 考虑了税费因素
- 更符合财务核算需求

## 推荐方案：方案一（简化计算）

### 修改步骤

#### 1. 在 KpiConfig 模型中添加客户经理税率配置
```javascript
// models/KpiConfig.js
part_time_sales_tax_rate: {
  type: Number,
  default: 0.1,  // 默认10%
  min: 0,
  max: 1
}
```

#### 2. 修改 Project 模型
- 移除 `partTimeSales.taxRate` 字段（不再存储）
- 修改 `calculatePartTimeSalesCommission` 方法：
```javascript
// 简化计算：佣金 = 项目总金额 - 公司应收金额
projectSchema.methods.calculatePartTimeSalesCommission = function() {
  if (!this.partTimeSales?.isPartTime) {
    return 0;
  }
  
  const totalAmount = this.projectAmount || 0;
  const companyReceivable = this.partTimeSales.companyReceivable || 0;
  
  // 佣金 = 项目总金额 - 公司应收金额（公司应收就是公司应得部分）
  const commission = totalAmount - companyReceivable;
  
  return Math.max(0, Math.round(commission * 100) / 100);
};
```

#### 3. 修改前端表单
- 移除税率输入框
- 修改佣金计算公式
- 从系统配置读取税率（如果需要显示税费信息）

#### 4. 修改后端服务
- 创建/更新项目时，不再接收 `taxRate` 参数
- 从 KpiConfig 读取税率（如果需要）

#### 5. 数据迁移
- 对于已有项目，保留 `taxRate` 字段但不使用
- 或者运行迁移脚本移除该字段

## 实施建议

1. **先实施方案一（简化计算）**，因为用户明确说"营收金额应该是公司应得部分"
2. 如果后续需要税费计算，可以再添加税费统计功能（不影响佣金计算）
3. 税率配置保留在后台，用于税费统计或其他用途

## 需要修改的文件清单

1. `models/KpiConfig.js` - 添加税率配置字段
2. `models/Project.js` - 移除 taxRate 字段，修改计算方法
3. `public/js/modules/project.js` - 移除税率输入框，修改计算逻辑
4. `public/app.js` - 移除税率输入框，修改计算逻辑
5. `services/projectService.js` - 移除税率验证和处理
6. `routes/config.js` - 添加税率配置的更新接口
7. `public/js/modules/system.js` - 添加税率配置的显示和编辑

## 注意事项

1. 需要处理已有数据的兼容性
2. 税率配置仅用于税费统计，不参与佣金计算
3. 确保前端和后端计算逻辑一致




