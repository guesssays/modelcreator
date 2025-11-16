// netlify/functions/telegram-bot.js

const { WEBHOOK_SECRET, ADMIN_CHAT_ID } = require("./bot/config");
const { sendMessage } = require("./bot/telegram");
const { getBaseKeyboard } = require("./bot/keyboards");
const {
  handleIncomingPhoto,
  handleTextMessage
} = require("./bot/userHandlers");
const { handleAdminCallback } = require("./bot/admin");

exports.handler = async function (event, context) {
  try {
    // Разрешаем только POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 200,
        body: "OK"
      };
    }

    // Простая защита по секрету в query (?secret=...)
    if (WEBHOOK_SECRET) {
      const url = new URL(
        event.rawUrl || event.headers["x-original-url"] || ""
      );
      const secretFromQuery = url.searchParams.get("secret");
      if (secretFromQuery !== WEBHOOK_SECRET) {
        return { statusCode: 403, body: "Forbidden" };
      }
    }

    const update = JSON.parse(event.body || "{}");

    // --- 1) inline-кнопки (callback_query), в т.ч. "✅ Подтвердить / ❌ Отклонить" ---
    if (update.callback_query) {
      const cq = update.callback_query;
      const fromId = cq.from.id;
      const data = cq.data || "";
      const callbackId = cq.id;

      // Обрабатываем только если это админ
      if (ADMIN_CHAT_ID && String(fromId) === String(ADMIN_CHAT_ID)) {
        // handleAdminCallback внутри уже разрулит approve/reject
        // и сам дернёт answerCallback (через telegram.js)
        await handleAdminCallback(fromId, data, callbackId);
      }

      // В любом случае отвечаем OK Telegram
      return {
        statusCode: 200,
        body: "OK"
      };
    }

    // --- 2) Обычные сообщения ---
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;

      if (msg.photo) {
        await handleIncomingPhoto(chatId, msg);
      } else if (typeof msg.text === "string") {
        await handleTextMessage(chatId, msg.text.trim());
      } else {
        await sendMessage(
          chatId,
          "Отправьте текст или фото, пожалуйста.",
          getBaseKeyboard(chatId)
        );
      }
    }

    return {
      statusCode: 200,
      body: "OK"
    };
  } catch (err) {
    console.error("Handler error:", err);
    return {
      statusCode: 200,
      body: "OK"
    };
  }
};
