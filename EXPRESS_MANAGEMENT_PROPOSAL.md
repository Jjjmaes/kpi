# 快递管理功能技术方案

## 一、功能概述

快递管理模块用于管理公司内部快递申请和发出流程，所有用户可申请，综合岗负责处理。

## 二、数据模型设计

### 2.1 ExpressRequest 模型

```javascript
{
  // 申请编号（自动生成，如 EXP20250101001）
  requestNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    index: true
  },
  
  // 收件人信息
  recipient: {
    name: { type: String, required: true, trim: true },      // 收件人姓名
    phone: { type: String, required: true, trim: true },      // 收件人电话
    address: { type: String, required: true, trim: true },   // 收件地址
    province: { type: String, trim: true },                   // 省份（可选）
    city: { type: String, trim: true },                       // 城市（可选）
    district: { type: String, trim: true },                   // 区县（可选）
    postalCode: { type: String, trim: true }                  // 邮编（可选）
  },
  
  // 邮寄内容
  content: {
    type: {                                                   // 内容类型
      type: String,
      enum: ['promotion', 'document', 'sample', 'other'],
      required: true
    },
    description: { type: String, trim: true },                // 详细描述
    quantity: { type: Number, min: 1, default: 1 },          // 数量
    weight: { type: Number, min: 0 },                        // 重量（kg，可选）
    estimatedValue: { type: Number, min: 0 }                 // 预估价值（元，可选）
  },
  
  // 快递信息（综合岗填写）
  express: {
    company: { type: String, trim: true },                    // 快递公司（顺丰/圆通/中通等）
    trackingNumber: { type: String, trim: true },             // 快递单号
    cost: { type: Number, min: 0 },                          // 快递费用（元）
    sentAt: { type: Date }                                    // 发出时间
  },
  
  // 申请状态
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // 申请人
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // 处理人（综合岗）
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // 处理时间
  processedAt: { type: Date },
  
  // 备注
  note: { type: String, trim: true },
  
  // 取消原因（仅当status为cancelled时）
  cancelReason: { type: String, trim: true },
  
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}
```

### 2.2 状态流转

```
pending（待处理）
  ↓ [综合岗接单]
processing（处理中）
  ↓ [综合岗填写快递信息并点击"已发出"]
sent（已发出）
  
pending/processing
  ↓ [申请人取消]
cancelled（已取消）
```

## 三、API 接口设计

### 3.1 创建快递申请
- **路径**: `POST /api/express`
- **权限**: 所有已登录用户
- **请求体**:
```json
{
  "recipient": {
    "name": "张三",
    "phone": "13800138000",
    "address": "北京市朝阳区xxx街道xxx号",
    "province": "北京市",
    "city": "北京市",
    "district": "朝阳区",
    "postalCode": "100000"
  },
  "content": {
    "type": "promotion",
    "description": "公司宣传册10本",
    "quantity": 10,
    "weight": 0.5,
    "estimatedValue": 50
  },
  "note": "请尽快发出"
}
```

### 3.2 获取快递申请列表
- **路径**: `GET /api/express`
- **权限**: 
  - 普通用户：只能查看自己申请的
  - 综合岗：可查看所有申请
- **查询参数**:
  - `status`: 状态筛选（pending/processing/sent/cancelled）
  - `createdBy`: 申请人ID（仅综合岗可用）
  - `page`: 页码
  - `pageSize`: 每页数量

### 3.3 获取单个快递申请详情
- **路径**: `GET /api/express/:id`
- **权限**: 申请人本人或综合岗

### 3.4 更新快递申请（综合岗处理）
- **路径**: `PUT /api/express/:id`
- **权限**: 综合岗
- **请求体**:
```json
{
  "status": "processing",  // 或 "sent"
  "express": {
    "company": "顺丰",
    "trackingNumber": "SF1234567890",
    "cost": 15.00,
    "sentAt": "2025-01-15T10:30:00Z"
  },
  "note": "已发出"
}
```

### 3.5 取消快递申请
- **路径**: `POST /api/express/:id/cancel`
- **权限**: 申请人本人（仅pending/processing状态可取消）
- **请求体**:
```json
{
  "cancelReason": "地址有误，需要重新申请"
}
```

