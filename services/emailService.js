const { Resend } = require('resend');

/**
 * 邮件服务层
 * 负责发送系统邮件通知
 */
class EmailService {
  constructor() {
    this.resend = null;
    this.enabled = false;
    this.fromEmail = null;
    this.fromName = null;
    this.init();
  }

  /**
   * 初始化邮件服务
   */
  init() {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const fromName = process.env.RESEND_FROM_NAME || '语家 KPI 系统';
    const emailEnabled = process.env.EMAIL_ENABLED !== 'false'; // 默认启用

    if (!apiKey || !fromEmail) {
      console.warn('[EmailService] 邮件配置不完整，邮件功能已禁用');
      console.warn('[EmailService] 需要配置: RESEND_API_KEY, RESEND_FROM_EMAIL');
      this.enabled = false;
      return;
    }

    try {
      this.resend = new Resend(apiKey);
      this.fromEmail = fromEmail;
      this.fromName = fromName;
      this.enabled = emailEnabled;
      console.log('[EmailService] 邮件服务已初始化');
    } catch (error) {
      console.error('[EmailService] 初始化失败:', error.message);
      this.enabled = false;
    }
  }

  /**
   * 检查邮件服务是否可用
   */
  isEnabled() {
    return this.enabled && this.resend !== null;
  }

  /**
   * 获取角色中文名称
   */
  getRoleName(role) {
    const roleNames = {
      'pm': '项目经理',
      'translator': '翻译',
      'reviewer': '审校',
      'layout': '排版',
      'sales': '销售',
      'part_time_sales': '兼职销售',
      'admin_staff': '综合岗',
      'part_time_translator': '兼职翻译'
    };
    return roleNames[role] || role;
  }

