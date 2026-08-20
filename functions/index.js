const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Firebase Admin SDK'ni ishga tushirish
if (!admin.apps.length) {
  admin.initializeApp();
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

// Firebase Cloud Function sifatida eksport qilish
exports.api = functions.https.onRequest(app);