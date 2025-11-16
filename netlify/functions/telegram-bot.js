// netlify/functions/telegram-bot.js

const { WEBHOOK_SECRET } = require("./bot/config");
const { sendMessage } = require("./bot/telegram");
const { getBaseKeyboard } = require("./bot/keyboards");
const {
  handleIncomingPhoto,
  handleTextMessage
} = require("./bot/userHandlers");

exports.handler = async function (event, context) {
  try {
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
