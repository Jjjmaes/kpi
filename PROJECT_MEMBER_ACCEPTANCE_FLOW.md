# 项目成员接受/拒绝流程优化方案

## 一、需求概述

### 当前问题
- 项目经理添加生产人员后，成员默认自动接受项目
- 成员无法主动确认或拒绝项目分配
- 如果成员无法参与，项目经理无法及时获知

### 优化目标
1. 成员可以主动接受或拒绝项目分配
2. 项目经理能及时收到成员确认/拒绝的通知
3. 只有所有生产人员都接受后，项目才能进入"进行中"状态
4. 拒绝后，项目经理可以重新安排人员

---

## 二、数据模型设计

### 2.1 ProjectMember 模型扩展

在 `models/ProjectMember.js` 中增加以下字段：

```javascript
// 成员接受状态
acceptanceStatus: {
  type: String,
  enum: ['pending', 'accepted', 'rejected'],
  default: 'pending',
  required: true
},
// 接受/拒绝时间
acceptanceAt: {
  type: Date,
  default: null
},
// 拒绝原因（可选）
rejectionReason: {
  type: String,
  maxlength: 500,
  default: null
}
```

### 2.2 Project 模型扩展

在 `models/Project.js` 中增加：

```javascript
// 成员确认状态追踪
memberAcceptance: {
  // 是否需要成员确认（生产人员需要，PM/销售不需要）
  requiresConfirmation: {
    type: Boolean,
    default: false
  },
  // 待确认成员数量
  pendingCount: {
    type: Number,
    default: 0
  },
  // 已接受成员数量
  acceptedCount: {
    type: Number,
    default: 0
  },
  // 已拒绝成员数量
  rejectedCount: {
    type: Number,
    default: 0
  },
  // 所有成员是否都已确认（接受或拒绝）
  allConfirmed: {
    type: Boolean,
    default: false
  }
}
```

### 2.3 生产人员角色定义

需要确认的角色（生产环节）：
- `translator` - 翻译
- `reviewer` - 审校
- `layout` - 排版
- `part_time_translator` - 兼职翻译

不需要确认的角色（管理环节）：
- `pm` - 项目经理（分配者）
- `sales` - 销售（创建者）
- `admin_staff` - 综合岗
- `part_time_sales` - 兼职销售

---

## 三、业务流程设计

### 3.1 添加成员流程

```
1. 项目经理添加成员
   ↓
2. 判断角色是否为生产人员
   ↓
3. 如果是生产人员：
   - 设置 acceptanceStatus = 'pending'
   - 项目 memberAcceptance.pendingCount += 1
   - 项目状态保持为 'scheduled'（不自动变为 'in_progress'）
   - 发送通知给成员："您已被分配到项目XXX，请确认是否接受"
   ↓
4. 如果不是生产人员（PM/销售等）：
   - 设置 acceptanceStatus = 'accepted'（自动接受）
   - 不增加 pendingCount
   - 正常流程
```

### 3.2 成员接受/拒绝流程

```
成员收到通知
   ↓
查看项目详情
   ↓
点击"接受"或"拒绝"
   ↓
如果接受：
   - acceptanceStatus = 'accepted'
   - acceptanceAt = 当前时间
   - 项目 memberAcceptance.pendingCount -= 1
   - 项目 memberAcceptance.acceptedCount += 1
   - 检查是否所有成员都已确认
   - 如果全部接受，项目状态变为 'in_progress'
   - 通知项目经理："XXX已接受项目XXX"
   ↓
如果拒绝：
   - acceptanceStatus = 'rejected'
   - acceptanceAt = 当前时间
   - rejectionReason = 用户填写的拒绝原因（可选）
   - 项目 memberAcceptance.pendingCount -= 1
   - 项目 memberAcceptance.rejectedCount += 1
   - 通知项目经理："XXX拒绝了项目XXX，原因：..."
   - 项目状态保持 'scheduled'，等待重新安排
```

### 3.3 重新安排流程

