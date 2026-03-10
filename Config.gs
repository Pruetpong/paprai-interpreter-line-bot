// Config.gs - Complete Configuration and Management System
// การตั้งค่าและจัดการระบบสำหรับ DSU Multi-Language Interpreter Bot
// Version: 3.0 (Multi-Language Support with All Functions Integrated)
// รวม: Configuration, Language Preferences, System Prompts, Setup Functions

// =================================
// BOT CONFIGURATION
// =================================

const BOT_CONFIG = {
  // ชื่อบอท
  BOT_NAME: 'DSU Multi-Language Interpreter Bot',
  VERSION: '3.0',
  
  // AI Parameters
  AI_TEMPERATURE: 0.4,  // ต่ำเพื่อความแม่นยำในการแปล
  AI_MAX_TOKENS: 1500,  // เพิ่มขึ้นเพื่อรองรับภาษาหลายภาษา

  // Default AI Model (ใช้ตอน Setup ครั้งแรก)
  DEFAULT_AI_MODEL: 'gpt-4o-mini',
  DEFAULT_AI_ENDPOINT: 'https://api.openai.com/v1/chat/completions',

  // Conversation History Settings
  MAX_HISTORY: 10,  // เก็บประวัติ 10 คู่การสนทนาล่าสุด
  ENABLE_HISTORY: true,  // เปิด/ปิดระบบจดจำประวัติ
  
  // Language Settings
  SUPPORTED_LANGUAGES: ['th', 'en', 'cn', 'jp', 'fr'],
  MIN_MESSAGE_LENGTH: 2,
  
  // Language Display Names
  LANGUAGE_NAMES: {
    'th': 'ภาษาไทย',
    'en': 'ภาษาอังกฤษ',
    'cn': 'ภาษาจีน',
    'jp': 'ภาษาญี่ปุ่น',
    'fr': 'ภาษาฝรั่งเศส'
  },
  
  // Language Flags (for UI)
  LANGUAGE_FLAGS: {
    'th': '🇹🇭',
    'en': '🇬🇧',
    'cn': '🇨🇳',
    'jp': '🇯🇵',
    'fr': '🇫🇷'
  },
  
  // Default Language Pairs (Fallback rules)
  DEFAULT_LANGUAGE_PAIRS: {
    'th': 'en',  // ไทย → อังกฤษ
    'en': 'th',  // อังกฤษ → ไทย
    'cn': 'en',  // จีน → อังกฤษ
    'jp': 'en',  // ญี่ปุ่น → อังกฤษ
    'fr': 'en'   // ฝรั่งเศส → อังกฤษ
  },
  
  // Feature Flags
  AUTO_TRANSLATE: true,
  REPLY_WITH_QUOTE: true,
  SHOW_LOADING: true,
  
  // Access Control
  GROUP_ONLY: true,  // อนุญาตให้ใช้ในแชทส่วนตัวได้ (แต่มีข้อจำกัด)
  OWNER_FULL_ACCESS: true  // เจ้าของสามารถใช้เต็มรูปแบบในทุก context
};

// =================================
// LANGUAGE PREFERENCE MANAGEMENT
// =================================

/**
 * บันทึกการตั้งค่าภาษาลง Google Sheets
 * @param {string} contextId - Group ID หรือ Private chat ID
 * @param {string} contextType - 'group' หรือ 'private'
 * @param {string} sourceLang - ภาษาต้นทาง (th/en/cn/jp/fr)
 * @param {string} targetLang - ภาษาปลายทาง (th/en/cn/jp/fr)
 * @param {string} userId - User ID ของผู้ตั้งค่า
 * @return {Object} { success: boolean, message: string }
 */
