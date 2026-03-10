// Code.gs - DSU Multi-Language Interpreter Bot Handler
// แชตบอทล่ามแปลภาษาหลายภาษา พร้อมระบบจดจำประวัติและการตั้งค่า
// Version: 3.0 (Multi-Language Support with Command System)
// Supported Languages: Thai, English, Chinese, Japanese, French

/**
 * Webhook handler สำหรับรับข้อความจาก LINE
 */
function doPost(e) {
  const startTime = new Date();
  console.log(`🌐 Webhook received at ${startTime.toISOString()}`);
  
  try {
    if (!e.postData || !e.postData.contents) {
      console.error('❌ Invalid request format');
      return createResponse('Invalid request', 400);
    }

    const contents = JSON.parse(e.postData.contents);
    
    if (!contents.events || !Array.isArray(contents.events)) {
      console.error('❌ No events found');
      return createResponse('No events', 400);
    }

    console.log(`📨 Processing ${contents.events.length} event(s)`);
    
    for (const event of contents.events) {
      processEvent(event);
    }

    const processingTime = new Date() - startTime;
    console.log(`✅ Completed in ${processingTime}ms`);

    return createResponse({ status: 'success', processed: contents.events.length });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return createResponse('Internal error', 500);
  }
}

// =================================
// EVENT PROCESSING
// =================================

/**
 * ประมวลผล event ที่ได้รับจาก LINE
 * รองรับ: message, follow, join events
 */
