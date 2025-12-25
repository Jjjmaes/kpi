# 项目完整状态流转文档

## 一、项目状态定义

### 1.1 所有状态列表

**方案A：使用现有状态（推荐，向后兼容）**

```javascript
enum: [
  'pending',            // 待开始（销售创建项目后）
  'scheduled',          // 待安排/待确认（PM添加成员中，或等待成员确认）
  'in_progress',        // 进行中（所有成员已接受，项目开始执行）
  'translation_done',   // 翻译完成
  'review_done',        // 审校完成
  'layout_done',        // 排版完成
  'completed',          // 已完成（进入KPI计算）
  'cancelled'           // 已取消
]
```

**说明**：使用 `scheduled` 状态，通过 `memberAcceptance.pendingCount > 0` 判断是否需要成员确认。

**方案B：新增状态（更清晰，但需要数据库迁移）**

```javascript
enum: [
  'pending',            // 待开始（销售创建项目后）
  'scheduled',          // 待安排（PM正在添加成员）
  'waiting_confirmation', // 待确认（已添加成员，等待成员接受/拒绝）
  'in_progress',        // 进行中（所有成员已接受，项目开始执行）
  'translation_done',   // 翻译完成
  'review_done',        // 审校完成
  'layout_done',        // 排版完成
  'completed',          // 已完成（进入KPI计算）
  'cancelled'           // 已取消
]
```

**说明**：新增 `waiting_confirmation` 状态，更清晰地区分"待安排"和"待确认"。

**推荐使用方案A**，因为：
1. 向后兼容，不需要修改现有数据
2. 通过 `memberAcceptance.pendingCount` 可以明确区分状态
3. 减少状态数量，逻辑更简单

### 1.2 状态说明

| 状态 | 说明 | 判断条件 | 可操作角色 | 下一步状态 |
|------|------|---------|-----------|-----------|
| `pending` | 销售刚创建项目，等待PM接手 | - | 销售、管理员 | `scheduled` |
| `scheduled` | 待安排/待确认 | `pendingCount = 0`：PM正在添加成员<br>`pendingCount > 0`：等待成员确认 | PM、生产人员、管理员 | `in_progress` 或 `scheduled` |
| `in_progress` | 所有成员已确认，项目开始执行 | `pendingCount = 0` 且所有生产人员已接受 | PM、翻译、审校、排版、管理员 | `translation_done` |
| `translation_done` | 翻译环节完成 | - | PM、审校、管理员 | `review_done` |
| `review_done` | 审校环节完成 | - | PM、排版、管理员 | `layout_done` 或 `completed` |
| `layout_done` | 排版环节完成（如有） | - | PM、管理员 | `completed` |
| `completed` | 项目完成，KPI已计算 | - | 无（只读） | - |
| `cancelled` | 项目已取消 | - | 销售、管理员 | - |

---

## 二、完整状态流转图

```
┌─────────────────────────────────────────────────────────────┐
│ 阶段1：项目创建                                              │
└─────────────────────────────────────────────────────────────┘
销售创建项目
   ↓
状态：pending（待开始）
   ↓
[销售点击"开始项目" 或 PM添加成员]
   ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段2：成员安排                                              │
└─────────────────────────────────────────────────────────────┘
状态：scheduled（待安排）
   ↓
PM添加生产人员（翻译/审校/排版）
   ↓
状态：scheduled（待确认，pendingCount > 0）
   ↓
成员收到通知，查看项目详情
   ↓
┌─────────────────────────────────────────────────────────────┐
│ 分支A：成员接受                                              │
└─────────────────────────────────────────────────────────────┘
成员点击"接受"
   ↓
检查：是否所有生产人员都已接受？
   ├─ 是 → 状态：in_progress（进行中）
   └─ 否 → 状态：scheduled（继续等待，pendingCount > 0）
   ↓
┌─────────────────────────────────────────────────────────────┐
│ 分支B：成员拒绝                                              │
└─────────────────────────────────────────────────────────────┘
成员点击"拒绝"（可填写原因）
   ↓
状态：scheduled（待安排，pendingCount 可能 > 0，等待重新安排）
   ↓
PM收到拒绝通知
   ↓
PM删除拒绝的成员，添加新成员
   ↓
状态：scheduled（新成员需要确认，pendingCount > 0）
   ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段3：项目执行                                              │
└─────────────────────────────────────────────────────────────┘
状态：in_progress（进行中）
   ↓
翻译执行工作
   ↓
[翻译或PM标记] 状态：translation_done（翻译完成）
   ↓
审校执行工作
   ↓
[审校或PM标记] 状态：review_done（审校完成）
   ↓
排版执行工作（如有）
   ↓
[排版或PM标记] 状态：layout_done（排版完成）
   ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段4：项目完成                                              │
└─────────────────────────────────────────────────────────────┘
PM点击"项目完成"
   ↓
系统检查：
   - ✅ 是否有成员
   - ✅ 项目金额是否填写
   - ✅ 质量信息是否填写（可选）
   ↓
状态：completed（已完成）
   ↓
系统自动计算KPI
   ↓
生成KPI记录
```