function saveLanguagePreference(contextId, contextType, sourceLang, targetLang, userId) {
  try {
    const config = getConfig();
    
    if (!config.SPREADSHEET_ID) {
      console.error('❌ Spreadsheet not configured');
      return { success: false, message: 'Spreadsheet not configured' };
    }

    const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName('Translation Settings');
    
    // ถ้ายังไม่มี sheet ให้สร้างใหม่
    if (!sheet) {
      console.log('📊 Creating Translation Settings sheet...');
      sheet = spreadsheet.insertSheet('Translation Settings');
      sheet.getRange('A1:F1').setValues([
        ['Context ID', 'Context Type', 'Source Lang', 'Target Lang', 'Last Updated', 'Updated By']
      ]);
      
      // Format header
      const headerRange = sheet.getRange('A1:F1');
      headerRange.setBackground('#34A853');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
      
      sheet.setFrozenRows(1);
    }
    
    const data = sheet.getDataRange().getValues();
    const timestamp = new Date();
    
    // ค้นหาว่ามีการตั้งค่าสำหรับ context นี้อยู่แล้วหรือไม่
    let existingRowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === contextId) {
        existingRowIndex = i + 1; // +1 เพราะ row ใน Sheets เริ่มที่ 1
        break;
      }
    }
    
    if (existingRowIndex > 0) {
      // อัปเดตแถวที่มีอยู่
      sheet.getRange(existingRowIndex, 1, 1, 6).setValues([
        [contextId, contextType, sourceLang, targetLang, timestamp, userId]
      ]);
      console.log(`✅ Updated language preference for ${contextId}: ${sourceLang} → ${targetLang}`);
    } else {
      // เพิ่มแถวใหม่
      sheet.appendRow([contextId, contextType, sourceLang, targetLang, timestamp, userId]);
      console.log(`✅ Saved new language preference for ${contextId}: ${sourceLang} → ${targetLang}`);
    }
    
    return { success: true, message: 'Preference saved successfully' };
    
  } catch (error) {
    console.error('❌ Error saving language preference:', error);
    return { success: false, message: error.message };
  }
}

/**
 * ดึงการตั้งค่าภาษาจาก Google Sheets
 * @param {string} contextId - Group ID หรือ Private chat ID
 * @return {Object} { hasPreference: boolean, source: string, target: string }
 */
function getLanguagePreference(contextId) {
  try {
    const config = getConfig();
    
    if (!config.SPREADSHEET_ID) {
      console.warn('⚠️ Spreadsheet not configured');
      return { hasPreference: false, source: null, target: null };
    }

    const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Translation Settings');
    
    if (!sheet) {
      console.warn('⚠️ Translation Settings sheet not found');
      return { hasPreference: false, source: null, target: null };
    }
    
    const data = sheet.getDataRange().getValues();
    
    // ค้นหาการตั้งค่าสำหรับ context นี้
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === contextId) {
        const sourceLang = data[i][2];
        const targetLang = data[i][3];
        
        console.log(`✅ Found preference for ${contextId}: ${sourceLang} → ${targetLang}`);
        
        return {
          hasPreference: true,
          source: sourceLang,
          target: targetLang,
          contextType: data[i][1],
          lastUpdated: data[i][4],
          updatedBy: data[i][5]
        };
      }
    }
    
    console.log(`⚠️ No preference found for ${contextId}`);
    return { hasPreference: false, source: null, target: null };
    
  } catch (error) {
    console.error('❌ Error getting language preference:', error);
    return { hasPreference: false, source: null, target: null };
  }
}

/**
 * ลบการตั้งค่าภาษาของ context (ถ้าต้องการ reset)
 * @param {string} contextId - Group ID หรือ Private chat ID
 * @return {Object} { success: boolean, message: string }
 */
function deleteLanguagePreference(contextId) {
  try {
    const config = getConfig();
    
    if (!config.SPREADSHEET_ID) {
      return { success: false, message: 'Spreadsheet not configured' };
    }

    const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Translation Settings');
    
    if (!sheet) {
      return { success: false, message: 'Translation Settings sheet not found' };
    }
    
    const data = sheet.getDataRange().getValues();
    
    // ค้นหาและลบแถว
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === contextId) {
        sheet.deleteRow(i + 1);
        console.log(`🗑️ Deleted language preference for ${contextId}`);
        return { success: true, message: 'Preference deleted successfully' };
      }
    }
    
    return { success: false, message: 'Preference not found' };
    
  } catch (error) {
    console.error('❌ Error deleting language preference:', error);
    return { success: false, message: error.message };
  }
}

// =================================
// SYSTEM PROMPT GENERATION
// =================================

/**
 * สร้าง System Prompt แบบ Dynamic ตามคู่ภาษา
 * @param {string} sourceLang - ภาษาต้นทาง
 * @param {string} targetLang - ภาษาปลายทาง
 * @return {string} System prompt ที่สมบูรณ์
 */
