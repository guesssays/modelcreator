// bot/admin.js
const { sendMessage, answerCallback } = require("./telegram");
const {
  adminKeyboard,
  getBaseKeyboard
} = require("./keyboards");
const {
  listShopsByStatus,
  listAllShops,
  ensureDailyCounters,
  getShop,
  TRIAL_CREDITS,
  addCreditsToShop,
  setShopPlan,
  persistShop
} = require("./store");
const { ADMIN_CHAT_ID } = require("./config");

// Пакеты для пополнения (тарифы)
const PACKS = {
  start: { credits: 100, label: "Start — 100 генераций" },
  pro:   { credits: 300, label: "Pro — 300 генераций" },
  max:   { credits: 700, label: "Max — 700 генераций" }
};

// ================== ХЕЛПЕРЫ ОТОБРАЖЕНИЯ КАРТОЧЕК ==================

// карточка pending-магазина (ожидает подтверждения)
async function sendPendingShopCard(adminChatId, shop) {
  const text = `
⏳ Ожидает подтверждения

Название: ${shop.name}
Chat ID: ${shop.chatId}
Instagram/Telegram: ${shop.instagram || "—"}
Контакт: ${shop.contact || "—"}
`.trim();

  await sendMessage(adminChatId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Подтвердить", callback_data: `approve:${shop.chatId}` },
          { text: "❌ Отклонить", callback_data: `reject:${shop.chatId}` }
        ]
      ]
    }
  });
}

// карточка активного магазина
async function sendActiveShopCard(adminChatId, shop) {
  ensureDailyCounters(shop);

  const text = `
🟢 Активный магазин

Название: ${shop.name}
Chat ID: ${shop.chatId}

Тариф: ${shop.plan || "—"}
Кредиты: ${shop.creditsLeft} / ${shop.creditsTotal}
Сгенерировано сегодня: ${shop.generatedToday}
`.trim();

  await sendMessage(adminChatId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ Начислить тариф", callback_data: `packs:${shop.chatId}` }
        ],
        [
          { text: "⛔ Заблокировать", callback_data: `block:${shop.chatId}` }
        ]
      ]
    }
  });
}

// карточка заблокированного магазина
async function sendBlockedShopCard(adminChatId, shop) {
  const text = `
⛔ Заблокированный магазин

Название: ${shop.name}
Chat ID: ${shop.chatId}
`.trim();

  await sendMessage(adminChatId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Разблокировать", callback_data: `unblock:${shop.chatId}` }
        ]
      ]
    }
  });
}

// ================== НОВЫЙ МАГАЗИН (уведомление) ==================

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

