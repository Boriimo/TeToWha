const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

// ==========================================
// 🌟 مفتاح جلب الرسائل السابقة 🌟
// ==========================================
const FETCH_MISSED_MESSAGES = true; 

process.on('unhandledRejection', (reason) => console.error('⚠️ خطأ غير متوقع:', reason));
process.on('uncaughtException', (error) => console.error('⚠️ خطأ جسيم:', error));

const apiId = 39184901; 
const apiHash = "f9401d4b61fa8a8c26b189292264ec8d";
const WA_CHAT_ID = "212778303880@c.us"; 
const stringSession = new StringSession("1BAAOMTQ5LjE1NC4xNjcuOTEAUK/F/t7wlbhiVjVv08LOUvzjydl0fgaqqTsd021DzbUzy78un5klFQcog7Nx0yrh4ANxn/il7vok/RPWYEPI1XXgRLGKYfOK5Q0UBx11Vk0bZiFvB5XVsKH3nAK5ZzgkIqMu0YKWxbCur9700i0vwy9fEFKnlS/cN/xhN/v4gyDFPkbgBTJmkprK7+she/9tPjAPiEnOASSprycUuQhE3BKJUVSkMn8DCOdkPeHzp9o6OWpMGjh03tKcMhwALSkR7EPHGe+C0+zkCKE1yMj2Yt1/WIbs/5oIIpyDG57K5ie82jT4gTsOeBpghwfaCPP/+1rbejmCYAt4gqvTGqiwyBg="); 

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
        timeout: 90000, 
        protocolTimeout: 600000 
    }
});

waClient.on('ready', async () => {
    console.log('✅ تم ربط واتساب بنجاح! سيتم إعطاء المتصفح 5 ثوانٍ للاستقرار...');
    await new Promise(r => setTimeout(r, 5000));
    isWhatsAppReady = true;
    processQueue(); 
});

waClient.on('disconnected', (reason) => {
    console.log('❌ واتساب فقد الاتصال. السبب:', reason);
    isWhatsAppReady = false;
    waClient.initialize();
});

const safeExecute = (promise, ms = 120000) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

const messageQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0 || !isWhatsAppReady) return;
    isProcessingQueue = true; 

    while (messageQueue.length > 0) {
        const task = messageQueue.shift(); 
        try {
            await task(); 
            console.log('⏳ استراحة 10 ثوانٍ لتنظيف الذاكرة...');
            await new Promise(resolve => setTimeout(resolve, 10000)); 
        } catch (error) {
            console.error('❌ خطأ في معالجة الرسالة:', error.message);
        }
    }
    isProcessingQueue = false; 
}