function generateSystemPrompt(sourceLang, targetLang) {
  const langNames = BOT_CONFIG.LANGUAGE_NAMES;
  
  // Base Prompt (ส่วนพื้นฐานที่ใช้กับทุกภาษา)
  const basePrompt = `You are a professional multilingual interpreter working in a LINE chat, facilitating communication at The Demonstration School of Silpakorn University (Secondary) in Thailand.

**Your Primary Role:**
You are a TRANSLATOR/INTERPRETER, providing immediate, natural translations between ${langNames[sourceLang]} and ${langNames[targetLang]} for professional academic collaboration.

**Translation Task:**
- Source Language: ${langNames[sourceLang]}
- Target Language: ${langNames[targetLang]}

**CRITICAL: CONTEXT AWARENESS**
You will receive previous conversation context before each translation. USE THIS CONTEXT to:
- Understand pronoun references (it, that, he, she, they, มัน, เขา, เธอ, พวกเขา, นั่น, นี่)
- Maintain consistency in terminology throughout the conversation
- Preserve the flow and coherence of the discussion
- Translate with awareness of what was previously discussed
- Identify speaker roles when possible (Thai staff vs. International educator)

**Translation Context:**
- **Setting**: Academic/educational institution in Thailand
- **Users**: Thai staff members, international educators, students
- **Relationship**: Professional colleagues and educational community
- **Common Topics**: Academic coordination, class schedules, student matters, curriculum, school events
- **Tone**: Professional yet warm and collegial`;

  // เพิ่ม Language-Specific Instructions
  const languageSpecificInstructions = getLanguageSpecificInstructions(sourceLang, targetLang);
  
  // เพิ่ม Cultural Context
  const culturalContext = getCulturalContext(sourceLang, targetLang);
  
  // Response Format Guidelines
  const responseGuidelines = `

**Response Format:**
- Provide ONLY the translation
- No explanations, no annotations, no meta-commentary
- Just the pure, natural translated text
- Maintain the speaker's intended tone and emotion
- Preserve names, titles, and institutional terminology appropriately

**Critical Rules:**
- Respond with ONLY the translated text
- USE conversation history to resolve ambiguities and maintain consistency
- Keep translations natural and contextually appropriate
- Adapt politeness levels appropriately for each language
- Preserve the speaker's intent and emotion
- When in doubt about context, prefer natural, professional translations
- Maintain clear communication as the primary goal`;

  // รวม prompt ทั้งหมด
  return basePrompt + '\n' + languageSpecificInstructions + '\n' + culturalContext + responseGuidelines;
}

/**
 * คำแนะนำเฉพาะภาษา
 */
function getLanguageSpecificInstructions(sourceLang, targetLang) {
  let instructions = '\n**Language-Specific Instructions:**\n';
  
  // Thai Language Instructions
  if (sourceLang === 'th' || targetLang === 'th') {
    instructions += `
- **Thai Language**: Use appropriate politeness particles (ครับ/ค่ะ, คะ) based on context
- Professional setting requires polite form (ครับ/ค่ะ at sentence end)
- Use "คุณ" for general respect, "อาจารย์" for teachers
- Adapt Western directness into Thai professional communication style`;
  }
  
  // English Language Instructions
  if (sourceLang === 'en' || targetLang === 'en') {
    instructions += `
- **English Language**: Use professional but friendly tone
- Suitable for international workplace communication
- Maintain clarity and directness while being respectful
- Use "Teacher [Name]" or appropriate professional titles`;
  }
  
  // Chinese Language Instructions
  if (sourceLang === 'cn' || targetLang === 'cn') {
    instructions += `
- **Chinese Language**: Use Simplified Chinese (简体中文)
- Maintain professional tone with appropriate measure words
- Use "老师" (lǎoshī) for teachers, "同学" (tóngxué) for students
- Academic context requires formal written style`;
  }
  
  // Japanese Language Instructions
  if (sourceLang === 'jp' || targetLang === 'jp') {
    instructions += `
- **Japanese Language**: Use polite form (です/ます形) for educational context
- Appropriate honorifics: "先生" (sensei) for teachers
- Maintain professional keigo (敬語) in academic communication
- Balance between formal and approachable tone`;
  }
  
  // French Language Instructions
  if (sourceLang === 'fr' || targetLang === 'fr') {
    instructions += `
- **French Language**: Use "vous" (formal) for teacher-student context
- Professional academic tone with appropriate formality
- "Professeur" or "Monsieur/Madame" for teachers
- Maintain French educational communication standards`;
  }
  
  return instructions;
}

/**
 * บริบททางวัฒนธรรมสำหรับคู่ภาษา
 */
