# 邮件发送检查指南

## 一、查看 PM2 日志（推荐方法）

### 1. 查看最新日志（实时监控）

```bash
# 查看所有日志（实时）
pm2 logs kpi

# 查看最近 100 行日志
pm2 logs kpi --lines 100

# 只查看错误日志
pm2 logs kpi --err --lines 50

# 只查看输出日志（成功信息）
pm2 logs kpi --out --lines 50
```

### 2. 查看日志文件

PM2 日志文件位置：
- **错误日志**：`/var/www/kpi/logs/pm2-error.log`
- **输出日志**：`/var/www/kpi/logs/pm2-out.log`

```bash
cd /var/www/kpi

# 查看错误日志最后 50 行
tail -50 logs/pm2-error.log

# 查看输出日志最后 50 行
tail -50 logs/pm2-out.log

# 实时监控日志文件
tail -f logs/pm2-out.log

# 搜索邮件相关日志
grep -i "EmailService" logs/pm2-out.log | tail -20
grep -i "邮件" logs/pm2-out.log | tail -20
```

### 3. 日志中的关键信息

#### ✅ **邮件发送成功**
```
[EmailService] 邮件发送成功: {
  to: 'user@example.com',
  project: '项目名称',
  role: '翻译',
  messageId: 're_xxxxxxxxxxxxx'
}
```

#### ✅ **批量邮件发送完成**
```
[EmailService] 批量邮件发送完成: {
  project: '项目名称',
  total: 3,
  success: 3,
  failed: 0
}
```

#### ❌ **邮件发送失败**
```
[EmailService] 邮件发送失败: {
  to: 'user@example.com',
  project: '项目名称',
  role: '翻译',
  error: '错误信息'
}
```

#### ⚠️ **邮件服务未启用**
```
[EmailService] 邮件服务未启用，跳过发送
```

#### ⚠️ **用户邮箱不存在**
```
[EmailService] 用户邮箱不存在，跳过发送: 用户名
```

#### ⚠️ **邮件配置不完整**
```
[EmailService] 邮件配置不完整，邮件功能已禁用
[EmailService] 需要配置: RESEND_API_KEY, RESEND_FROM_EMAIL
```

## 二、查看 Resend Dashboard（最准确）

Resend 提供了详细的邮件发送记录和状态。

### 1. 登录 Resend Dashboard

访问：https://resend.com/emails

### 2. 查看邮件发送记录

- **发送时间**：邮件发送的准确时间
- **收件人**：邮件发送到的邮箱地址
- **状态**：
  - ✅ **Sent**：已发送到邮件服务器
  - ✅ **Delivered**：已送达收件箱
  - ⚠️ **Bounced**：邮件被退回（邮箱不存在或已满）
  - ⚠️ **Failed**：发送失败（API 错误、配置错误等）
  - ⚠️ **Complained**：收件人标记为垃圾邮件

### 3. 查看邮件详情

点击任意邮件记录，可以查看：
- **Message ID**：邮件唯一标识（与日志中的 `messageId` 对应）
- **发送时间**：精确到秒
- **收件人**：完整邮箱地址
- **主题**：邮件主题
- **状态**：当前状态和状态变更历史
- **错误信息**：如果失败，会显示详细错误

### 4. 使用 Message ID 查找

如果日志中记录了 `messageId`（如 `re_xxxxxxxxxxxxx`），可以在 Resend Dashboard 中搜索该 ID 查看详细状态。

## 三、快速检查命令

### 1. 检查邮件服务是否初始化

```bash
pm2 logs kpi --lines 200 | grep -i "EmailService.*初始化"
```

应该看到：
```
[EmailService] 邮件服务已初始化
```

### 2. 检查最近的邮件发送记录

```bash
# 查看最近 1 小时内的邮件发送记录
pm2 logs kpi --lines 500 | grep -i "EmailService.*邮件发送" | tail -20
```

### 3. 检查邮件发送失败记录

```bash
# 查看最近的失败记录
pm2 logs kpi --lines 500 | grep -i "邮件发送失败" | tail -10
```

### 4. 检查邮件配置

```bash
# 检查环境变量（不显示敏感信息）
pm2 show kpi | grep -E "RESEND|EMAIL"
```

## 四、常见问题排查

### 问题 1：日志显示"邮件发送成功"，但收件人没收到

**可能原因：**
1. 邮件被标记为垃圾邮件
2. 收件人邮箱地址错误
3. 邮件服务器延迟

**排查步骤：**
1. 检查 Resend Dashboard，查看邮件状态
2. 如果状态是 "Delivered"，检查收件人的垃圾邮件文件夹
3. 如果状态是 "Bounced"，检查邮箱地址是否正确
4. 如果状态是 "Failed"，查看错误信息

### 问题 2：日志显示"邮件服务未启用"

**可能原因：**
1. `.env` 文件中 `EMAIL_ENABLED=false`
2. `RESEND_API_KEY` 或 `RESEND_FROM_EMAIL` 未配置

**排查步骤：**
```bash
cd /var/www/kpi
cat .env | grep -E "EMAIL_ENABLED|RESEND"
```

应该看到：
```
EMAIL_ENABLED=true
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### 问题 3：日志显示"用户邮箱不存在"

**可能原因：**
1. 用户资料中没有填写邮箱
2. 用户邮箱字段为空

**排查步骤：**
1. 登录系统，检查用户资料中的邮箱字段
2. 确保邮箱格式正确（如 `user@example.com`）

### 问题 4：日志显示"邮件发送失败"

**可能原因：**
1. Resend API Key 无效或过期
2. 发件人邮箱域名未验证
3. 邮件内容格式错误
4. Resend 服务异常

**排查步骤：**
1. 查看日志中的详细错误信息
2. 登录 Resend Dashboard，检查 API Key 状态
3. 检查域名验证状态（Domains 页面）
4. 查看 Resend Dashboard 中的错误日志

## 五、测试邮件发送

### 1. 通过项目分配测试

创建一个测试项目，添加一个成员，系统会自动发送邮件。

### 2. 通过报销申请测试

创建一个报销申请，系统会发送邮件给审批人。

### 3. 实时监控日志

在另一个终端窗口运行：
```bash
pm2 logs kpi --lines 0
```

然后执行触发邮件发送的操作，观察日志输出。

## 六、日志示例

### 成功发送示例

```
[EmailService] 邮件发送成功: {
  to: 'zhangsan@example.com',
  project: '测试项目',
  role: '翻译',
  messageId: 're_abc123def456'
}
[EmailService] 批量邮件发送完成: {
  project: '测试项目',
  total: 2,
  success: 2,
  failed: 0
}
```

### 失败示例

```
[EmailService] 邮件发送失败: {
  to: 'lisi@example.com',
  project: '测试项目',
  role: '审校',
  error: 'Invalid API key'
}
[EmailService] 批量邮件发送完成: {
  project: '测试项目',
  total: 2,
  success: 1,
  failed: 1
}
```

## 七、最佳实践

1. **定期检查日志**：每天查看一次邮件发送日志，确保服务正常
2. **监控失败率**：如果失败率超过 5%，需要检查配置
3. **使用 Resend Dashboard**：定期查看 Dashboard，了解邮件送达情况
4. **测试新配置**：修改邮件配置后，先测试发送，确认正常后再使用

---

**提示**：如果遇到问题，先查看 PM2 日志，然后对照 Resend Dashboard 确认邮件状态。