function processEvent(event) {
  try {
    const { type, replyToken, source } = event;
    const userId = source?.userId;
    const isGroupChat = source?.type === 'group';
    const isRoomChat = source?.type === 'room';
    const isPrivateChat = !isGroupChat && !isRoomChat;
    
    console.log(`🔄 Event: ${type}, Context: ${source?.type || 'unknown'}, User: ${userId || 'unknown'}`);

    // ตรวจสอบว่าเป็นเจ้าของบอทหรือไม่
    const isOwner = isOwnerUser(userId);
    
    if (type === 'message') {
      if (isGroupChat || isRoomChat) {
        // ใน Group/Room ทุกคนใช้ได้ทุกฟีเจอร์
        handleMessage(event);
      } else if (isPrivateChat) {
        // ในแชทส่วนตัว - เฉพาะเจ้าของใช้ฟีเจอร์แปลได้
        if (isOwner) {
          console.log('✅ Owner detected - full access in private chat');
          handleMessage(event);
        } else {
          console.log('⚠️ Non-owner in private chat - limited access');
          handleNonOwnerPrivateMessage(event);
        }
      }
    } else if (type === 'follow') {
      handleFollow(replyToken, userId);
    } else if (type === 'join') {
      handleJoin(replyToken);
    } else {
      console.log(`⚠️ Unhandled event: ${type}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing event:`, error);
  }
}

/**
 * จัดการข้อความที่ส่งเข้ามา
 * รองรับ: คำสั่งภาษา, คำสั่งระบบ, การแปลภาษา
 */
function handleMessage(event) {
  const { message, replyToken, source } = event;
  
  if (message.type !== 'text') {
    console.log(`⚠️ Non-text message ignored: ${message.type}`);
    return;
  }

  const userMessage = message.text.trim();
  const userId = source.userId || 'unknown';
  const groupId = source.groupId || source.roomId || null;
  const isPrivateChat = !groupId;
  const contextId = groupId || ('private_' + userId);
  const contextType = groupId ? 'group' : 'private';
  
  // Validation: ข้อความสั้นเกินไป
  if (userMessage.length === 0 || userMessage.length < 2) {
    console.log('⚠️ Message too short, ignored');
    return;
  }

  // Validation: emoji เท่านั้น
  if (isOnlyEmoji(userMessage)) {
    console.log('⚠️ Emoji-only message ignored');
    return;
  }

  console.log(`💬 Message from ${contextType} (${contextId}): "${userMessage}"`);

  // ====================================
  // 1. ตรวจสอบคำสั่งภาษา (Language Commands)
  // ====================================
  if (userMessage.startsWith('/') && userMessage.length <= 7) {
    const commandResult = handleLanguageCommand(userMessage, replyToken, contextId, contextType, userId);
    if (commandResult) {
      return; // ถ้าเป็นคำสั่งภาษา ให้หยุดที่นี่
    }
  }

  // ====================================
  // 2. ตรวจสอบคำสั่งระบบ (System Commands)
  // ====================================
  if (handleSystemCommand(userMessage, replyToken, contextId, contextType)) {
    return; // ถ้าเป็นคำสั่งระบบ ให้หยุดที่นี่
  }

  // ====================================
  // 3. ตรวจสอบสิทธิ์การแปลภาษา
  // ====================================
  const canTranslate = canUseTranslation(userId, isPrivateChat);
  
  if (!canTranslate) {
    console.log('🚫 Non-owner cannot translate in private chat');
    sendTranslationPermissionError(replyToken);
    return;
  }

  // ====================================
  // 4. ประมวลผลการแปลภาษา
  // ====================================
  if (userId && userId !== 'unknown') {
    startLoading(userId);
  }

  processTranslation(userMessage, replyToken, message.quoteToken, contextId, contextType, userId);
}

/**
 * จัดการข้อความส่วนตัวจากผู้ใช้ที่ไม่ใช่เจ้าของ
 * อนุญาตให้ใช้คำสั่งได้ แต่ไม่สามารถแปลภาษาได้
 */
function handleNonOwnerPrivateMessage(event) {
  const { message, replyToken, source } = event;
  const userMessage = message.text.trim();
  const userId = source.userId;
  const contextId = 'private_' + userId;
  
  console.log(`📝 Non-owner private message: "${userMessage}"`);
  
  // อนุญาตให้ใช้คำสั่งภาษาได้
  if (userMessage.startsWith('/') && userMessage.length <= 7) {
    const commandResult = handleLanguageCommand(userMessage, replyToken, contextId, 'private', userId);
    if (commandResult) {
      return;
    }
  }
  
  // อนุญาตให้ใช้คำสั่งระบบได้
  if (handleSystemCommand(userMessage, replyToken, contextId, 'private')) {
    return;
  }
  
  // ถ้าไม่ใช่คำสั่ง แสดงว่าพยายามแปลภาษา → แจ้งข้อจำกัด
  sendInfoMessage(replyToken, userId);
}

/**
 * ส่งข้อความแจ้งข้อมูลสำหรับผู้ใช้ที่ไม่ใช่เจ้าของ
 */
function sendInfoMessage(replyToken, userId) {
  console.log(`📝 Sending info message to non-owner user: ${userId}`);
  
  const message = `สวัสดีครับ! 👋

🤖 ขอบคุณที่สนใจบอทล่ามแปลภาษาของเรา

📌 การใช้งาน:
บอทนี้ถูกออกแบบมาสำหรับใช้งานในกลุ่ม LINE

🌐 ภาษาที่รองรับ:
- ไทย ↔ อังกฤษ
- ไทย ↔ จีน
- ไทย ↔ ญี่ปุ่น
- ไทย ↔ ฝรั่งเศส
- อังกฤษ ↔ จีน/ญี่ปุ่น/ฝรั่งเศส

🔹 วิธีใช้:
1. เพิ่มบอทเข้ากลุ่ม LINE
2. ใช้คำสั่งเลือกภาษา เช่น /th2en
3. พิมพ์ข้อความ บอทจะแปลอัตโนมัติ!

💡 พิมพ์ /help เพื่อดูคำสั่งทั้งหมด

ยินดีให้บริการในกลุ่มของคุณครับ 😊`;

  try {
    replyMessage(replyToken, message);
  } catch (error) {
    console.error('Failed to send info message:', error);
  }
}

/**
 * ส่งข้อความแจ้งข้อผิดพลาดเมื่อไม่มีสิทธิ์แปลภาษา
 */
function sendTranslationPermissionError(replyToken) {
  const errorMessage = `🚫 ไม่สามารถใช้งานฟีเจอร์แปลภาษาในแชทส่วนตัวได้

📌 คุณสามารถ:
✅ ใช้คำสั่งตั้งค่าภาษา (เช่น /th2en)
✅ ใช้คำสั่งระบบ (/help, /status)
✅ เพิ่มบอทเข้ากลุ่มเพื่อใช้ฟีเจอร์แปลภาษา

💡 บอทถูกออกแบบสำหรับการใช้งานในกลุ่ม LINE`;

  try {
    replyMessage(replyToken, errorMessage);
  } catch (error) {
    console.error('Failed to send permission error:', error);
  }
}

// =================================
// LANGUAGE COMMAND HANDLER
// =================================

/**
 * จัดการคำสั่งภาษา เช่น /th2en, /en2jp, etc.
 * รองรับ 14 คำสั่ง: th2en/en2th/th2cn/cn2th/th2jp/jp2th/th2fr/fr2th/en2cn/cn2en/en2jp/jp2en/en2fr/fr2en
 * @return {boolean} true ถ้าเป็นคำสั่งภาษา, false ถ้าไม่ใช่
 */
function handleLanguageCommand(commandText, replyToken, contextId, contextType, userId) {
  const command = commandText.toLowerCase().trim();
  
  console.log(`🔍 Checking language command: "${command}"`);
  
  // Parse คำสั่ง
  const parsed = parseLanguageCommand(command);
  
  if (!parsed.isValid) {
    console.log('⚠️ Not a valid language command');
    return false; // ไม่ใช่คำสั่งภาษา
  }
  
  console.log(`✅ Valid language command: ${parsed.source} → ${parsed.target}`);
  
  // Validate language pair
  const validation = validateLanguagePair(parsed.source, parsed.target);
  
  if (!validation.valid) {
    replyMessage(replyToken, validation.message);
    return true; // เป็นคำสั่งภาษา แต่ใช้ไม่ได้
  }
  
  // บันทึกการตั้งค่า
  const saved = saveLanguagePreference(contextId, contextType, parsed.source, parsed.target, userId);
  
  if (saved.success) {
    const langNames = getLanguageNames();
    const confirmMessage = `✅ ตั้งค่าเรียบร้อยแล้ว!

🌐 โหมดแปล: ${langNames[parsed.source]} → ${langNames[parsed.target]}
📝 พิมพ์ข้อความเพื่อเริ่มใช้งาน

💡 เคล็ดลับ:
- บอทจะแปลอัตโนมัติทันที
- พิมพ์ /status เพื่อดูการตั้งค่า
- พิมพ์ /clear เพื่อลบประวัติการสนทนา`;

    replyMessage(replyToken, confirmMessage);
  } else {
    replyMessage(replyToken, '❌ ไม่สามารถบันทึกการตั้งค่าได้ กรุณาลองใหม่อีกครั้ง');
  }
  
  return true;
}

/**
 * Parse คำสั่งภาษา
 * ตัวอย่าง: /th2en → { source: 'th', target: 'en', isValid: true }
 */
function parseLanguageCommand(command) {
  // Pattern: /XX2YY (เช่น /th2en, /en2jp)
  const pattern = /^\/([a-z]{2})2([a-z]{2})$/;
  const match = command.match(pattern);
  
  if (!match) {
    return { isValid: false, source: null, target: null };
  }
  
  const source = match[1];
  const target = match[2];
  
  // ตรวจสอบว่าเป็นภาษาที่รองรับหรือไม่
  const supportedLangs = ['th', 'en', 'cn', 'jp', 'fr'];
  
  if (!supportedLangs.includes(source) || !supportedLangs.includes(target)) {
    return { isValid: false, source: null, target: null };
  }
  
  return {
    isValid: true,
    source: source,
    target: target
  };
}

/**
 * ตรวจสอบความถูกต้องของคู่ภาษา
 */
function validateLanguagePair(source, target) {
  // ตรวจสอบภาษาเดียวกัน
  if (source === target) {
    const langNames = getLanguageNames();
    return {
      valid: false,
      message: `❌ ไม่สามารถตั้งค่าแปลภาษาเดียวกันได้\n\nคุณเลือก: ${langNames[source]} → ${langNames[target]}\n\n💡 เลือกภาษาคู่ที่ต่างกัน เช่น /th2en`
    };
  }
  
  // ทุกคู่ภาษาที่ต่างกันสามารถใช้ได้
  return { valid: true };
}

/**
 * ดึงชื่อภาษาเป็นภาษาไทย
 */
function getLanguageNames() {
  return {
    'th': 'ภาษาไทย',
    'en': 'ภาษาอังกฤษ',
    'cn': 'ภาษาจีน',
    'jp': 'ภาษาญี่ปุ่น',
    'fr': 'ภาษาฝรั่งเศส'
  };
}

// =================================
// SYSTEM COMMAND HANDLER
// =================================

/**
 * จัดการคำสั่งระบบ: /clear, /status, /help
 * @return {boolean} true ถ้าเป็นคำสั่งระบบ, false ถ้าไม่ใช่
 */
function handleSystemCommand(userMessage, replyToken, contextId, contextType) {
  const command = userMessage.toLowerCase().trim();
  
  // คำสั่ง: Clear History
  if (command === '/clear' || command === 'clear history' || command === 'ลบประวัติ') {
    const result = clearGroupHistory(contextId);
    if (result.success) {
      replyMessage(replyToken, `✅ ลบประวัติการสนทนาเรียบร้อยแล้ว\n\n📊 ลบไปทั้งหมด: ${result.deletedCount} รายการ`);
    } else {
      replyMessage(replyToken, '❌ ไม่สามารถลบประวัติได้ กรุณาลองใหม่อีกครั้ง');
    }
    return true;
  }
  
  // คำสั่ง: Status
  if (command === '/status' || command === 'status' || command === 'สถานะ') {
    sendStatusMessage(replyToken, contextId, contextType);
    return true;
  }
  
  // คำสั่ง: Help
  if (command === '/help' || command === 'help' || command === 'ช่วยเหลือ') {
    sendHelpMessage(replyToken);
    return true;
  }
  
  return false; // ไม่ใช่คำสั่งระบบ
}

/**
 * ส่งข้อความ Help
 */
function sendHelpMessage(replyToken) {
  const helpText = `🤖 DSU Multi-Language Interpreter Bot

🌐 ภาษาที่รองรับ:
- ไทย (th)  • อังกฤษ (en)
- จีน (cn)  • ญี่ปุ่น (jp)  • ฝรั่งเศส (fr)

📝 คำสั่งตั้งค่าภาษา:

🇹🇭 จากภาษาไทย:
/th2en  ไทย → อังกฤษ
/th2cn  ไทย → จีน
/th2jp  ไทย → ญี่ปุ่น
/th2fr  ไทย → ฝรั่งเศส

🇬🇧 จากภาษาอังกฤษ:
/en2th  อังกฤษ → ไทย
/en2cn  อังกฤษ → จีน
/en2jp  อังกฤษ → ญี่ปุ่น
/en2fr  อังกฤษ → ฝรั่งเศส

🌏 คำสั่งอื่น ๆ:
/cn2th  จีน → ไทย    /cn2en  จีน → อังกฤษ
/jp2th  ญี่ปุ่น → ไทย  /jp2en  ญี่ปุ่น → อังกฤษ
/fr2th  ฝรั่งเศส → ไทย /fr2en  ฝรั่งเศส → อังกฤษ

💡 คำสั่งระบบ:
/status  ดูสถานะและการตั้งค่าปัจจุบัน
/clear   ลบประวัติการสนทนา
/help    แสดงคำแนะนำนี้

📚 วิธีใช้งาน:
1. ใช้คำสั่งเลือกภาษาที่ต้องการ
2. พิมพ์ข้อความ บอทจะแปลอัตโนมัติทันที!

ยินดีช่วยเหลือครับ! 😊`;

  replyMessage(replyToken, helpText);
}

/**
 * ส่งข้อความแสดงสถานะระบบ
 */
function sendStatusMessage(replyToken, contextId, contextType) {
  try {
    const config = getConfig();
    const history = getConversationHistory(contextId);
    const preference = getLanguagePreference(contextId);
    
    let modeText = '🔄 โหมดอัตโนมัติ (ยังไม่ได้ตั้งค่า)';
    
    if (preference.hasPreference) {
      const langNames = getLanguageNames();
      const sourceName = langNames[preference.source];
      const targetName = langNames[preference.target];
      modeText = `🌐 ${sourceName} → ${targetName}`;
    }
    
    const contextText = contextType === 'group' ? '👥 กลุ่ม' : '💬 แชทส่วนตัว';
    
    const statusText = `📊 สถานะระบบแปลภาษา

${contextText}
${modeText}

💬 ประวัติการสนทนา: ${history.length}/${config.MAX_HISTORY} ข้อความ
🤖 AI Model: ${config.AI_MODEL}
📝 ระบบจดจำประวัติ: ${config.ENABLE_HISTORY ? '✅ เปิด' : '❌ ปิด'}
⏰ เวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}

💡 พิมพ์ /help เพื่อดูคำสั่งทั้งหมด

พร้อมให้บริการ! 🚀`;

    replyMessage(replyToken, statusText);
    
  } catch (error) {
    console.error('Error getting status:', error);
    replyMessage(replyToken, '❌ ไม่สามารถดึงข้อมูลสถานะได้');
  }
}

// =================================
// EVENT HANDLERS: FOLLOW & JOIN
// =================================

/**
 * จัดการเมื่อมีคนเพิ่มบอทเป็นเพื่อน
 */
function handleFollow(replyToken, userId) {
  console.log(`👋 New follower: ${userId}`);
  
  const isOwner = isOwnerUser(userId);
  
  let welcomeMessage;
  
  if (isOwner) {
    welcomeMessage = `สวัสดีครับ! 👋

ยินดีต้อนรับ คุณเป็นเจ้าของบอท! 🎉

✅ คุณสามารถ:
- ใช้งานบอทในแชทส่วนตัวได้เต็มรูปแบบ
- เพิ่มบอทเข้ากลุ่ม LINE
- ใช้คำสั่งและฟีเจอร์ทั้งหมด

🌐 รองรับ 5 ภาษา:
ไทย, อังกฤษ, จีน, ญี่ปุ่น, ฝรั่งเศส

💡 พิมพ์ /help เพื่อดูคำแนะนำการใช้งาน`;
  } else {
    welcomeMessage = `สวัสดีครับ! 👋

ยินดีต้อนรับสู่บอทล่ามแปลภาษา 🤖

🌐 รองรับ 5 ภาษา:
- ไทย ↔ อังกฤษ
- ไทย ↔ จีน/ญี่ปุ่น/ฝรั่งเศส
- อังกฤษ ↔ จีน/ญี่ปุ่น/ฝรั่งเศส

📝 วิธีใช้งาน:
1. เชิญบอทเข้ากลุ่ม LINE
2. ใช้คำสั่ง เช่น /th2en เพื่อเลือกภาษา
3. พิมพ์ข้อความ บอทจะแปลอัตโนมัติ!

💡 พิมพ์ /help เพื่อดูคำสั่งทั้งหมด

ยินดีให้บริการ! 😊`;
  }
  
  try {
    replyMessage(replyToken, welcomeMessage);
  } catch (error) {
    console.error('Failed to send welcome message:', error);
  }
}

/**
 * จัดการเมื่อบอทถูกเชิญเข้ากลุ่ม
 */
function handleJoin(replyToken) {
  console.log('🏠 Bot joined a group');
  
  const welcomeMessage = `สวัสดีทุกคนครับ! 👋

ผมคือบอทล่ามแปลภาษาหลายภาษา 🌐
ยินดีที่ได้เข้าร่วมกลุ่มนี้!

🌍 รองรับ 5 ภาษา:
ไทย, อังกฤษ, จีน, ญี่ปุ่น, ฝรั่งเศส

📝 วิธีใช้งาน:
1. ตั้งค่าภาษา เช่น /th2en (ไทย→อังกฤษ)
2. พิมพ์ข้อความ ผมจะแปลให้อัตโนมัติ!
3. จดจำบริบทการสนทนา 10 ข้อความล่าสุด

💡 คำสั่งที่มี:
- /help   ดูคำสั่งทั้งหมด
- /status ดูสถานะและการตั้งค่า
- /clear  ลบประวัติการสนทนา

เริ่มต้นด้วยการพิมพ์ /help เลยครับ! 😊`;

  try {
    replyMessage(replyToken, welcomeMessage);
  } catch (error) {
    console.error('Failed to send welcome message:', error);
  }
}

// =================================
// TRANSLATION PROCESSING
// =================================

/**
 * ประมวลผลการแปลภาษา
 */
function processTranslation(userMessage, replyToken, quoteToken, contextId, contextType, userId) {
  try {
    console.log(`🔄 Processing translation for context: ${contextId}`);
    
    // ดึงการตั้งค่าภาษา
    const preference = getLanguagePreference(contextId);
    
    let sourceLang, targetLang;
    
    if (preference.hasPreference) {
      // ใช้การตั้งค่าที่บันทึกไว้
      sourceLang = preference.source;
      targetLang = preference.target;
      console.log(`✅ Using saved preference: ${sourceLang} → ${targetLang}`);
    } else {
      // ใช้ Fallback: ตรวจจับภาษาอัตโนมัติ
      console.log('⚠️ No preference found, using auto-detection fallback');
      const detectedLang = detectLanguageAdvanced(userMessage);
      console.log(`🔍 Detected language: ${detectedLang}`);
      
      if (detectedLang === 'unknown') {
        console.log('⚠️ Language not supported, skipping translation');
        return;
      }
      
      // กำหนด target ตามกฎ fallback
      const fallbackPair = getDefaultPreference(detectedLang);
      sourceLang = fallbackPair.source;
      targetLang = fallbackPair.target;
      console.log(`🔄 Fallback mode: ${sourceLang} → ${targetLang}`);
    }
    
    // ดึงประวัติการสนทนา
    const conversationHistory = getConversationHistory(contextId);
    console.log(`📚 Using ${conversationHistory.length} previous messages as context`);
    
    // สร้าง System Prompt แบบ Dynamic
    const systemPrompt = generateSystemPrompt(sourceLang, targetLang);
    
    // สร้าง User Prompt พร้อม context
    const userPrompt = constructUserPromptWithContext(
      userMessage,
      sourceLang,
      targetLang,
      conversationHistory
    );
    
    // เรียก AI
    const translation = callAI({
      system: systemPrompt,
      user: userPrompt
    });
    
    if (translation && translation.trim().length > 0) {
      // บันทึกการแปล
      saveTranslation(contextId, userId, sourceLang, userMessage, translation);
      
      // ส่งข้อความตอบกลับ
      replyMessage(replyToken, translation, quoteToken);
      console.log('✅ Translation sent and saved');
    } else {
      console.log('⚠️ Empty translation, not sending');
    }
    
  } catch (error) {
    console.error('❌ Translation error:', error);
    
    if (error.message.includes('API') || error.message.includes('quota')) {
      try {
        replyMessage(replyToken, '❌ ขออภัย ระบบแปลภาษาขัดข้องชั่วคราว\n\nกรุณาลองใหม่อีกครั้ง');
      } catch (e) {
        console.error('Failed to send error message:', e);
      }
    }
  }
}

// =================================
// LANGUAGE DETECTION (Advanced)
// =================================

/**
 * ตรวจจับภาษาด้วย confidence scoring
 * รองรับ: Thai, English, Chinese, Japanese, French
 */
function detectLanguageAdvanced(text) {
  // ลบ whitespace ออก
  const cleanText = text.replace(/\s/g, '');
  const totalChars = cleanText.length;
  
  if (totalChars === 0) return 'unknown';
  
  // Unicode ranges สำหรับแต่ละภาษา
  const patterns = {
    th: /[\u0E00-\u0E7F]/g,           // Thai
    en: /[a-zA-Z]/g,                   // English (basic Latin)
    cn: /[\u4E00-\u9FFF]/g,           // Chinese (CJK Unified Ideographs)
    jp: /[\u3040-\u309F\u30A0-\u30FF]/g, // Japanese (Hiragana + Katakana)
    fr: /[a-zA-ZàâäæçéèêëïîôùûüÿœÀÂÄÆÇÉÈÊËÏÎÔÙÛÜŸŒ]/g // French (with accents)
  };
  
  // นับจำนวนตัวอักษรแต่ละภาษา
  const counts = {};
  const percentages = {};
  
  for (const [lang, pattern] of Object.entries(patterns)) {
    const matches = text.match(pattern);
    counts[lang] = matches ? matches.length : 0;
    percentages[lang] = (counts[lang] / totalChars) * 100;
  }
  
  console.log('📊 Language detection scores:', percentages);
  
  // เรียงตาม percentage
  const sorted = Object.entries(percentages).sort((a, b) => b[1] - a[1]);
  const topLang = sorted[0][0];
  const topScore = sorted[0][1];
  
  // Threshold: อย่างน้อย 30% ถึงจะถือว่าเป็นภาษานั้น
  if (topScore >= 30) {
    console.log(`✅ Detected: ${topLang} (${topScore.toFixed(1)}%)`);
    return topLang;
  }
  
  // กรณีพิเศษ: ภาษาญี่ปุ่นอาจมี Kanji (จีน) ด้วย
  if (counts.jp > 0 && counts.cn > 0) {
    console.log('✅ Detected: jp (contains Hiragana/Katakana)');
    return 'jp';
  }
  
  // ถ้าไม่มีภาษาไหนเกิน threshold
  console.log('⚠️ No language meets threshold (30%)');
  return 'unknown';
}

/**
 * กำหนดภาษาเป้าหมายตามกฎ Fallback
 */
function getDefaultPreference(detectedLang) {
  const fallbackRules = {
    'th': { source: 'th', target: 'en' },  // ไทย → อังกฤษ
    'en': { source: 'en', target: 'th' },  // อังกฤษ → ไทย
    'cn': { source: 'cn', target: 'en' },  // จีน → อังกฤษ
    'jp': { source: 'jp', target: 'en' },  // ญี่ปุ่น → อังกฤษ
    'fr': { source: 'fr', target: 'en' }   // ฝรั่งเศส → อังกฤษ
  };
  
  return fallbackRules[detectedLang] || { source: 'en', target: 'th' };
}

/**
 * ตรวจสอบว่าเป็น emoji เท่านั้นหรือไม่
 */
function isOnlyEmoji(text) {
  const withoutEmoji = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]/gu, '');
  const withoutSpace = withoutEmoji.replace(/\s/g, '');
  return withoutSpace.length === 0;
}

