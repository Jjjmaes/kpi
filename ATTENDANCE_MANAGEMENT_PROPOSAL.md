# 考勤管理功能实现方案

## 一、功能概述

为综合岗（admin_staff）提供考勤管理功能，用于管理所有专职人员的考勤记录、统计和审批。

### 1.1 考核对象
- **专职人员**：`employmentType === 'full_time'` 的所有用户
- **包含角色**：admin、finance、pm、sales、translator、reviewer、layout、admin_staff
- **排除角色**：part_time_sales、part_time_translator（兼职人员不参与考勤）

### 1.2 功能模块
1. **考勤记录管理**：打卡记录、请假申请、加班申请、补卡申请
2. **考勤统计**：个人考勤统计、部门/角色统计、月度/年度报表
3. **考勤审批**：请假审批、加班审批、补卡审批
4. **考勤设置**：工作日设置、考勤规则配置（上班时间、下班时间、迟到/早退阈值等）

---

## 二、数据模型设计

### 2.1 考勤记录表（AttendanceRecord）

```javascript
{
  userId: ObjectId,           // 用户ID
  date: Date,                 // 考勤日期（YYYY-MM-DD）
  checkInTime: Date,          // 上班打卡时间
  checkOutTime: Date,         // 下班打卡时间
  status: String,             // 考勤状态：normal（正常）、late（迟到）、early_leave（早退）、absent（缺勤）、leave（请假）、overtime（加班）
  workHours: Number,          // 实际工作小时数
  lateMinutes: Number,        // 迟到分钟数（0表示未迟到）
  earlyLeaveMinutes: Number,  // 早退分钟数（0表示未早退）
  location: String,           // 打卡地点（可选，用于定位打卡）
  note: String,              // 备注
  createdBy: ObjectId,        // 创建人（系统自动或管理员）
  createdAt: Date,            // 创建时间
  updatedAt: Date            // 更新时间
}
```

**索引**：
- `{ userId: 1, date: 1 }` - 唯一索引，确保每人每天只有一条记录
- `{ date: 1 }` - 按日期查询
- `{ userId: 1, date: -1 }` - 按用户和日期查询

### 2.2 请假申请表（LeaveRequest）

```javascript
{
  requestNumber: String,       // 申请编号（自动生成，如：LEAVE-20240101-001）
  userId: ObjectId,           // 申请人
  leaveType: String,          // 请假类型：annual（年假）、sick（病假）、personal（事假）、marriage（婚假）、maternity（产假）、paternity（陪产假）、bereavement（丧假）、other（其他）
  startDate: Date,           // 开始日期
  endDate: Date,             // 结束日期
  startTime: String,         // 开始时间（可选，如：09:00，用于半天假）
  endTime: String,           // 结束时间（可选，如：12:00，用于半天假）
  days: Number,              // 请假天数（自动计算）
  reason: String,            // 请假原因
  status: String,            // 状态：pending（待审批）、approved（已批准）、rejected（已拒绝）、cancelled（已取消）
  approvedBy: ObjectId,     // 审批人（综合岗）
  approvedAt: Date,          // 审批时间
  rejectReason: String,      // 拒绝原因
  attachments: [String],     // 附件URL（如病假条等）
  createdAt: Date,           // 创建时间
  updatedAt: Date           // 更新时间
}
```

**索引**：
- `{ requestNumber: 1 }` - 唯一索引
- `{ userId: 1, createdAt: -1 }` - 按用户查询
- `{ status: 1, createdAt: -1 }` - 按状态查询（待审批列表）

### 2.3 加班申请表（OvertimeRequest）

```javascript
{
  requestNumber: String,       // 申请编号（自动生成）
  userId: ObjectId,           // 申请人
  date: Date,                 // 加班日期
  startTime: Date,            // 开始时间
  endTime: Date,              // 结束时间
  hours: Number,              // 加班小时数（自动计算）
  reason: String,             // 加班原因
  status: String,             // 状态：pending、approved、rejected、cancelled
  approvedBy: ObjectId,       // 审批人（综合岗）
  approvedAt: Date,          // 审批时间
  rejectReason: String,      // 拒绝原因
  createdAt: Date,            // 创建时间
  updatedAt: Date            // 更新时间
}
```

### 2.4 补卡申请表（CheckInCorrectionRequest）

