# 邮件功能实现方案 - 项目成员分配邮件通知

## 一、需求分析

### 功能目标
- 当项目成员被分配时，自动发送邮件通知给被分配人员
- 邮件包含项目基本信息、角色、交付时间等关键信息
- 支持批量分配时批量发送邮件
- 邮件发送失败不应影响项目成员分配流程

### 触发场景
1. **创建项目时添加成员** - `projectService.createProject()`
2. **单独添加项目成员** - `projectService.addProjectMember()`
3. **批量添加成员**（如果未来有）

## 二、技术架构

### 2.1 依赖检查
- ✅ Resend 已安装（用户确认）
- ✅ User 模型已有 email 字段
- ✅ 已有通知服务层（notificationService.js）可参考

### 2.2 文件结构
```
services/
  ├── emailService.js          # 邮件服务层（新建）
  └── projectService.js        # 项目服务层（修改，集成邮件）

utils/
  └── emailTemplates.js        # 邮件模板（新建，可选）

config/
  └── email.js                 # 邮件配置（新建，可选）
```

## 三、实现步骤

### 步骤1：创建邮件服务层 (`services/emailService.js`)

**功能：**
- 封装 Resend API 调用
- 提供发送项目分配邮件的接口
- 错误处理和日志记录
- 支持异步发送（不阻塞主流程）

**核心方法：**
```javascript
- sendProjectAssignmentEmail(user, project, role, assigner)
- sendBulkProjectAssignmentEmails(members, project, assigner)
- validateEmailConfig() // 检查配置是否完整
```

### 步骤2：创建邮件模板

**邮件内容包含：**
- 项目名称和编号
- 被分配的角色
- 项目交付时间（deadline）
- 源语种和目标语种
- 项目金额（根据权限决定是否显示）
- 分配人信息
- 系统登录链接

**模板类型：**
- HTML 格式（美观）
- 纯文本格式（备用）

### 步骤3：环境变量配置

**需要添加的配置：**
```env
# Resend 配置
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
RESEND_FROM_NAME=语家 KPI 系统

# 邮件功能开关（可选）
EMAIL_ENABLED=true
EMAIL_SEND_ON_ASSIGNMENT=true
```

### 步骤4：集成到项目服务层

**修改位置：**
1. `services/projectService.js` - `addProjectMember()` 方法
2. `services/projectService.js` - `createProject()` 方法（创建项目时添加成员）

**集成策略：**
- 邮件发送使用 try-catch 包裹，失败不影响主流程
- 异步发送，不阻塞响应
- 记录发送日志（成功/失败）

### 步骤5：错误处理和日志

**错误处理：**
- 邮件配置缺失：记录警告，不发送
- 用户邮箱无效：记录错误，继续处理其他用户
- Resend API 错误：记录详细错误信息，不影响业务

**日志记录：**
- 发送成功：记录用户、项目、角色
- 发送失败：记录错误原因
- 配置检查：启动时检查配置完整性

## 四、详细实现代码

### 4.1 邮件服务层实现要点

```javascript
// services/emailService.js 核心结构
const { Resend } = require('resend');

class EmailService {
  constructor() {
    this.resend = null;
    this.enabled = false;
    this.fromEmail = null;
    this.fromName = null;
    this.init();
  }

  init() {
    // 检查配置并初始化 Resend 客户端
  }

  async sendProjectAssignmentEmail(user, project, role, assigner) {
    // 发送单个项目分配邮件
  }

  async sendBulkProjectAssignmentEmails(members, project, assigner) {
    // 批量发送邮件
  }
}
```

### 4.2 邮件模板设计

**HTML 模板包含：**
- 系统 Logo/标题
- 问候语（用户姓名）
- 项目信息卡片
- 角色信息
- 操作按钮（查看项目）
- 页脚（系统信息）

### 4.3 集成点

**在 `projectService.addProjectMember()` 中：**
```javascript
// 在创建 ProjectMember 后，发送通知前
try {
  await emailService.sendProjectAssignmentEmail(
    memberUser,
    project,
    role,
    user // 分配人
  );
} catch (emailError) {
  console.error('[ProjectService] 发送邮件失败:', emailError);
  // 不影响主流程，继续发送站内通知
}
```

**在 `projectService.createProject()` 中：**
```javascript
// 在 sendMemberAssignmentNotifications 后
if (validatedMembers.length > 0) {
  await emailService.sendBulkProjectAssignmentEmails(
    validatedMembers,
    project,
    creator
  );
}
```

## 五、配置和部署

### 5.1 环境变量
- 在 `.env` 文件中添加 Resend 配置
- 在 `server.js` 中验证配置（可选）

### 5.2 测试建议
1. 单元测试：邮件服务层方法
2. 集成测试：实际发送测试邮件
3. 错误测试：配置缺失、无效邮箱等场景

## 六、扩展性考虑

### 未来可扩展功能
- 邮件模板管理（数据库存储）
- 邮件发送队列（处理大量邮件）
- 邮件发送记录（审计日志）
- 用户邮件偏好设置（是否接收邮件）
- 其他邮件类型（项目完成、回款到账等）

## 七、安全考虑

1. **API Key 安全**：存储在环境变量，不提交到代码库
2. **邮件内容**：不包含敏感信息（如密码）
3. **发送频率**：避免频繁发送造成骚扰
4. **用户隐私**：遵守数据保护规定

## 八、实施优先级

1. **P0（必须）**：基础邮件发送功能
2. **P1（重要）**：邮件模板美化、错误处理完善
3. **P2（可选）**：邮件发送记录、用户偏好设置

