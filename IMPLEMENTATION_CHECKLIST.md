# 成员接受/拒绝功能实施清单

## 一、数据模型修改

### 1.1 models/ProjectMember.js
**修改内容**：
- [ ] 添加 `acceptanceStatus` 字段（enum: ['pending', 'accepted', 'rejected']）
- [ ] 添加 `acceptanceAt` 字段（Date，可选）
- [ ] 添加 `rejectionReason` 字段（String，可选，最大500字符）

**代码位置**：第48行后添加

```javascript
// 成员接受状态
acceptanceStatus: {
  type: String,
  enum: ['pending', 'accepted', 'rejected'],
  default: 'accepted', // 历史数据兼容：默认为 accepted
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

---

### 1.2 models/Project.js
**修改内容**：
- [ ] 添加 `memberAcceptance` 字段（嵌套对象）

**代码位置**：第156行（completionChecks 后）添加

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
    default: 0,
    min: 0
  },
  // 已接受成员数量
  acceptedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  // 已拒绝成员数量
  rejectedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  // 所有成员是否都已确认（接受或拒绝）
  allConfirmed: {
    type: Boolean,
    default: false
  }
}
```

---

## 二、后端服务层修改

### 2.1 services/projectService.js

#### 2.1.1 addMember 方法修改
**文件位置**：`services/projectService.js` 第500-620行

**修改内容**：
- [ ] 判断角色是否为生产人员（translator, reviewer, layout, part_time_translator）
- [ ] 根据角色设置 `acceptanceStatus`（生产人员为 'pending'，其他为 'accepted'）
- [ ] 初始化 `project.memberAcceptance`（如果不存在）
- [ ] 更新 `memberAcceptance` 计数（pendingCount 或 acceptedCount）
- [ ] 修改项目状态逻辑（pending → scheduled，但不自动变为 in_progress）
- [ ] 修改通知消息（生产人员提示需要确认）

**关键代码位置**：
- 第549行：确定使用的系数（在此之后添加角色判断）
- 第569行：创建成员（添加 acceptanceStatus）
- 第585行：项目状态变更逻辑（需要修改）
- 第602行：通知消息（需要修改）

**具体修改**：

1. **在确定系数后，添加角色判断**（第567行后）：
```javascript
// 判断是否为生产人员
const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
const isProductionRole = productionRoles.includes(role);

// 设置接受状态
const acceptanceStatus = isProductionRole ? 'pending' : 'accepted';
```

2. **创建成员时添加 acceptanceStatus**（第569行）：
```javascript
const member = await ProjectMember.create({
  projectId,
  userId,
  role,
  employmentType,
  translatorType: role === 'translator' ? (translatorType || 'mtpe') : undefined,
  wordRatio: ['translator', 'reviewer', 'layout'].includes(role)
    ? (typeof wordRatio === 'number' ? (wordRatio || 1.0) : 1.0)
    : 1.0,
  ratio_locked: ratio,
  partTimeFee: role === 'part_time_translator'
    ? (parseFloat(partTimeFee || 0) || 0)
    : 0,
  acceptanceStatus: acceptanceStatus  // 新增
});
```

3. **修改项目状态和 memberAcceptance 逻辑**（第585行替换）：
```javascript
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
    project.startedAt = new Date();
    project.completionChecks.hasMembers = true;
  }
  // 如果已经是 scheduled，保持 scheduled（通过 pendingCount > 0 表示待确认）
} else {
  // 非生产人员自动接受
  project.memberAcceptance.acceptedCount += 1;
  
  // 如果项目是 pending，变为 scheduled
  if (project.status === 'pending') {
    project.status = 'scheduled';
    project.startedAt = new Date();
    project.completionChecks.hasMembers = true;
  }
}

await project.save();
```

4. **修改通知消息**（第602行）：
```javascript
const roleName = roleNames[role] || role;
const message = isProductionRole
  ? `您已被分配到项目"${project.projectName}"，角色：${roleName}，请确认是否接受`
  : `您已被分配到项目"${project.projectName}"，角色：${roleName}`;
```

---

#### 2.1.2 completeProject 方法修改
**文件位置**：`services/projectService.js` 第960-1050行

**修改内容**：
- [ ] 添加检查：所有生产人员是否都已接受

