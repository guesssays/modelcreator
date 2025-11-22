// netlify/functions/telegram-bot.js

const { WEBHOOK_SECRET, ADMIN_CHAT_ID } = require("./bot/config");
const { sendMessage } = require("./bot/telegram");
const { getBaseKeyboard } = require("./bot/keyboards");
const {
  handleIncomingPhoto,
  handleTextMessage,
  handleUserCallback
} = require("./bot/userHandlers");
const { handleAdminCallback } = require("./bot/admin");

// ИНИЦИАЛИЗАЦИЯ Netlify Blobs для Functions v1
const { initBlobStore } = require("./bot/store");

exports.handler = async function (event, context) {
  try {
    // Обязательно инициализируем Blobs до любых обращений к store
    initBlobStore(event);

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 200,
        body: "OK"
      };
    }

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

    // callback_query от inline-кнопок
    if (update.callback_query) {
      const cq = update.callback_query;
      const fromId = cq.from.id;
      const data = cq.data || "";
      const callbackId = cq.id;

      if (ADMIN_CHAT_ID && String(fromId) === String(ADMIN_CHAT_ID)) {
        await handleAdminCallback(fromId, data, callbackId);
      } else {
        await handleUserCallback(fromId, data, callbackId);
      }

      return {
        statusCode: 200,
        body: "OK"
      };
    }

    // Обычные сообщения
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;

      if (msg.photo) {
        await handleIncomingPhoto(chatId, msg);
      } else if (typeof msg.text === "string") {
        await handleTextMessage(chatId, msg.text.trim());
      } else {
        const kb = await getBaseKeyboard(chatId);
        await sendMessage(
          chatId,
          "Отправьте текст или фото, пожалуйста.",
          kb
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