```
项目经理收到拒绝通知
   ↓
查看项目详情，看到拒绝的成员
   ↓
删除拒绝的成员（可选）
   ↓
添加新成员
   ↓
新成员需要重新确认
```

### 3.4 项目状态流转

```
pending（待开始）
   ↓ [添加生产人员]
scheduled（待安排/待确认）
   ↓ [所有生产角色都有有效成员且都已接受]
in_progress（进行中）
   ↓ [项目完成]
completed（已完成）

状态判断规则：
- 系统会按角色分组检查每个生产角色（翻译、审校、排版、兼职翻译）
- 对于每个角色，如果曾经分配过，必须有有效的（非拒绝的）成员
- 所有有效成员都必须已接受
- 只有当所有角色都满足条件时，项目才会变为"进行中"
- 如果有成员拒绝，需要删除并重新安排新成员
- 拒绝的成员记录会保留，但不会影响项目状态判断（如果该角色已有新的有效成员）
```

**注意**：
- 如果项目中有成员拒绝，项目不能进入 `in_progress` 状态
- 只有所有生产人员都接受后，才能进入 `in_progress`
- PM/销售等管理角色不需要确认，自动接受

---

## 四、API 接口设计

### 4.1 接受项目分配

**POST** `/api/projects/:projectId/members/:memberId/accept`

**请求体**：无

**响应**：
```json
{
  "success": true,
  "message": "已接受项目分配",
  "data": {
    "member": {
      "acceptanceStatus": "accepted",
      "acceptanceAt": "2024-01-15T10:30:00.000Z"
    },
    "project": {
      "status": "in_progress", // 如果所有成员都已接受
      "memberAcceptance": {
        "pendingCount": 0,
        "acceptedCount": 3,
        "rejectedCount": 0,
        "allConfirmed": true
      }
    }
  }
}
```

### 4.2 拒绝项目分配

**POST** `/api/projects/:projectId/members/:memberId/reject`

**请求体**：
```json
{
  "reason": "时间冲突，无法参与" // 可选
}
```

**响应**：
```json
{
  "success": true,
  "message": "已拒绝项目分配",
  "data": {
    "member": {
      "acceptanceStatus": "rejected",
      "acceptanceAt": "2024-01-15T10:30:00.000Z",
      "rejectionReason": "时间冲突，无法参与"
    },
    "project": {
      "status": "scheduled", // 保持 scheduled，等待重新安排
      "memberAcceptance": {
        "pendingCount": 0,
        "acceptedCount": 2,
        "rejectedCount": 1,
        "allConfirmed": true
      }
    }
  }
}
```

### 4.3 获取项目成员确认状态

**GET** `/api/projects/:projectId/members/acceptance-status`

**响应**：
```json
{
  "success": true,
  "data": {
    "pending": [
      {
        "memberId": "...",
        "userId": "...",
        "userName": "张三",
        "role": "translator",
        "roleName": "翻译"
      }
    ],
    "accepted": [...],
    "rejected": [
      {
        "memberId": "...",
        "userId": "...",
        "userName": "李四",
        "role": "reviewer",
        "roleName": "审校",
        "rejectionReason": "时间冲突",
        "rejectedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "summary": {
      "total": 3,
      "pendingCount": 0,
      "acceptedCount": 2,
      "rejectedCount": 1,
      "allConfirmed": true,
      "canStart": false // 是否有拒绝的成员
    }
  }
}
```

---

## 五、前端界面设计

### 5.1 项目列表页面

在项目列表中，对于 `scheduled` 状态的项目，显示确认状态：

```
项目名称 | 状态：待确认 (2/3已接受) | [查看详情]
```

### 5.2 项目详情页面

#### 5.2.1 成员列表显示

在项目详情页的成员列表中，显示每个成员的确认状态：

```
成员列表：
┌─────────────────────────────────────────┐
│ 张三 - 翻译                              │
│ 状态：✅ 已接受 (2024-01-15 10:30)      │
├─────────────────────────────────────────┤
│ 李四 - 审校                              │
│ 状态：⏳ 待确认                          │
│ [接受] [拒绝]                            │
├─────────────────────────────────────────┤
│ 王五 - 排版                              │
│ 状态：❌ 已拒绝 (2024-01-15 11:00)      │
│ 拒绝原因：时间冲突                        │
└─────────────────────────────────────────┘

确认进度：2/3 已接受，1 人待确认
```