**具体修改**（在检查成员后，第1000行左右添加）：
```javascript
// 检查生产人员是否都已接受（如果有生产人员）
const productionMembers = members.filter(m => 
  ['translator', 'reviewer', 'layout', 'part_time_translator'].includes(m.role)
);

if (productionMembers.length > 0) {
  const allAccepted = productionMembers.every(m => 
    m.acceptanceStatus === 'accepted'
  );
  if (!allAccepted) {
    throw new AppError('请确保所有生产人员都已接受项目分配', 400, 'MEMBERS_NOT_ALL_ACCEPTED');
  }
}
```

---

### 2.2 services/notificationService.js

**修改内容**：
- [ ] 添加新的通知类型：`MEMBER_ACCEPTED` 和 `MEMBER_REJECTED`

**代码位置**：第58行（NotificationTypes 对象）

```javascript
const NotificationTypes = {
  PROJECT_ASSIGNED: 'project_assigned',      // 项目分配
  MEMBER_ACCEPTED: 'member_accepted',       // 成员接受项目（新增）
  MEMBER_REJECTED: 'member_rejected',       // 成员拒绝项目（新增）
  // ... 其他类型
};
```

---

## 三、后端路由修改

### 3.1 routes/projects.js

#### 3.1.1 添加接受项目接口
**文件位置**：`routes/projects.js`（在 add-member 路由后添加）

**新增路由**：
- [ ] `POST /api/projects/:projectId/members/:memberId/accept`

