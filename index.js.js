const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

// ==========================================
// 1. بيانات تلغرام وواتساب الأساسية
// ==========================================
const apiId = 39184901; 
const apiHash = "f9401d4b61fa8a8c26b189292264ec8d";
const WA_CHAT_ID = "212679121829@c.us"; 

// ==========================================
// 2. مفتاح الجلسة الثابت لتلغرام
// ==========================================
const stringSession = new StringSession("1BAAOMTQ5LjE1NC4xNjcuOTEAUK/F/t7wlbhiVjVv08LOUvzjydl0fgaqqTsd021DzbUzy78un5klFQcog7Nx0yrh4ANxn/il7vok/RPWYEPI1XXgRLGKYfOK5Q0UBx11Vk0bZiFvB5XVsKH3nAK5ZzgkIqMu0YKWxbCur9700i0vwy9fEFKnlS/cN/xhN/v4gyDFPkbgBTJmkprK7+she/9tPjAPiEnOASSprycUuQhE3BKJUVSkMn8DCOdkPeHzp9o6OWpMGjh03tKcMhwALSkR7EPHGe+C0+zkCKE1yMj2Yt1/WIbs/5oIIpyDG57K5ie82jT4gTsOeBpghwfaCPP/+1rbejmCYAt4gqvTGqiwyBg="); 

// ==========================================
// 3. تهيئة واتساب (نسخة خفيفة جداً ومضادة للتجميد في الخوادم)
// ==========================================
const waClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', // الأهم لمنع انهيار الذاكرة
            '--disable-gpu', // إيقاف معالجة الرسومات
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-background-timer-throttling', // منع تجميد المتصفح في الخلفية
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding' // إجبار واتساب على البقاء نشطاً
        ],
        timeout: 60000, 
        protocolTimeout: 300000 
    }
});

waClient.on('qr', (qr) => {
    console.log('\n==================================================');
    console.log('📱 افتح هذا الرابط في متصفحك للحصول على صورة كود QR واضحة:');
    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`);
    console.log('==================================================\n');
});

waClient.on('ready', () => {
    console.log('✅ تم ربط واتساب بنجاح! البوت الآن جاهز ومستقر ولن يتجمد.');
});

// ==========================================
// 4. تهيئة تلغرام ونقل الرسائل
// ==========================================
(async () => {
    console.log("جاري الاتصال بحساب تلغرام...");
    const tgClient = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

    await tgClient.start({
        onError: (err) => console.log("خطأ في تسجيل الدخول:", err),
    });
    
    console.log("✅ تم الدخول لحساب تلغرام بنجاح وبدون طلب كود!");

    tgClient.addEventHandler(async (event) => {
        const message = event.message;
        
        try {
            // استخراج بيانات الدردشة والمرسل
            const chat = await message.getChat();
            const sender = await message.getSender();
            
            let senderName = "تلغرام";
            
            if (chat && chat.title) {
                senderName = chat.title;
                if (sender && sender.firstName && sender.firstName !== chat.title) {
                    senderName += ` - ${sender.firstName}`;
                }
            } else if (sender && sender.firstName) {
                senderName = sender.firstName;
            } else if (chat && chat.firstName) {
                senderName = chat.firstName;
            }

            const messageHeader = `[من: ${senderName}]:\n`;

            // نقل الرسائل النصية
            if (message.message && !message.media) {
                await waClient.sendMessage(WA_CHAT_ID, `${messageHeader}${message.message}`);
                console.log(`تم نقل رسالة نصية من: ${senderName}`);
            } 
            // نقل الوسائط والملفات
            else if (message.media) {
                console.log(`جاري تحميل ملف من: ${senderName} ونقله...`);
                const buffer = await tgClient.downloadMedia(message, { workers: 1 });
                
                if (buffer) {
                    const base64Data = buffer.toString('base64');
                    const mimeType = message.file && message.file.mimeType ? message.file.mimeType : 'application/octet-stream';
                    const filename = message.file && message.file.name ? message.file.name : 'telegram_media';
                    
                    const media = new MessageMedia(mimeType, base64Data, filename);
                    const caption = message.message ? `${messageHeader}${message.message}` : `[ملف من: ${senderName}]`;
                    
                    await waClient.sendMessage(WA_CHAT_ID, media, { caption: caption });
                    console.log(`تم نقل الملف بنجاح من: ${senderName}`);
                }
            }
        } catch (error) {
            console.error('❌ حدث خطأ أثناء النقل:', error.message);
        }
    }, new NewMessage({}));

    waClient.initialize();
    
})();
