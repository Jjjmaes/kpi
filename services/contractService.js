const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TabStopType,
  TabStopPosition
} = require('docx');

/**
 * 生成项目合同 Word 文档（基于用户提供的模板结构）
 * @param {Object} project - 项目数据（包含 customerId, contactInfo 等）
 * @param {Array} members - 项目成员列表（已 populate userId）
 * @returns {Promise<Buffer>} docx 文件 Buffer
 */
async function generateProjectContract(project, members = []) {
  const vars = buildTemplateVariables(project, members);
  const doc = new Document({
    creator: 'KPI System',
    title: '翻译服务合同',
    description: '自动生成的翻译服务合同',
    sections: [
      {
        properties: {
          page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }
        },
        children: buildContractContent(project, members, vars)
      }
    ]
  });

  return await Packer.toBuffer(doc);
}

function buildContractContent(project, members, vars) {
  const reqs = project.specialRequirements || {};
  const checklist = {
    translation: checkmark(project.businessType === 'translation'),
    interpretation: checkmark(project.businessType === 'interpretation'),
    electronic: checkmark(true),
    email: checkmark(true),
    fax: checkmark(false),
    print: checkmark(reqs.printSealExpress)
  };

  return [
    heading1('翻译服务合同'),
    boldLine(`编号：${vars.projectNumber}`),
    separator(),
    heading2('一、合同主体'),
    twoCols('甲方（委托方）：', project.customerId?.name || project.clientName || '—'),
    twoCols('地址：', vars.customerAddress),
    twoCols('电话（Tel）：', vars.contactPhone),
    twoCols('传真（Fax）：', '—'),
    twoCols('邮编（Postal Code）：', '—'),
    blankLine(),
    twoCols('乙方（服务方）：', '上海语家信息科技有限公司'),
    twoCols('地址：', '上海市浦东新盛荣路88弄1-206'),
    twoCols('电话（Tel）：', '021-61984608'),
    twoCols('传真（Fax）：', '—'),
    twoCols('邮编（Postal Code）：', '200123'),
    separator(),
    paragraph('鉴于乙方具备专业翻译服务能力，甲方委托乙方就相关资料提供翻译服务。双方在平等、自愿、诚实信用的基础上，经协商一致，订立本合同，以兹共同遵守。'),
    separator(),
    heading2('二、项目说明'),
    numbered('1.', '文稿名称（Title）：', project.projectName || '—'),
    numbered('2.', '翻译类型：', `${checklist.interpretation} 口译    ${checklist.translation} 笔译`),
    numbered('3.', '翻译语种：', `原语种：${project.sourceLanguage || '—'}    目标语种：${vars.targetLanguagesText}`),
    numbered('4.', '交付时间：', `自合同签署并确认全部翻译资料之日起 ${vars.deliveryDaysText} 内完成交付。`),
    numbered('5.', '字数及计价规则：', ''),
    bullet('以原文字数为计价依据；'),
    bullet('字数统计以 Microsoft Word 工具栏显示的“字数”为准；'),
    bullet('页眉、页脚、文本框、图片、表格内容另行统计；'),
    bullet('小件翻译规则：不足 500 字按 500 字计；超过 500 字不足 1000 字按 1000 字计；'),
    bullet('证件翻译按“份”计价，价格另行约定。'),
    separator(),
    heading2('三、服务费用'),
    paragraph(`笔译单价：${vars.unitPriceText}`),
    paragraph(`资料总量：${vars.wordCountText}`),
    paragraph(`翻译总费用：${vars.amountText}`),
    paragraph('上述费用为双方确认的合同价款，除另有书面约定外，不因译者或流程调整发生变化。'),
    separator(),
    heading2('四、付款方式'),
    paragraph('1. 付款安排：'),
    bullet(`合同签订后乙方开始翻译，译文交付并验收后 ${vars.payDueDaysText} 内一次性支付尾款`),
    paragraph('2. 乙方收款信息：'),
    bullet('开户行：招商银行上海张江支行'),
    bullet('账号：121924402310912'),
    bullet('户名：上海语家信息科技有限公司'),
    paragraph('3. 违约责任：'),
    bullet('甲方逾期付款的，每日按应付未付金额的千分之五支付违约金；'),
    bullet('乙方逾期交稿的，每日按未完成部分费用的千分之五支付违约金。'),
    separator(),
    heading2('五、中止翻译'),
    paragraph('如甲方在翻译过程中要求中止项目，应按照乙方已完成的实际翻译字数，按合同单价向乙方支付相应费用。'),
    separator(),
    heading2('六、交付与验收'),
    paragraph(`1. 交付方式（可多选）： ${checklist.electronic} 电子版    ${checklist.email} 电子邮件    ${checklist.fax} 传真    ${checklist.print} 打印稿`),
    paragraph('2. 乙方应按约定时间及方式交付译稿。'),
    paragraph('3. 甲方应在收到译稿之日起 3 个工作日内完成验收并反馈；超过 5 个工作日未提出异议的，视为验收合格。'),
    paragraph('4. 验收合格或视为合格后，甲方应在 3 个工作日内完成尾款支付。'),
    separator(),
    heading2('七、质量标准与修改'),
    paragraph('1. 乙方应遵循翻译行业通行质量标准完成服务，综合误差率 1.5‰ 属合理范围。'),
    paragraph('2. 质量保证期：自交付之日起 30 日内，以下问题乙方应免费修改：'),
    bullet('语法或拼写错误'),
    bullet('名词、术语明显错误'),
    bullet('排版或格式错误'),
    paragraph('3. 翻译属于高度专业化智力劳动，语言风格具有一定主观性。乙方应保证译文忠实原文、准确、通顺、流畅。甲方不得仅因个人语言偏好拒稿、拖延付款或扣减费用。'),
    paragraph('4. 质量异议：甲方须在收稿之日起 3 日内提出；乙方应及时免费修改直至符合约定标准；逾期未提出异议的，视为认可译文质量。'),
    paragraph('5. 第三方评审：如双方无法就质量达成一致，可共同委托第三方评审：若译文不达标，甲方可退稿或要求重译；若评审合格，乙方不承担任何赔偿责任。'),
    separator(),
    heading2('八、知识产权'),
    paragraph('1. 原文内容的合法性、真实性及版权责任由甲方自行承担。'),
    paragraph('2. 在甲方支付全部费用后，译文的使用权归甲方所有。'),
    paragraph('3. 未经甲方书面许可，乙方不得对外发布或使用译文。'),
    separator(),
    heading2('九、争议解决'),
    paragraph('因本合同产生的任何争议，双方应先友好协商；协商不成的，提交上海仲裁委员会按其现行规则仲裁。仲裁裁决为终局，对双方均有约束力。'),
    separator(),
    heading2('十、不可抗力'),
    paragraph('因法律政策变动、政府行为、战争、自然灾害、重大通信故障等不可抗力导致合同无法履行的，双方互不承担违约责任。'),
    paragraph('受影响方应在 7 日内书面通知对方，并协商后续履约安排。'),
    separator(),
    heading2('十一、通知与送达'),
    paragraph('双方通知可通过书面或电子方式送达至合同首页所列联系方式。'),
    paragraph('联系方式变更方应在 3 日内书面通知对方，否则自行承担后果。'),
    separator(),
    heading2('十二、其他'),
    bullet('未尽事宜，双方可另行签署补充协议，与本合同具有同等效力。'),
    bullet('本合同一式两份，双方各执一份，扫描件/传真件有效。'),
    bullet('中英文版本不一致的，以中文版本为准。'),
    bullet('本合同自双方签字或盖章之日起生效。'),
    separator(),
    heading2('签署页'),
    twoCols('甲方（盖章）：', ''),
    twoCols('甲方经办人签字：', ''),
    twoCols('日期：', ''),
    blankLine(),
    twoCols('乙方（盖章）：', ''),
    twoCols('乙方经办人签字：', ''),
    twoCols('日期：', '')
  ];
}

