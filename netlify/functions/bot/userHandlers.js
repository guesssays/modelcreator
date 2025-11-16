// bot/userHandlers.js
const { ADMIN_CHAT_ID, COOLDOWN_MS } = require("./config");
const {
  getSession,
  getShop,
  createShop,
  deleteShop,
  ensureDailyCounters,
  getDailyLimitForPlan,
  TRIAL_CREDITS
} = require("./store");
const { validateShopLink, validateContact } = require("./validators");
const {
  getBaseKeyboard,
  registrationKeyboard,
  itemTypeKeyboard,
  peopleModeKeyboard,
  genderKeyboard,
  pairTypeKeyboard,
  poseKeyboard,
  backgroundKeyboard
} = require("./keyboards");
const { TARIFF_TEXT, HELP_TEXT } = require("./texts");
const { generateImageWithGemini, buildPromptFromSession } = require("./gemini");
const { sendMessage, sendPhoto, downloadTelegramFile } = require("./telegram");
const { notifyAdminNewShop, handleAdminCommand } = require("./admin");

// /start
async function handleStart(chatId) {
  const session = getSession(chatId);
  const shop = getShop(chatId);

  if (!shop) {
    session.step = "await_shop_name";
    session.tmp = {};
    await sendMessage(
      chatId,
      "Привет! 👋 Я бот, который генерирует профессиональные фото моделей с вашей одеждой.\n\nДавайте начнём с регистрации.\n\nНапишите название вашего магазина одежды:",
      registrationKeyboard()
    );
  } else {
    session.step = "idle";
    session.tmp = {};
    ensureDailyCounters(shop);

    if (shop.status === "pending") {
      await sendMessage(
        chatId,
        `Снова привет, ${shop.name}! 👋\n\nВаша заявка принята системой и проходит автоматическую проверку.\nПосле успешной проверки вы получите ${TRIAL_CREDITS} пробных генераций.\n\nНажмите «🏬 Мой магазин», чтобы посмотреть статус.`,
        getBaseKeyboard(chatId)
      );
      return;
    }

    if (shop.status === "blocked") {
      await sendMessage(
        chatId,
        `Снова привет, ${shop.name}.\n\nК сожалению, доступ к генерации для вашего магазина сейчас ограничен. Если вы считаете, что это ошибка, свяжитесь со службой поддержки сервиса.\n\nНажмите «🏬 Мой магазин», чтобы посмотреть информацию.`,
        getBaseKeyboard(chatId)
      );
      return;
    }

    await sendMessage(
      chatId,
      `Снова привет, ${shop.name}! 👋\nУ вашего магазина осталось генераций: ${shop.creditsLeft}\n\nВыберите действие в меню ниже.`,
      getBaseKeyboard(chatId)
    );
  }
}

// "Мой магазин"
async function handleMyShop(chatId) {
  const shop = getShop(chatId);

  if (!shop) {
    await sendMessage(
      chatId,
      "Магазин ещё не зарегистрирован.\nНажмите /start, чтобы пройти регистрацию.",
      getBaseKeyboard(chatId)
    );
    return;
  }

  ensureDailyCounters(shop);

  const statusText =
    shop.status === "pending"
      ? "⏳ Ожидает проверки системой"
      : shop.status === "blocked"
      ? "⛔ Временно ограничен"
      : "✅ Активен";

  const planText = shop.plan || "—";
  const stats = `
🏬 Мой магазин

Название: ${shop.name}
Статус: ${statusText}
Тариф: ${planText}

Кредиты всего: ${shop.creditsTotal}
Кредиты доступно: ${shop.creditsLeft}
Сгенерировано сегодня: ${shop.generatedToday}

Instagram/Telegram: ${shop.instagram || "—"}
Контакт: ${shop.contact || "—"}

Дата регистрации: ${shop.createdAt.split("T")[0]}
`.trim();

  await sendMessage(chatId, stats, getBaseKeyboard(chatId));
}

async function handleTariffs(chatId) {
  await sendMessage(chatId, TARIFF_TEXT, getBaseKeyboard(chatId));
}

async function handleHelp(chatId) {
  await sendMessage(chatId, HELP_TEXT, getBaseKeyboard(chatId));
}