// =================================
// CONVERSATION HISTORY
// =================================

/**
 * ดึงประวัติการสนทนาจาก Google Sheets
 */
function getConversationHistory(contextId) {
  try {
    const config = getConfig();
    
    if (!config.ENABLE_HISTORY || !config.SPREADSHEET_ID) {
      console.log('⚠️ Conversation history disabled');
      return [];
    }

    const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Conversation History');
    
    if (!sheet) {
      console.warn('⚠️ Conversation History sheet not found');
      return [];
    }
    
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) return [];
    
    const contextHistory = data
      .slice(1)
      .filter(row => row[1] === contextId)
      .slice(-config.MAX_HISTORY)
      .map(row => ({
        timestamp: row[0],
        contextId: row[1],
        userId: row[2],
        originalLanguage: row[3],
        originalMessage: row[4],
        translation: row[5]
      }));
      
    console.log(`📚 Retrieved ${contextHistory.length} conversation entries`);
    return contextHistory;
    
  } catch (error) {
    console.error('❌ Error retrieving conversation history:', error);
    return [];
  }
}

/**
 * บันทึกการแปลลง Google Sheets
 */
function saveTranslation(contextId, userId, originalLang, originalMsg, translation) {
  try {
    const config = getConfig();
    
    if (!config.ENABLE_HISTORY || !config.SPREADSHEET_ID) {
      console.log('⚠️ History saving skipped');
      return;
    }

    const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Conversation History');
    
    if (!sheet) {
      console.warn('⚠️ Conversation History sheet not found');
      return;
    }
    
    const timestamp = new Date();
    
    sheet.appendRow([timestamp, contextId, userId, originalLang, originalMsg, translation]);
    console.log('💾 Translation saved to history');
    
  } catch (error) {
    console.error('❌ Error saving translation:', error);
  }
}