function buildTemplateVariables(project, members = []) {
  const contact = project.contactInfo || project.customerId || {};
  const targetLanguagesText = (project.targetLanguages || []).join(', ') || '—';
  const amountText = project.projectAmount
    ? `人民币 ¥${Number(project.projectAmount).toFixed(2)}${project.isTaxIncluded ? '（含税）' : ''}`
    : '—';
  const unitPriceText = project.unitPrice ? `¥${Number(project.unitPrice).toFixed(2)} / 千字` : '—';
  const wordCountText = project.wordCount ? `${project.wordCount} 字` : '—';
  const deliveryDaysText = project.deadline ? daysFromNow(project.deadline) : '—';
  const payDueDaysText = project.expectedAt
    ? daysFromNow(project.expectedAt)
    : (project.payment && project.payment.expectedAt ? daysFromNow(project.payment.expectedAt) : '—');
  const deadlineText = project.deadline ? formatDate(project.deadline) : '—';
  const payDueDateText = project.expectedAt
    ? formatDate(project.expectedAt)
    : (project.payment && project.payment.expectedAt ? formatDate(project.payment.expectedAt) : '—');
  const paymentStatusText = project.payment && project.payment.paymentStatus ? project.payment.paymentStatus : '—';
  const reqs = project.specialRequirements || {};

  return {
    projectNumber: project.projectNumber || '—',
    customerAddress: (project.customerId && project.customerId.address) || '—',
    contactName: contact.name || project.customerId?.contactPerson || '—',
    contactPhone: contact.phone || project.customerId?.phone || '—',
    contactEmail: contact.email || project.customerId?.email || '—',
    businessTypeText: businessTypeLabel(project.businessType),
    projectTypeText: projectTypeLabel(project.projectType),
    targetLanguagesText,
    wordCountText,
    unitPriceText,
    amountText,
    deadlineText,
    payDueDateText,
    deliveryDaysText,
    payDueDaysText,
    taxIncludedText: project.isTaxIncluded ? '含税' : '不含税',
    paymentStatusText,
    terminologyText: boolText(reqs.terminology),
    referenceFilesText: boolText(reqs.referenceFiles),
    bilingualDeliveryText: boolText(reqs.bilingualDelivery),
    pureTranslationDeliveryText: boolText(reqs.pureTranslationDelivery),
    printSealExpressText: boolText(reqs.printSealExpress),
    notesText: reqs.notes || '无',
    members
  };
}

