const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Render'ga yuklangan serviceAccountKey.json faylini ulash
let serviceAccount;
try {
  serviceAccount = require("./serviceAccountKey.json");
} catch (e) {
  console.log("serviceAccountKey.json fayli topilmadi, standart muhit ishlatilmoqda.");
}

// Firebase Admin SDK'ni ishga tushirish
if (!admin.apps.length) {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    admin.initializeApp();
  }
}

// bot.js faylidan bot obyektini import qilish
const bot = require("./bot");

const app = express();

// Middleware sozlamalari
app.use(cors({ origin: true }));
app.use(express.json());

// Telegram Webhook yo'lagi (Endpoint)
app.post("/webhook", async (req, res) => {
  try {
    // Telegramdan kelayotgan har bir hodisani Telegraf botiga uzatish
    await bot.handleUpdate(req.body, res);
  } catch (error) {
    console.error("Webhookda xatolik:", error);
    if (!res.headersSent) {
      res.status(500).send("Xatolik yuz berdi");
    }
  }
});

// Qo'shimcha: Mini App yoki Veb sayt uchun REST API (ixtiyoriy)
app.get("/health", (req, res) => {
  res.status(200).send("Bot API muvaffaqiyatli ishlamoqda!");
});

// Render serverini doimiy faol ushlab turish uchun port tinglovchisi
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ${PORT}-portda muvaffaqiyatli ishga tushdi`);
});