---

## 三、详细流程说明

### 3.1 阶段1：销售创建项目

**触发条件**：销售在系统中创建新项目

**操作**：
1. 填写项目基本信息（名称、客户、金额、交付时间等）
2. 系统自动锁定KPI系数到 `locked_ratios`
3. 可选择添加成员（PM、销售等，但不添加生产人员）

**状态变更**：
- 创建后：`status = 'pending'`
- `startedAt = null`
- `memberAcceptance = null`（尚未需要确认）

**下一步**：
- 方式1：销售点击"开始项目"按钮 → 状态变为 `scheduled`
- 方式2：PM直接添加成员 → 状态变为 `scheduled`

---

### 3.2 阶段2：PM添加成员

#### 2.1 添加非生产人员（PM、销售、综合岗）

**触发条件**：PM在项目详情页添加成员

**操作**：
- 添加PM、销售、综合岗等管理角色
- 这些角色**不需要确认**，自动接受

**状态变更**：
- 如果项目是 `pending` → 变为 `scheduled`，`pendingCount = 0`
- 如果项目是 `scheduled` → 保持 `scheduled`，`pendingCount` 不变
- 成员 `acceptanceStatus = 'accepted'`（自动）
- `memberAcceptance.acceptedCount += 1`

#### 2.2 添加生产人员（翻译、审校、排版）

**触发条件**：PM在项目详情页添加生产人员

**操作**：
- 添加翻译、审校、排版、兼职翻译等生产角色
- 这些角色**需要确认**

**状态变更**：
- 如果项目是 `pending` → 变为 `scheduled`
- 如果项目是 `scheduled` → 保持 `scheduled`（通过 `pendingCount > 0` 表示待确认）
- 成员 `acceptanceStatus = 'pending'`
- `memberAcceptance.pendingCount += 1`
- `memberAcceptance.requiresConfirmation = true`
- 发送通知给成员："您已被分配到项目XXX，请确认是否接受"

**判断逻辑**：
```javascript
// 添加成员后，判断项目状态
if (project.status === 'pending') {
  project.status = 'scheduled';
}
// scheduled 状态通过 pendingCount > 0 判断是否需要确认
// 前端显示时：如果 pendingCount > 0，显示"待确认"；否则显示"待安排"
```

---

### 3.3 阶段3：成员确认

#### 3.3.1 成员接受项目

**触发条件**：生产人员点击"接受"按钮

**操作**：
1. 成员查看项目详情
2. 点击"接受"按钮
3. 系统更新成员状态

**状态变更**：
- 成员 `acceptanceStatus = 'accepted'`
- 成员 `acceptanceAt = 当前时间`
- `memberAcceptance.pendingCount -= 1`
- `memberAcceptance.acceptedCount += 1`
- 发送通知给项目经理："XXX已接受项目XXX"

**检查是否所有成员都已接受**：
```javascript
// 查询所有生产人员
const productionMembers = await ProjectMember.find({
  projectId: projectId,
  role: { $in: ['translator', 'reviewer', 'layout', 'part_time_translator'] }
});

// 检查是否全部接受
const allAccepted = productionMembers.every(m => 
  m.acceptanceStatus === 'accepted'
);

if (allAccepted && project.memberAcceptance.pendingCount === 0) {
  // 所有成员都已接受，项目可以开始
  project.status = 'in_progress';
  project.startedAt = project.startedAt || new Date();
  project.memberAcceptance.allConfirmed = true;
} else {
  // 还有成员未确认，保持 scheduled（pendingCount > 0）
  project.status = 'scheduled';
}
```

#### 3.3.2 成员拒绝项目

**触发条件**：生产人员点击"拒绝"按钮

**操作**：
1. 成员查看项目详情
2. 点击"拒绝"按钮
3. 可选填写拒绝原因
4. 系统更新成员状态