Выберите действие с помощью кнопок ниже.
`.trim();

  await sendMessage(ADMIN_CHAT_ID, text, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Подтвердить",
            callback_data: `approve:${shop.chatId}`
          },
          {
            text: "❌ Отклонить",
            callback_data: `reject:${shop.chatId}`
          }
        ]
      ]
    }
  });
}

// ================== БАЗОВЫЕ ОПЕРАЦИИ approve/reject ==================

async function approveShop(adminChatId, targetId) {
  const shop = await getShop(targetId);
  if (!shop) {
    await sendMessage(
      adminChatId,
      `Магазин с chatId ${targetId} не найден.`,
      adminKeyboard()
    );
    return;
  }

  shop.status = "active";
  shop.plan = "trial";
  shop.creditsTotal = TRIAL_CREDITS;
  shop.creditsLeft = TRIAL_CREDITS;
  ensureDailyCounters(shop);
  await persistShop(shop);

  await sendMessage(
    adminChatId,
    `Магазин «${shop.name}» (chatId: ${shop.chatId}) одобрен. Выдано ${TRIAL_CREDITS} пробных генераций.`,
    adminKeyboard()
  );

  const kb = await getBaseKeyboard(shop.chatId);
  await sendMessage(
    shop.chatId,
    `Ваша заявка успешно прошла проверку! 🎉\nВам выдано ${TRIAL_CREDITS} пробных генераций. Нажмите «🎨 Генерировать», чтобы начать.`,
    kb
  );
}

async function rejectShop(adminChatId, targetId) {
  const shop = await getShop(targetId);
  if (!shop) {
    await sendMessage(
      adminChatId,
      `Магазин с chatId ${targetId} не найден.`,
      adminKeyboard()
    );
    return;
  }

  shop.status = "blocked";
  shop.creditsTotal = 0;
  shop.creditsLeft = 0;
  await persistShop(shop);

  await sendMessage(
    adminChatId,
    `Магазин «${shop.name}» (chatId: ${shop.chatId}) помечен как заблокированный.`,
    adminKeyboard()
  );

  const kb = await getBaseKeyboard(shop.chatId);
  await sendMessage(
    shop.chatId,
    "К сожалению, ваша заявка не прошла автоматическую проверку системы. Если вы считаете, что это ошибка — свяжитесь со службой поддержки сервиса.",
    kb
  );
}

// ================== ОБРАБОТКА ТЕКСТОВЫХ АДМИН-КОМАНД ==================

async function handleAdminCommand(chatId, text) {
  // Команды можно оставить как "резервный" способ
  if (text.startsWith("/approve ")) {
    const parts = text.split(" ").filter(Boolean);
    if (parts.length < 2) {
      await sendMessage(
        chatId,
        "Использование: /approve <chatId>",
        adminKeyboard()
      );
      return;
    }
    const targetId = parts[1];
    await approveShop(chatId, targetId);
    return;
  }

  if (text.startsWith("/reject ")) {
    const parts = text.split(" ").filter(Boolean);
    if (parts.length < 2) {
      await sendMessage(
        chatId,
        "Использование: /reject <chatId>",
        adminKeyboard()
      );
      return;
    }
    const targetId = parts[1];
    await rejectShop(chatId, targetId);
    return;
  }

  if (text.startsWith("/add_credits ")) {
    const parts = text.split(" ").filter(Boolean);
    if (parts.length < 3) {
      await sendMessage(
        chatId,
        "Использование: /add_credits <chatId> <кол-во_кредитов>",
        adminKeyboard()
      );
      return;
    }
    const targetId = parts[1];
    const amount = parseInt(parts[2], 10);
    if (isNaN(amount) || amount <= 0) {
      await sendMessage(
        chatId,
        "Сумма кредитов должна быть положительным числом.",
        adminKeyboard()
      );
      return;
    }
    const shop = await addCreditsToShop(targetId, amount);
    if (!shop) {
      await sendMessage(
        chatId,
        `Магазин с chatId ${targetId} не найден.`,
        adminKeyboard()
      );
      return;
    }

    await sendMessage(
      chatId,
      `Начислено ${amount} кредитов магазину «${shop.name}».\nТеперь доступно: ${shop.creditsLeft} кредитов.`,
      adminKeyboard()
    );

    const kb = await getBaseKeyboard(shop.chatId);
    await sendMessage(
      shop.chatId,
      `✅ Оплата проверена.\nВам начислено ${amount} генераций.\nТекущий баланс: ${shop.creditsLeft} кредитов.`,
      kb
    );
    return;
  }

  if (text.startsWith("/set_plan ")) {
    const parts = text.split(" ").filter(Boolean);
    if (parts.length < 3) {
      await sendMessage(
        chatId,
        "Использование: /set_plan <chatId> <trial|start|pro|max>",
        adminKeyboard()
      );
      return;
    }
    const targetId = parts[1];
    const plan = parts[2];
    if (!["trial", "start", "pro", "max"].includes(plan)) {
      await sendMessage(
        chatId,
        "План должен быть одним из: trial, start, pro, max",
        adminKeyboard()
      );
      return;
    }
    const shop = await setShopPlan(targetId, plan);
    if (!shop) {
      await sendMessage(
        chatId,
        `Магазин с chatId ${targetId} не найден.`,
        adminKeyboard()
      );
      return;
    }

    await sendMessage(
      chatId,
      `Тариф магазина «${shop.name}» изменён на: ${plan}.`,
      adminKeyboard()
    );

    const kb = await getBaseKeyboard(shop.chatId);
    await sendMessage(
      shop.chatId,
      `Ваш тариф изменён администратором на: ${plan}.`,
      kb
    );
    return;
  }

  // /list_shops — просто список, без кнопок
  if (text === "/list_shops") {
    const all = await listAllShops();
    if (!all.length) {
      await sendMessage(
        chatId,
        "Пока нет ни одного зарегистрированного магазина.",
        adminKeyboard()
      );
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

  // КНОПКИ ПАНЕЛИ

  if (text === "⏳ Ожидают подтверждения") {
    const arr = await listShopsByStatus("pending");
    if (!arr.length) {
      await sendMessage(
        chatId,
        "Нет магазинов, ожидающих подтверждения.",
        adminKeyboard()
      );
      return;
    }

    await sendMessage(
      chatId,
      `Магазины, ожидающие подтверждения: ${arr.length} шт.`,
      adminKeyboard()
    );

    for (const shop of arr) {
      await sendPendingShopCard(chatId, shop);
    }
    return;
  }

  if (text === "✅ Активные магазины") {
    const arr = await listShopsByStatus("active");
    if (!arr.length) {
      await sendMessage(
        chatId,
        "Нет активных магазинов.",
        adminKeyboard()
      );
      return;
    }

    await sendMessage(
      chatId,
      `Активные магазины: ${arr.length} шт.`,
      adminKeyboard()
    );

    for (const shop of arr) {
      await sendActiveShopCard(chatId, shop);
    }
    return;
  }

  if (text === "⛔ Заблокированные магазины") {
    const arr = await listShopsByStatus("blocked");
    if (!arr.length) {
      await sendMessage(
        chatId,
        "Нет заблокированных магазинов.",
        adminKeyboard()
      );
      return;
    }

    await sendMessage(
      chatId,
      `Заблокированные магазины: ${arr.length} шт.`,
      adminKeyboard()
    );

    for (const shop of arr) {
      await sendBlockedShopCard(chatId, shop);
    }
    return;
  }

  if (text === "🔄 Все магазины") {
    const all = await listAllShops();
    if (!all.length) {
      await sendMessage(
        chatId,
        "Пока нет ни одного зарегистрированного магазина.",
        adminKeyboard()
      );
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

// ================== CALLBACK-КНОПКИ АДМИНА ==================

async function handleAdminCallback(fromId, data, callbackId) {
  if (!data) return;

  // approve / reject
  if (data.startsWith("approve:")) {
    const targetId = data.split(":")[1];
    await approveShop(fromId, targetId);
    if (callbackId) await answerCallback(callbackId, "Магазин одобрен");
    return;
  }

  if (data.startsWith("reject:")) {
    const targetId = data.split(":")[1];
    await rejectShop(fromId, targetId);
    if (callbackId) await answerCallback(callbackId, "Магазин отклонён");
    return;
  }

  // блокировка активного магазина
  if (data.startsWith("block:")) {
    const targetId = data.split(":")[1];
    await rejectShop(fromId, targetId); // используем ту же логику блокировки
    if (callbackId) await answerCallback(callbackId, "Магазин заблокирован");
    return;
  }

  // разблокировка заблокированного магазина
  if (data.startsWith("unblock:")) {
    const targetId = data.split(":")[1];
    const shop = await getShop(targetId);
    if (!shop) {
      if (callbackId) await answerCallback(callbackId, "Магазин не найден", true);
      return;
    }
    shop.status = "active";
    await persistShop(shop);

    await sendMessage(
      fromId,
      `Магазин «${shop.name}» (chatId: ${shop.chatId}) разблокирован.`,
      adminKeyboard()
    );

    const kb = await getBaseKeyboard(shop.chatId);
    await sendMessage(
      shop.chatId,
      "Ваш магазин снова активен. Вы можете продолжать пользоваться генерацией (при наличии кредитов).",
      kb
    );

    if (callbackId) await answerCallback(callbackId, "Магазин разблокирован");
    return;
  }

  // выбор "Начислить тариф" -> показать пакеты
  if (data.startsWith("packs:")) {
    const targetId = data.split(":")[1];
    const shop = await getShop(targetId);
    if (!shop) {
      if (callbackId) await answerCallback(callbackId, "Магазин не найден", true);
      return;
    }

    const text = `