```javascript
{
  requestNumber: String,       // 申请编号
  userId: ObjectId,           // 申请人
  date: Date,                 // 补卡日期
  type: String,               // 类型：check_in（补上班卡）、check_out（补下班卡）、both（补全天）
  correctTime: Date,          // 正确时间
  reason: String,             // 补卡原因
  status: String,             // 状态：pending、approved、rejected、cancelled
  approvedBy: ObjectId,       // 审批人（综合岗）
  approvedAt: Date,          // 审批时间
  rejectReason: String,       // 拒绝原因
  createdAt: Date,            // 创建时间
  updatedAt: Date            // 更新时间
}
```

### 2.5 考勤设置表（AttendanceSettings）

```javascript
{
  workStartTime: String,      // 上班时间（如：09:00）
  workEndTime: String,         // 下班时间（如：18:00）
  lateThreshold: Number,      // 迟到阈值（分钟，如：15）
  earlyLeaveThreshold: Number, // 早退阈值（分钟，如：15）
  workDays: [Number],          // 工作日（0=周日，1=周一，...，6=周六，如：[1,2,3,4,5]）
  workHoursPerDay: Number,     // 每日标准工作小时数（如：8）
  enableLocationCheck: Boolean, // 是否启用位置打卡
  locationRange: Number,       // 位置范围（米，如：500）
  updatedBy: ObjectId,        // 最后更新人
  updatedAt: Date            // 最后更新时间
}
```

**说明**：此表为单例表，只保存一条记录。

---

## 三、功能模块详细设计

### 3.1 考勤记录管理

#### 3.1.1 打卡功能
- **前端**：打卡按钮（上班打卡/下班打卡）
- **后端**：
  - `POST /api/attendance/checkin` - 上班打卡
  - `POST /api/attendance/checkout` - 下班打卡
  - 自动计算迟到/早退
  - 自动更新考勤状态

#### 3.1.2 考勤记录列表
- **综合岗视角**：
  - 查看所有专职人员的考勤记录
  - 支持按用户、日期范围、状态筛选
  - 支持批量导出
- **个人视角**：
  - 查看自己的考勤记录
  - 支持按月查看

#### 3.1.3 考勤记录编辑
- **权限**：仅综合岗可编辑
- **功能**：修改打卡时间、状态、备注等

### 3.2 请假管理

#### 3.2.1 请假申请
- **申请人**：所有专职人员
- **流程**：
  1. 填写请假表单（类型、日期、原因等）
  2. 提交申请
  3. 综合岗审批
  4. 审批通过后自动更新考勤记录

#### 3.2.2 请假审批
- **审批人**：综合岗
- **功能**：
  - 查看待审批列表
  - 批准/拒绝申请
  - 填写审批意见

#### 3.2.3 请假统计
- 个人请假统计（年假余额、已用天数等）
- 部门/角色请假统计

### 3.3 加班管理

#### 3.3.1 加班申请
- **申请人**：所有专职人员
- **流程**：申请 → 审批 → 记录到考勤

#### 3.3.2 加班审批
- **审批人**：综合岗
- **功能**：批准/拒绝加班申请

### 3.4 补卡管理

#### 3.4.1 补卡申请
- **申请人**：所有专职人员
- **场景**：忘记打卡、打卡失败等
- **流程**：申请 → 审批 → 更新考勤记录

#### 3.4.2 补卡审批
- **审批人**：综合岗

### 3.5 考勤统计

#### 3.5.1 个人考勤统计
- **查看人**：本人、综合岗、管理员
- **统计项**：
  - 出勤天数
  - 迟到次数/时长
  - 早退次数/时长
  - 缺勤天数
  - 请假天数（按类型）
  - 加班小时数
  - 实际工作小时数

#### 3.5.2 部门/角色统计
- **查看人**：综合岗、管理员
- **统计项**：
  - 按角色/部门统计出勤率
  - 迟到/早退排行榜
  - 请假统计
  - 加班统计

#### 3.5.3 月度/年度报表
- 生成月度考勤报表
- 生成年度考勤报表
- 支持导出Excel

### 3.6 考勤设置

#### 3.6.1 考勤规则设置
- **权限**：仅综合岗、管理员
- **设置项**：
  - 上班时间
  - 下班时间
  - 迟到/早退阈值
  - 工作日设置
  - 每日标准工作小时数

#### 3.6.2 节假日设置
- 设置法定节假日
- 设置调休工作日

---

## 四、前端界面设计

### 4.1 导航菜单
- 在综合岗导航中添加"考勤管理"按钮
- 显示待审批数量徽章