**状态变更**：
- 成员 `acceptanceStatus = 'rejected'`
- 成员 `acceptanceAt = 当前时间`
- 成员 `rejectionReason = 用户填写的原因`
- `memberAcceptance.pendingCount -= 1`
- `memberAcceptance.rejectedCount += 1`
- `memberAcceptance.allConfirmed = false`
- 项目状态：保持 `scheduled`（等待重新安排，pendingCount 可能仍 > 0）
- 发送通知给项目经理："XXX拒绝了项目XXX，原因：..."

**重新安排流程**：
1. PM收到拒绝通知
2. PM查看项目详情，看到拒绝的成员
3. PM删除拒绝的成员（可选）
4. PM添加新成员
5. 新成员需要重新确认（状态变为 `waiting_confirmation`）

---

### 3.4 阶段4：项目执行

#### 4.1 项目开始执行

**触发条件**：所有生产人员都已接受

**状态变更**：
- 状态：`scheduled`（pendingCount = 0） → `in_progress`
- `startedAt = 当前时间`（如果尚未设置）
- `memberAcceptance.allConfirmed = true`

**权限**：
- 只有所有生产人员都接受后，项目才能进入 `in_progress`
- 如果有任何成员拒绝，项目不能进入 `in_progress`

#### 4.2 翻译完成

**触发条件**：翻译或PM标记翻译完成

**操作**：
- 翻译上传译文文件
- 翻译或PM点击"翻译完成"

**状态变更**：
- 状态：`in_progress` → `translation_done`
- 仅允许向前推进（不能回退）

**权限检查**：
```javascript
// 允许操作的角色
const allowedRoles = ['admin', 'pm', 'translator'];
// 状态顺序检查
const order = ['pending', 'scheduled', 'waiting_confirmation', 'in_progress', 'translation_done', ...];
// 只能向前推进
if (targetIdx < currentIdx) {
  throw new AppError('状态不可回退', 400);
}
```

#### 4.3 审校完成

**触发条件**：审校或PM标记审校完成

**状态变更**：
- 状态：`translation_done` → `review_done`

#### 4.4 排版完成（如有）

**触发条件**：排版或PM标记排版完成

**状态变更**：
- 状态：`review_done` → `layout_done`
- 如果项目没有排版环节，可以直接从 `review_done` 到 `completed`

---

### 3.5 阶段5：项目完成

**触发条件**：PM点击"项目完成"按钮

**前置检查**：
```javascript
// 1. 检查是否有成员
const members = await ProjectMember.find({ projectId });
if (members.length === 0) {
  throw new AppError('项目必须有成员才能完成', 400);
}

// 2. 检查项目金额
if (!project.projectAmount || project.projectAmount <= 0) {
  throw new AppError('项目金额未填写或无效', 400);
}

// 3. 检查状态（必须至少是 review_done 或 layout_done）
const allowedStatuses = ['review_done', 'layout_done'];
if (!allowedStatuses.includes(project.status)) {
  throw new AppError('请先完成所有生产环节', 400);
}
```

**状态变更**：
- 状态：`review_done` 或 `layout_done` → `completed`
- `completedAt = 当前时间`
- 检查是否延期：`isDelayed = completedAt > deadline`

**后续操作**：
1. 系统自动计算KPI（实时计算）
2. 生成KPI记录到 `kpi_records` 表
3. 发送通知给所有项目成员："项目XXX已完成，KPI已生成"

---

## 四、状态流转规则总结

### 4.1 状态推进规则

1. **只能向前推进，不能回退**
   - 状态顺序：`pending` → `scheduled` → `in_progress` → `translation_done` → `review_done` → `layout_done` → `completed`
   - 注意：`scheduled` 状态内部通过 `pendingCount` 区分"待安排"和"待确认"

2. **特殊状态转换**
   - `pending` → `scheduled`：销售点击"开始项目" 或 PM添加成员
   - `scheduled`（pendingCount = 0） → `scheduled`（pendingCount > 0）：PM添加生产人员
   - `scheduled`（pendingCount > 0） → `in_progress`：所有生产人员都接受
   - `scheduled`（pendingCount > 0） → `scheduled`（pendingCount 可能仍 > 0）：有成员拒绝，等待重新安排
   - `in_progress` → `translation_done`：翻译完成
   - `translation_done` → `review_done`：审校完成
   - `review_done` → `layout_done` 或 `completed`：排版完成（如有）或直接完成
   - `layout_done` → `completed`：项目完成

3. **状态回退规则**
   - `scheduled` 状态内部可以变化（pendingCount 增减），但状态值不变
   - 其他状态不能回退

