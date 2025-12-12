const { body, validationResult } = require('express-validator');

/**
 * 项目创建验证规则
 */
const createProjectValidation = [
  body('projectName')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('项目名称长度应在2-200个字符之间'),
  
  body('customerId')
    .notEmpty()
    .withMessage('客户不能为空')
    .isMongoId()
    .withMessage('客户ID格式无效'),
  
  body('deadline')
    .notEmpty()
    .withMessage('交付时间不能为空')
    .isISO8601()
    .withMessage('交付时间格式无效')
    .custom((value) => {
      const deadline = new Date(value);
      if (isNaN(deadline.getTime())) {
        throw new Error('交付时间格式无效');
      }
      // 可以根据业务需求决定是否允许过去的日期
      // if (deadline < new Date()) {
      //   throw new Error('交付时间不能早于当前时间');
      // }
      return true;
    }),
  
  body('sourceLanguage')
    .trim()
    .notEmpty()
    .withMessage('源语种不能为空'),
  
  body('targetLanguages')
    .isArray({ min: 1, max: 20 })
    .withMessage('目标语言必须是数组，且数量在1-20个之间')
    .custom((languages) => {
      if (!Array.isArray(languages)) {
        throw new Error('目标语言必须是数组格式');
      }
      if (languages.length === 0) {
        throw new Error('至少需要指定一个目标语言');
      }
      if (languages.length > 20) {
        throw new Error('目标语言数量不能超过20个');
      }
      // 检查是否有重复
      const unique = [...new Set(languages.map(lang => String(lang).trim()).filter(lang => lang))];
      if (unique.length !== languages.length) {
        throw new Error('目标语言列表中存在重复项');
      }
      return true;
    }),
  
  body('projectAmount')
    .optional()
    .isFloat({ min: 0, max: 100000000 })
    .withMessage('项目金额必须在0-100000000之间'),
  
  body('wordCount')
    .optional()
    .isFloat({ min: 0, max: 100000000 })
    .withMessage('字数必须在0-100000000之间'),
  
  body('unitPrice')
    .optional()
    .isFloat({ min: 0, max: 100000 })
    .withMessage('单价必须在0-100000之间'),
  
  body('members')
    .optional()
    .isArray({ max: 50 })
    .withMessage('项目成员必须是数组，且数量不能超过50个')
    .custom((members) => {
      if (!Array.isArray(members)) {
        return true; // 可选字段，如果不存在则跳过
      }
      if (members.length > 50) {
        throw new Error('项目成员数量不能超过50个');
      }
      const validRoles = ['translator', 'reviewer', 'pm', 'sales', 'admin_staff', 'part_time_sales', 'layout'];
      for (const member of members) {
        if (!member.userId || !member.role) {
          throw new Error('每个成员必须包含userId和role字段');
        }
        if (!validRoles.includes(member.role)) {
          throw new Error(`无效的角色: ${member.role}`);
        }
        if (member.wordRatio !== undefined) {
          const wordRatio = parseFloat(member.wordRatio);
          if (isNaN(wordRatio) || wordRatio < 0 || wordRatio > 10) {
            throw new Error('字数比例必须在0-10之间');
          }
        }
      }
      return true;
    }),
  
  body('partTimeSales.isPartTime')
    .optional()
    .isBoolean()
    .withMessage('兼职销售标识必须是布尔值'),
  
  body('partTimeSales.companyReceivable')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('公司应收金额必须是非负数'),
  
  body('partTimeSales.taxRate')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('税率必须在0-1之间（0-100%）'),
  
  body('partTimeLayout.isPartTime')
    .optional()
    .isBoolean()
    .withMessage('兼职排版标识必须是布尔值'),
  
  body('partTimeLayout.layoutCost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('排版费用必须是非负数'),
];

/**
 * 验证结果处理中间件
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: '输入验证失败',
      errors: errors.array()
    });
  }
  next();
};

module.exports = {
  createProjectValidation,
  handleValidationErrors
};

