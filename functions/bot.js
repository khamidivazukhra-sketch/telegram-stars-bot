const { Telegraf, Markup } = require("telegraf");
const admin = require("firebase-admin");

// Firebase initiatsiyasi (index.js da chaqirilmagan bo'lsa)
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// Bot tokeni va Admin ID sini kiriting
const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN";
const ADMIN_ID = process.env.ADMIN_ID || "123456789"; // O'zingizning Telegram ID ingiz

const bot = new Telegraf(BOT_TOKEN);

// 1. /start buyrug'i - Foydalanuvchini bazaga ro'yxatga olish
bot.start(async (ctx) => {
  const user = ctx.from;
  const userRef = db.collection("users").doc(user.id.toString());

  try {
    const doc = await userRef.get();
    if (!doc.exists) {
      await userRef.set({
        telegramId: user.id,
        firstName: user.first_name || "",
        username: user.username || "",
        balance: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await ctx.reply(
      `Xush kelibsiz, ${user.first_name}!\nBalansni to'ldirish uchun /deposit buyrug'ini yuboring.`
    );
  } catch (error) {
    console.error("Start xatosi:", error);
  }
});

// 2. /deposit buyrug'i - Depozit so'rovini yaratish
bot.command("deposit", async (ctx) => {
  const userId = ctx.from.id.toString();
  const amount = 50000; // Misol uchun 50,000 so'm

  try {
    // Bazada yangi depozit so'rovi yaratish
    const depositRef = await db.collection("deposits").add({
      userId: userId,
      userName: ctx.from.first_name,
      amount: amount,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await ctx.reply("Depozit so'rovingiz adminga yuborildi. Kuting...");

    // Adminga tugmalar bilan xabar yuborish
    await ctx.telegram.sendMessage(
      ADMIN_ID,
      `📥 **Yangi depozit so'rovi!**\n\n` +
        `👤 Foydalanuvchi: ${ctx.from.first_name} (@${ctx.from.username || "yo'q"})\n` +
        `🆔 ID: \`${userId}\`\n` +
        `💰 Summa: **${amount.toLocaleString()} so'm**\n` +
        `📄 So'rov ID: \`${depositRef.id}\``,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Tasdiqlash", `approve_${depositRef.id}`),
            Markup.button.callback("❌ Rad etish", `reject_${depositRef.id}`),
          ],
        ]),
      }
    );
  } catch (error) {
    console.error("Deposit xatosi:", error);
    await ctx.reply("So'rov yaratishda xatolik yuz berdi.");
  }
});

// 3. Admin "✅ Tasdiqlash" tugmasini bosganda
bot.action(/^approve_(.+)$/, async (ctx) => {
  const depositId = ctx.match[1];

  try {
    // Telegram spinnerini to'xtatish
    await ctx.answerCbQuery("Ishlanmoqda...");

    const depositRef = db.collection("deposits").doc(depositId);

    // Firestore Tranzaksiyasi: balans va statusni bir vaqtda xavfsiz yangilash
    await db.runTransaction(async (transaction) => {
      const depositDoc = await transaction.get(depositRef);

      if (!depositDoc.exists) {
        throw new Error("So'rov topilmadi!");
      }

      const depositData = depositDoc.data();

      if (depositData.status !== "pending") {
        throw new Error("So'rov allaqachon ko'rib chiqilgan!");
      }

      const userRef = db.collection("users").doc(depositData.userId);

      // Foydalanuvchi balansini oshirish
      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(Number(depositData.amount)),
      });

      // Depozit statusini yangilash
      transaction.update(depositRef, {
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Foydalanuvchiga bildirishnoma yuborish
      await ctx.telegram.sendMessage(
        depositData.userId,
        `🎉 **Balansingiz to'ldirildi!**\n\n💰 Qo'shildi: **${depositData.amount.toLocaleString()} so'm**`,
        { parse_mode: "Markdown" }
      );
    });

    // Admin chatidagi xabarni va tugmalarni o'zgartirish
    await ctx.editMessageText(
      `${ctx.callbackQuery.message.text}\n\n✅ **HOLAT: Tasdiqlandi**`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Tasdiqlash xatosi:", error);
    await ctx.answerCbQuery(`❌ Xatolik: ${error.message}`, { show_alert: true });
  }
});

// 4. Admin "❌ Rad etish" tugmasini bosganda
bot.action(/^reject_(.+)$/, async (ctx) => {
  const depositId = ctx.match[1];

  try {
    await ctx.answerCbQuery("Rad etilmoqda...");

    const depositRef = db.collection("deposits").doc(depositId);
    const depositDoc = await depositRef.get();

    if (!depositDoc.exists || depositDoc.data().status !== "pending") {
      return ctx.answerCbQuery("So'rov allaqachon ko'rib chiqilgan!", {
        show_alert: true,
      });
    }

    const depositData = depositDoc.data();

    // Statusni 'rejected' qilish
    await depositRef.update({
      status: "rejected",
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Foydalanuvchiga rad etilgani haqida xabar berish
    await ctx.telegram.sendMessage(
      depositData.userId,
      `❌ Sizning **${depositData.amount.toLocaleString()} so'm**lik depozit so'rovingiz rad etildi.`,
      { parse_mode: "Markdown" }
    );

    // Admin chatidagi matnni yangilash
    await ctx.editMessageText(
      `${ctx.callbackQuery.message.text}\n\n❌ **HOLAT: Rad etildi**`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Rad etish xatosi:", error);
    await ctx.answerCbQuery("Xatolik yuz berdi!", { show_alert: true });
  }
});

module.exports = bot;