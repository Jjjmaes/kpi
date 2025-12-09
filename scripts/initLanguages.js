require('dotenv').config();
const mongoose = require('mongoose');
const Language = require('../models/Language');

// 常用语种列表
const commonLanguages = [
  { name: '中文', code: 'ZH', nativeName: '中文' },
  { name: '英文', code: 'EN', nativeName: 'English' },
  { name: '日文', code: 'JA', nativeName: '日本語' },
  { name: '韩文', code: 'KO', nativeName: '한국어' },
  { name: '法文', code: 'FR', nativeName: 'Français' },
  { name: '德文', code: 'DE', nativeName: 'Deutsch' },
  { name: '俄文', code: 'RU', nativeName: 'Русский' },
  { name: '西班牙语', code: 'ES', nativeName: 'Español' },
  { name: '葡萄牙语', code: 'PT', nativeName: 'Português' },
  { name: '阿拉伯语', code: 'AR', nativeName: 'العربية' },
  { name: '意大利语', code: 'IT', nativeName: 'Italiano' },
  { name: '泰语', code: 'TH', nativeName: 'ไทย' },
  { name: '越南语', code: 'VI', nativeName: 'Tiếng Việt' },
  { name: '印尼语', code: 'ID', nativeName: 'Bahasa Indonesia' },
  { name: '马来语', code: 'MS', nativeName: 'Bahasa Melayu' },
  { name: '荷兰语', code: 'NL', nativeName: 'Nederlands' },
  { name: '波兰语', code: 'PL', nativeName: 'Polski' },
  { name: '土耳其语', code: 'TR', nativeName: 'Türkçe' }
];

async function initLanguages() {
  try {
    // 连接MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kpi_system', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected');

    let created = 0;
    let skipped = 0;

    for (const lang of commonLanguages) {
      try {
        // 检查是否已存在（按名称或代码）
        const existing = await Language.findOne({
          $or: [
            { name: lang.name },
            { code: lang.code }
          ]
        });

        if (existing) {
          console.log(`⏭️  跳过: ${lang.name} (${lang.code}) - 已存在`);
          skipped++;
        } else {
          await Language.create(lang);
          console.log(`✅ 创建: ${lang.name} (${lang.code})`);
          created++;
        }
      } catch (error) {
        console.error(`❌ 创建 ${lang.name} 失败:`, error.message);
      }
    }

    console.log('\n📊 初始化完成:');
    console.log(`   ✅ 创建: ${created} 个语种`);
    console.log(`   ⏭️  跳过: ${skipped} 个语种（已存在）`);
    console.log(`   📝 总计: ${commonLanguages.length} 个语种`);

    process.exit(0);
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    process.exit(1);
  }
}

initLanguages();