#### 5.2.2 成员操作按钮

**对于当前用户自己的成员记录**：
- 如果状态是 `pending`：显示"接受"和"拒绝"按钮
- 如果状态是 `accepted`：显示"已接受"（不可操作）
- 如果状态是 `rejected`：显示"已拒绝"（不可操作）

**对于其他成员**（项目经理查看）：
- 显示状态标签（待确认/已接受/已拒绝）
- 如果已拒绝，显示拒绝原因

#### 5.2.3 拒绝弹窗

点击"拒绝"按钮时，弹出确认对话框：

```
┌─────────────────────────────────────┐
│ 拒绝项目分配                         │
├─────────────────────────────────────┤
│ 项目：XXX项目                        │
│ 角色：翻译                            │
│                                      │
│ 拒绝原因（可选）：                    │
│ [___________________________]        │
│                                      │
│ [取消]  [确认拒绝]                   │
└─────────────────────────────────────┘
```

### 5.3 我的项目页面

在"我的项目"页面，显示待确认的项目：

```
待确认项目 (2)
┌─────────────────────────────────────┐
│ XXX项目                              │
│ 角色：翻译                            │
│ 交付时间：2024-01-20                 │
│ [接受] [拒绝]                        │
└─────────────────────────────────────┘
```

### 5.4 通知中心

通知消息格式：

**分配通知**：
```
您已被分配到项目"XXX项目"，角色：翻译
请确认是否接受：[接受] [拒绝]
```

**接受通知**（给项目经理）：
```
张三已接受项目"XXX项目"的翻译任务
```

**拒绝通知**（给项目经理）：
```
李四拒绝了项目"XXX项目"的审校任务
拒绝原因：时间冲突，无法参与
请重新安排人员
```

---

## 六、后端实现要点

### 6.1 添加成员时的逻辑修改

在 `services/projectService.js` 的 `addMember` 方法中：

```javascript
// 判断是否为生产人员
const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
const isProductionRole = productionRoles.includes(role);

// 设置接受状态
const acceptanceStatus = isProductionRole ? 'pending' : 'accepted';

// 创建成员
const member = await ProjectMember.create({
  // ... 其他字段
  acceptanceStatus: acceptanceStatus
});

// 如果是生产人员，更新项目的成员确认状态
if (isProductionRole) {
  project.memberAcceptance = project.memberAcceptance || {
    requiresConfirmation: true,
    pendingCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    allConfirmed: false
  };
  project.memberAcceptance.pendingCount += 1;
  project.memberAcceptance.requiresConfirmation = true;
  
  // 项目状态保持为 scheduled，不自动变为 in_progress
  if (project.status === 'pending') {
    project.status = 'scheduled';
  }
} else {
  // 非生产人员自动接受，不增加 pendingCount
  project.memberAcceptance.acceptedCount += 1;
}

await project.save();
```

### 6.2 接受/拒绝接口实现

在 `routes/projects.js` 中新增路由：