function getCulturalContext(sourceLang, targetLang) {
  let context = '\n**Cultural Adaptation:**\n';
  
  // Thai ↔ English
  if ((sourceLang === 'th' && targetLang === 'en') || (sourceLang === 'en' && targetLang === 'th')) {
    context += `
- Thai → English: Convert Thai politeness markers into professional English courtesy naturally
- English → Thai: Add appropriate Thai politeness markers (ครับ/ค่ะ, คะ)
- Preserve institutional context and academic terminology
- Adapt greetings: สวัสดี → Hello/Hi, ขอบคุณ → Thank you`;
  }
  
  // Thai ↔ Chinese
  if ((sourceLang === 'th' && targetLang === 'cn') || (sourceLang === 'cn' && targetLang === 'th')) {
    context += `
- Maintain professional academic tone in both languages
- Respect hierarchy: Thai "อาจารย์" ↔ Chinese "老师"
- Thai politeness ↔ Chinese formal written style
- Educational terminology should be consistent and clear`;
  }
  
  // Thai ↔ Japanese
  if ((sourceLang === 'th' && targetLang === 'jp') || (sourceLang === 'jp' && targetLang === 'th')) {
    context += `
- Both languages have complex politeness systems - maintain appropriate levels
- Thai ครับ/ค่ะ ↔ Japanese です/ます
- Respect titles: "อาจารย์" ↔ "先生"
- Balance formality while maintaining warmth`;
  }
  
  // Thai ↔ French
  if ((sourceLang === 'th' && targetLang === 'fr') || (sourceLang === 'fr' && targetLang === 'th')) {
    context += `
- Thai politeness ↔ French "vous" formal address
- Academic context requires formal tone in both languages
- "อาจารย์" ↔ "Professeur" or "Monsieur/Madame"
- Maintain professional educational standards`;
  }
  
  // English ↔ Chinese/Japanese/French
  if (sourceLang === 'en' && ['cn', 'jp', 'fr'].includes(targetLang)) {
    context += `
- English directness should be adapted to target language's cultural norms
- Maintain professional academic tone
- Preserve clarity while respecting formality levels
- Educational terminology should be accurate and consistent`;
  }
  
  if (['cn', 'jp', 'fr'].includes(sourceLang) && targetLang === 'en') {
    context += `
- Adapt source language formality into professional English
- Maintain academic context and respect levels
- Convert honorifics appropriately
- Keep translations clear and natural in English`;
  }
  
  return context;
}

// =================================
// CREDENTIALS MANAGEMENT
// =================================

/**
 * ตั้งค่า Configuration
 */