/**
 * ลบประวัติการสนทนาของ context
 */
function clearGroupHistory(contextId) {
  try {
    const config = getConfig();
    
    if (!config.SPREADSHEET_ID) {
      console.warn('⚠️ No spreadsheet configured');
      return { success: false, message: 'No spreadsheet configured', deletedCount: 0 };
    }

    const spreadsheet = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName('Conversation History');
    
    if (!sheet) {
      console.warn('⚠️ Conversation History sheet not found');
      return { success: false, message: 'Sheet not found', deletedCount: 0 };
    }
    
    const data = sheet.getDataRange().getValues();
    const rowsToDelete = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === contextId) {
        rowsToDelete.push(i + 1);
      }
    }
    
    // ลบจากแถวล่างสุดขึ้นบน
    rowsToDelete.sort((a, b) => b - a).forEach(rowNum => {
      sheet.deleteRow(rowNum);
    });
    
    console.log(`🗑️ Cleared ${rowsToDelete.length} history entries for ${contextId}`);
    return { success: true, deletedCount: rowsToDelete.length };
    
  } catch (error) {
    console.error('❌ Error clearing history:', error);
    return { success: false, error: error.message, deletedCount: 0 };
  }
}

/**
 * สร้าง User Prompt พร้อม conversation context
 */
