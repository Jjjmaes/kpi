# 收款确认流程优化方案

## 一、业务背景

### 当前问题
- 微信、支付宝等对公转账以外的收款方式，客户直接转给销售
- 销售转给现金保管员，而不是直接转给财务
- 当前流程：只有财务/管理员可以创建回款记录，创建后立即生效

### 业务需求
1. **销售发起**：销售/客户经理可以发起非对公转账的收款记录
2. **收款人确认**：收款人（现金保管员）需要确认收到款项
3. **财务检查**：财务可以查看所有记录，并进行审核/标记

## 二、设计方案

### 2.1 数据模型扩展

#### PaymentRecord 模型新增字段

```javascript
{
  // 现有字段...
  
  // 新增字段
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'approved'],
    default: 'pending', // 待确认
    index: true
  },
  
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    // 发起人（销售/客户经理）
  },
  
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    // 确认人（收款人/现金保管员）
  },
  
  confirmedAt: {
    type: Date,
    // 确认时间
  },
  
  confirmNote: {
    type: String,
    // 确认备注
  },
  
  financeReviewed: {
    type: Boolean,
    default: false,
    // 财务是否已检查
  },
  
  financeReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    // 财务检查人
  },
  
  financeReviewedAt: {
    type: Date,
    // 财务检查时间
  },
  
  financeReviewNote: {
    type: String,
    // 财务检查备注
  }
}
```

### 2.2 状态流转

```
[销售发起] → pending（待确认）
    ↓
[收款人确认] → confirmed（已确认）
    ↓
[财务检查] → approved（已审核，可选）
```

**状态说明：**
- `pending`：销售发起，等待收款人确认
- `confirmed`：收款人已确认收到款项
- `rejected`：收款人拒绝（如金额不符等）
- `approved`：财务已检查（可选，不影响项目回款状态）

### 2.3 权限控制

#### 2.3.1 发起收款（销售/客户经理）
- **角色**：`sales`、`part_time_sales`
- **权限**：可以发起非对公转账（`cash`、`alipay`、`wechat`）的收款记录
- **限制**：只能发起自己负责的项目（项目成员或项目创建人）

#### 2.3.2 确认收款（收款人/现金保管员）
- **角色**：收款人可以是任何用户（不限制角色）
- **权限**：只能确认自己作为收款人的记录
- **操作**：确认/拒绝

#### 2.3.3 财务检查（财务/管理员）
- **角色**：`finance`、`admin`
- **权限**：可以查看所有收款记录，可以标记为"已检查"
- **操作**：查看、标记已检查、添加检查备注

#### 2.3.4 对公转账（财务/管理员）
- **角色**：`finance`、`admin`
- **权限**：对公转账（`bank`）创建后直接生效，无需确认流程

### 2.4 项目回款状态更新逻辑

**关键规则：只有 `confirmed` 状态的收款记录才更新项目回款金额**

```javascript
// 伪代码
if (paymentRecord.status === 'confirmed') {
  // 更新项目累计回款
  project.payment.receivedAmount += paymentRecord.amount;
  // 更新回款状态
  updatePaymentStatus(project);
}
```

**注意：**
- `pending` 状态的记录不影响项目回款状态
- `rejected` 状态的记录不影响项目回款状态
- `confirmed` 状态的记录才计入项目回款
- `approved` 状态只是财务标记，不影响回款金额

### 2.5 通知机制

#### 2.5.1 发起收款时
- 通知收款人：有新的收款记录待确认
- 通知内容：项目编号、金额、发起人、收款方式

#### 2.5.2 确认收款时
- 通知发起人（销售）：收款已确认/拒绝
- 通知财务：有新的收款记录已确认，待检查

#### 2.5.3 财务检查时
- 可选：通知发起人（销售）财务已检查

## 三、API 接口设计

### 3.1 销售发起收款

```
POST /api/finance/payment/:projectId/initiate
权限：sales, part_time_sales
```

**请求体：**
```json
{
  "amount": 10000,
  "receivedAt": "2024-01-15",
  "method": "alipay", // cash, alipay, wechat
  "receivedBy": "userId", // 收款人ID（现金保管员）
  "reference": "转账凭证号",
  "note": "备注"
}
```

**响应：**
```json
{
  "success": true,
  "message": "收款记录已发起，等待收款人确认",
  "data": {
    "paymentRecord": {
      "id": "...",
      "status": "pending",
      "initiatedBy": "salesUserId",
      "receivedBy": "cashKeeperUserId"
    }
  }
}
```

### 3.2 收款人确认/拒绝

```
POST /api/finance/payment/:paymentId/confirm
权限：收款人本人
```

**请求体：**
```json
{
  "action": "confirm", // confirm 或 reject
  "note": "确认备注" // 可选
}
```