**代码**：
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
    }).populate('projectId');
    
    if (!member) {
      throw new AppError('成员记录不存在或已处理', 404, 'MEMBER_NOT_FOUND');
    }
    
    const project = member.projectId;
    
    // 更新成员状态
    member.acceptanceStatus = 'accepted';
    member.acceptanceAt = new Date();
    await member.save();
    
    // 更新项目确认状态
    if (!project.memberAcceptance) {
      project.memberAcceptance = {
        requiresConfirmation: true,
        pendingCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        allConfirmed: false
      };
    }
    
    project.memberAcceptance.pendingCount = Math.max(0, project.memberAcceptance.pendingCount - 1);
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
      // 还有成员未确认，保持 scheduled
      project.status = 'scheduled';
    }
    
    await project.save();
    
    // 通知项目经理
    const { createNotification, NotificationTypes } = require('../services/notificationService');
    const roleNames = {
      'translator': '翻译',
      'reviewer': '审校',
      'layout': '排版',
      'part_time_translator': '兼职翻译'
    };
    const roleName = roleNames[member.role] || member.role;
    
    await createNotification({
      userId: project.createdBy,
      type: NotificationTypes.MEMBER_ACCEPTED,
      message: `${req.user.name}已接受项目"${project.projectName}"的${roleName}任务`,
      link: `#projects/${projectId}`
    });
    
    res.json({
      success: true,
      message: '已接受项目分配',
      data: { member, project }
    });
  })
);
```

---

#### 3.1.2 添加拒绝项目接口
**文件位置**：`routes/projects.js`（在 accept 路由后添加）

**新增路由**：
- [ ] `POST /api/projects/:projectId/members/:memberId/reject`

**代码**：
```javascript
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
    }).populate('projectId');
    
    if (!member) {
      throw new AppError('成员记录不存在或已处理', 404, 'MEMBER_NOT_FOUND');
    }
    
    const project = member.projectId;
    
    // 更新成员状态
    member.acceptanceStatus = 'rejected';
    member.acceptanceAt = new Date();
    member.rejectionReason = reason ? reason.trim().substring(0, 500) : null;
    await member.save();
    
    // 更新项目确认状态
    if (!project.memberAcceptance) {
      project.memberAcceptance = {
        requiresConfirmation: true,
        pendingCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        allConfirmed: false
      };
    }
    
    project.memberAcceptance.pendingCount = Math.max(0, project.memberAcceptance.pendingCount - 1);
    project.memberAcceptance.rejectedCount += 1;
    project.memberAcceptance.allConfirmed = false;
    
    // 项目保持 scheduled，等待重新安排
    project.status = 'scheduled';
    
    await project.save();
    
    // 通知项目经理
    const { createNotification, NotificationTypes } = require('../services/notificationService');
    const roleNames = {
      'translator': '翻译',
      'reviewer': '审校',
      'layout': '排版',
      'part_time_translator': '兼职翻译'
    };
    const roleName = roleNames[member.role] || member.role;
    const reasonText = reason ? `，原因：${reason}` : '';
    
    await createNotification({
      userId: project.createdBy,
      type: NotificationTypes.MEMBER_REJECTED,
      message: `${req.user.name}拒绝了项目"${project.projectName}"的${roleName}任务${reasonText}`,
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

---

#### 3.1.3 添加获取确认状态接口（可选）
**文件位置**：`routes/projects.js`（可选，用于前端显示确认进度）

**新增路由**：
- [ ] `GET /api/projects/:projectId/members/acceptance-status`

**代码**：
```javascript
// 获取项目成员确认状态
router.get('/:projectId/members/acceptance-status',
  authenticate,
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId;
    
    // 检查项目访问权限
    await checkProjectAccess(projectId, req.user, req.user.roles);
    
    const members = await ProjectMember.find({ projectId })
      .populate('userId', 'name username')
      .populate('projectId', 'memberAcceptance');
    
    const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
    const productionMembers = members.filter(m => productionRoles.includes(m.role));
    
    const pending = productionMembers.filter(m => m.acceptanceStatus === 'pending');
    const accepted = productionMembers.filter(m => m.acceptanceStatus === 'accepted');
    const rejected = productionMembers.filter(m => m.acceptanceStatus === 'rejected');
    
    const project = members[0]?.projectId;
    const acceptance = project?.memberAcceptance || {
      pendingCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      allConfirmed: false
    };
    
    res.json({
      success: true,
      data: {
        pending: pending.map(m => ({
          memberId: m._id,
          userId: m.userId._id,
          userName: m.userId.name,
          role: m.role,
          roleName: getRoleName(m.role)
        })),
        accepted: accepted.map(m => ({
          memberId: m._id,
          userId: m.userId._id,
          userName: m.userId.name,
          role: m.role,
          roleName: getRoleName(m.role),
          acceptedAt: m.acceptanceAt
        })),
        rejected: rejected.map(m => ({
          memberId: m._id,
          userId: m.userId._id,
          userName: m.userId.name,
          role: m.role,
          roleName: getRoleName(m.role),
          rejectionReason: m.rejectionReason,
          rejectedAt: m.acceptanceAt
        })),
        summary: {
          total: productionMembers.length,
          pendingCount: acceptance.pendingCount,
          acceptedCount: acceptance.acceptedCount,
          rejectedCount: acceptance.rejectedCount,
          allConfirmed: acceptance.allConfirmed,
          canStart: accepted.length === productionMembers.length && rejected.length === 0
        }
      }
    });
  })
);

function getRoleName(role) {
  const roleNames = {
    'translator': '翻译',
    'reviewer': '审校',
    'layout': '排版',
    'part_time_translator': '兼职翻译'
  };
  return roleNames[role] || role;
}
```

---

#### 3.1.4 修改项目详情接口
**文件位置**：`routes/projects.js` 第238-298行

**修改内容**：
- [ ] 确保返回 `memberAcceptance` 字段
- [ ] 确保成员数据包含 `acceptanceStatus`、`acceptanceAt`、`rejectionReason`

**具体修改**：第253行，populate 时确保包含新字段（默认会包含，无需修改）

---

## 四、前端修改

### 4.1 public/js/modules/project.js

#### 4.1.1 修改项目详情显示
**文件位置**：`public/js/modules/project.js` 第1556-1576行（成员列表渲染部分）

**修改内容**：
- [ ] 在成员列表显示中，添加确认状态显示
- [ ] 对于当前用户的待确认成员，显示"接受"和"拒绝"按钮
- [ ] 显示确认进度（如：2/3 已接受，1 人待确认）

**具体修改位置**：
- 第1556行：`project.members.map(m => {` 循环中
- 第1570行：`member-item` div 内添加状态显示

**修改代码**（替换第1570-1575行）：
```javascript
// 在成员列表渲染中添加
members.forEach(member => {
  const isCurrentUser = member.userId._id === currentUser._id;
  const status = member.acceptanceStatus || 'accepted'; // 兼容历史数据
  
  let statusHtml = '';
  if (status === 'pending' && isCurrentUser) {
    statusHtml = `
      <div class="member-status">
        <span class="status-badge pending">待确认</span>
        <button class="btn btn-sm btn-success" onclick="acceptMember('${project._id}', '${member._id}')">接受</button>
        <button class="btn btn-sm btn-danger" onclick="rejectMember('${project._id}', '${member._id}')">拒绝</button>
      </div>
    `;
  } else if (status === 'accepted') {
    statusHtml = `
      <div class="member-status">
        <span class="status-badge accepted">已接受</span>
        ${member.acceptanceAt ? `<small>${formatDate(member.acceptanceAt)}</small>` : ''}
      </div>
    `;
  } else if (status === 'rejected') {
    statusHtml = `
      <div class="member-status">
        <span class="status-badge rejected">已拒绝</span>
        ${member.rejectionReason ? `<small>原因：${member.rejectionReason}</small>` : ''}
      </div>
    `;
  }
  
  // 将 statusHtml 插入到成员信息中
});
```

---

#### 4.1.2 添加接受/拒绝函数
**文件位置**：`public/js/modules/project.js`（在文件末尾或合适位置）

**新增函数**：
- [ ] `acceptMember(projectId, memberId)` - 接受项目
- [ ] `rejectMember(projectId, memberId)` - 拒绝项目（带弹窗输入原因）

**代码**（添加到文件末尾，约第4200行后）：
```javascript
// 接受项目分配
async function acceptMember(projectId, memberId) {
    try {
        const res = await apiFetch(`/api/projects/${projectId}/members/${memberId}/accept`, {
            method: 'POST'
        });
        
        if (res.success) {
            showToast('已接受项目分配', 'success');
            // 刷新项目详情
            await viewProject(projectId);
        }
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
    }
}

// 拒绝项目分配
async function rejectMember(projectId, memberId) {
    // 显示拒绝原因输入弹窗（使用更友好的方式）
    const reason = prompt('请输入拒绝原因（可选，可直接点击确定跳过）：');
    if (reason === null) return; // 用户取消
    
    try {
        const res = await apiFetch(`/api/projects/${projectId}/members/${memberId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason ? reason.trim() : null })
        });
        
        if (res.success) {
            showToast('已拒绝项目分配', 'success');
            // 刷新项目详情
            await viewProject(projectId);
        }
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
    }
}