### 4.2 主要页面

#### 4.2.1 考勤记录页面
- **标签页**：
  - "我的考勤"（个人视角）
  - "考勤管理"（综合岗视角）
- **功能**：
  - 打卡按钮（上班/下班）
  - 考勤记录列表（日历视图/列表视图）
  - 筛选器（日期范围、用户、状态）
  - 导出按钮

#### 4.2.2 请假管理页面
- **标签页**：
  - "我的申请"（个人视角）
  - "待审批"（综合岗视角）
- **功能**：
  - 新建请假申请
  - 请假记录列表
  - 审批操作

#### 4.2.3 加班管理页面
- 类似请假管理页面结构

#### 4.2.4 补卡管理页面
- 类似请假管理页面结构

#### 4.2.5 考勤统计页面
- **标签页**：
  - "我的统计"（个人视角）
  - "全员统计"（综合岗视角）
- **功能**：
  - 统计图表（出勤率、迟到率等）
  - 统计表格
  - 导出报表

#### 4.2.6 考勤设置页面
- **权限**：仅综合岗、管理员可见
- **功能**：
  - 考勤规则设置表单
  - 节假日设置（日历选择）

---

## 五、后端API设计

### 5.1 考勤记录API

```
GET    /api/attendance/records              # 获取考勤记录列表
POST   /api/attendance/checkin              # 上班打卡
POST   /api/attendance/checkout             # 下班打卡
GET    /api/attendance/records/:id          # 获取单条考勤记录
PUT    /api/attendance/records/:id           # 更新考勤记录（仅综合岗）
DELETE /api/attendance/records/:id           # 删除考勤记录（仅综合岗）
GET    /api/attendance/statistics           # 获取考勤统计
GET    /api/attendance/export               # 导出考勤记录
```

### 5.2 请假管理API

```
GET    /api/attendance/leaves                # 获取请假记录列表
POST   /api/attendance/leaves                # 创建请假申请
GET    /api/attendance/leaves/:id            # 获取请假详情
PUT    /api/attendance/leaves/:id/approve    # 批准请假
PUT    /api/attendance/leaves/:id/reject     # 拒绝请假
PUT    /api/attendance/leaves/:id/cancel     # 取消请假
GET    /api/attendance/leaves/pending/count  # 获取待审批数量
```

### 5.3 加班管理API

```
GET    /api/attendance/overtimes             # 获取加班记录列表
POST   /api/attendance/overtimes              # 创建加班申请
GET    /api/attendance/overtimes/:id         # 获取加班详情
PUT    /api/attendance/overtimes/:id/approve  # 批准加班
PUT    /api/attendance/overtimes/:id/reject   # 拒绝加班
PUT    /api/attendance/overtimes/:id/cancel   # 取消加班
```

### 5.4 补卡管理API

```
GET    /api/attendance/corrections           # 获取补卡记录列表
POST   /api/attendance/corrections           # 创建补卡申请
GET    /api/attendance/corrections/:id       # 获取补卡详情
PUT    /api/attendance/corrections/:id/approve  # 批准补卡
PUT    /api/attendance/corrections/:id/reject    # 拒绝补卡
```

### 5.5 考勤设置API

```
GET    /api/attendance/settings              # 获取考勤设置
PUT    /api/attendance/settings              # 更新考勤设置（仅综合岗、管理员）
GET    /api/attendance/holidays             # 获取节假日列表
POST   /api/attendance/holidays             # 添加节假日
DELETE /api/attendance/holidays/:id         # 删除节假日
```

---

## 六、权限控制

### 6.1 角色权限

| 功能 | 综合岗 | 管理员 | 其他专职人员 |
|------|--------|--------|------------|
| 查看自己的考勤 | ✅ | ✅ | ✅ |
| 查看所有人的考勤 | ✅ | ✅ | ❌ |
| 编辑考勤记录 | ✅ | ✅ | ❌ |
| 请假申请 | ✅ | ✅ | ✅ |
| 请假审批 | ✅ | ✅ | ❌ |
| 加班申请 | ✅ | ✅ | ✅ |
| 加班审批 | ✅ | ✅ | ❌ |
| 补卡申请 | ✅ | ✅ | ✅ |
| 补卡审批 | ✅ | ✅ | ❌ |
| 查看统计 | ✅ | ✅ | 仅自己 |
| 考勤设置 | ✅ | ✅ | ❌ |