### 3.6 获取待处理数量（综合岗）
- **路径**: `GET /api/express/pending/count`
- **权限**: 综合岗

## 四、前端页面设计

### 4.1 导航入口（推荐方案）

#### 方案一：主导航栏独立入口（推荐）
- **位置**：在主导航栏添加"快递管理"按钮（位于"KPI查询"和"财务管理"之间）
- **可见性**：所有已登录用户可见
- **徽章显示**：
  - 综合岗：显示待处理申请数量（红色徽章）
  - 普通用户：显示自己的待处理申请数量（可选，蓝色徽章）
- **代码位置**：`public/index.html` 第64-75行导航栏区域

```html
<button data-click="showSection('express')">快递管理
  <span id="expressBadge" class="nav-badge" style="display:none;">0</span>
</button>
```

#### 方案二：个人中心快捷入口（辅助）
- **位置**：在个人中心页面添加快递申请卡片
- **内容**：
  - 显示"我的快递申请"卡片
  - 显示申请数量统计（待处理/处理中/已发出）
  - 提供"新建申请"按钮
- **代码位置**：`public/js/modules/user.js` 的 `loadProfile` 函数中

#### 方案三：业务看板卡片（可选）
- **位置**：在业务看板添加快递管理卡片
- **内容**：
  - 综合岗：显示"待处理快递申请"卡片，点击进入管理页面
  - 普通用户：显示"我的快递申请"卡片，显示最近申请状态
- **代码位置**：`public/js/modules/dashboard.js` 的 `renderDashboardCards` 函数中

### 4.2 页面结构
- **主页面ID**：`express`（与导航按钮对应）
- **页面位置**：`public/index.html` 中与其他 section 同级
- **标签页设计**：
  - 普通用户：只显示"我的申请"标签页
  - 综合岗：显示"申请管理"和"我的申请"两个标签页

### 4.3 申请列表页面布局

#### 页面结构
```html
<div id="express" class="section">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <h2>快递管理</h2>
    <button class="btn-primary" data-click="showCreateExpressModal()">新建申请</button>
  </div>
  
  <!-- 标签页切换（综合岗显示两个标签） -->
  <div class="tabs">
    <button class="tab active" data-click="switchExpressTab('my')">我的申请</button>
    <button class="tab" data-click="switchExpressTab('manage')" id="expressManageTab" style="display:none;">
      申请管理
      <span id="expressPendingBadge" class="badge badge-danger" style="display:none;">0</span>
    </button>
  </div>
  
  <!-- 筛选区域 -->
  <div class="card" style="margin-bottom:16px;">
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <select id="expressStatusFilter" data-change="loadExpressList()">
        <option value="">全部状态</option>
        <option value="pending">待处理</option>
        <option value="processing">处理中</option>
        <option value="sent">已发出</option>
        <option value="cancelled">已取消</option>
      </select>
      <!-- 综合岗在"申请管理"标签下显示申请人筛选 -->
      <select id="expressCreatedByFilter" data-change="loadExpressList()" style="display:none;">
        <option value="">全部申请人</option>
      </select>
      <input type="date" id="expressStartDate" placeholder="开始日期" data-change="loadExpressList()">
      <input type="date" id="expressEndDate" placeholder="结束日期" data-change="loadExpressList()">
      <button data-click="loadExpressList()">刷新</button>
    </div>
  </div>
  
  <!-- 列表区域 -->
  <div id="expressList"></div>
</div>
```

#### 功能说明
- **我的申请**（所有用户）：
  - 显示自己申请的所有快递
  - 支持按状态、日期范围筛选
  - 列表显示：申请编号、收件人、内容类型、状态、申请时间
  - 操作：查看详情、取消申请（仅pending/processing状态）
  
- **申请管理**（综合岗）：
  - 显示所有申请
  - 支持按状态、申请人、日期范围筛选
  - 列表显示：申请编号、申请人、收件人、内容类型、状态、申请时间
  - 操作：查看详情、接单（pending→processing）、已发出（processing→sent）

