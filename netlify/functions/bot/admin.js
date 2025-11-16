// bot/admin.js
const { sendMessage } = require("./telegram");
const {
  adminKeyboard,
  getBaseKeyboard
} = require("./keyboards");
const {
  listShopsByStatus,
  listAllShops,
  ensureDailyCounters,
  getShop,
  TRIAL_CREDITS
} = require("./store");
const { ADMIN_CHAT_ID } = require("./config");

// Уведомление админа о новом магазине
async function notifyAdminNewShop(shop) {
  if (!ADMIN_CHAT_ID) {
    console.warn("ADMIN_CHAT_ID is not set, skipping admin notify");
    return;
  }
  const text = `
Новый магазин ожидает подтверждения:

Название: ${shop.name}
Instagram/Telegram: ${shop.instagram || "—"}
Контакт: ${shop.contact || "—"}
Chat ID: ${shop.chatId}

Чтобы выдать пробные генерации, отправьте:
/approve ${shop.chatId}

Чтобы отклонить или заблокировать:
/reject ${shop.chatId}
`.trim();

  await sendMessage(ADMIN_CHAT_ID, text, adminKeyboard());
}

async function handleAdminCommand(chatId, text) {
  // /approve <chatId>
  if (text.startsWith("/approve ")) {
    const parts = text.split(" ").filter(Boolean);
    if (parts.length < 2) {
      await sendMessage(chatId, "Использование: /approve <chatId>", adminKeyboard());
      return;
    }
    const targetId = parts[1];
    const shop = getShop(targetId);
    if (!shop) {
      await sendMessage(chatId, `Магазин с chatId ${targetId} не найден.`, adminKeyboard());
      return;
    }

    shop.status = "active";
    shop.plan = "trial";
    shop.creditsTotal = TRIAL_CREDITS;
    shop.creditsLeft = TRIAL_CREDITS;
    ensureDailyCounters(shop);

    await sendMessage(
      chatId,
      `Магазин «${shop.name}» (chatId: ${shop.chatId}) одобрен. Выдано ${TRIAL_CREDITS} пробных генераций.`,
      adminKeyboard()
    );

    await sendMessage(
      shop.chatId,
      `Ваша заявка успешно прошла автоматическую проверку системой! 🎉\nВам выдано ${TRIAL_CREDITS} пробных генераций. Нажмите «🎨 Попробовать генерацию», чтобы начать.`,
      getBaseKeyboard(shop.chatId)
    );
    return;
  }

  // /reject <chatId>
  if (text.startsWith("/reject ")) {
    const parts = text.split(" ").filter(Boolean);
    if (parts.length < 2) {
      await sendMessage(chatId, "Использование: /reject <chatId>", adminKeyboard());
      return;
    }
    const targetId = parts[1];
    const shop = getShop(targetId);
    if (!shop) {
      await sendMessage(chatId, `Магазин с chatId ${targetId} не найден.`, adminKeyboard());
      return;
    }

    shop.status = "blocked";
    shop.creditsTotal = 0;
    shop.creditsLeft = 0;

    await sendMessage(
      chatId,
      `Магазин «${shop.name}» (chatId: ${shop.chatId}) помечен как заблокированный.`,
      adminKeyboard()
    );

    await sendMessage(
      shop.chatId,
      "К сожалению, ваша заявка не прошла автоматическую проверку системы. Если вы считаете, что это ошибка — свяжитесь со службой поддержки сервиса.",
      getBaseKeyboard(shop.chatId)
    );
    return;
  }

  // /list_shops
  if (text === "/list_shops") {
    const all = listAllShops();
    if (!all.length) {
      await sendMessage(chatId, "Пока нет ни одного зарегистрированного магазина.", adminKeyboard());
      return;
    }
    const lines = all
      .slice(0, 50)
      .map(
        (s) =>
          `• ${s.name} (chatId: ${s.chatId}, status: ${s.status}, credits: ${s.creditsLeft})`
      );
    await sendMessage(chatId, lines.join("\n"), adminKeyboard());
    return;
  }

  // Кнопки панели
  if (text === "⏳ Ожидают подтверждения") {
    const arr = listShopsByStatus("pending");
    if (!arr.length) {
      await sendMessage(chatId, "Нет магазинов, ожидающих подтверждения.", adminKeyboard());
      return;
    }
    const lines = arr.map(
      (s) =>
        `• ${s.name} (chatId: ${s.chatId}, Instagram/Telegram: ${s.instagram || "—"})`
    );
    await sendMessage(chatId, lines.join("\n"), adminKeyboard());
    return;
  }

  if (text === "✅ Активные магазины") {
    const arr = listShopsByStatus("active");
    if (!arr.length) {
      await sendMessage(chatId, "Нет активных магазинов.", adminKeyboard());
      return;
    }
    const lines = arr.map(
      (s) =>
        `• ${s.name} (chatId: ${s.chatId}, credits: ${s.creditsLeft})`
    );
    await sendMessage(chatId, lines.join("\n"), adminKeyboard());
    return;
  }

  if (text === "⛔ Заблокированные магазины") {
    const arr = listShopsByStatus("blocked");
    if (!arr.length) {
      await sendMessage(chatId, "Нет заблокированных магазинов.", adminKeyboard());
      return;
    }
    const lines = arr.map(
      (s) =>
        `• ${s.name} (chatId: ${s.chatId})`
    );
    await sendMessage(chatId, lines.join("\n"), adminKeyboard());
    return;
  }

  if (text === "🔄 Все магазины") {
    const all = listAllShops();
    if (!all.length) {
      await sendMessage(chatId, "Пока нет ни одного зарегистрированного магазина.", adminKeyboard());
      return;
    }
    const lines = all
      .slice(0, 50)
      .map(
        (s) =>
          `• ${s.name} (chatId: ${s.chatId}, status: ${s.status}, credits: ${s.creditsLeft})`
      );
    await sendMessage(chatId, lines.join("\n"), adminKeyboard());
    return;
  }
}

module.exports = {
  notifyAdminNewShop,
  handleAdminCommand
};