**响应：**
```json
{
  "success": true,
  "message": "收款已确认",
  "data": {
    "paymentRecord": {
      "id": "...",
      "status": "confirmed",
      "confirmedBy": "cashKeeperUserId",
      "confirmedAt": "2024-01-15T10:00:00Z"
    },
    "project": {
      "paymentStatus": "partially_paid",
      "receivedAmount": 10000
    }
  }
}
```

### 3.3 财务检查

```
POST /api/finance/payment/:paymentId/review
权限：finance, admin
```

**请求体：**
```json
{
  "reviewed": true,
  "note": "财务检查备注" // 可选
}
```

**响应：**
```json
{
  "success": true,
  "message": "已标记为已检查",
  "data": {
    "paymentRecord": {
      "id": "...",
      "financeReviewed": true,
      "financeReviewedBy": "financeUserId",
      "financeReviewedAt": "2024-01-15T11:00:00Z"
    }
  }
}
```

### 3.4 查询收款记录（支持状态筛选）

```
GET /api/finance/payment/:projectId?status=pending
权限：根据角色和项目权限
```

**查询参数：**
- `status`: pending, confirmed, rejected, approved
- `startDate`: 开始日期
- `endDate`: 结束日期

## 四、前端界面设计

### 4.1 销售发起收款界面

**位置**：项目详情页 → 回款记录区域

**界面元素：**
- 收款方式选择（仅显示：现金、支付宝、微信）
- 金额输入
- 收款日期选择
- 收款人选择（下拉框，显示所有用户）
- 凭证号/备注输入
- "发起收款"按钮

**提示信息：**
- "发起后，收款人需要确认，确认后才会更新项目回款状态"

### 4.2 收款人确认界面

**位置**：个人中心 → 待确认收款 / 通知中心

**界面元素：**
- 收款记录列表（状态：待确认）
- 每条记录显示：项目编号、金额、发起人、收款方式、发起时间
- "确认"按钮
- "拒绝"按钮（可选，带拒绝原因输入）

### 4.3 财务检查界面

**位置**：财务管理 → 回款记录

**界面元素：**
- 收款记录列表（支持状态筛选）
- 状态标签：待确认、已确认、已拒绝、已检查
- 已确认但未检查的记录高亮显示
- "标记为已检查"按钮
- 检查备注输入

### 4.4 回款记录列表显示

**状态标签：**
- 🟡 待确认（pending）
- 🟢 已确认（confirmed）
- 🔴 已拒绝（rejected）
- ✅ 已检查（approved）

**权限控制：**
- 销售：只能看到自己发起的记录
- 收款人：只能看到自己作为收款人的记录
- 财务/管理员：可以看到所有记录

## 五、实施步骤

### 阶段一：数据模型和基础 API
1. 扩展 PaymentRecord 模型
2. 创建数据库迁移脚本
3. 实现基础 API（发起、确认、查询）

### 阶段二：权限和业务逻辑
1. 实现权限控制中间件
2. 实现状态流转逻辑
3. 实现项目回款状态更新逻辑（仅 confirmed 状态）

### 阶段三：前端界面
1. 销售发起收款界面
2. 收款人确认界面
3. 财务检查界面
4. 回款记录列表优化（状态显示）

### 阶段四：通知机制
1. 实现通知创建逻辑
2. 前端通知显示
3. 通知已读/未读状态

### 阶段五：测试和优化
1. 单元测试
2. 集成测试
3. 用户体验优化

## 六、注意事项

### 6.1 向后兼容
- 现有对公转账（`bank`）记录保持原有逻辑，创建后直接生效
- 现有已创建的现金/支付宝/微信记录，默认状态为 `confirmed`（已确认）

### 6.2 数据迁移
- 为现有 PaymentRecord 记录添加默认值：
  - `status`: `confirmed`（已确认）
  - `initiatedBy`: `recordedBy`（记录人）
  - `confirmedBy`: `receivedBy`（收款人，如果有）
  - `confirmedAt`: `createdAt`（创建时间）

### 6.3 权限边界
- 销售只能发起自己负责的项目
- 收款人只能确认自己作为收款人的记录
- 财务可以查看所有记录，但不能修改（除非是管理员）

### 6.4 异常处理
- 如果收款人拒绝，记录状态为 `rejected`，不影响项目回款
- 销售可以查看自己发起的记录状态
- 财务可以查看所有记录，包括被拒绝的记录

## 七、可选扩展

### 7.1 批量确认
- 收款人可以批量确认多条记录

### 7.2 收款凭证上传
- 支持上传收款凭证（截图、转账记录等）

### 7.3 收款统计报表
- 按状态统计收款记录
- 待确认收款提醒

### 7.4 收款流程配置
- 可配置哪些收款方式需要确认流程
- 可配置默认收款人



