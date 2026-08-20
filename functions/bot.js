const { Telegraf } = require("telegraf");
const admin = require("firebase-admin");

// Render Environment variables'dan bot tokenni olish
const bot = new Telegraf(process.env.BOT_TOKEN);
const db = admin.firestore();

// 1. /start buyrug'i
bot.start(async (ctx) => {
  const userId = String(ctx.from.id);
  const userRef = db.collection("users").doc(userId);
  const doc = await userRef.get();

  if (!doc.exists) {
    await userRef.set({
      id: userId,
      username: ctx.from.username || "Mavjud emas",
      first_name: ctx.from.first_name || "",
      balance: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  await ctx.reply(`Xush kelibsiz, ${ctx.from.first_name}! Balansingizni to'ldirish uchun chek yuboring.`);
});

// 2. Chek (Foto) kelganda ishlovchi qism
bot.on("photo", async (ctx) => {
  const userId = String(ctx.from.id);
  const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const caption = ctx.message.caption || "0";

  // Captionsiz yuborilgan bo'lsa summani ajratish
  const amount = parseInt(caption.replace(/\D/g, "")) || 0;

  if (amount <= 0) {
    return ctx.reply("❌ Iltimos, rasm ostiga (caption) o'tkazgan summangizni raqamda yozib yuboring! (Masalan: 50000)");
  }

  const adminId = process.env.ADMIN_ID;
  if (!adminId) {
    return ctx.reply("❌ Tizim xatoligi: Admin ID sozlanmagan.");
  }

  // Adminga xabar va inline tugmalarni yuborish
  await ctx.telegram.sendPhoto(adminId, photoId, {
    caption: `📥 **YANGI TO'LOV CHEKI!**\n\n👤 Foydalanuvchi: @${ctx.from.username || "yashirin"} (ID: \`${userId}\`)\n💰 Summa: **${amount.toLocaleString()} UZS**`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Balansni tasdiqlash", callback_data: `approve_${userId}_${amount}` },
          { text: "❌ Rad etish", callback_data: `reject_${userId}` }
        ]
      ]
    }
  });

  await ctx.reply("✅ Chekingiz adminga yuborildi. Tekshiruvdan so'ng balansingizga pul qo'shiladi.");
});

// 3. Admin "✅ Balansni tasdiqlash" tugmasini bosganda
bot.action(/^approve_(\d+)_(\d+)$/, async (ctx) => {
  const userId = ctx.match[1];
  const amount = parseInt(ctx.match[2]);

  try {
    const userRef = db.collection("users").doc(userId);

    // Firestore tranzaksiyasi orqali balansni xavfsiz oshirish
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        transaction.set(userRef, { balance: amount });
      } else {
        const currentBalance = userDoc.data().balance || 0;
        transaction.update(userRef, { balance: currentBalance + amount });
      }
    });

    // Telegram uchun qisqa va aniq javob (xatolik bermaydi)
    await ctx.answerCbQuery("✅ Balans muvaffaqiyatli to'ldirildi!");

    // Admin xabarini yangilash
    await ctx.editMessageCaption(
      `${ctx.callbackQuery.message.caption}\n\n✅ **STATUS:** Tasdiqlandi (+${amount.toLocaleString()} UZS)`,
      { parse_mode: "Markdown" }
    );

    // Foydalanuvchiga xabar yuborish
    await bot.telegram.sendMessage(
      userId,
      `🎉 **Xushxabar!** To'lovingiz tasdiqlandi.\n💰 Balansingizga **${amount.toLocaleString()} UZS** qo'shildi.`
    );
  } catch (error) {
    console.error("Tasdiqlashda xatolik:", error);
    // Qisqa xabar berish orqali MESSAGE_TOO_LONG xatosining oldi olinadi
    await ctx.answerCbQuery("❌ Baza xatosi! Admin panelini tekshiring.", { show_alert: true });
  }
});

// 4. Admin "❌ Rad etish" tugmasini bosganda
bot.action(/^reject_(\d+)$/, async (ctx) => {
  const userId = ctx.match[1];

  try {
    await ctx.answerCbQuery("❌ To'lov rad etildi");
    await ctx.editMessageCaption(
      `${ctx.callbackQuery.message.caption}\n\n❌ **STATUS:** Rad etildi`,
      { parse_mode: "Markdown" }
    );

    await bot.telegram.sendMessage(
      userId,
      "❌ Kechirasiz, siz yuborgan to'lov cheki rad etildi."
    );
  } catch (error) {
    console.error("Rad etishda xatolik:", error);
    await ctx.answerCbQuery("❌ Xatolik yuz berdi", { show_alert: true });
  }
});

module.exports = bot;