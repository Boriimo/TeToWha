const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const input = require("input");
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ==========================================
// 1. بيانات تلغرام
// ==========================================
const apiId = 39184901; 
const apiHash = "f9401d4b61fa8a8c26b189292264ec8d";
const TG_CHAT_ID = "-1001694075679"; 

// =========================================
// 2. بيانات واتساب
// =========================================
const WA_CHAT_ID = "212679712397@c.us"; 

// ==========================================
// 3. مفتاح الجلسة (تم وضعه في المكان الصحيح)
// ==========================================
const stringSession = new StringSession("1BAAOMTQ5LjE1NC4xNjcuOTEAUIIYeilyRn4vg12+fTViiF+NlVSoiVBNI80alfclk6G7P0HZoXKJwqYPmfZ7HHnGTkAEwLwJ17EgqFpOO0M+27evN/pfdHqlvODNTL3ecIUUQvseDs8pjBlZwKwPLp/BmqYatY3yEqnxvLg3/OiJz798O50binici4g+8PI54h8DG9OIhhyjjzMjs//rJzJrusFB5fnxgBP/DOD7JgGU2FF+zDAx5I/DaVhD4cU4T4EIBr2gbi2GPH2rLu1H7LUkGkZ6iChpvRoe4Q3k7s06grS/+xk2jDbO8kqJ7bkLShCktBhOZVEDUMwhfXAh/A73dGPBW8Xi+pJDDbjo9Iwj5CY="); 

// تهيئة واتساب (تم إزالة مسار الويندوز لكي يعمل على Railway)
const waClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

waClient.on('qr', (qr) => {
       console.log('\n==================================================');
       console.log('📱 افتح هذا الرابط في متصفحك للحصول على صورة كود QR واضحة:');
       console.log(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`);
       console.log('==================================================\n');
   });

waClient.on('ready', () => {
    console.log('✅ تم ربط واتساب بنجاح!');
});

// تهيئة تلغرام وتوصيل الحسابين
(async () => {
    console.log("جاري الاتصال بحساب تلغرام...");
    const tgClient = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

    // لن يطلب أرقاماً الآن لأنه يستخدم المفتاح الجاهز
    await tgClient.start({
        onError: (err) => console.log("خطأ في تسجيل الدخول:", err),
    });
    
    console.log("✅ تم الدخول لحساب تلغرام بنجاح وبدون طلب كود!");

    tgClient.addEventHandler(async (event) => {
        const message = event.message;
        const chatId = message.chatId ? message.chatId.toString() : "";
        
        if (!chatId.includes(TG_CHAT_ID.replace("-100", ""))) return;

        try {
            if (message.message && !message.media) {
                await waClient.sendMessage(WA_CHAT_ID, `[من تلغرام]:\n${message.message}`);
                console.log("تم نقل رسالة نصية.");
            } 
            else if (message.media) {
                console.log("جاري تحميل ملف من تلغرام...");
                const buffer = await tgClient.downloadMedia(message, { workers: 1 });
                
                if (buffer) {
                    const base64Data = buffer.toString('base64');
                    const mimeType = message.file && message.file.mimeType ? message.file.mimeType : 'application/octet-stream';
                    const filename = message.file && message.file.name ? message.file.name : 'telegram_media';
                    
                    const media = new MessageMedia(mimeType, base64Data, filename);
                    const caption = message.message ? `[من تلغرام]:\n${message.message}` : '[ملف من تلغرام]';
                    
                    await waClient.sendMessage(WA_CHAT_ID, media, { caption: caption });
                    console.log("تم نقل الملف بنجاح.");
                }
            }
        } catch (error) {
            console.error('❌ حدث خطأ أثناء النقل:', error.message);
        }
    }, new NewMessage({}));

    waClient.initialize();
})();