### 6.2 数据过滤
- 个人视角：只能查看自己的数据
- 综合岗视角：可以查看所有专职人员的数据
- 管理员视角：可以查看所有数据

---

## 七、实现步骤

### 阶段一：基础功能（优先级：高）
1. 创建数据模型（AttendanceRecord、LeaveRequest、OvertimeRequest、CheckInCorrectionRequest、AttendanceSettings）
2. 实现打卡功能（上班打卡、下班打卡）
3. 实现考勤记录列表（个人视角、综合岗视角）
4. 实现考勤记录编辑（综合岗）

### 阶段二：请假管理（优先级：高）
1. 实现请假申请功能
2. 实现请假审批功能
3. 实现请假统计

### 阶段三：加班和补卡（优先级：中）
1. 实现加班申请和审批
2. 实现补卡申请和审批

### 阶段四：统计和报表（优先级：中）
1. 实现个人考勤统计
2. 实现全员考勤统计
3. 实现月度/年度报表导出

### 阶段五：设置和优化（优先级：低）
1. 实现考勤规则设置
2. 实现节假日设置
3. 优化用户体验（日历视图、图表展示等）

---

## 八、技术实现要点

### 8.1 打卡时间计算
- 自动计算迟到/早退分钟数
- 自动计算实际工作小时数
- 考虑午休时间（如：12:00-13:00）

### 8.2 请假天数计算
- 支持全天假和半天假
- 自动排除节假日和周末
- 支持跨月请假

### 8.3 考勤状态自动更新
- 打卡后自动更新状态
- 请假审批通过后自动更新考勤记录
- 补卡审批通过后自动更新考勤记录

### 8.4 通知机制
- 请假/加班/补卡申请提交后通知综合岗
- 审批结果通知申请人

### 8.5 数据导出
- 支持导出Excel格式的考勤记录
- 支持导出考勤统计报表

---

## 九、数据库索引优化

```javascript
// AttendanceRecord
{ userId: 1, date: 1 }           // 唯一索引
{ date: 1 }                      // 按日期查询
{ userId: 1, date: -1 }          // 按用户和日期查询
{ status: 1, date: 1 }           // 按状态和日期查询

// LeaveRequest
{ requestNumber: 1 }            // 唯一索引
{ userId: 1, createdAt: -1 }     // 按用户查询
{ status: 1, createdAt: -1 }    // 待审批列表
{ startDate: 1, endDate: 1 }     // 按日期范围查询

// OvertimeRequest
{ requestNumber: 1 }            // 唯一索引
{ userId: 1, createdAt: -1 }     // 按用户查询
{ status: 1, createdAt: -1 }    // 待审批列表

// CheckInCorrectionRequest
{ requestNumber: 1 }            // 唯一索引
{ userId: 1, createdAt: -1 }     // 按用户查询
{ status: 1, createdAt: -1 }    // 待审批列表
```

---

## 十、注意事项

1. **数据一致性**：确保考勤记录与请假/加班/补卡申请数据一致
2. **时区处理**：所有时间使用服务器时区，前端显示时转换为用户本地时区
3. **并发控制**：打卡时防止重复提交（使用唯一索引）
4. **历史数据**：考勤记录一旦生成，修改需要审批流程
5. **数据备份**：考勤数据涉及薪资计算，需要定期备份
6. **隐私保护**：考勤数据仅相关人员可见，需要严格的权限控制

---

## 十一、扩展功能（可选）

1. **位置打卡**：使用GPS定位，确保在指定范围内打卡
2. **人脸识别打卡**：集成人脸识别API，防止代打卡
3. **考勤异常提醒**：自动检测异常考勤（如连续迟到、缺勤等）并提醒
4. **考勤数据分析**：提供更丰富的数据分析图表和趋势预测
5. **移动端支持**：开发移动端打卡应用

---

## 十二、文件结构

```
models/
  AttendanceRecord.js
  LeaveRequest.js
  OvertimeRequest.js
  CheckInCorrectionRequest.js
  AttendanceSettings.js

routes/
  attendance.js

public/js/modules/
  attendance.js

public/index.html
  - 添加"考勤管理"导航按钮
  - 添加考勤管理相关页面结构
```

---

## 总结

本方案提供了完整的考勤管理功能设计，包括数据模型、功能模块、API设计、权限控制等。实现时建议按阶段逐步推进，优先实现基础打卡和请假管理功能，再逐步完善其他功能。

