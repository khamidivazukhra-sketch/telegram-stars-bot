const express = require('express');
const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');

// Firebase Admin-ni Environment Variable orqali ulash
if (process.env.FIREBASE_CONFIG_JSON) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  admin.initializeApp();
}

const db = admin.firestore();

// Bot va Admin sozlamalari
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID || '8121415074';

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

// Start buyrug'i
bot.start(async (ctx) => {
  const userId = String(ctx.from.id);
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    await userRef.set({
      userId: userId,
      username: username,
      balance: 0,
      createdAt: new Date()
    });
  }

  ctx.reply(`Xush kelibsiz, ${username}!\n\nBalans to'ldirish uchun to'lov chekini (rasm) shu yerga yuboring. 📸`);
});

// Chek (rasm) kelganda
bot.on('photo', async (ctx) => {
  try {
    const userId = String(ctx.from.id);
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const caption = ctx.message.caption || "Summa yozilmadi";

    await ctx.reply("Chekingiz qabul qilindi! Admin tekshirib balangingizni to'ldiradi. ⏳");

    await ctx.telegram.sendPhoto(ADMIN_ID, photoId, {
      caption: `📥 **Yangi to'lov cheki!**\n\nFoydalanuvchi: ${username}\nID: \`${userId}\`\nIzoh: ${caption}`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ +50,000 so\'m', callback_data: `add_50000_${userId}` },
            { text: '✅ +100,000 so\'m', callback_data: `add_100000_${userId}` }
          ],
          [
            { text: '❌ Rad etish', callback_data: `reject_${userId}` }
          ]
        ]
      }
    });
  } catch (err) {
    console.error('Photo error:', err);
  }
});

// Admin to'lovni tasdiqlaganda (Balans oshadi)
bot.action(/add_(\d+)_(.+)/, async (ctx) => {
  try {
    const amount = parseInt(ctx.match[1]);
    const targetUserId = ctx.match[2];

    const userRef = db.collection('users').doc(targetUserId);
    await userRef.set({
      balance: admin.firestore.FieldValue.increment(amount)
    }, { merge: true });

    const userDoc = await userRef.get();
    const newBalance = userDoc.data().balance || amount;

    await ctx.telegram.sendMessage(targetUserId, `🎉 To'lovingiz tasdiqlandi!\n\nBalansingizga +${amount.toLocaleString()} so'm qo'shildi.\nHozirgi balansingiz: ${newBalance.toLocaleString()} so'm.`);
    await ctx.editMessageCaption(`✅ **To'lov tasdiqlandi!** (+${amount.toLocaleString()} so'm qo'shildi)`);
  } catch (err) {
    console.error('Add balance error:', err);
  }
});

// Admin to'lovni rad etganda
bot.action(/reject_(.+)/, async (ctx) => {
  try {
    const targetUserId = ctx.match[1];
    await ctx.telegram.sendMessage(targetUserId, "❌ To'lov chekingiz rad etildi. Ma'lumotlarni tekshirib qayta yuboring.");
    await ctx.editMessageCaption("❌ **To'lov rad etildi.**");
  } catch (err) {
    console.error('Reject error:', err);
  }
});

// Mini App orqali Stars xarid qilish API
app.post('/api/buy-stars', async (req, res) => {
  try {
    const { userId, starsCount, price } = req.body;
    const userRef = db.collection('users').doc(String(userId));
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'Foydalanuvchi topilmadi' });
    }

    const userData = userDoc.data();
    if ((userData.balance || 0) < price) {
      return res.status(400).json({ success: false, message: 'Balans yetarli emas!' });
    }

    await userRef.update({
      balance: admin.firestore.FieldValue.increment(-price)
    });

    await bot.telegram.sendMessage(ADMIN_ID, `⭐️ **YANGI STARS SO'ROVI!**\n\nFoydalanuvchi: ${userData.username || userId}\nID: \`${userId}\`\nSo'ralgan Stars: ${starsCount} dona\nYechilgan summa: ${price.toLocaleString()} so'm`, {
      parse_mode: 'Markdown'
    });

    res.json({ success: true, message: 'So\'rovingiz adminga yuborildi!' });
  } catch (err) {
    console.error('Buy stars error:', err);
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// User balansini ko'rish API
app.get('/api/user/:id', async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.params.id).get();
    if (!userDoc.exists) return res.json({ balance: 0 });
    res.json(userDoc.data());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('Server ishlamoqda!'));
app.use(bot.webhookCallback('/webhook'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT}-portda ishlamoqda`));