import admin from 'firebase-admin';
import fetch from 'node-fetch';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const BOT_TOKEN = '8727235785:AAEodW-Pfqo3082mrSa4fK73_wp8o-Q3sUg';
console.log("🚀 Bot muvaffaqiyatli ishga tushdi!");

async function answerCallbackQuery(callbackQueryId, text, showAlert = false) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert })
    });
  } catch (e) {
    console.error("Answer error:", e);
  }
}

async function editMessageCaption(chatId, messageId, caption) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, caption })
    });
  } catch (e) {
    console.error("Edit error:", e);
  }
}

let offset = 0;
async function poll() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`);
    const data = await res.json();

    if (data.ok && data.result) {
      for (const update of data.result) {
        offset = update.update_id + 1;

        if (update.callback_query) {
          const query = update.callback_query;
          const dataStr = query.data;
          const chatId = query.message.chat.id;
          const messageId = query.message.message_id;

          if (dataStr.startsWith('approve_')) {
            const parts = dataStr.split('_');
            
            let userId = parts[1];
            let amountStr = parts[2];
            
            let amount = Number(amountStr);
            if (isNaN(amount)) {
              for (let p of parts) {
                if (!isNaN(p) && p.length < 8 && Number(p) > 0) {
                  amount = Number(p);
                } else if (!isNaN(p) && p.length >= 8) {
                  userId = p;
                }
              }
            }

            try {
              const userRef = db.collection('users').doc(String(userId));
              const doc = await userRef.get();

              let currentBalance = 0;
              if (doc.exists) {
                currentBalance = Number(doc.data().balance || 0);
              }

              if (isNaN(amount) || amount <= 0) {
                await answerCallbackQuery(query.id, `Xatolik: Summa topilmadi (${amountStr})`, true);
                return;
              }

              await userRef.set({ 
                balance: currentBalance + amount 
              }, { merge: true });
              
              await answerCallbackQuery(query.id, `Balansga ${amount.toLocaleString('uz-UZ')} UZS qo'shildi!`, true);
              await editMessageCaption(chatId, messageId, `✅ TOLOV TASDIQLANDI!\n\nID: ${userId}\nSumma: ${amount.toLocaleString('uz-UZ')} UZS`);
            } catch (e) {
              console.error("DB error:", e);
              await answerCallbackQuery(query.id, 'Bazaga yozishda xatolik!');
            }
          } else if (dataStr.startsWith('reject_')) {
            const userId = dataStr.split('_')[1];
            await answerCallbackQuery(query.id, 'Rad etildi');
            await editMessageCaption(chatId, messageId, `❌ TOLOV RAD ETILDI!\n\nID: ${userId}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('Polling xatosi:', err);
  }
  setTimeout(poll, 1000);
}

poll();