// 导出函数供全局使用
window.acceptMember = acceptMember;
window.rejectMember = rejectMember;
```

---

#### 4.1.3 修改项目列表显示
**文件位置**：`public/js/modules/project.js`（查找项目列表渲染函数）

**修改内容**：
- [ ] 对于 `scheduled` 状态的项目，显示确认进度
- [ ] 如果 `memberAcceptance.pendingCount > 0`，显示"待确认"标签

**代码位置**：`public/js/modules/project.js`（查找项目列表渲染函数，通常在 `renderProjects` 或类似函数中）

**具体修改**：在项目状态显示部分添加确认进度

**代码示例**（需要根据实际代码结构调整）：
```javascript
// 在项目状态显示部分添加
if (project.status === 'scheduled' && project.memberAcceptance?.pendingCount > 0) {
  const total = (project.memberAcceptance.pendingCount || 0) + 
                (project.memberAcceptance.acceptedCount || 0);
  const accepted = project.memberAcceptance.acceptedCount || 0;
  // 在状态标签后添加
  statusHtml += `<span class="badge" style="background: #ffc107; color: #000; margin-left: 8px;">待确认 (${accepted}/${total})</span>`;
}
```

---

### 4.2 public/styles.css

**修改内容**：
- [ ] 添加成员状态样式（待确认、已接受、已拒绝）
- [ ] 添加接受/拒绝按钮样式

**代码**：
```css
/* 成员状态样式 */
.member-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.pending {
  background-color: #fff3cd;
  color: #856404;
}

.status-badge.accepted {
  background-color: #d4edda;
  color: #155724;
}

.status-badge.rejected {
  background-color: #f8d7da;
  color: #721c24;
}

/* 接受/拒绝按钮 */
.member-status .btn {
  padding: 4px 12px;
  font-size: 12px;
}
```

---

## 五、数据库迁移脚本

### 5.1 创建迁移脚本
**文件位置**：`migrations/add_member_acceptance.js`（新建文件）

**内容**：
```javascript
const mongoose = require('mongoose');
const ProjectMember = require('../models/ProjectMember');
const Project = require('../models/Project');