### 4.4 入口位置总结

**推荐实现顺序**：
1. ✅ **主导航栏入口**（必须）：所有用户最直接的访问入口
2. ✅ **个人中心快捷入口**（推荐）：方便用户快速申请
3. ⚪ **业务看板卡片**（可选）：提供数据概览

**入口访问路径**：
- 主导航栏 → "快递管理"按钮 → 快递管理页面
- 个人中心 → "我的快递申请"卡片 → 快递管理页面
- 业务看板 → "快递申请"卡片（可选）→ 快递管理页面

### 4.5 申请表单
- **收件人信息**：
  - 姓名*（必填）
  - 电话*（必填）
  - 地址*（必填，支持省市区选择或手动输入）
  - 邮编（可选）
  
- **邮寄内容**：
  - 内容类型*（下拉选择：促销品/文件/样品/其他）
  - 详细描述*（必填）
  - 数量*（默认1）
  - 重量（可选，kg）
  - 预估价值（可选，元）
  
- **备注**（可选）

### 4.4 详情/处理页面
- 显示申请信息（只读）
- 综合岗可填写快递信息：
  - 快递公司（下拉选择：顺丰/圆通/中通/申通/韵达/其他）
  - 快递单号*（必填）
  - 快递费用（可选）
  - 发出时间（自动填充当前时间，可修改）
- 操作按钮：
  - 综合岗：接单（pending→processing）、已发出（processing→sent）
  - 申请人：取消申请（pending/processing→cancelled）

## 五、权限控制

### 5.1 后端权限检查
```javascript
// 创建申请：所有已登录用户
router.post('/', authenticate, asyncHandler(...));

// 查看列表：自己或综合岗
if (!isAdminStaff(req) && req.user._id.toString() !== createdBy.toString()) {
  throw new AppError('无权查看', 403);
}

// 处理申请：仅综合岗
router.put('/:id', authenticate, authorize('admin_staff'), asyncHandler(...));
```

### 5.2 前端权限控制
- 使用 `hasPermission` 或角色检查
- 综合岗显示"申请管理"标签页
- 普通用户只显示"我的申请"标签页

## 六、功能特性

### 6.1 自动编号生成
- 格式：`EXP` + `YYYYMMDD` + `001`（当日序号）
- 例如：`EXP20250115001`

### 6.2 通知功能
- 申请创建：通知综合岗（如有待处理申请）
- 状态变更：通知申请人
- 使用现有的通知系统

### 6.3 数据统计（可选）
- 综合岗可查看：
  - 本月申请数量
  - 各状态分布
  - 快递费用统计
  - 内容类型分布

## 七、数据库索引

```javascript
expressRequestSchema.index({ status: 1, createdAt: -1 });
expressRequestSchema.index({ createdBy: 1, status: 1 });
expressRequestSchema.index({ requestNumber: 1 });
expressRequestSchema.index({ 'express.trackingNumber': 1 });
expressRequestSchema.index({ 'recipient.phone': 1 });
```

## 八、实现步骤

1. **数据模型**：创建 `models/ExpressRequest.js`
2. **API路由**：创建 `routes/express.js`，注册到 `server.js`
3. **前端模块**：创建 `public/js/modules/express.js`
4. **页面UI**：在 `public/index.html` 添加快递管理页面
5. **导航集成**：在主导航添加入口
6. **通知集成**：添加状态变更通知
7. **测试**：编写测试用例

## 九、扩展建议

1. **快递公司管理**：可配置常用快递公司列表
2. **地址簿**：保存常用收件地址
3. **批量处理**：综合岗可批量标记已发出
4. **导出功能**：导出快递申请列表（Excel）
5. **快递跟踪**：集成快递API查询物流信息
6. **费用统计**：按月份/季度统计快递费用

## 十、注意事项

1. 收件人信息敏感，注意数据脱敏（如非必要不显示完整地址）
2. 取消申请需填写原因，便于追溯
3. 快递单号需唯一性校验（可选）
4. 状态变更记录操作日志（可选）
5. 考虑数据保留策略（已发出超过一定时间的记录可归档）

