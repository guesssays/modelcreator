// bot/telegram.js
const { TELEGRAM_API, TELEGRAM_FILE_API } = require("./config");

// Отправка текстового сообщения
async function sendMessage(chatId, text, extra = {}) {
  const payload = {
    chat_id: chatId,
    text,
    ...extra
  };

  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// Ответ на callback_query (inline-кнопки)
async function answerCallback(callbackQueryId, text = null, showAlert = false) {
  if (!callbackQueryId) return;

  const payload = {
    callback_query_id: callbackQueryId
  };

  if (text) payload.text = text;
  if (showAlert) payload.show_alert = true;

  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// Отправка фото (Buffer)
async function sendPhoto(chatId, buffer, caption = "") {
  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  formData.append("caption", caption);
  formData.append("photo", new Blob([buffer]), "generated.png");

  await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: "POST",
    body: formData
  });
}

// Получить файл из Telegram (Buffer)
async function downloadTelegramFile(fileId) {
  const resMeta = await fetch(
    `${TELEGRAM_API}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const metaJson = await resMeta.json();
  if (!metaJson.ok) {
    throw new Error("Failed to getFile from Telegram");
  }
  const filePath = metaJson.result.file_path;

  const fileRes = await fetch(`${TELEGRAM_FILE_API}/${filePath}`);
  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  sendMessage,
  answerCallback,
  sendPhoto,
  downloadTelegramFile
};