// Старт генерации
async function handleStartGeneration(chatId) {
  const session = getSession(chatId);
  const shop = getShop(chatId);

  if (!shop) {
    session.step = "await_shop_name";
    session.tmp = {};
    await sendMessage(
      chatId,
      "Сначала зарегистрируйте магазин.\n\nНапишите название вашего магазина одежды:",
      registrationKeyboard()
    );
    return;
  }

  if (shop.status === "pending") {
    await sendMessage(
      chatId,
      "Ваша заявка ещё не прошла автоматическую проверку системой.\nПосле успешной проверки вы получите пробные генерации и сможете протестировать сервис.",
      getBaseKeyboard(chatId)
    );
    return;
  }

  if (shop.status === "blocked") {
    await sendMessage(
      chatId,
      "Доступ к генерации для вашего магазина сейчас ограничен. Если вы считаете, что это ошибка — свяжитесь со службой поддержки сервиса.",
      getBaseKeyboard(chatId)
    );
    return;
  }

  ensureDailyCounters(shop);
  const dailyLimit = getDailyLimitForPlan(shop.plan);

  if (shop.creditsLeft <= 0) {
    await sendMessage(
      chatId,
      "У вашего магазина закончились генерации. Посмотрите тарифы и свяжитесь с владельцем бота для пополнения.",
      getBaseKeyboard(chatId)
    );
    await handleTariffs(chatId);
    return;
  }

  if (shop.generatedToday >= dailyLimit) {
    await sendMessage(
      chatId,
      "На сегодня лимит генераций для вашего тарифа исчерпан. Попробуйте завтра или обновите тариф.",
      getBaseKeyboard(chatId)
    );
    return;
  }

session.step = "await_photo";
session.tmp = {};
await sendMessage(
  chatId,
  "Отправьте фото вещи (например, худи, куртка, штаны и т.п.). Лучше всего — в хорошем освещении, на чистом однотонном фоне без посторонних предметов и надписей вокруг, надписи могут быть только на самой одежде. Вещь не должна быть на человеке — сфотографируйте её на вешалке, манекене или аккуратно разложенной.",
  {}
);
}


// Фото
async function handleIncomingPhoto(chatId, message) {
  const session = getSession(chatId);

  if (session.step !== "await_photo") {
    await sendMessage(
      chatId,
      "Сначала нажмите «🎨 Генерировать» в меню, чтобы запустить сценарий.",
      getBaseKeyboard(chatId)
    );
    return;
  }

  const photos = message.photo || [];
  if (photos.length === 0) {
    await sendMessage(chatId, "Не вижу фото 🤔 Попробуйте ещё раз.");
    return;
  }

  const fileId = photos[photos.length - 1].file_id;
  session.tmp.photoFileId = fileId;
  session.step = "await_item_type";

  await sendMessage(
    chatId,
    "Отлично! Что это за вещь?",
    itemTypeKeyboard()
  );
}