function enqueueMessage(message, tgClient) {
    messageQueue.push(async () => {
        try {
            let chat, sender;
            try {
                chat = await safeExecute(message.getChat(), 20000);
                sender = await safeExecute(message.getSender(), 20000);
            } catch (e) {
                console.log('⚠️ تأخر في جلب بيانات المرسل، سيتم الاستمرار...');
            }
            
            let senderName = "تلغرام";
            if (chat && chat.title) senderName = chat.title;

            const messageHeader = `[من: ${senderName}]:\n`;

            if (message.message && !message.media) {
                console.log(`📤 جاري إرسال نص من: ${senderName}...`);
                try {
                    await safeExecute(waClient.sendMessage(WA_CHAT_ID, `${messageHeader}${message.message}`), 60000);
                    console.log(`✅ تم إرسال نص بنجاح!`);
                } catch (e) {
                    console.log(`❌ تجمد المتصفح أثناء إرسال النص. تم الإلغاء للمرور للتالي.`);
                }
            } 
            else if (message.media) {
                const fileSize = message.file ? message.file.size : 0;
                
                // 🛑 السقف الجديد الصارم جداً: 10 ميجابايت كحد أقصى للخادم المجاني!
                const maxSizeInBytes = 10 * 1024 * 1024; 
                
                if (fileSize > maxSizeInBytes) {
                    const sizeInMB = (fileSize / (1024 * 1024)).toFixed(2);
                    console.log(`⚠️ تخطي ملف (${sizeInMB} MB) لثقله وحماية الخادم من الشلل.`);
                    await safeExecute(waClient.sendMessage(WA_CHAT_ID, `${messageHeader}⚠️ *[تنبيه]:* يوجد ملف أو فيديو (${sizeInMB} MB) يتجاوز سعة البوت. يرجى مشاهدته من تلغرام.`), 60000).catch(()=>{});
                    return; 
                }

                console.log(`⬇️ جاري تحميل ملف (${(fileSize / (1024 * 1024)).toFixed(2)} MB) للقرص الصلب...`);
                let buffer;
                try {
                    buffer = await safeExecute(tgClient.downloadMedia(message, { workers: 1 }), 180000);
                } catch(e) {
                    console.log(`❌ فشل تحميل الملف من تلغرام.`);
                    return;
                }
                
                if (buffer) {
                    const mimeType = message.file && message.file.mimeType ? message.file.mimeType : 'application/octet-stream';
                    let filename = message.file && message.file.name ? message.file.name : `media_${Date.now()}`;
                    
                    if (!filename.includes('.')) {
                        if (mimeType.includes('mp4')) filename += '.mp4';
                        else if (mimeType.includes('jpg') || mimeType.includes('jpeg')) filename += '.jpg';
                        else if (mimeType.includes('png')) filename += '.png';
                        else if (mimeType.includes('pdf')) filename += '.pdf';
                        else if (mimeType.includes('ogg')) filename += '.ogg';
                        else if (mimeType.includes('audio')) filename += '.mp3';
                    }
                    
                    const filePath = path.join(__dirname, filename);
                    fs.writeFileSync(filePath, buffer);
                    buffer = null; 
                    
                    const media = MessageMedia.fromFilePath(filePath);
                    const caption = message.message ? `${messageHeader}${message.message}` : `[ملف من: ${senderName}]`;
                    const sendOptions = { caption: caption };
                    
                    if (mimeType.includes('audio') || mimeType.includes('ogg')) sendOptions.sendAudioAsVoice = true; 
                    else sendOptions.sendMediaAsDocument = true; 
                    
                    console.log(`📤 جاري إرسال الملف (مهلة دقيقتين)...`);
                    try {
                        await safeExecute(waClient.sendMessage(WA_CHAT_ID, media, sendOptions), 120000);
                        console.log(`✅ تم إرسال الملف بنجاح!`);
                    } catch (sendError) {
                        console.log(`❌ فشل النقل: المتصفح تجمد. تم التخطي.`);
                        await safeExecute(waClient.sendMessage(WA_CHAT_ID, `${messageHeader}⚠️ تعذر نقل ملف (${(fileSize / (1024 * 1024)).toFixed(2)} MB).`), 60000).catch(()=>{});
                    } finally {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            console.log(`🗑️ تم حذف الملف لتنظيف المساحة.`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ خطأ داخل الطابور:', error.message);
        }
    });
    
    processQueue();
}

(async () => {
    console.log("جاري الاتصال بحساب تلغرام...");
    const tgClient = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: Infinity }); 

    await tgClient.start({ onError: (err) => console.log("خطأ:", err) });
    console.log("✅ تم الدخول لحساب تلغرام بنجاح!");

    if (FETCH_MISSED_MESSAGES) {
        console.log("🔍 جاري جلب رسائل آخر 24 ساعة الفائتة...");
        try {
            const dialogs = await tgClient.getDialogs({ limit: 15 });
            let allTodaysMessages = [];
            const startTimestamp = Math.floor(Date.now() / 1000) - (24 * 60 * 60);

            for (const dialog of dialogs) {
                const messages = await tgClient.getMessages(dialog.id, { limit: 50 });
                allTodaysMessages.push(...messages.filter(m => m.date >= startTimestamp));
            }

            allTodaysMessages.sort((a, b) => a.date - b.date);

            if (allTodaysMessages.length > 0) {
                console.log(`📥 تم العثور على ${allTodaysMessages.length} رسالة. جاري إضافتها للطابور...`);
                for (const msg of allTodaysMessages) enqueueMessage(msg, tgClient);
            }
        } catch (err) {
            console.error("❌ خطأ:", err.message);
        }
    }

    tgClient.addEventHandler(async (event) => enqueueMessage(event.message, tgClient), new NewMessage({}));
    waClient.initialize();
})();
