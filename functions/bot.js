import admin from 'firebase-admin';
import fetch from 'node-fetch';

const db = admin.firestore();
const BOT_TOKEN = '8727235785:AAEodW-Pfqo3082mrSa4fK73_wp8o-Q3sUg';

// Webhook orqali kelgan update'larni boshqarish
export async function handleUpdate(reqBody, res) {
  try {
    if (reqBody.callback_query) {
      const query = reqBody.callback_query;
      const dataStr = query.data;
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;

      if (dataStr.startsWith('approve_')) {
        const parts = dataStr.split('_');
        let userId = parts[1];
        let amountStr = parts[parts.length - 1];
        let amount = Number(amountStr);

        if (isNaN(amount) || amount < 1000 || amount > 10000000) {
          await answerCallbackQuery(query.id, `Xatolik: Noto'g'ri summa!`, true);
          await editMessageCaption(chatId, messageId, `❌ XATOLIK: Summa xato!`);
          return res.status(200).send('OK');
        }

        const userRef = db.collection('users').doc(String(userId));
        const doc = await userRef.get();

        let currentBalance = 0;
        if (doc.exists) {
          currentBalance = Number(doc.data().balance || 0);
        }

        await userRef.set({ 
          balance: currentBalance + amount 
        }, { merge: true });
        
        await answerCallbackQuery(query.id, `Balansga ${amount.toLocaleString('uz-UZ')} UZS qo'shildi!`, true);
        await editMessageCaption(chatId, messageId, `✅ TOLOV TASDIQLANDI!\n\nID: ${userId}\nSumma: ${amount.toLocaleString('uz-UZ')} UZS`);

      } else if (dataStr.startsWith('reject_')) {
        const userId = dataStr.split('_')[1];
        await answerCallbackQuery(query.id, 'Rad etildi');
        await editMessageCaption(chatId, messageId, `❌ TOLOV RAD ETILDI!\n\nID: ${userId}`);
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook xatosi:', err);
    res.status(500).send('Error');
  }
}

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