```javascript
// 接受项目分配
router.post('/:projectId/members/:memberId/accept', 
  authenticate,
  asyncHandler(async (req, res) => {
    const { projectId, memberId } = req.params;
    const userId = req.user._id;
    
    // 验证成员是否属于当前用户
    const member = await ProjectMember.findOne({
      _id: memberId,
      projectId: projectId,
      userId: userId,
      acceptanceStatus: 'pending'
    });
    
    if (!member) {
      throw new AppError('成员记录不存在或已处理', 404);
    }
    
    // 更新成员状态
    member.acceptanceStatus = 'accepted';
    member.acceptanceAt = new Date();
    await member.save();
    
    // 更新项目确认状态
    const project = await Project.findById(projectId);
    project.memberAcceptance.pendingCount -= 1;
    project.memberAcceptance.acceptedCount += 1;
    
    // 检查是否所有成员都已确认
    const allMembers = await ProjectMember.find({ projectId });
    const productionMembers = allMembers.filter(m => 
      ['translator', 'reviewer', 'layout', 'part_time_translator'].includes(m.role)
    );
    const allAccepted = productionMembers.every(m => 
      m.acceptanceStatus === 'accepted'
    );
    
    if (allAccepted && project.memberAcceptance.pendingCount === 0) {
      project.status = 'in_progress';
      project.memberAcceptance.allConfirmed = true;
    }
    
    await project.save();
    
    // 通知项目经理
    await createNotification({
      userId: project.createdBy,
      type: NotificationTypes.MEMBER_ACCEPTED,
      message: `${req.user.name}已接受项目"${project.projectName}"的${getRoleName(member.role)}任务`,
      link: `#projects/${projectId}`
    });
    
    res.json({
      success: true,
      message: '已接受项目分配',
      data: { member, project }
    });
  })
);