  /**
   * 生成项目分配邮件 HTML 模板
   */
  generateProjectAssignmentEmailHTML(user, project, role, assigner) {
    const roleName = this.getRoleName(role);
    const projectUrl = process.env.APP_URL || 'http://localhost:3000';
    const deadline = project.deadline ? new Date(project.deadline).toLocaleDateString('zh-CN') : '未设置';
    const targetLanguages = Array.isArray(project.targetLanguages) 
      ? project.targetLanguages.join('、') 
      : project.targetLanguages || '未设置';

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>项目分配通知</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">语家 KPI 系统</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 30px;">
                            <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">${user.name}，您好！</p>
                            
                            <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">您已被分配到新项目，详情如下：</p>
                            
                            <!-- Project Info Card -->
                            <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px;">
                                <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #333333;">${project.projectName || '未命名项目'}</h2>
                                
                                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 100px;">项目编号：</td>
                                        <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 500;">${project.projectNumber || '-'}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">分配角色：</td>
                                        <td style="padding: 8px 0; color: #667eea; font-size: 14px; font-weight: 600;">${roleName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">交付时间：</td>
                                        <td style="padding: 8px 0; color: #333333; font-size: 14px;">${deadline}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">源语种：</td>
                                        <td style="padding: 8px 0; color: #333333; font-size: 14px;">${project.sourceLanguage || '-'}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">目标语种：</td>
                                        <td style="padding: 8px 0; color: #333333; font-size: 14px;">${targetLanguages}</td>
                                    </tr>
                                    ${assigner ? `
                                    <tr>
                                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">分配人：</td>
                                        <td style="padding: 8px 0; color: #333333; font-size: 14px;">${assigner.name || assigner.username || '-'}</td>
                                    </tr>
                                    ` : ''}
                                </table>
                            </div>
                            
                            <!-- Action Button -->
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${projectUrl}/#projects" style="display: inline-block; padding: 12px 30px; background-color: #667eea; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">查看项目详情</a>
                            </div>
                            
                            <p style="margin: 20px 0 0 0; font-size: 14px; color: #999999; line-height: 1.6;">如有疑问，请联系项目负责人或系统管理员。</p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 30px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center; border-top: 1px solid #e9ecef;">
                            <p style="margin: 0; font-size: 12px; color: #999999;">此邮件由系统自动发送，请勿回复。</p>
                            <p style="margin: 5px 0 0 0; font-size: 12px; color: #999999;">© ${new Date().getFullYear()} 语家 KPI 系统</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
  }

  /**
   * 生成项目分配邮件纯文本模板
   */
  generateProjectAssignmentEmailText(user, project, role, assigner) {
    const roleName = this.getRoleName(role);
    const projectUrl = process.env.APP_URL || 'http://localhost:3000';
    const deadline = project.deadline ? new Date(project.deadline).toLocaleDateString('zh-CN') : '未设置';
    const targetLanguages = Array.isArray(project.targetLanguages) 
      ? project.targetLanguages.join('、') 
      : project.targetLanguages || '未设置';

    return `
${user.name}，您好！

您已被分配到新项目，详情如下：

项目名称：${project.projectName || '未命名项目'}
项目编号：${project.projectNumber || '-'}
分配角色：${roleName}
交付时间：${deadline}
源语种：${project.sourceLanguage || '-'}
目标语种：${targetLanguages}
${assigner ? `分配人：${assigner.name || assigner.username || '-'}` : ''}

请登录系统查看项目详情：${projectUrl}/#projects

如有疑问，请联系项目负责人或系统管理员。

---
此邮件由系统自动发送，请勿回复。
© ${new Date().getFullYear()} 语家 KPI 系统
    `.trim();
  }

  /**
   * 发送项目分配邮件
   * @param {Object} user - 用户对象（包含 name, email）
   * @param {Object} project - 项目对象
   * @param {String} role - 角色代码
   * @param {Object} assigner - 分配人对象（可选）
   * @param {Array} attachments - 附件数组，格式：[{ filename: string, content: Buffer }]（可选）
   * @returns {Promise<Object>} 发送结果
   */
  async sendProjectAssignmentEmail(user, project, role, assigner = null, attachments = null) {
    if (!this.isEnabled()) {
      console.warn('[EmailService] 邮件服务未启用，跳过发送');
      return { success: false, reason: 'EMAIL_SERVICE_DISABLED' };
    }

    if (!user || !user.email) {
      console.warn('[EmailService] 用户邮箱不存在，跳过发送:', user?.name || user?.username);
      return { success: false, reason: 'NO_EMAIL' };
    }

    try {
      const htmlContent = this.generateProjectAssignmentEmailHTML(user, project, role, assigner);
      const textContent = this.generateProjectAssignmentEmailText(user, project, role, assigner);
      const roleName = this.getRoleName(role);

      const emailOptions = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: user.email,
        subject: `【项目分配通知】${project.projectName || '新项目'} - ${roleName}`,
        html: htmlContent,
        text: textContent
      };

      // 如果有附件，添加到邮件中
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        emailOptions.attachments = attachments.map(att => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'base64')
        }));
      }

      const result = await this.resend.emails.send(emailOptions);

      console.log('[EmailService] 邮件发送成功:', {
        to: user.email,
        project: project.projectName,
        role: roleName,
        messageId: result.data?.id
      });

      return { success: true, messageId: result.data?.id };
    } catch (error) {
      console.error('[EmailService] 邮件发送失败:', {
        to: user.email,
        project: project.projectName,
        role,
        error: error.message
      });
      return { success: false, reason: 'SEND_FAILED', error: error.message };
    }
  }

  /**
   * 批量发送项目分配邮件
   * @param {Array} members - 成员数组，每个元素包含 { userId, role } 或 { user, role }
   * @param {Object} project - 项目对象
   * @param {Object} assigner - 分配人对象
   * @returns {Promise<Object>} 发送结果统计
   */
  async sendBulkProjectAssignmentEmails(members, project, assigner = null) {
    if (!this.isEnabled() || !members || members.length === 0) {
      return { total: 0, success: 0, failed: 0 };
    }

    const results = {
      total: members.length,
      success: 0,
      failed: 0,
      details: []
    };

    // 批量发送（使用 Promise.allSettled 确保所有邮件都尝试发送）
    const emailPromises = members.map(async (member) => {
      let user = null;
      const role = member.role;

      // 处理不同的成员数据结构
      if (member.userId && typeof member.userId === 'object' && member.userId.email) {
        user = member.userId;
      } else if (member.user && member.user.email) {
        user = member.user;
      } else if (member.userId) {
        // 需要查询用户信息
        const User = require('../models/User');
        user = await User.findById(member.userId).select('name email username');
      }

      if (!user || !user.email) {
        results.failed++;
        results.details.push({ userId: member.userId, role, reason: 'NO_EMAIL' });
        return;
      }

      const emailResult = await this.sendProjectAssignmentEmail(user, project, role, assigner, attachments);
      if (emailResult.success) {
        results.success++;
        results.details.push({ userId: user._id, email: user.email, role, status: 'success' });
      } else {
        results.failed++;
        results.details.push({ userId: user._id, email: user.email, role, status: 'failed', reason: emailResult.reason });
      }
    });

    await Promise.allSettled(emailPromises);

    console.log('[EmailService] 批量邮件发送完成:', {
      project: project.projectName,
      total: results.total,
      success: results.success,
      failed: results.failed
    });

    return results;
  }
}

// 导出单例实例
module.exports = new EmailService();