function heading1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 }
  });
}

function heading2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 }
  });
}

function paragraph(text) {
  return new Paragraph({
    text,
    spacing: { after: 120 }
  });
}

function boldLine(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true })],
    spacing: { after: 120 }
  });
}

function blankLine() {
  return new Paragraph({ text: '', spacing: { after: 120 } });
}

function numbered(no, title, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${no} ${title}`, bold: true }),
      new TextRun({ text: value ? ` ${value}` : '' })
    ],
    spacing: { after: 120 }
  });
}

function bullet(text) {
  return new Paragraph({
    text: text || '',
    bullet: { level: 0 },
    spacing: { after: 60 }
  });
}

function twoCols(label, value) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.LEFT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: label, bold: true }),
      new TextRun({ text: '\t' + (value || '—') })
    ],
    spacing: { after: 80 }
  });
}

function separator() {
  return new Paragraph({ text: '---', spacing: { after: 160 } });
}

function boolText(flag) {
  return flag ? '是' : '否';
}

function checkmark(condition) {
  return condition ? '[x]' : '[ ]';
}

function businessTypeLabel(code) {
  const map = {
    translation: '笔译',
    interpretation: '口译',
    transcription: '转录',
    localization: '本地化',
    other: '其他'
  };
  return map[code] || '—';
}

function projectTypeLabel(code) {
  const map = {
    mtpe: 'MTPE',
    deepedit: '深度编辑',
    review: '审校',
    mixed: '综合'
  };
  return map[code] || '—';
}

function daysFromNow(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  return diff > 0 ? `${diff} 个工作日` : '—';
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = {
  generateProjectContract
};