function constructUserPromptWithContext(message, sourceLang, targetLang, conversationHistory) {
  let contextSection = '';
  
  if (conversationHistory && conversationHistory.length > 0) {
    contextSection = '**Recent Conversation Context:**\n\n';
    
    conversationHistory.forEach((entry, index) => {
      const langNames = getLanguageNames();
      const sourceName = langNames[entry.originalLanguage] || entry.originalLanguage;
      
      contextSection += `[${index + 1}] ${sourceName}: "${entry.originalMessage}"\n`;
      contextSection += `    Translation: "${entry.translation}"\n\n`;
    });
    
    contextSection += '---\n\n';
  }
  
  const langNames = getLanguageNames();
  const sourceFullName = langNames[sourceLang] || sourceLang;
  const targetFullName = langNames[targetLang] || targetLang;
  
  const userPrompt = `${contextSection}**Current Message to Translate:**

Source Language: ${sourceFullName} (${sourceLang})
Target Language: ${targetFullName} (${targetLang})

Text: "${message}"

Using the conversation context above (if any), translate the current message naturally and appropriately. Provide ONLY the translated text with NO explanations.`;

  return userPrompt;
}

// =================================
// AI TRANSLATION
// =================================

/**
 * เรียก AI API เพื่อแปลภาษา
 */