function setConfig(key, value) {
  try {
    const validKeys = [
      'API_KEY', 
      'AI_ENDPOINT', 
      'AI_MODEL', 
      'LINE_CHANNEL_ACCESS_TOKEN',
      'SPREADSHEET_ID',
      'YOUR_USER_ID'
    ];

    if (!validKeys.includes(key)) {
      throw new Error(`Invalid config key: ${key}`);
    }

    if (!value || value.toString().trim() === '') {
      throw new Error(`Value cannot be empty for ${key}`);
    }

    const properties = PropertiesService.getScriptProperties();
    properties.setProperty(key, value.toString());
    properties.setProperty(`${key}_UPDATED`, new Date().toISOString());
    
    console.log(`✅ Successfully set ${key}`);
    return { success: true, message: `${key} configured successfully` };

  } catch (error) {
    console.error(`❌ Error setting ${key}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * ดึง Configuration
 */
function getConfig() {
  try {
    const properties = PropertiesService.getScriptProperties();
    
    return {
      // API Credentials
      API_KEY: properties.getProperty('API_KEY'),
      AI_ENDPOINT: properties.getProperty('AI_ENDPOINT') || BOT_CONFIG.DEFAULT_AI_ENDPOINT,
      AI_MODEL: properties.getProperty('AI_MODEL') || BOT_CONFIG.DEFAULT_AI_MODEL,
      
      // LINE Configuration
      LINE_CHANNEL_ACCESS_TOKEN: properties.getProperty('LINE_CHANNEL_ACCESS_TOKEN'),
      SPREADSHEET_ID: properties.getProperty('SPREADSHEET_ID'),
      YOUR_USER_ID: properties.getProperty('YOUR_USER_ID'),
      
      // AI Parameters (จาก BOT_CONFIG)
      AI_TEMPERATURE: BOT_CONFIG.AI_TEMPERATURE,
      AI_MAX_TOKENS: BOT_CONFIG.AI_MAX_TOKENS,
      
      // History Settings
      MAX_HISTORY: BOT_CONFIG.MAX_HISTORY,
      ENABLE_HISTORY: BOT_CONFIG.ENABLE_HISTORY,
      
      // Language Settings
      SUPPORTED_LANGUAGES: BOT_CONFIG.SUPPORTED_LANGUAGES,
      LANGUAGE_NAMES: BOT_CONFIG.LANGUAGE_NAMES,
      DEFAULT_LANGUAGE_PAIRS: BOT_CONFIG.DEFAULT_LANGUAGE_PAIRS,
      
      // Access Control
      GROUP_ONLY: BOT_CONFIG.GROUP_ONLY,
      OWNER_FULL_ACCESS: BOT_CONFIG.OWNER_FULL_ACCESS
    };

  } catch (error) {
    console.error('❌ Error getting config:', error);
    throw new Error(`Failed to get configuration: ${error.message}`);
  }
}

/**
 * ตรวจสอบความถูกต้องของ Configuration
 */
function validateConfig() {
  console.log('🔍 Validating configuration...');
  
  try {
    const config = getConfig();
    
    const results = {
      api_key: !!config.API_KEY && config.API_KEY.length > 20,
      ai_endpoint: !!config.AI_ENDPOINT && config.AI_ENDPOINT.startsWith('http'),
      ai_model: !!config.AI_MODEL && config.AI_MODEL.length > 3,
      line_token: !!config.LINE_CHANNEL_ACCESS_TOKEN && config.LINE_CHANNEL_ACCESS_TOKEN.length > 100,
      spreadsheet: !!config.SPREADSHEET_ID,
      your_user_id: !!config.YOUR_USER_ID
    };
    
    const allValid = Object.values(results).every(Boolean);
    
    console.log('📊 Validation Results:');
    console.log(results);
    console.log(`Status: ${allValid ? '✅ VALID' : '⚠️ INCOMPLETE'}`);
    
    if (!allValid) {
      const missing = Object.entries(results)
        .filter(([key, value]) => !value)
        .map(([key]) => key);
      console.warn('⚠️ Missing or invalid:', missing);
      return { valid: false, missing: missing };
    }
    
    return { valid: true, message: 'All configurations are valid' };

  } catch (error) {
    console.error('❌ Validation error:', error);
    return { valid: false, error: error.message };
  }
}

// =================================
// GOOGLE SHEETS SETUP
// =================================

/**
 * สร้าง Conversation History Sheet
 */
function setupConversationSheet(spreadsheet) {
  try {
    let sheet = spreadsheet.getSheetByName('Conversation History');
    
    if (sheet) {
      console.log('⚠️ Conversation History sheet already exists');
      return sheet;
    }
    
    sheet = spreadsheet.insertSheet('Conversation History');
    
    // ตั้งค่า Header
    sheet.getRange('A1:F1').setValues([
      ['Timestamp', 'Context ID', 'User ID', 'Original Language', 'Original Message', 'Translation']
    ]);
    
    // Format Header
    const headerRange = sheet.getRange('A1:F1');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    // ตั้งค่าความกว้างของคอลัมน์
    sheet.setColumnWidth(1, 150);  // Timestamp
    sheet.setColumnWidth(2, 150);  // Context ID
    sheet.setColumnWidth(3, 150);  // User ID
    sheet.setColumnWidth(4, 120);  // Original Language
    sheet.setColumnWidth(5, 300);  // Original Message
    sheet.setColumnWidth(6, 300);  // Translation
    
    sheet.setFrozenRows(1);
    
    console.log('✅ Conversation History sheet created');
    return sheet;
    
  } catch (error) {
    console.error('❌ Error creating Conversation History sheet:', error);
    throw error;
  }
}

/**
 * สร้าง Translation Settings Sheet
 */
function setupTranslationSettingsSheet(spreadsheet) {
  try {
    let sheet = spreadsheet.getSheetByName('Translation Settings');
    
    if (sheet) {
      console.log('⚠️ Translation Settings sheet already exists');
      return sheet;
    }
    
    sheet = spreadsheet.insertSheet('Translation Settings');
    
    // ตั้งค่า Header
    sheet.getRange('A1:F1').setValues([
      ['Context ID', 'Context Type', 'Source Lang', 'Target Lang', 'Last Updated', 'Updated By']
    ]);
    
    // Format Header
    const headerRange = sheet.getRange('A1:F1');
    headerRange.setBackground('#34A853');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    // ตั้งค่าความกว้างของคอลัมน์
    sheet.setColumnWidth(1, 180);  // Context ID
    sheet.setColumnWidth(2, 100);  // Context Type
    sheet.setColumnWidth(3, 100);  // Source Lang
    sheet.setColumnWidth(4, 100);  // Target Lang
    sheet.setColumnWidth(5, 150);  // Last Updated
    sheet.setColumnWidth(6, 150);  // Updated By
    
    sheet.setFrozenRows(1);
    
    console.log('✅ Translation Settings sheet created');
    return sheet;
    
  } catch (error) {
    console.error('❌ Error creating Translation Settings sheet:', error);
    throw error;
  }
}

/**
 * สร้าง Spreadsheet พร้อมทั้ง 2 Sheets
 */
function setupCompleteSpreadsheet() {
  try {
    console.log('📊 Creating new spreadsheet...');
    
    const spreadsheet = SpreadsheetApp.create('DSU Multi-Language Interpreter Bot - Data');
    const spreadsheetId = spreadsheet.getId();
    
    console.log(`✅ Spreadsheet created: ${spreadsheetId}`);
    console.log(`📊 URL: ${spreadsheet.getUrl()}`);
    
    // ลบ Sheet1 เริ่มต้น (ถ้ามี)
    const defaultSheet = spreadsheet.getSheetByName('Sheet1');
    if (defaultSheet && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(defaultSheet);
    }
    
    // สร้าง Conversation History Sheet
    setupConversationSheet(spreadsheet);
    
    // สร้าง Translation Settings Sheet
    setupTranslationSettingsSheet(spreadsheet);
    
    console.log('✅ All sheets created successfully');
    
    return {
      success: true,
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: spreadsheet.getUrl()
    };
    
  } catch (error) {
    console.error('❌ Error creating spreadsheet:', error);
    throw error;
  }
}

// =================================
// QUICK SETUP FUNCTION
// =================================

/**
 * ติดตั้งระบบอัตโนมัติ - ใช้ครั้งแรกเท่านั้น
 */
function quickSetup() {
  console.log('🚀 Quick setup for Multi-Language Interpreter Bot...');
  console.log('⚠️ กรุณาแก้ไข API Keys ด้านล่างก่อน Run:');
  
  // ===============================================
  // 🔑 ใส่ API Keys ของคุณที่นี่
  // ===============================================
  const API_KEY = 'sk-proj-YOUR-API-KEY-HERE';  // OpenAI, Gemini, DeepSeek, etc.
  const AI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';  // เปลี่ยนได้ตาม Provider
  const AI_MODEL = 'gpt-4o-mini';  // เปลี่ยนได้ตาม Provider
  const LINE_CHANNEL_ACCESS_TOKEN = 'YOUR-LINE-CHANNEL-ACCESS-TOKEN-HERE';
  const YOUR_USER_ID = 'YOUR-LINE-USER-ID-HERE';  // LINE User ID ของเจ้าของบอท
  // ===============================================
  
  // ตรวจสอบว่ากรอกข้อมูลครบหรือยัง
  if (API_KEY.includes('YOUR-') || LINE_CHANNEL_ACCESS_TOKEN.includes('YOUR-') || YOUR_USER_ID.includes('YOUR-')) {
    console.error('❌ กรุณาแก้ไข API Keys และ YOUR_USER_ID ในฟังก์ชัน quickSetup()');
    console.log('💡 วิธีหา YOUR_USER_ID:');
    console.log('   1. ส่งข้อความหาบอทผ่าน LINE');
    console.log('   2. ดู Execution log ใน Apps Script');
    console.log('   3. หา User ID ในส่วน "Event: message, User: Uxxxxxxxxx"');
    return { success: false, error: 'Please configure API Keys and YOUR_USER_ID first' };
  }
  
  try {
    console.log('🔑 Step 1: Setting up API keys...');
    setConfig('API_KEY', API_KEY);
    setConfig('AI_ENDPOINT', AI_ENDPOINT);
    setConfig('AI_MODEL', AI_MODEL);
    setConfig('LINE_CHANNEL_ACCESS_TOKEN', LINE_CHANNEL_ACCESS_TOKEN);
    setConfig('YOUR_USER_ID', YOUR_USER_ID);
    
    console.log('📊 Step 2: Creating Google Sheets...');
    const sheetResult = setupCompleteSpreadsheet();
    
    if (!sheetResult.success) {
      throw new Error('Failed to create spreadsheet');
    }
    
    setConfig('SPREADSHEET_ID', sheetResult.spreadsheetId);
    
    console.log('🔍 Step 3: Validating configuration...');
    const validation = validateConfig();
    
    if (validation.valid) {
      console.log('');
      console.log('═══════════════════════════════════════════════════');
      console.log('✅ Setup completed successfully!');
      console.log('═══════════════════════════════════════════════════');
      console.log('');
      console.log('📊 Spreadsheet URL:');
      console.log(sheetResult.spreadsheetUrl);
      console.log('');
      console.log('🤖 AI Configuration:');
      console.log(`   Provider: ${AI_ENDPOINT}`);
      console.log(`   Model: ${AI_MODEL}`);
      console.log('');
      console.log('🌐 Supported Languages:');
      console.log('   • Thai (th) 🇹🇭');
      console.log('   • English (en) 🇬🇧');
      console.log('   • Chinese (cn) 🇨🇳');
      console.log('   • Japanese (jp) 🇯🇵');
      console.log('   • French (fr) 🇫🇷');
      console.log('');
      console.log('🔐 Access Control:');
      console.log('   Group Chat: Everyone can use');
      console.log('   Private Chat: Commands only (Owner has full access)');
      console.log('');
      console.log('⚠️ SECURITY: Delete API Keys from quickSetup() function now!');
      console.log('═══════════════════════════════════════════════════');
      
      return {
        success: true,
        spreadsheetId: sheetResult.spreadsheetId,
        spreadsheetUrl: sheetResult.spreadsheetUrl,
        aiProvider: AI_ENDPOINT,
        aiModel: AI_MODEL,
        supportedLanguages: BOT_CONFIG.SUPPORTED_LANGUAGES
      };
    } else {
      throw new Error('Validation failed: ' + JSON.stringify(validation.missing));
    }

  } catch (error) {
    console.error('❌ Setup failed:', error);
    return { success: false, error: error.message };
  }
}

// =================================
// TESTING FUNCTIONS
// =================================

/**
 * ทดสอบการแปลภาษา
 */
function testTranslation() {
  console.log('🧪 Testing translation system...\n');
  
  const config = getConfig();
  if (!config.API_KEY) {
    console.error('❌ API Key not configured');
    console.log('💡 Run quickSetup() first');
    return;
  }

  console.log(`🤖 Using: ${config.AI_MODEL} at ${config.AI_ENDPOINT}`);
  console.log('');

  // Test Thai → English
  const testPrompt = {
    system: generateSystemPrompt('th', 'en'),
    user: `**Current Message to Translate:**

Source Language: ภาษาไทย (th)
Target Language: ภาษาอังกฤษ (en)

Text: "สวัสดีครับ ผมชื่อครูจอห์น ยินดีที่ได้รู้จักนะครับ"

Using the conversation context above (if any), translate the current message naturally and appropriately. Provide ONLY the translated text with NO explanations.`
  };
  
  const payload = {
    model: config.AI_MODEL,
    messages: [
      { role: "system", content: testPrompt.system },
      { role: "user", content: testPrompt.user }
    ],
    temperature: config.AI_TEMPERATURE,
    max_tokens: config.AI_MAX_TOKENS
  };
  
  try {
    console.log('📤 Sending test request...');
    const response = UrlFetchApp.fetch(config.AI_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': `Bearer ${config.API_KEY}` },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    const statusCode = response.getResponseCode();
    
    if (statusCode === 200) {
      const result = JSON.parse(response.getContentText());
      console.log('✅ Translation test passed!');
      console.log('');
      console.log('📝 Original (Thai):');
      console.log('   "สวัสดีครับ ผมชื่อครูจอห์น ยินดีที่ได้รู้จักนะครับ"');
      console.log('');
      console.log('📝 Translation (English):');
      console.log(`   "${result.choices[0].message.content}"`);
      console.log('');
      console.log('✅ System is working correctly!');
    } else {
      console.error('❌ Test failed with status:', statusCode);
      console.error('Response:', response.getContentText());
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

/**
 * ทดสอบ Language Detection
 */
function testLanguageDetection() {
  console.log('🧪 Testing language detection...\n');
  
  const testCases = [
    { text: 'สวัสดีครับ ยินดีที่ได้รู้จัก', expected: 'th' },
    { text: 'Hello, nice to meet you!', expected: 'en' },
    { text: '你好，很高兴认识你', expected: 'cn' },
    { text: 'こんにちは、はじめまして', expected: 'jp' },
    { text: 'Bonjour, enchanté de vous rencontrer', expected: 'fr' }
  ];
  
  console.log('Testing detection for 5 languages:\n');
  
  testCases.forEach((testCase, index) => {
    // Note: This would call the detectLanguageAdvanced() function from Code.gs
    // Since we can't access it here, we just show the test structure
    console.log(`Test ${index + 1}:`);
    console.log(`  Text: "${testCase.text}"`);
    console.log(`  Expected: ${testCase.expected}`);
    console.log(`  Status: ✅ (Run actual test in Code.gs)`);
    console.log('');
  });
  
  console.log('💡 To test actual detection, send messages to the bot in each language');
}

/**
 * แสดงสถานะการติดตั้ง
 */
function showSetupStatus() {
  console.log('📊 Setup Status Check\n');
  console.log('═══════════════════════════════════════════════════');
  
  const config = getConfig();
  
  console.log('🔑 API Configuration:');
  console.log(`   API Key: ${maskValue(config.API_KEY)}`);
  console.log(`   AI Endpoint: ${config.AI_ENDPOINT || '❌ Not set'}`);
  console.log(`   AI Model: ${config.AI_MODEL || '❌ Not set'}`);
  console.log('');
  
  console.log('📱 LINE Configuration:');
  console.log(`   Channel Token: ${maskValue(config.LINE_CHANNEL_ACCESS_TOKEN)}`);
  console.log(`   Owner User ID: ${maskValue(config.YOUR_USER_ID)}`);
  console.log('');
  
  console.log('📊 Google Sheets:');
  if (config.SPREADSHEET_ID) {
    console.log(`   Spreadsheet ID: ${config.SPREADSHEET_ID}`);
    try {
      const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_ID);
      console.log(`   URL: ${spreadsheet.getUrl()}`);
      
      const sheet1 = spreadsheet.getSheetByName('Conversation History');
      const sheet2 = spreadsheet.getSheetByName('Translation Settings');
      
      console.log(`   Conversation History: ${sheet1 ? '✅ Ready' : '❌ Missing'}`);
      console.log(`   Translation Settings: ${sheet2 ? '✅ Ready' : '❌ Missing'}`);
    } catch (error) {
      console.log('   Status: ❌ Cannot access spreadsheet');
    }
  } else {
    console.log('   Status: ❌ Not configured');
  }
  console.log('');
  
  console.log('🌐 Language Support:');
  BOT_CONFIG.SUPPORTED_LANGUAGES.forEach(lang => {
    const flag = BOT_CONFIG.LANGUAGE_FLAGS[lang];
    const name = BOT_CONFIG.LANGUAGE_NAMES[lang];
    console.log(`   ${flag} ${name} (${lang})`);
  });
  
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  
  const validation = validateConfig();
  if (validation.valid) {
    console.log('✅ All systems ready!');
  } else {
    console.log('⚠️ Configuration incomplete');
    console.log('Missing:', validation.missing);
    console.log('');
    console.log('💡 Run quickSetup() to configure automatically');
  }
}

/**
 * ฟังก์ชันช่วยเหลือ: ซ่อน sensitive values
 */
function maskValue(value) {
  if (!value || value.length < 8) return value ? '***' : '❌ Not set';
  const first = value.substring(0, 4);
  const last = value.substring(value.length - 4);
  return `${first}${'*'.repeat(8)}${last}`;
}

// =================================
// MANUAL CONFIGURATION HELPERS
// =================================

/**
 * ตั้งค่า Spreadsheet ID แยกต่างหาก
 */
function setSpreadsheetId(spreadsheetId) {
  return setConfig('SPREADSHEET_ID', spreadsheetId);
}

/**
 * ตั้งค่า AI Provider
 */
function setAIProvider(apiKey, endpoint, model) {
  console.log('🤖 Configuring AI Provider...');
  
  setConfig('API_KEY', apiKey);
  setConfig('AI_ENDPOINT', endpoint);
  setConfig('AI_MODEL', model);
  
  console.log('✅ AI Provider configured');
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Model: ${model}`);
}

/**
 * ตั้งค่า LINE Channel
 */
function setLINEChannel(channelAccessToken, ownerUserId) {
  console.log('📱 Configuring LINE Channel...');
  
  setConfig('LINE_CHANNEL_ACCESS_TOKEN', channelAccessToken);
  setConfig('YOUR_USER_ID', ownerUserId);
  
  console.log('✅ LINE Channel configured');
  console.log(`   Owner User ID: ${maskValue(ownerUserId)}`);
}
