const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

// ==========================================
// 0. مضادات الانهيار الشاملة
// ==========================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [تحذير]: خطأ غير متوقع:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('⚠️ [كارثة تم تجنبها]: خطأ جسيم:', error);
});

// ==========================================
// 1. بيانات تلغرام وواتساب
// ==========================================
const apiId = 39184901; 
const apiHash = "f9401d4b61fa8a8c26b189292264ec8d";
const WA_CHAT_ID = "212778303880@c.us"; 

// ==========================================
// 2. مفتاح الجلسة لتلغرام
// ==========================================
const stringSession = new StringSession("1BAAOMTQ5LjE1NC4xNjcuOTEAUK/F/t7wlbhiVjVv08LOUvzjydl0fgaqqTsd021DzbUzy78un5klFQcog7Nx0yrh4ANxn/il7vok/RPWYEPI1XXgRLGKYfOK5Q0UBx11Vk0bZiFvB5XVsKH3nAK5ZzgkIqMu0YKWxbCur9700i0vwy9fEFKnlS/cN/xhN/v4gyDFPkbgBTJmkprK7+she/9tPjAPiEnOASSprycUuQhE3BKJUVSkMn8DCOdkPeHzp9o6OWpMGjh03tKcMhwALSkR7EPHGe+C0+zkCKE1yMj2Yt1/WIbs/5oIIpyDG57K5ie82jT4gTsOeBpghwfaCPP/+1rbejmCYAt4gqvTGqiwyBg="); 

// ==========================================
// 3. تهيئة واتساب (مضاد للتجميد ومحمي بالـ Volume)
// ==========================================
const waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }), 
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu', 
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-background-timer-throttling', 
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding' 
        ],
        timeout: 60000, 
        protocolTimeout: 300000 
    }
});

waClient.on('qr', (qr) => {
    console.log('\n📱 كود QR جاهز (في حال احتجته):');
    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}\n`);
});

waClient.on('ready', () => {
    console.log('✅ تم ربط واتساب بنجاح! البوت الآن جاهز ومستقر.');
});

waClient.on('disconnected', (reason) => {
    console.log('❌ واتساب فقد الاتصال. السبب:', reason);
    waClient.initialize();
});

// ==========================================
// 4. تهيئة تلغرام ونقل الرسائل
// ==========================================
(async () => {
    console.log("جاري الاتصال بحساب تلغرام...");
    const tgClient = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: Infinity }); 

    await tgClient.start({
        onError: (err) => console.log("خطأ في تسجيل الدخول:", err),
    });
    
    console.log("✅ تم الدخول لحساب تلغرام بنجاح!");

    tgClient.addEventHandler(async (event) => {
        const message = event.message;
        
        try {
            const chat = await message.getChat();
            const sender = await message.getSender();
            
            let senderName = "تلغرام";
            if (chat && chat.title) {
                senderName = chat.title;
                if (sender && sender.firstName && sender.firstName !== chat.title) senderName += ` - ${sender.firstName}`;
            } else if (sender && sender.firstName) senderName = sender.firstName;
            else if (chat && chat.firstName) senderName = chat.firstName;

            const messageHeader = `[من: ${senderName}]:\n`;

            // نقل الرسائل النصية
            if (message.message && !message.media) {
                await waClient.sendMessage(WA_CHAT_ID, `${messageHeader}${message.message}`);
                console.log(`تم نقل رسالة نصية من: ${senderName}`);
            } 
            // نقل الوسائط والملفات
            else if (message.media) {
                const fileSize = message.file ? message.file.size : 0;
                const maxSizeInBytes = 60 * 1024 * 1024; 
                const whatsappVideoLimit = 15 * 1024 * 1024; 

                if (fileSize > maxSizeInBytes) {
                    const sizeInMB = (fileSize / (1024 * 1024)).toFixed(2);
                    console.log(`⚠️ تم تخطي ملف ضخم (${sizeInMB} MB) لحماية الخادم.`);
                    await waClient.sendMessage(WA_CHAT_ID, `${messageHeader}⚠️ *[تنبيه]:* يوجد ملف حجمه كبير جداً (${sizeInMB} MB). يرجى مشاهدته من تطبيق تلغرام.`);
                    return; 
                }

                console.log(`جاري تحميل ملف من: ${senderName} ونقله...`);
                const buffer = await tgClient.downloadMedia(message, { workers: 1 });
                
                if (buffer) {
                    const base64Data = buffer.toString('base64');
                    const mimeType = message.file && message.file.mimeType ? message.file.mimeType : 'application/octet-stream';
                    
                    let filename = message.file && message.file.name ? message.file.name : 'telegram_media';
                    
                    if (!filename.includes('.')) {
                        if (mimeType.includes('mp4')) filename += '.mp4';
                        else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) filename += '.jpg';
                        else if (mimeType.includes('png')) filename += '.png';
                        else if (mimeType.includes('pdf')) filename += '.pdf';
                        else if (mimeType.includes('ogg')) filename += '.ogg';
                        else if (mimeType.includes('audio')) filename += '.mp3';
                    }
                    
                    const media = new MessageMedia(mimeType, base64Data, filename);
                    const caption = message.message ? `${messageHeader}${message.message}` : `[ملف من: ${senderName}]`;
                    
                    const sendOptions = { caption: caption };
                    
                    // --- التحديث الجديد ---
                    if (mimeType.includes('audio') || mimeType.includes('ogg')) {
                        // إذا كان الملف صوتياً، أرسله كرسالة صوتية (Voice Note) قابلة للتشغيل مباشرة
                        sendOptions.sendAudioAsVoice = true; 
                        console.log("سيتم إرسال الملف الصوتي كرسالة صوتية (Voice Note) قابلة للتشغيل...");
                    } else if (fileSize > whatsappVideoLimit) {
                        // إذا كان الملف فيديو كبير (أكبر من 15 ميجا)، أرسله كمستند
                        sendOptions.sendMediaAsDocument = true; 
                        console.log("سيتم إرسال الملف الكبير كـ 'مستند' لضمان عبوره قيود حجم واتساب...");
                    }
                    
                    await waClient.sendMessage(WA_CHAT_ID, media, sendOptions);
                    console.log(`تم نقل الملف بنجاح من: ${senderName}`);
                }
            }
        } catch (error) {
            console.error('❌ حدث خطأ أثناء النقل داخل الحدث:', error.message);
        }
    }, new NewMessage({}));

    waClient.initialize();
    
})();