Выберите тариф/пакет для магазина:

«${shop.name}»
Chat ID: ${shop.chatId}
`.trim();

    await sendMessage(fromId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Start +100", callback_data: `pack:start:${shop.chatId}` },
            { text: "Pro +300",   callback_data: `pack:pro:${shop.chatId}` }
          ],
          [
            { text: "Max +700",   callback_data: `pack:max:${shop.chatId}` }
          ]
        ]
      }
    });

    if (callbackId) await answerCallback(callbackId);
    return;
  }

  // применить конкретный пакет
  if (data.startsWith("pack:")) {
    const parts = data.split(":"); // ["pack", "<plan>", "<chatId>"]
    const plan = parts[1];
    const targetId = parts[2];

    const pack = PACKS[plan];
    if (!pack) {
      if (callbackId) await answerCallback(callbackId, "Неизвестный пакет", true);
      return;
    }

    // ставим план и начисляем кредиты
    let shop = await setShopPlan(targetId, plan);
    if (!shop) {
      if (callbackId) await answerCallback(callbackId, "Магазин не найден", true);
      return;
    }

    shop = await addCreditsToShop(targetId, pack.credits);

    await sendMessage(
      fromId,
      `Тариф ${pack.label} применён к магазину «${shop.name}».\nНачислено ${pack.credits} кредитов.\nТекущий баланс: ${shop.creditsLeft} кредитов.`,
      adminKeyboard()
    );

    const kb = await getBaseKeyboard(shop.chatId);
    await sendMessage(
      shop.chatId,
      `✅ Оплата подтверждена.\nВам подключён тариф: ${pack.label}.\nТекущий баланс: ${shop.creditsLeft} генераций.`,
      kb
    );

    if (callbackId) await answerCallback(callbackId, "Тариф применён");
    return;
  }
}

module.exports = {
  notifyAdminNewShop,
  handleAdminCommand,
  handleAdminCallback
};