### 4.2 成员确认规则

1. **需要确认的角色**（生产人员）：
   - `translator` - 翻译
   - `reviewer` - 审校
   - `layout` - 排版
   - `part_time_translator` - 兼职翻译

2. **自动接受的角色**（管理人员）：
   - `pm` - 项目经理
   - `sales` - 销售
   - `admin_staff` - 综合岗
   - `part_time_sales` - 兼职销售

3. **确认状态**：
   - `pending` - 待确认（生产人员添加后）
   - `accepted` - 已接受
   - `rejected` - 已拒绝

4. **项目开始条件**：
   - 所有生产人员都必须接受（`acceptanceStatus = 'accepted'`）
   - 如果有任何生产人员拒绝，项目不能进入 `in_progress`

### 4.3 权限控制

| 操作 | 允许角色 | 说明 |
|------|---------|------|
| 创建项目 | 销售、管理员 | 创建后状态为 `pending` |
| 开始项目 | 销售、管理员 | `pending` → `scheduled` |
| 添加成员 | PM、管理员 | 添加后可能变为 `waiting_confirmation` |
| 接受/拒绝 | 生产人员本人 | 只能操作自己的成员记录 |
| 标记翻译完成 | PM、翻译、管理员 | `in_progress` → `translation_done` |
| 标记审校完成 | PM、审校、管理员 | `translation_done` → `review_done` |
| 标记排版完成 | PM、排版、管理员 | `review_done` → `layout_done` |
| 项目完成 | PM、管理员 | `review_done`/`layout_done` → `completed` |
| 取消项目 | 销售、管理员 | 任何状态 → `cancelled` |

---

## 五、代码实现要点

### 5.1 添加成员时的状态判断

```javascript
// services/projectService.js - addMember 方法
async addMember(projectId, userId, role, ...) {
  const project = await Project.findById(projectId);
  const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
  const isProductionRole = productionRoles.includes(role);
  
  // 设置接受状态
  const acceptanceStatus = isProductionRole ? 'pending' : 'accepted';
  
  // 创建成员
  const member = await ProjectMember.create({
    // ...
    acceptanceStatus: acceptanceStatus
  });
  
  // 初始化 memberAcceptance（如果不存在）
  if (!project.memberAcceptance) {
    project.memberAcceptance = {
      requiresConfirmation: false,
      pendingCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      allConfirmed: false
    };
  }
  
  // 如果是生产人员，需要确认
  if (isProductionRole) {
    project.memberAcceptance.pendingCount += 1;
    project.memberAcceptance.requiresConfirmation = true;
    
    // 状态变更：如果项目是 pending，变为 scheduled
    if (project.status === 'pending') {
      project.status = 'scheduled';
    }
    // 如果已经是 scheduled，保持 scheduled（通过 pendingCount > 0 表示待确认）
  } else {
    // 非生产人员自动接受
    project.memberAcceptance.acceptedCount += 1;
    
    // 如果项目是 pending，变为 scheduled
    if (project.status === 'pending') {
      project.status = 'scheduled';
    }
  }
  
  await project.save();
  return member;
}
```

### 5.2 成员接受时的状态判断

```javascript
// routes/projects.js - 接受接口
router.post('/:projectId/members/:memberId/accept', async (req, res) => {
  // ... 验证和更新成员状态 ...
  
  // 更新项目确认状态
  project.memberAcceptance.pendingCount -= 1;
  project.memberAcceptance.acceptedCount += 1;
  
  // 检查是否所有生产人员都已接受
  const productionMembers = await ProjectMember.find({
    projectId: projectId,
    role: { $in: ['translator', 'reviewer', 'layout', 'part_time_translator'] }
  });
  
  const allAccepted = productionMembers.every(m => 
    m.acceptanceStatus === 'accepted'
  );
  
  const hasRejected = productionMembers.some(m => 
    m.acceptanceStatus === 'rejected'
  );
  
  // 如果所有成员都已接受，且没有拒绝的成员，项目可以开始
  if (allAccepted && project.memberAcceptance.pendingCount === 0 && !hasRejected) {
    project.status = 'in_progress';
    project.startedAt = project.startedAt || new Date();
    project.memberAcceptance.allConfirmed = true;
  } else {
    // 还有成员未确认，保持 scheduled（pendingCount > 0）
    project.status = 'scheduled';
  }
  
  await project.save();
  // ... 发送通知 ...
});
```

### 5.3 成员拒绝时的状态判断