function callAI(promptData) {
  const config = getConfig();
  
  if (!config.API_KEY) {
    throw new Error('API key not configured');
  }

  console.log(`🤖 Calling AI: ${config.AI_MODEL} at ${config.AI_ENDPOINT}`);
  
  const payload = {
    model: config.AI_MODEL,
    messages: [
      { role: "system", content: promptData.system },
      { role: "user", content: promptData.user }
    ],
    temperature: config.AI_TEMPERATURE,
    max_tokens: config.AI_MAX_TOKENS
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': `Bearer ${config.API_KEY}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(config.AI_ENDPOINT, options);
    const statusCode = response.getResponseCode();
    
    if (statusCode !== 200) {
      const errorText = response.getContentText();
      console.error(`AI API Error (${statusCode}):`, errorText);
      
      if (statusCode === 401) throw new Error('Invalid API key');
      else if (statusCode === 429) throw new Error('API rate limit exceeded');
      else if (statusCode === 400) throw new Error('Invalid API request');
      else throw new Error(`API error: ${statusCode}`);
    }

    const result = JSON.parse(response.getContentText());
    
    if (!result.choices || result.choices.length === 0) {
      throw new Error('No response from AI');
    }

    return result.choices[0].message.content.trim();

  } catch (error) {
    console.error('❌ AI API Error:', error);
    throw error;
  }
}

