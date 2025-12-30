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
   * 发送阶段性交付邮件（翻译/审校/排版完成 -> PM）
   */
  async sendProjectDeliveryEmail(recipients, project, status, sender, deliveryNote, attachments = null) {
    if (!this.isEnabled()) {
      console.warn('[EmailService] 邮件服务未启用，跳过阶段性交付邮件');
      return { success: false, reason: 'EMAIL_SERVICE_DISABLED' };
    }

    const statusText = {
      translation_done: '翻译完成',
      review_done: '审校完成',
      layout_done: '排版完成'
    }[status] || '阶段性交付';

    const subject = `【阶段性交付】${project.projectNumber || ''} ${project.projectName || ''} - ${statusText}`;
    const toList = recipients.map(r => r.email).filter(Boolean);
    if (toList.length === 0) {
      console.warn('[EmailService] 阶段性交付：无有效收件人');
      return { success: false, reason: 'NO_RECIPIENT' };
    }

    const projectUrl = process.env.APP_URL || 'http://localhost:3000';
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${statusText}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:20px;">
    <h2>${statusText} - ${project.projectName || ''}</h2>
    <p>项目编号：${project.projectNumber || '-'}</p>
    <p>交付人：${sender?.name || sender?.username || '-'}</p>
    ${deliveryNote ? `<p>交付说明：${deliveryNote}</p>` : ''}
    <p>请登录系统查看项目详情并下载附件。</p>
    <p><a href="${projectUrl}/#projects" style="color:#2563eb;">进入项目列表</a></p>
  </div>
</body>
</html>
    `.trim();

    const textContent = `
${statusText} - ${project.projectName || ''}

项目编号：${project.projectNumber || '-'}
交付人：${sender?.name || sender?.username || '-'}
${deliveryNote ? `交付说明：${deliveryNote}\n` : ''}

请登录系统查看项目详情并下载附件。

${projectUrl || 'http://localhost:3000'}/#projects
    `.trim();

    const emailOptions = {
      from: `${this.fromName} <${this.fromEmail}>`,
      to: toList,
      subject,
      html: htmlContent,
      text: textContent,
      headers: {
        'List-Unsubscribe': `<${process.env.APP_URL || 'http://localhost:3000'}/#settings>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Mailer': '语家TMS系统',
        'X-Priority': '1',
        'Reply-To': this.fromEmail
      },
      tags: [
        { name: 'category', value: 'project_delivery_stage' },
        { name: 'system', value: 'kpi' }
      ]
    };

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      emailOptions.attachments = attachments.map(att => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'base64')
      }));
    }

    const result = await this.resend.emails.send(emailOptions);
    if (result?.data?.id) {
      console.log('[EmailService] 阶段性交付邮件发送成功:', { to: toList, project: project.projectName, status, messageId: result.data.id });
      return { success: true, messageId: result.data.id };
    }
    if (result?.error) {
      console.error('[EmailService] 阶段性交付邮件发送失败（API）:', result.error);
      return { success: false, reason: 'API_ERROR', error: JSON.stringify(result.error) };
    }
    console.error('[EmailService] 阶段性交付邮件发送失败（无 messageId）');
    return { success: false, reason: 'NO_MESSAGE_ID' };
  }

  /**
   * 发送最终交付邮件（项目经理 -> 销售）
   */
  async sendProjectFinalDeliveryEmail(project, sender, finalNote, attachments = null) {
    if (!this.isEnabled()) {
      console.warn('[EmailService] 邮件服务未启用，跳过最终交付邮件');
      return { success: false, reason: 'EMAIL_SERVICE_DISABLED' };
    }

    // 查询项目创建人（销售）
    const User = require('../models/User');
    const creator = await User.findById(project.createdBy).select('name email username');
    if (!creator || !creator.email) {
      console.warn('[EmailService] 最终交付：项目创建人无邮箱，跳过发送');
      return { success: false, reason: 'NO_SALES_EMAIL' };
    }

    const subject = `【最终交付】${project.projectNumber || ''} ${project.projectName || ''}`;
    const projectUrl = process.env.APP_URL || 'http://localhost:3000';

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>项目最终交付</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:20px;">
    <h2>项目最终交付 - ${project.projectName || ''}</h2>
    <p>项目编号：${project.projectNumber || '-'}</p>
    <p>交付人：${sender?.name || sender?.username || '-'}</p>
    ${finalNote ? `<p>交付说明：${finalNote}</p>` : ''}
    <p>本邮件附带了本次最终交付的文件，请注意查收。</p>
    <p><a href="${projectUrl}/#projects" style="color:#2563eb;">在系统中查看项目详情</a></p>
  </div>
</body>
</html>
    `.trim();

    const textContent = `
项目最终交付 - ${project.projectName || ''}

项目编号：${project.projectNumber || '-'}
交付人：${sender?.name || sender?.username || '-'}
${finalNote ? `交付说明：${finalNote}\n` : ''}

本邮件附带了本次最终交付的文件，请注意查收。

${projectUrl || 'http://localhost:3000'}/#projects
    `.trim();

    const emailOptions = {
      from: `${this.fromName} <${this.fromEmail}>`,
      to: creator.email,
      subject,
      html: htmlContent,
      text: textContent,
      headers: {
        'List-Unsubscribe': `<${process.env.APP_URL || 'http://localhost:3000'}/#settings>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Mailer': '语家TMS系统',
        'X-Priority': '1',
        'Reply-To': this.fromEmail
      },
      tags: [
        { name: 'category', value: 'project_delivery_final' },
        { name: 'system', value: 'kpi' }
      ]
    };

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      emailOptions.attachments = attachments.map(att => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'base64')
      }));
    }

    const result = await this.resend.emails.send(emailOptions);
    if (result?.data?.id) {
      console.log('[EmailService] 最终交付邮件发送成功:', { to: creator.email, project: project.projectName, messageId: result.data.id });
      return { success: true, messageId: result.data.id };
    }
    if (result?.error) {
      console.error('[EmailService] 最终交付邮件发送失败（API）:', result.error);
      return { success: false, reason: 'API_ERROR', error: JSON.stringify(result.error) };
    }
    console.error('[EmailService] 最终交付邮件发送失败（无 messageId）');
    return { success: false, reason: 'NO_MESSAGE_ID' };
  }

  /**
   * 初始化邮件服务
   */
  init() {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const fromName = process.env.RESEND_FROM_NAME || '语家 OA 系统';
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
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">语家 OA 系统</h1>
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
                            <p style="margin: 5px 0 0 0; font-size: 12px; color: #999999;">© ${new Date().getFullYear()} 语家 OA 系统</p>
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
© ${new Date().getFullYear()} 语家 OA 系统
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
        text: textContent,
        // 添加邮件头信息，提升送达率
        headers: {
          'List-Unsubscribe': `<${process.env.APP_URL || 'http://localhost:3000'}/#settings>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Mailer': '语家TMS系统',
          'X-Priority': '1', // 正常优先级
          'Reply-To': this.fromEmail // 设置回复地址
        },
        // 设置标签，便于 Resend 追踪
        tags: [
          { name: 'category', value: 'project_assignment' },
          { name: 'system', value: 'kpi' }
        ]
      };

      // 如果有附件，添加到邮件中
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        emailOptions.attachments = attachments.map(att => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'base64')
        }));
      }

      const result = await this.resend.emails.send(emailOptions);

      // Resend SDK 可能返回 { data } 或 { error }，这里做显式判定
      if (result?.data?.id) {
        console.log('[EmailService] 邮件发送成功:', {
          to: user.email,
          project: project.projectName,
          role: roleName,
          messageId: result.data.id
        });
        return { success: true, messageId: result.data.id };
      }

      // 如果返回 error 或没有 messageId，视为失败并记录详情
      if (result?.error) {
        const errorDetails = {
          to: user.email,
          project: project.projectName,
          role,
          errorMessage: result.error.message || '未知错误',
          errorCode: result.error.statusCode || result.error.code || 'N/A',
          errorDetails: result.error
        };
        console.error('[EmailService] 邮件发送失败（API返回错误）:', errorDetails);
        console.error('[EmailService] 完整错误对象:', JSON.stringify(result.error, null, 2));
        return { success: false, reason: 'API_ERROR', error: result.error.message || JSON.stringify(result.error) };
      }

      console.error('[EmailService] 邮件发送失败（未返回 messageId）:', {
        to: user.email,
        project: project.projectName,
        role
      });
      return { success: false, reason: 'NO_MESSAGE_ID' };
    } catch (error) {
      console.error('[EmailService] 邮件发送失败（异常）:', {
        to: user.email,
        project: project.projectName,
        role,
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name
      });
      console.error('[EmailService] 完整异常对象:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      return { success: false, reason: 'SEND_FAILED', error: error.message };
    }
  }

  /**
   * 批量发送项目分配邮件
   * @param {Array} members - 成员数组，每个元素包含 { userId, role } 或 { user, role }
   * @param {Object} project - 项目对象
   * @param {Object} assigner - 分配人对象
   * @param {Array} attachments - 附件数组（可选）
   * @returns {Promise<Object>} 发送结果统计
   */
  async sendBulkProjectAssignmentEmails(members, project, assigner = null, attachments = null) {
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

  /**
   * 生成报销申请邮件HTML内容
   * @param {Object} user - 审批人用户对象
   * @param {Object} expenseRequest - 报销申请对象
   * @param {Object} applicant - 申请人对象
   * @returns {String} HTML内容
   */
  generateExpenseRequestEmailHTML(user, expenseRequest, applicant) {
    const expenseTypeMap = {
      travel: '差旅费',
      meal: '餐费',
      transport: '交通费',
      office_supply: '办公用品',
      communication: '通讯费',
      other: '其他'
    };
    const expenseTypeText = expenseTypeMap[expenseRequest.expenseType] || expenseRequest.expenseType;
    const requestDate = new Date(expenseRequest.createdAt).toLocaleString('zh-CN');
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .info-row { margin: 10px 0; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; }
          .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; background: white; }
          .items-table th, .items-table td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          .items-table th { background: #f3f4f6; font-weight: bold; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>报销申请通知</h2>
          </div>
          <div class="content">
            <p>您好 ${user.name || user.username}，</p>
            <p>您收到一份新的报销申请，请及时审批。</p>
            
            <div class="info-row">
              <span class="label">申请编号：</span>
              <span class="value">${expenseRequest.requestNumber}</span>
            </div>
            <div class="info-row">
              <span class="label">费用类型：</span>
              <span class="value">${expenseTypeText}</span>
            </div>
            <div class="info-row">
              <span class="label">总金额：</span>
              <span class="value">¥${expenseRequest.totalAmount.toLocaleString()}</span>
            </div>
            <div class="info-row">
              <span class="label">申请人：</span>
              <span class="value">${applicant.name || applicant.username}</span>
            </div>
            <div class="info-row">
              <span class="label">申请时间：</span>
              <span class="value">${requestDate}</span>
            </div>
            <div class="info-row">
              <span class="label">申请说明：</span>
              <span class="value">${expenseRequest.reason || '无'}</span>
            </div>
            
            ${expenseRequest.items && expenseRequest.items.length > 0 ? `
            <h3>费用明细：</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>金额</th>
                  <th>说明</th>
                  <th>发票号</th>
                </tr>
              </thead>
              <tbody>
                ${expenseRequest.items.map(item => `
                  <tr>
                    <td>${new Date(item.date).toLocaleDateString('zh-CN')}</td>
                    <td>¥${item.amount.toLocaleString()}</td>
                    <td>${item.description}</td>
                    <td>${item.invoice || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ` : ''}
            
            <p style="margin-top: 20px;">
              <a href="${process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000'}/#expense" class="button">查看详情并审批</a>
            </p>
          </div>
          <div class="footer">
            <p>此邮件由系统自动发送，请勿回复。</p>
            <p>${new Date().getFullYear()} 语家 KPI 系统</p>
          </div>
        </div>
      </body>
      </html>
    `.trim();
  }

  /**
   * 生成报销申请邮件纯文本内容
   * @param {Object} user - 审批人用户对象
   * @param {Object} expenseRequest - 报销申请对象
   * @param {Object} applicant - 申请人对象
   * @returns {String} 纯文本内容
   */
  generateExpenseRequestEmailText(user, expenseRequest, applicant) {
    const expenseTypeMap = {
      travel: '差旅费',
      meal: '餐费',
      transport: '交通费',
      office_supply: '办公用品',
      communication: '通讯费',
      other: '其他'
    };
    const expenseTypeText = expenseTypeMap[expenseRequest.expenseType] || expenseRequest.expenseType;
    const requestDate = new Date(expenseRequest.createdAt).toLocaleString('zh-CN');
    
    return `
报销申请通知

您好 ${user.name || user.username}，

您收到一份新的报销申请，请及时审批。

申请编号：${expenseRequest.requestNumber}
费用类型：${expenseTypeText}
总金额：¥${expenseRequest.totalAmount.toLocaleString()}
申请人：${applicant.name || applicant.username}
申请时间：${requestDate}
申请说明：${expenseRequest.reason || '无'}

费用明细：
${expenseRequest.items && expenseRequest.items.length > 0 
  ? expenseRequest.items.map((item, index) => 
      `${index + 1}. ${new Date(item.date).toLocaleDateString('zh-CN')} - ¥${item.amount.toLocaleString()} - ${item.description}${item.invoice ? ` (发票号: ${item.invoice})` : ''}`
    ).join('\n')
  : '无'
}

请登录系统查看详情并审批。

${new Date().getFullYear()} 语家 OA 系统
    `.trim();
  }

  /**
   * 生成发票开具完成邮件 HTML 内容
   * @param {Object} request - 发票申请对象
   * @param {Object} invoice - 发票对象
   * @param {Object} recipient - 收件人用户（createdBy）
   */
  generateInvoiceIssuedEmailHTML(request, invoice, recipient) {
    const projectSummary = (request.projects || [])
      .map(p => `${p.projectNumber || '-'} ${p.projectName || '-'}`)
      .join('、') || '相关项目';

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>发票开具通知</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f5f5f5;">
    <tr>
      <td style="padding:24px;">
        <table role="presentation" style="width:100%;max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:20px 24px;background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);border-radius:8px 8px 0 0;color:#fff;">
              <h1 style="margin:0;font-size:20px;font-weight:600;">发票开具通知</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 16px 0;font-size:15px;color:#111827;">${recipient?.name || recipient?.username || '您好'}：</p>
              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">
                您提交的发票申请已由财务开具，相关信息如下：
              </p>
              <div style="margin:16px 0;padding:16px;background-color:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
                <p style="margin:0 0 8px 0;font-size:14px;color:#6b7280;">申请信息：</p>
                <ul style="margin:0 0 8px 20px;padding:0;font-size:14px;color:#374151;">
                  <li>项目：${projectSummary}</li>
                  <li>申请金额：¥${(request.amount || 0).toLocaleString()}</li>
                  <li>发票类型：${request.invoiceType === 'vat' ? '增值税发票' : request.invoiceType === 'normal' ? '普通发票' : '其他'}</li>
                  <li>发票抬头：${request.invoiceInfo?.title || '-'}</li>
                </ul>
                <p style="margin:8px 0 4px 0;font-size:14px;color:#6b7280;">开票信息：</p>
                <ul style="margin:0 0 0 20px;padding:0;font-size:14px;color:#374151;">
                  <li>发票号：${invoice.invoiceNumber || '-'}</li>
                  <li>开票金额：¥${(invoice.amount || 0).toLocaleString()}</li>
                  <li>开票日期：${invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('zh-CN') : '-'}</li>
                </ul>
              </div>
              <p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;">
                如本邮件附带有发票 PDF 或照片，请注意查收并确认。如有疑问，请联系财务人员或管理员。
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background-color:#f9fafb;border-radius:0 0 8px 8px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">此邮件由系统自动发送，请勿直接回复。</p>
              <p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} 语家TMS系统</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * 生成发票开具完成邮件纯文本内容
   */
  generateInvoiceIssuedEmailText(request, invoice, recipient) {
    const projectSummary = (request.projects || [])
      .map(p => `${p.projectNumber || '-'} ${p.projectName || '-'}`)
      .join('、') || '相关项目';

    return `
发票开具通知

您好 ${recipient?.name || recipient?.username || ''}，

您提交的发票申请已由财务开具，相关信息如下：

项目：${projectSummary}
申请金额：¥${(request.amount || 0).toLocaleString()}
发票类型：${request.invoiceType === 'vat' ? '增值税发票' : request.invoiceType === 'normal' ? '普通发票' : '其他'}
发票抬头：${request.invoiceInfo?.title || '-'}

开票信息：
发票号：${invoice.invoiceNumber || '-'}
开票金额：¥${(invoice.amount || 0).toLocaleString()}
开票日期：${invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('zh-CN') : '-'}

如本邮件附带有发票 PDF 或照片，请注意查收并确认。如有疑问，请联系财务人员或管理员。

${new Date().getFullYear()} 语家TMS系统
    `.trim();
  }

  /**
   * 发送发票开具完成邮件给申请人和可选通知邮箱
   * @param {Object} request - 已审批的发票申请（需填充 projects、createdBy）
   * @param {Object} invoice - 关联的发票
   * @param {Array} attachments - 附件数组 [{ filename, content: Buffer | base64, contentType }]
   * @returns {Promise<Object>}
   */
  async sendInvoiceIssuedEmail(request, invoice, attachments = null) {
    if (!this.isEnabled()) {
      console.warn('[EmailService] 邮件服务未启用，跳过发送发票通知');
      return { success: false, reason: 'EMAIL_SERVICE_DISABLED' };
    }

    const recipient = request.createdBy;
    const extraEmail = request.notifyEmail;

    if (!recipient?.email && !extraEmail) {
      console.warn('[EmailService] 发票开具通知：没有有效的收件邮箱，跳过发送');
      return { success: false, reason: 'NO_EMAIL' };
    }

    try {
      const htmlContent = this.generateInvoiceIssuedEmailHTML(request, invoice, recipient);
      const textContent = this.generateInvoiceIssuedEmailText(request, invoice, recipient);

      const toList = [];
      if (recipient?.email) toList.push(recipient.email);
      if (extraEmail) toList.push(extraEmail);

      const emailOptions = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: toList,
        subject: `【发票开具通知】${invoice.invoiceNumber || ''} - ¥${(invoice.amount || 0).toLocaleString()}`,
        html: htmlContent,
        text: textContent,
        headers: {
          'List-Unsubscribe': `<${process.env.APP_URL || 'http://localhost:3000'}/#settings>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Mailer': '语家TMS系统',
          'X-Priority': '1',
          'Reply-To': this.fromEmail
        },
        tags: [
          { name: 'category', value: 'invoice_issued' },
          { name: 'system', value: 'kpi' }
        ]
      };

      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        emailOptions.attachments = attachments.map(att => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'base64'),
          contentType: att.contentType
        }));
      }

      const result = await this.resend.emails.send(emailOptions);

      if (result?.data?.id) {
        console.log('[EmailService] 发票开具通知邮件发送成功:', {
          to: toList,
          invoiceNumber: invoice.invoiceNumber,
          messageId: result.data.id
        });
        return { success: true, messageId: result.data.id };
      }

      if (result?.error) {
        console.error('[EmailService] 发票开具通知邮件发送失败（API返回错误）:', {
          to: toList,
          invoiceNumber: invoice.invoiceNumber,
          error: result.error
        });
        return { success: false, reason: 'API_ERROR', error: JSON.stringify(result.error) };
      }

      console.error('[EmailService] 发票开具通知邮件发送失败（未返回 messageId）:', {
        to: toList,
        invoiceNumber: invoice.invoiceNumber
      });
      return { success: false, reason: 'NO_MESSAGE_ID' };
    } catch (error) {
      console.error('[EmailService] 发票开具通知邮件发送失败（异常）:', {
        requestId: request._id,
        invoiceId: invoice._id,
        errorMessage: error.message,
        errorStack: error.stack
      });
      return { success: false, reason: 'SEND_FAILED', error: error.message };
    }
  }

  /**
   * 发送报销申请邮件给审批人
   * @param {Object} user - 审批人用户对象（包含 name, email）
   * @param {Object} expenseRequest - 报销申请对象
   * @param {Object} applicant - 申请人对象
   * @param {Array} attachments - 附件数组，格式：[{ filename: string, content: Buffer }]（可选）
   * @returns {Promise<Object>} 发送结果
   */
  async sendExpenseRequestEmail(user, expenseRequest, applicant, attachments = null) {
    if (!this.isEnabled()) {
      console.warn('[EmailService] 邮件服务未启用，跳过发送');
      return { success: false, reason: 'EMAIL_SERVICE_DISABLED' };
    }

    if (!user || !user.email) {
      console.warn('[EmailService] 用户邮箱不存在，跳过发送:', user?.name || user?.username);
      return { success: false, reason: 'NO_EMAIL' };
    }

    try {
      const htmlContent = this.generateExpenseRequestEmailHTML(user, expenseRequest, applicant);
      const textContent = this.generateExpenseRequestEmailText(user, expenseRequest, applicant);

      const emailOptions = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: user.email,
        subject: `【报销申请通知】${expenseRequest.requestNumber} - ${expenseRequest.totalAmount}元`,
        html: htmlContent,
        text: textContent,
        // 添加邮件头信息，提升送达率
        headers: {
          'List-Unsubscribe': `<${process.env.APP_URL || 'http://localhost:3000'}/#settings>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Mailer': '语家TMS系统',
          'X-Priority': '1',
          'Reply-To': this.fromEmail
        },
        tags: [
          { name: 'category', value: 'expense_request' },
          { name: 'system', value: 'kpi' }
        ]
      };

      // 如果有附件，添加到邮件中
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        emailOptions.attachments = attachments.map(att => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'base64')
        }));
      }

      const result = await this.resend.emails.send(emailOptions);

      if (result?.data?.id) {
        console.log('[EmailService] 报销申请邮件发送成功:', {
          to: user.email,
          requestNumber: expenseRequest.requestNumber,
          messageId: result.data.id
        });
        return { success: true, messageId: result.data.id };
      }

      if (result?.error) {
        console.error('[EmailService] 报销申请邮件发送失败（API返回错误）:', {
          to: user.email,
          requestNumber: expenseRequest.requestNumber,
          error: result.error
        });
        return { success: false, reason: 'API_ERROR', error: JSON.stringify(result.error) };
      }

      console.error('[EmailService] 报销申请邮件发送失败（未返回 messageId）:', {
        to: user.email,
        requestNumber: expenseRequest.requestNumber
      });
      return { success: false, reason: 'NO_MESSAGE_ID' };
    } catch (error) {
      console.error('[EmailService] 报销申请邮件发送失败:', {
        to: user.email,
        requestNumber: expenseRequest.requestNumber,
        error: error.message
      });
      return { success: false, reason: 'SEND_FAILED', error: error.message };
    }
  }

  /**
   * 批量发送报销申请邮件给审批人
   * @param {Array} users - 审批人用户数组
   * @param {Object} expenseRequest - 报销申请对象
   * @param {Object} applicant - 申请人对象
   * @param {Array} attachments - 附件数组（可选）
   * @returns {Promise<Object>} 发送结果统计
   */
  async sendBulkExpenseRequestEmails(users, expenseRequest, applicant, attachments = null) {
    if (!this.isEnabled() || !users || users.length === 0) {
      return { total: 0, success: 0, failed: 0 };
    }

    const results = {
      total: users.length,
      success: 0,
      failed: 0,
      details: []
    };

    // 批量发送（使用 Promise.allSettled 确保所有邮件都尝试发送）
    const emailPromises = users.map(async (user) => {
      if (!user || !user.email) {
        results.failed++;
        results.details.push({ userId: user._id, reason: 'NO_EMAIL' });
        return;
      }

      const emailResult = await this.sendExpenseRequestEmail(user, expenseRequest, applicant, attachments);
      if (emailResult.success) {
        results.success++;
        results.details.push({ userId: user._id, email: user.email, status: 'success' });
      } else {
        results.failed++;
        results.details.push({ userId: user._id, email: user.email, status: 'failed', reason: emailResult.reason });
      }
    });

    await Promise.allSettled(emailPromises);

    console.log('[EmailService] 批量报销申请邮件发送完成:', {
      requestNumber: expenseRequest.requestNumber,
      total: results.total,
      success: results.success,
      failed: results.failed
    });

    return results;
  }
}

// 导出单例实例
module.exports = new EmailService();