```javascript
// routes/projects.js - 拒绝接口
router.post('/:projectId/members/:memberId/reject', async (req, res) => {
  // ... 验证和更新成员状态 ...
  
  // 更新项目确认状态
  project.memberAcceptance.pendingCount -= 1;
  project.memberAcceptance.rejectedCount += 1;
  project.memberAcceptance.allConfirmed = false;
  
  // 项目保持 scheduled，等待重新安排（pendingCount 可能仍 > 0）
  // 状态值不变，但通过 pendingCount 和 rejectedCount 可以判断需要重新安排
  
  await project.save();
  // ... 发送通知给PM ...
});
```

### 5.4 项目完成时的检查

```javascript
// services/projectService.js - completeProject 方法
async completeProject(projectId, user) {
  const project = await Project.findById(projectId);
  
  // 1. 检查状态（必须至少是 review_done 或 layout_done）
  const allowedStatuses = ['review_done', 'layout_done'];
  if (!allowedStatuses.includes(project.status)) {
    throw new AppError('请先完成所有生产环节', 400);
  }
  
  // 2. 检查是否有成员
  const members = await ProjectMember.find({ projectId });
  if (members.length === 0) {
    throw new AppError('项目必须有成员才能完成', 400);
  }
  
  // 3. 检查项目金额
  if (!project.projectAmount || project.projectAmount <= 0) {
    throw new AppError('项目金额未填写或无效', 400);
  }
  
  // 4. 检查生产人员是否都已接受（如果有生产人员）
  const productionMembers = members.filter(m => 
    ['translator', 'reviewer', 'layout', 'part_time_translator'].includes(m.role)
  );
  
  if (productionMembers.length > 0) {
    const allAccepted = productionMembers.every(m => 
      m.acceptanceStatus === 'accepted'
    );
    if (!allAccepted) {
      throw new AppError('请确保所有生产人员都已接受项目分配', 400);
    }
  }
  
  // 5. 更新状态
  project.status = 'completed';
  project.completedAt = new Date();
  
  // 6. 检查是否延期
  if (project.completedAt > project.deadline) {
    project.isDelayed = true;
  }
  
  await project.save();
  
  // 7. 计算KPI
  // ...
}
```

---

## 六、状态流转图（简化版）

```
pending（待开始）
   ↓ [销售点击"开始项目" 或 PM添加成员]
scheduled（待安排，pendingCount = 0）
   ↓ [PM添加生产人员]
scheduled（待确认，pendingCount > 0）
   ├─ [所有成员接受] → in_progress（进行中）
   └─ [有成员拒绝] → scheduled（待安排，pendingCount 可能仍 > 0）
   ↓
in_progress（进行中）
   ↓ [翻译完成]
translation_done（翻译完成）
   ↓ [审校完成]
review_done（审校完成）
   ├─ [有排版] → layout_done（排版完成）
   └─ [无排版] → completed（已完成）
   ↓
layout_done（排版完成）
   ↓ [PM标记完成]
completed（已完成）
```

---

## 七、注意事项

1. **状态一致性**：
   - 确保状态变更时同时更新相关字段（如 `startedAt`、`memberAcceptance`）
   - 状态变更前必须验证前置条件

2. **并发控制**：
   - 多个成员同时接受/拒绝时，需要正确处理计数
   - 使用数据库事务确保数据一致性

3. **历史数据兼容**：
   - 现有项目的成员，`acceptanceStatus` 默认为 `accepted`
   - 现有项目的 `memberAcceptance` 需要初始化

4. **通知机制**：
   - 添加成员时通知成员
   - 成员接受/拒绝时通知PM
   - 项目状态变更时通知相关人员

5. **权限验证**：
   - 每个状态变更操作都要验证用户权限
   - 成员只能操作自己的接受/拒绝

---

## 八、总结

这个完整的状态流转方案：

✅ **覆盖了从项目创建到完成的全流程**
✅ **整合了成员接受/拒绝机制**
✅ **明确了每个状态的触发条件和下一步**
✅ **避免了状态冲突和不衔接的问题**
✅ **提供了详细的代码实现要点**

关键改进：
1. 使用 `scheduled` 状态，通过 `memberAcceptance.pendingCount` 区分"待安排"和"待确认"
2. 成员拒绝后项目保持 `scheduled`，等待重新安排
3. 只有所有生产人员都接受后，项目才能进入 `in_progress`
4. 项目完成前检查所有生产人员是否都已接受
5. 前端显示时，根据 `pendingCount > 0` 显示"待确认"，否则显示"待安排"