// Тексты (общий вход)
async function handleTextMessage(chatId, text) {
  const session = getSession(chatId);

  // Админ
  if (ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID)) {
    if (
      text.startsWith("/approve ") ||
      text.startsWith("/reject ") ||
      text === "/list_shops" ||
      text === "⏳ Ожидают подтверждения" ||
      text === "✅ Активные магазины" ||
      text === "⛔ Заблокированные магазины" ||
      text === "🔄 Все магазины"
    ) {
      await handleAdminCommand(chatId, text);
      return;
    }
  }

  // Назад
  if (text === "⬅️ В главное меню") {
    session.step = "idle";
    session.tmp = {};
    await sendMessage(chatId, "Главное меню:", getBaseKeyboard(chatId));
    return;
  }

  // Команды / базовые кнопки
  if (text === "/start") {
    await handleStart(chatId);
    return;
  }
  if (text === "🎨 Генерировать") {
    await handleStartGeneration(chatId);
    return;
  }
  if (text === "💳 Тарифы и цены") {
    await handleTariffs(chatId);
    return;
  }
  if (text === "ℹ️ Помощь") {
    await handleHelp(chatId);
    return;
  }
  if (text === "🏬 Мой магазин") {
    await handleMyShop(chatId);
    return;
  }

  if (text === "➕ Новый магазин") {
    const shop = getShop(chatId);
    session.step = "await_shop_name";
    session.tmp = {};
    const prefix = shop
      ? `Сейчас у вас уже есть магазин «${shop.name}».\nНовый магазин заменит текущий в этом аккаунте.\n\n`
      : "";
    await sendMessage(
      chatId,
      `${prefix}Напишите название нового магазина одежды:`,
      registrationKeyboard()
    );
    return;
  }

  if (text === "🗑 Удалить магазин") {
    const shop = getShop(chatId);
    if (!shop) {
      await sendMessage(
        chatId,
        "У вас ещё нет зарегистрированного магазина.",
        getBaseKeyboard(chatId)
      );
      return;
    }
    session.step = "confirm_delete_shop";
    session.tmp = {};
    await sendMessage(
      chatId,
      `Вы уверены, что хотите удалить магазин «${shop.name}»?\n\nНажмите «✅ Да, удалить» или «❌ Отмена».`,
      {
        reply_markup: {
          keyboard: [
            [{ text: "✅ Да, удалить" }],
            [{ text: "❌ Отмена" }]
          ],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  // Подтверждение удаления магазина
  if (session.step === "confirm_delete_shop") {
    if (text === "✅ Да, удалить") {
      const ok = deleteShop(chatId);
      session.step = "idle";
      session.tmp = {};
      await sendMessage(
        chatId,
        ok
          ? "Магазин удалён. Вы можете зарегистрировать новый, нажав /start."
          : "Магазин не найден.",
        getBaseKeyboard(chatId)
      );
      return;
    }
    // Любой другой ответ — отмена
    session.step = "idle";
    session.tmp = {};
    await sendMessage(
      chatId,
      "Удаление отменено.",
      getBaseKeyboard(chatId)
    );
    return;
  }

  // === Регистрация магазина ===
  if (session.step === "await_shop_name") {
    session.tmp.shopName = text;
    session.step = "await_shop_instagram";

    await sendMessage(
      chatId,
      "Отлично! Вставьте ссылку на Instagram вашего магазина или Telegram-канал/чат.\nПримеры:\n• https://instagram.com/yourshop\n• https://t.me/yourshop\n• @yourshop\n\nИли напишите «нет», если пока нет профиля.",
      registrationKeyboard()
    );
    return;
  }

  if (session.step === "await_shop_instagram") {
    const { ok, value } = validateShopLink(text);
    if (!ok) {
      await sendMessage(
        chatId,
        "Похоже, ссылка некорректна.\nВведите ссылку вида:\n• https://instagram.com/yourshop\n• https://t.me/yourshop\n• @yourshop\nили напишите «нет».",
        registrationKeyboard()
      );
      return;
    }

    session.tmp.shopInstagram = value || "";
    session.step = "await_shop_contact";

    await sendMessage(
      chatId,
      "Укажите контакт для связи (телеграм @username или номер телефона, например +998...):",
      registrationKeyboard()
    );
    return;
  }

  if (session.step === "await_shop_contact") {
    const { ok, value } = validateContact(text);
    if (!ok) {
      await sendMessage(
        chatId,
        "Похоже, контакт некорректен.\nУкажите:\n• Telegram @username (не короче 5 символов)\nили\n• номер телефона, например +9989XXXXXXXX.",
        registrationKeyboard()
      );
      return;
    }

    session.tmp.shopContact = value;

    const shopData = {
      name: session.tmp.shopName || "Без названия",
      instagram: session.tmp.shopInstagram || "",
      contact: session.tmp.shopContact || ""
    };

    const shop = createShop(chatId, shopData);

    session.step = "idle";
    session.tmp = {};

    await sendMessage(
      chatId,
      `Готово! Мы зарегистрировали ваш магазин «${shop.name}».\n\nЗаявка принята и отправлена на проверку.\nПосле успешной проверки вы получите ${TRIAL_CREDITS} пробных генераций, и бот уведомит вас.`,
      getBaseKeyboard(chatId)
    );

    await notifyAdminNewShop(shop);
    return;
  }

  // === Сценарий генерации ===
  if (session.step === "await_item_type") {
    session.tmp.itemType = text;
    session.step = "await_people_mode";

    await sendMessage(
      chatId,
      "Выберите формат съёмки:",
      peopleModeKeyboard()
    );
    return;
  }

  if (session.step === "await_people_mode") {
    if (text === "Один человек") {
      session.tmp.peopleMode = "single";
      session.step = "await_gender";

      await sendMessage(
        chatId,
        "Кто будет моделью?",
        genderKeyboard()
      );
      return;
    }

    if (text === "Пара") {
      session.tmp.peopleMode = "pair";
      session.step = "await_pair_type";

      await sendMessage(
        chatId,
        "Какую пару показать?",
        pairTypeKeyboard()
      );
      return;
    }

    await sendMessage(
      chatId,
      "Пожалуйста, выберите вариант на клавиатуре: «Один человек» или «Пара».",
      peopleModeKeyboard()
    );
    return;
  }

  if (session.step === "await_gender") {
    session.tmp.gender = text;
    session.step = "await_age";

    await sendMessage(
      chatId,
      "Укажи возраст модели (например: 18-25, 25-35):",
      {
        reply_markup: {
          keyboard: [
            [{ text: "18-25" }, { text: "25-35" }],
            [{ text: "35-45" }, { text: "45+" }],
            [{ text: "⬅️ В главное меню" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
    return;
  }

  if (session.step === "await_pair_type") {
    session.tmp.pairType = text;
    session.step = "await_age";

    await sendMessage(
      chatId,
      "Укажи возраст моделей (например: 18-25, 25-35):",
      {
        reply_markup: {
          keyboard: [
            [{ text: "18-25" }, { text: "25-35" }],
            [{ text: "35-45" }, { text: "45+" }],
            [{ text: "⬅️ В главное меню" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
    return;
  }

  if (session.step === "await_age") {
    session.tmp.age = text;
    session.step = "await_pose";

    await sendMessage(
      chatId,
      "Выбери позу модели:",
      poseKeyboard()
    );
    return;
  }

  if (session.step === "await_pose") {
    session.tmp.pose = text;
    session.step = "await_background";

    await sendMessage(
      chatId,
      "Теперь выбери фон:",
      backgroundKeyboard()
    );
    return;
  }

  if (session.step === "await_background") {
    session.tmp.background = text;

    const shop = getShop(chatId);
    if (!shop) {
      session.step = "await_shop_name";
      session.tmp = {};
      await sendMessage(
        chatId,
        "Кажется, данные магазина не найдены. Давайте зарегистрируемся заново.\nНапишите название вашего магазина одежды:",
        registrationKeyboard()
      );
      return;
    }

    if (shop.status === "pending") {
      session.step = "idle";
      await sendMessage(
        chatId,
        "Ваша заявка ещё не прошла автоматическую проверку системой. После успешной проверки вы сможете запускать генерацию.",
        getBaseKeyboard(chatId)
      );
      return;
    }

    if (shop.status === "blocked") {
      session.step = "idle";
      await sendMessage(
        chatId,
        "Доступ к генерации для вашего магазина сейчас ограничен. Если вы считаете, что это ошибка — свяжитесь со службой поддержки сервиса.",
        getBaseKeyboard(chatId)
      );
      return;
    }

    ensureDailyCounters(shop);
    const dailyLimit = getDailyLimitForPlan(shop.plan);

    if (shop.creditsLeft <= 0) {
      session.step = "idle";
      await sendMessage(
        chatId,
        "У вашего магазина закончились генерации. Посмотрите тарифы и свяжитесь с владельцем бота для пополнения.",
        getBaseKeyboard(chatId)
      );
      await handleTariffs(chatId);
      return;
    }

    if (shop.generatedToday >= dailyLimit) {
      session.step = "idle";
      await sendMessage(
        chatId,
        "На сегодня лимит генераций для вашего тарифа исчерпан. Попробуйте завтра или обновите тариф.",
        getBaseKeyboard(chatId)
      );
      return;
    }

    const now = Date.now();
    if (shop.lastGeneratedAt && now - shop.lastGeneratedAt < COOLDOWN_MS) {
      const waitMs = COOLDOWN_MS - (now - shop.lastGeneratedAt);
      const waitSec = Math.ceil(waitMs / 1000);
      session.step = "idle";
      await sendMessage(
        chatId,
        `Пожалуйста, подождите ещё ${waitSec} сек перед следующей генерацией.`,
        getBaseKeyboard(chatId)
      );
      return;
    }

    session.step = "generating";

    await sendMessage(
      chatId,
      "Генерирую изображение, это может занять несколько секунд…",
      {}
    );

    try {
      const photoBuffer = await downloadTelegramFile(session.tmp.photoFileId);
      const prompt = buildPromptFromSession(session);

      const imageBuffer = await generateImageWithGemini(
        prompt,
        photoBuffer
      );

      shop.creditsLeft = Math.max(0, shop.creditsLeft - 1);
      ensureDailyCounters(shop);
      shop.generatedToday += 1;
      shop.lastGeneratedAt = Date.now();

      await sendPhoto(
        chatId,
        imageBuffer,
        "Вот сгенерированная модель с вашей вещью 🎨"
      );

      session.step = "idle";
      session.tmp = {};

      if (shop.creditsLeft <= 0) {
        await sendMessage(
          chatId,
          "У вашего магазина закончились генерации. Посмотрите тарифы 👇",
          getBaseKeyboard(chatId)
        );
        await handleTariffs(chatId);
      } else {
        await sendMessage(
          chatId,
          `У вашего магазина осталось генераций: ${shop.creditsLeft}`,
          getBaseKeyboard(chatId)
        );
      }
    } catch (err) {
      console.error("Error during generation:", err);
      session.step = "idle";
      await sendMessage(
        chatId,
        "Произошла ошибка при генерации изображения. Попробуйте ещё раз позже.",
        getBaseKeyboard(chatId)
      );
    }

    return;
  }

  //fallback
  await sendMessage(
    chatId,
    "Не понял сообщение. Используйте кнопки ниже 👇",
    getBaseKeyboard(chatId)
  );
}

module.exports = {
  handleStart,
  handleMyShop,
  handleTariffs,
  handleHelp,
  handleStartGeneration,
  handleIncomingPhoto,
  handleTextMessage
};