// 拒绝项目分配
router.post('/:projectId/members/:memberId/reject',
  authenticate,
  asyncHandler(async (req, res) => {
    const { projectId, memberId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;
    
    // 验证成员是否属于当前用户
    const member = await ProjectMember.findOne({
      _id: memberId,
      projectId: projectId,
      userId: userId,
      acceptanceStatus: 'pending'
    });
    
    if (!member) {
      throw new AppError('成员记录不存在或已处理', 404);
    }
    
    // 更新成员状态
    member.acceptanceStatus = 'rejected';
    member.acceptanceAt = new Date();
    member.rejectionReason = reason || null;
    await member.save();
    
    // 更新项目确认状态
    const project = await Project.findById(projectId);
    project.memberAcceptance.pendingCount -= 1;
    project.memberAcceptance.rejectedCount += 1;
    // 项目状态保持 scheduled，等待重新安排
    project.memberAcceptance.allConfirmed = false;
    
    await project.save();
    
    // 通知项目经理
    await createNotification({
      userId: project.createdBy,
      type: NotificationTypes.MEMBER_REJECTED,
      message: `${req.user.name}拒绝了项目"${project.projectName}"的${getRoleName(member.role)}任务${reason ? `，原因：${reason}` : ''}`,
      link: `#projects/${projectId}`
    });
    
    res.json({
      success: true,
      message: '已拒绝项目分配',
      data: { member, project }
    });
  })
);
```

### 6.3 检查所有成员确认状态的辅助函数

```javascript
async function checkAllMembersConfirmed(projectId) {
  const project = await Project.findById(projectId);
  const allMembers = await ProjectMember.find({ projectId });
  
  const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
  const productionMembers = allMembers.filter(m => 
    productionRoles.includes(m.role)
  );
  
  const allAccepted = productionMembers.every(m => 
    m.acceptanceStatus === 'accepted'
  );
  
  const hasRejected = productionMembers.some(m => 
    m.acceptanceStatus === 'rejected'
  );
  
  return {
    allAccepted,
    hasRejected,
    canStart: allAccepted && !hasRejected,
    pendingCount: productionMembers.filter(m => m.acceptanceStatus === 'pending').length
  };
}
```

---

## 七、通知类型扩展

在 `services/notificationService.js` 中增加新的通知类型：

```javascript
NotificationTypes = {
  // ... 现有类型
  MEMBER_ACCEPTED: 'member_accepted',      // 成员接受项目
  MEMBER_REJECTED: 'member_rejected'        // 成员拒绝项目
}
```

---

## 八、实施步骤

### 阶段一：数据模型和基础功能
1. ✅ 修改 `ProjectMember` 模型，增加 `acceptanceStatus` 等字段
2. ✅ 修改 `Project` 模型，增加 `memberAcceptance` 字段
3. ✅ 数据库迁移脚本（为现有数据设置默认值）

### 阶段二：后端API实现
4. ✅ 修改 `projectService.addMember`，区分生产人员和管理人员
5. ✅ 实现接受/拒绝接口
6. ✅ 实现获取确认状态接口
7. ✅ 更新通知服务，增加新通知类型

### 阶段三：前端界面实现
8. ✅ 修改项目详情页，显示成员确认状态
9. ✅ 实现接受/拒绝按钮和弹窗
10. ✅ 修改项目列表，显示确认进度
11. ✅ 修改"我的项目"页面，显示待确认项目

### 阶段四：测试和优化
12. ✅ 单元测试
13. ✅ 集成测试
14. ✅ 用户体验优化

---

## 九、边界情况处理

### 9.1 成员被删除
- 如果成员被删除，从确认统计中移除
- 重新计算确认状态

### 9.2 项目已开始
- 如果项目已经是 `in_progress` 状态，新添加的成员仍然需要确认
- 但不影响项目状态

### 9.3 成员重复添加
- 系统已有唯一索引防止重复
- 如果尝试添加已存在的成员，返回错误

### 9.4 超时未确认
- 可以考虑增加超时提醒（可选功能）
- 例如：3天后未确认，自动提醒项目经理

### 9.5 历史数据兼容
- 现有项目的成员，`acceptanceStatus` 默认为 `accepted`
- 现有项目的 `memberAcceptance` 需要初始化

---

## 十、数据库迁移脚本

```javascript
// migrations/add_member_acceptance.js
const mongoose = require('mongoose');
const ProjectMember = require('../models/ProjectMember');
const Project = require('../models/Project');

async function migrate() {
  // 1. 为所有现有成员设置 acceptanceStatus = 'accepted'
  await ProjectMember.updateMany(
    { acceptanceStatus: { $exists: false } },
    { 
      $set: { 
        acceptanceStatus: 'accepted',
        acceptanceAt: new Date()
      }
    }
  );
  
  // 2. 为所有现有项目初始化 memberAcceptance
  const projects = await Project.find({});
  for (const project of projects) {
    const members = await ProjectMember.find({ projectId: project._id });
    const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
    const productionMembers = members.filter(m => productionRoles.includes(m.role));
    
    project.memberAcceptance = {
      requiresConfirmation: productionMembers.length > 0,
      pendingCount: 0,
      acceptedCount: productionMembers.length,
      rejectedCount: 0,
      allConfirmed: true
    };
    
    await project.save();
  }
  
  console.log('迁移完成');
}
```

---

## 十一、用户体验优化建议

1. **自动提醒**：如果成员3天未确认，自动发送提醒通知
2. **批量操作**：项目经理可以批量查看所有待确认项目
3. **拒绝原因模板**：提供常用拒绝原因选项（时间冲突、工作量已满等）
4. **确认统计看板**：项目经理可以看到所有项目的确认进度
5. **移动端适配**：确保接受/拒绝操作在移动端友好

---

## 十二、总结

这个方案实现了：
- ✅ 成员可以主动接受/拒绝项目分配
- ✅ 项目经理和项目创建者能及时收到通知
- ✅ 项目状态根据成员接受情况自动流转（按角色分组检查）
- ✅ 拒绝后可以重新安排人员，新成员接受后项目可以正常进行
- ✅ 多角色用户支持角色筛选，顶部切换角色时项目列表自动过滤
- ✅ 拒绝的成员不显示在项目列表中
- ✅ 角色名称从数据库动态读取，支持在系统中修改

### 关键改进点

1. **项目状态判断逻辑优化**：
   - 按角色分组检查，每个生产角色都需要有有效成员且都已接受
   - 忽略已拒绝但已重新安排的旧记录
   - 只有当所有角色都满足条件时，项目才会变为"进行中"

2. **角色筛选功能**：
   - 多角色用户可以在顶部切换角色，项目列表自动过滤
   - 项目列表提供角色筛选器，可以选择特定角色或"全部角色"
   - 后端查询时自动排除拒绝的成员

3. **用户体验优化**：
   - 接受/拒绝操作有明确的提示信息
   - 角色筛选器自动同步当前角色
   - 角色名称从数据库动态读取，支持自定义
- ✅ 完整的流程闭环

实施难度：中等
预计工作量：3-5个工作日
影响范围：项目模块、通知模块、前端界面