async function migrate() {
  console.log('开始迁移：为现有成员添加接受状态...');
  
  // 1. 为所有现有成员设置 acceptanceStatus = 'accepted'
  const result1 = await ProjectMember.updateMany(
    { acceptanceStatus: { $exists: false } },
    { 
      $set: { 
        acceptanceStatus: 'accepted',
        acceptanceAt: new Date()
      }
    }
  );
  console.log(`已更新 ${result1.modifiedCount} 个成员记录`);
  
  // 2. 为所有现有项目初始化 memberAcceptance
  const projects = await Project.find({});
  let updatedProjects = 0;
  
  for (const project of projects) {
    const members = await ProjectMember.find({ projectId: project._id });
    const productionRoles = ['translator', 'reviewer', 'layout', 'part_time_translator'];
    const productionMembers = members.filter(m => productionRoles.includes(m.role));
    
    if (!project.memberAcceptance) {
      project.memberAcceptance = {
        requiresConfirmation: productionMembers.length > 0,
        pendingCount: 0,
        acceptedCount: productionMembers.length,
        rejectedCount: 0,
        allConfirmed: true
      };
      await project.save();
      updatedProjects++;
    }
  }
  
  console.log(`已更新 ${updatedProjects} 个项目记录`);
  console.log('迁移完成！');
}

// 如果直接运行此脚本
if (require.main === module) {
  const config = require('../config/database');
  mongoose.connect(config.mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    console.log('数据库连接成功');
    return migrate();
  }).then(() => {
    console.log('迁移完成，退出');
    process.exit(0);
  }).catch(err => {
    console.error('迁移失败:', err);
    process.exit(1);
  });
}

module.exports = migrate;
```

---

## 六、测试要点

### 6.1 功能测试
- [ ] 测试添加生产人员后，状态为 pending
- [ ] 测试添加非生产人员后，状态为 accepted
- [ ] 测试成员接受项目后，状态变为 accepted
- [ ] 测试所有成员接受后，项目状态变为 in_progress
- [ ] 测试成员拒绝项目后，状态变为 rejected
- [ ] 测试有成员拒绝时，项目不能进入 in_progress
- [ ] 测试拒绝后重新添加成员，新成员需要确认
- [ ] 测试项目完成前检查所有成员是否都已接受

### 6.2 边界测试
- [ ] 测试历史数据兼容性（没有 acceptanceStatus 的成员）
- [ ] 测试并发接受/拒绝（多个成员同时操作）
- [ ] 测试已接受的成员不能再次接受
- [ ] 测试已拒绝的成员不能再次拒绝
- [ ] 测试非成员用户不能接受/拒绝

### 6.3 UI测试
- [ ] 测试项目详情页显示成员状态
- [ ] 测试接受/拒绝按钮显示正确
- [ ] 测试拒绝弹窗输入原因
- [ ] 测试项目列表显示确认进度
- [ ] 测试通知消息正确显示

---

## 七、实施顺序

1. **第一阶段：数据模型**
   - 修改 `models/ProjectMember.js`
   - 修改 `models/Project.js`
   - 运行数据库迁移脚本

2. **第二阶段：后端逻辑**
   - 修改 `services/projectService.js` 的 `addMember` 方法
   - 修改 `services/projectService.js` 的 `completeProject` 方法
   - 修改 `services/notificationService.js` 添加通知类型

3. **第三阶段：后端API**
   - 在 `routes/projects.js` 添加接受接口
   - 在 `routes/projects.js` 添加拒绝接口
   - 可选：添加获取确认状态接口

4. **第四阶段：前端界面**
   - 修改 `public/js/modules/project.js` 显示成员状态
   - 添加接受/拒绝函数
   - 修改项目列表显示确认进度
   - 添加样式 `public/styles.css`

5. **第五阶段：测试**
   - 功能测试
   - 边界测试
   - UI测试

---

## 八、注意事项

1. **向后兼容**：
   - 现有成员的 `acceptanceStatus` 默认为 'accepted'
   - 现有项目的 `memberAcceptance` 需要初始化

2. **数据一致性**：
   - 确保 `memberAcceptance` 的计数与实际的成员状态一致
   - 使用数据库事务确保并发安全

3. **通知机制**：
   - 添加成员时通知成员（需要确认）
   - 成员接受/拒绝时通知项目经理

4. **权限控制**：
   - 只有成员本人可以接受/拒绝
   - 项目经理可以查看所有成员的确认状态

5. **状态流转**：
   - 只有所有生产人员都接受后，项目才能进入 in_progress
   - 有成员拒绝时，项目保持 scheduled，等待重新安排

---

## 九、预计工作量

- **数据模型修改**：1小时
- **后端服务层修改**：2-3小时
- **后端API修改**：2-3小时
- **前端界面修改**：3-4小时
- **数据库迁移脚本**：1小时
- **测试**：2-3小时

**总计**：约 11-15 小时（1.5-2 个工作日）

