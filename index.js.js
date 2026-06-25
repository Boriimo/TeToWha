const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

// ==========================================
// 🌟 مفتاح التحكم في جلب رسائل اليوم 🌟
// ==========================================
// غيّر هذه القيمة إلى false بعد أن تصل الرسائل لكي لا تتكرر مستقبلاً!
const FETCH_TODAY_MESSAGES = true; 

// ==========================================
// 0. مضادات الانهيار الشاملة
// ==========================================
process.on('unhandledRejection', (reason) => console.error('⚠️ خطأ غير متوقع:', reason));
process.on('uncaughtException', (error) => console.error('⚠️ خطأ جسيم:', error));

// ==========================================
// 1. بيانات تلغرام وواتساب
// ==========================================
const apiId = 39184901; 
const apiHash = "f9401d4b61fa8a8c26b189292264ec8d";
const WA_CHAT_ID = "212778303880@c.us"; 
const stringSession = new StringSession("1BAAOMTQ5LjE1NC4xNjcuOTEAUK/F/t7wlbhiVjVv08LOUvzjydl0fgaqqTsd021DzbUzy78un5klFQcog7Nx0yrh4ANxn/il7vok/RPWYEPI1XXgRLGKYfOK5Q0UBx11Vk0bZiFvB5XVsKH3nAK5ZzgkIqMu0YKWxbCur9700i0vwy9fEFKnlS/cN/xhN/v4gyDFPkbgBTJmkprK7+she/9tPjAPiEnOASSprycUuQhE3BKJUVSkMn8DCOdkPeHzp9o6OWpMGjh03tKcMhwALSkR7EPHGe+C0+zkCKE1yMj2Yt1/WIbs/5oIIpyDG57K5ie82jT4gTsOeBpghwfaCPP/+1rbejmCYAt4gqvTGqiwyBg="); 

// ==========================================
// 2. تهيئة واتساب
// ==========================================
let isWhatsAppReady = false;

const waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }), 
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', 
            '--disable-gpu', '--disable-accelerated-2d-canvas', '--no-first-run',
            '--no-zygote', '--disable-background-timer-throttling', 
            '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding' 
        ],
        timeout: 60000, 
        protocolTimeout: 300000 
    }
});

waClient.on('ready', () => {
    console.log('✅ تم ربط واتساب بنجاح!');
    isWhatsAppReady = true;
    processQueue(); // بدء تشغيل الطابور فور جاهزية واتساب
});

waClient.on('disconnected', (reason) => {
    console.log('❌ واتساب فقد الاتصال. السبب:', reason);
    isWhatsAppReady = false;
    waClient.initialize();
});

// ==========================================
// 3. نظام الطابور (Queue System)
// ==========================================
const messageQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0 || !isWhatsAppReady) return;
    
    isProcessingQueue = true; 

    while (messageQueue.length > 0) {
        const task = messageQueue.shift(); 
        try {
            await task(); 
            // استراحة ثانيتين بين كل رسالة لحماية الخادم
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error('❌ خطأ في معالجة الرسالة:', error.message);
        }
    }
    
    isProcessingQueue = false; 
}

// دالة لتجهيز الرسالة وإضافتها للطابور
function enqueueMessage(message, tgClient) {
    messageQueue.push(async () => {
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

            if (message.message && !message.media) {
                await waClient.sendMessage(WA_CHAT_ID, `${messageHeader}${message.message}`);
                console.log(`تم إرسال نص من: ${senderName}`);
            } 
            else if (message.media) {
                const fileSize = message.file ? message.file.size : 0;
                const maxSizeInBytes = 60 * 1024 * 1024; 
                const whatsappVideoLimit = 15 * 1024 * 1024; 

                if (fileSize > maxSizeInBytes) {
                    const sizeInMB = (fileSize / (1024 * 1024)).toFixed(2);
                    console.log(`⚠️ تم تخطي ملف ضخم (${sizeInMB} MB).`);
                    await waClient.sendMessage(WA_CHAT_ID, `${messageHeader}⚠️ *[تنبيه]:* ملف كبير جداً (${sizeInMB} MB) موجود في تلغرام.`);
                    return; 
                }

                console.log(`جاري تحميل ملف من: ${senderName}...`);
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
                    
                    if (mimeType.includes('audio') || mimeType.includes('ogg')) {
                        sendOptions.sendAudioAsVoice = true; 
                    } else if (fileSize > whatsappVideoLimit) {
                        sendOptions.sendMediaAsDocument = true; 
                    }
                    
                    await waClient.sendMessage(WA_CHAT_ID, media, sendOptions);
                    console.log(`تم إرسال ملف بنجاح!`);
                }
            }
        } catch (error) {
            console.error('❌ خطأ داخل الطابور:', error.message);
        }
    });
    
    processQueue();
}

// ==========================================
// 4. تهيئة تلغرام
// ==========================================
(async () => {
    console.log("جاري الاتصال بحساب تلغرام...");
    const tgClient = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: Infinity }); 

    await tgClient.start({
        onError: (err) => console.log("خطأ في تسجيل الدخول:", err),
    });
    console.log("✅ تم الدخول لحساب تلغرام بنجاح!");

    // جلب رسائل اليوم إذا كان المفتاح مفعلاً
    if (FETCH_TODAY_MESSAGES) {
        console.log("🔍 جاري جلب رسائل اليوم الفائتة...");
        try {
            const dialogs = await tgClient.getDialogs({ limit: 15 });
            let allTodaysMessages = [];
            
            // تحديد بداية اليوم بتوقيت السيرفر
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const startTimestamp = Math.floor(startOfDay.getTime() / 1000);

            for (const dialog of dialogs) {
                const messages = await tgClient.getMessages(dialog.id, { limit: 50 });
                const todaysMsgs = messages.filter(m => m.date >= startTimestamp);
                allTodaysMessages.push(...todaysMsgs);
            }

            // ترتيب الرسائل من الأقدم للأحدث لكي تصل بشكل منطقي
            allTodaysMessages.sort((a, b) => a.date - b.date);

            if (allTodaysMessages.length > 0) {
                console.log(`📥 تم العثور على ${allTodaysMessages.length} رسالة اليوم. جاري إضافتها للطابور...`);
                for (const msg of allTodaysMessages) {
                    enqueueMessage(msg, tgClient);
                }
            } else {
                console.log("✅ لا توجد رسائل سابقة اليوم.");
            }
        } catch (err) {
            console.error("❌ خطأ أثناء جلب الرسائل القديمة:", err.message);
        }
    }

    // الاستماع للرسائل الجديدة
    tgClient.addEventHandler(async (event) => {
        enqueueMessage(event.message, tgClient);
    }, new NewMessage({}));

    waClient.initialize();
})();
