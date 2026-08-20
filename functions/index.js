const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const path = require("path");

if (!admin.apps.length) {
  let credential;

  if (process.env.FIREBASE_CONFIG_JSON) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
      credential = admin.credential.cert(serviceAccount);
    } catch (err) {
      console.error("FIREBASE_CONFIG_JSON'ni o'qishda xatolik:", err);
    }
  }

  if (!credential) {
    try {
      const serviceAccount = require("./serviceAccountKey.json");
      credential = admin.credential.cert(serviceAccount);
    } catch (err) {
      console.warn("serviceAccountKey.json topilmadi, standart sozlama ishlatilmoqda.");
    }
  }

  admin.initializeApp(credential ? { credential } : {});
}

const bot = require("./bot");
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// 📌 Public papkasidagi HTML va statik fayllarni ulash
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/webhook", async (req, res) => {
  try {
    await bot.handleUpdate(req.body, res);
  } catch (error) {
    console.error("Webhookda xatolik:", error);
    if (!res.headersSent) {
      res.status(500).send("Xatolik yuz berdi");
    }
  }
});

app.get("/health", (req, res) => {
  res.status(200).send("Bot API muvaffaqiyatli ishlamoqda!");
});

// 📌 Top 25 turnover (abarot) bo'yicha foydalanuvchilar reytingi
app.get("/api/top-users", async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection('users')
      .orderBy('turnover', 'desc')
      .limit(25)
      .get();

    const topUsers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      topUsers.push({
        userId: doc.id,
        username: data.username || 'Foydalanuvchi',
        turnover: data.turnover || 0
      });
    });

    res.status(200).json({ success: true, topUsers });
  } catch (error) {
    console.error("Top users xatosi:", error);
    res.status(500).json({ success: false, error: "Server xatosi" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ${PORT}-portda muvaffaqiyatli ishga tushdi`);
});