// =================================
// LINE MESSAGING
// =================================

/**
 * ส่งข้อความตอบกลับทาง LINE
 */
function replyMessage(replyToken, text, quoteToken = null) {
  const config = getConfig();
  
  if (!config.LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE token not configured');
  }

  const message = { type: 'text', text: text };
  if (quoteToken) message.quoteToken = quoteToken;

  const payload = {
    replyToken: replyToken,
    messages: [message]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', options);
    const statusCode = response.getResponseCode();
    
    if (statusCode !== 200) {
      const errorText = response.getContentText();
      console.error(`LINE API Error (${statusCode}):`, errorText);
      throw new Error(`LINE API error: ${statusCode}`);
    }
    
    console.log('✅ Message sent successfully');
    
  } catch (error) {
    console.error('❌ Failed to send message:', error);
    throw error;
  }
}

/**
 * แสดง loading indicator
 */
function startLoading(userId) {
  const config = getConfig();
  if (!config.LINE_CHANNEL_ACCESS_TOKEN) return;

  try {
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}` },
      payload: JSON.stringify({ chatId: userId }),
      muteHttpExceptions: true
    };

    UrlFetchApp.fetch('https://api.line.me/v2/bot/chat/loading/start', options);
    console.log('⏳ Loading indicator started');
    
  } catch (error) {
    console.error('⚠️ Loading indicator failed:', error);
  }
}

// =================================
// ACCESS CONTROL
// =================================

/**
 * ตรวจสอบว่าเป็นเจ้าของบอทหรือไม่
 */
function isOwnerUser(userId) {
  if (!userId) return false;
  
  try {
    const config = getConfig();
    const ownerUserId = config.YOUR_USER_ID;
    
    if (!ownerUserId) {
      console.warn('⚠️ YOUR_USER_ID not configured');
      return false;
    }
    
    const isOwner = userId === ownerUserId;
    console.log(`👤 User ${userId}: ${isOwner ? '✅ OWNER' : '❌ NOT OWNER'}`);
    
    return isOwner;
    
  } catch (error) {
    console.error('❌ Error checking owner:', error);
    return false;
  }
}

/**
 * ตรวจสอบว่าสามารถใช้ฟีเจอร์แปลภาษาได้หรือไม่
 */
function canUseTranslation(userId, isPrivateChat) {
  // ใน Group/Room ทุกคนใช้ได้
  if (!isPrivateChat) return true;
  
  // ในแชทส่วนตัว เฉพาะ owner เท่านั้น
  return isOwnerUser(userId);
}

// =================================
// UTILITIES
// =================================

/**
 * สร้าง HTTP Response
 */
function createResponse(data, statusCode = 200) {
  const response = typeof data === 'string' ? { message: data } : data;
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON)
    .setStatusCode(200);
}
