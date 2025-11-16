// netlify/functions/telegram-bot.js

// === Конфиг из переменных окружения ===
//
// Обязательно задай в Netlify:
//  - TG_BOT_TOKEN        — токен бота из BotFather
//  - GEMINI_API_KEY      — API ключ Gemini (Google AI Studio)
//  - TELEGRAM_WEBHOOK_SECRET (опционально) — любая строка, если хочешь простую защиту
//  - ADMIN_CHAT_ID       — chat_id телеграма админа (строка, как есть)
//
const TELEGRAM_TOKEN = process.env.TG_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || null;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;

if (!TELEGRAM_TOKEN) {
  console.error("TG_BOT_TOKEN is not set");
}
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set");
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}`;

// === Простенькие in-memory-хранилища (MVP) ===
// Для продакшена нужно вынести в внешнюю БД.

const sessions = {}; // состояния диалогов по chatId
const shops = {};   // магазины (B2B-клиенты), ключ — chatId

// Настройки кредитов/лимитов
const TRIAL_CREDITS = 10;
const DAILY_LIMIT_BY_PLAN = {
  trial: 20,
  start: 100,
  pro: 300,
  max: 1000
};
const DEFAULT_DAILY_LIMIT = 20;
const COOLDOWN_MS = 10_000; // 10 секунд между генерациями

// ============================================================================
// helpers: даты / магазины / сессии
// ============================================================================

function getToday() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getSession(chatId) {
  if (!sessions[chatId]) {
    sessions[chatId] = {
      step: "idle",
      tmp: {}
    };
  }
  return sessions[chatId];
}

function getShop(chatId) {
  const shop = shops[chatId] || null;
  // старые записи без статуса считаем активными
  if (shop && !shop.status) {
    shop.status = "active";
  }
  return shop;
}

// Создаём магазин со статусом pending, без кредитов — ждём одобрения админа
function createShop(chatId, { name, instagram, contact }) {
  const today = getToday();
  const shop = {
    id: String(chatId),
    chatId,
    name,
    instagram,
    contact,
    status: "pending",      // pending | active | blocked
    plan: "trial",          // после активации
    creditsTotal: 0,        // кредиты появятся после approve
    creditsLeft: 0,
    generatedToday: 0,
    generatedTodayDate: today,
    lastGeneratedAt: 0,
    createdAt: new Date().toISOString()
  };
  shops[chatId] = shop;
  console.log("Shop created (pending):", shop);
  return shop;
}

function ensureDailyCounters(shop) {
  const today = getToday();
  if (shop.generatedTodayDate !== today) {
    shop.generatedTodayDate = today;
    shop.generatedToday = 0;
  }
}

function getDailyLimitForPlan(plan) {
  return DAILY_LIMIT_BY_PLAN[plan] || DEFAULT_DAILY_LIMIT;
}

// ============================================================================
// Валидация Instagram / Telegram / контакта
// ============================================================================

function normalize(str) {
  return (str || "").trim();
}

// instagram или telegram link / handle для поля "instagram"
function validateShopLink(inputRaw) {
  const input = normalize(inputRaw);

  if (!input) return { ok: false, value: null };

  const lower = input.toLowerCase();
  if (lower === "нет" || lower === "none" || lower === "-") {
    return { ok: true, value: "" }; // допустимо отсутствие ссылки
  }

  const instagramUrl = /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/[a-z0-9_.]{2,}$/i;
  const telegramUrl = /^https?:\/\/t\.me\/[a-z0-9_]{5,}$/i;
  const telegramHandle = /^@[a-z0-9_]{5,}$/i;

  if (instagramUrl.test(input) || telegramUrl.test(input) || telegramHandle.test(input)) {
    return { ok: true, value: input };
  }

  return { ok: false, value: null };
}

// контакт: телеграм @username или телефон
function validateContact(inputRaw) {
  const input = normalize(inputRaw);
  if (!input) return { ok: false, value: null };

  const telegramHandle = /^@[a-z0-9_]{5,}$/i;
  const phone = /^\+?\d[\d\s\-()]{7,}$/; // довольно либеральная проверка

  if (telegramHandle.test(input) || phone.test(input)) {
    return { ok: true, value: input };
  }
  return { ok: false, value: null };
}

// ============================================================================
// Утилиты Telegram
// ============================================================================

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

// уведомление админа о новом магазине
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

// ============================================================================
// Gemini
// ============================================================================

async function generateImageWithGemini(prompt, referenceImageBuffer) {
  const base64Image = referenceImageBuffer.toString("base64");

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64Image
            }
          }
        ]
      }
    ]
  };

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify(body)
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("Gemini error:", res.status, text);
    throw new Error("Gemini API error");
  }

  const json = await res.json();

  let imageBase64 = null;
  const candidates = json.candidates || [];
  if (candidates.length > 0) {
    const parts = candidates[0].content?.parts || [];
    for (const part of parts) {
      if (part.inline_data?.data) {
        imageBase64 = part.inline_data.data;
        break;
      }
    }
  }

  if (!imageBase64) {
    console.error("No image data in Gemini response", JSON.stringify(json));
    throw new Error("No image data from Gemini");
  }

  return Buffer.from(imageBase64, "base64");
}

// ============================================================================
// Клавиатуры (компоненты UI)
// ============================================================================

// Клавиатура на этапе регистрации (ещё нет магазина)
function registrationKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "ℹ️ Помощь" }]
      ],
      resize_keyboard: true
    }
  };
}

// Клавиатура для магазина в статусе pending
function pendingKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🏬 Мой магазин" }],
        [{ text: "ℹ️ Помощь" }]
      ],
      resize_keyboard: true
    }
  };
}

// Клавиатура для заблокированного магазина
function blockedKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🏬 Мой магазин" }],
        [{ text: "ℹ️ Помощь" }]
      ],
      resize_keyboard: true
    }
  };
}

// Клавиатура для активного магазина
function activeShopKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [
          { text: "🎨 Попробовать генерацию" },
          { text: "🏬 Мой магазин" }
        ],
        [{ text: "💳 Тарифы и цены" }],
        [{ text: "ℹ️ Помощь" }]
      ],
      resize_keyboard: true
    }
  };
}

// Клавиатура для админа
function adminKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [
          { text: "⏳ Ожидают подтверждения" },
          { text: "✅ Активные магазины" }
        ],
        [
          { text: "⛔ Заблокированные магазины" },
          { text: "🔄 Все магазины" }
        ]
      ],
      resize_keyboard: true
    }
  };
}

// Динамическая клавиатура по chatId (учитывая и админа)
function getBaseKeyboard(chatId) {
  if (ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID)) {
    return adminKeyboard();
  }
  const shop = getShop(chatId);
  if (!shop) return registrationKeyboard();
  if (shop.status === "pending") return pendingKeyboard();
  if (shop.status === "blocked") return blockedKeyboard();
  return activeShopKeyboard();
}

// Конкретные клавиатуры для шагов сценария
function itemTypeKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Худи" }, { text: "Куртка" }, { text: "Футболка" }],
        [{ text: "Штаны" }, { text: "Обувь" }, { text: "Комплект" }],
        [{ text: "⬅️ В главное меню" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function genderKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Мужчина" }, { text: "Женщина" }, { text: "Унисекс" }],
        [{ text: "⬅️ В главное меню" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function poseKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Стоя, полный рост" }, { text: "По пояс" }],
        [{ text: "В движении" }, { text: "Сидя" }],
        [{ text: "⬅️ В главное меню" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function backgroundKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Чистый студийный фон" }],
        [{ text: "Улица города" }, { text: "Интерьер (комната)" }],
        [{ text: "Подиум / фэшн-съёмка" }],
        [{ text: "⬅️ В главное меню" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

// ============================================================================
// ТЕКСТЫ
// ============================================================================

const TARIFF_TEXT = `
💳 Тарифы и цены (пример)

🔹 Trial — 10 генераций, чтобы протестировать сервис (после подтверждения админом).
🔹 Start — 100 генераций в месяц.
🔹 Pro — 500+ генераций, персональные стили под ваш магазин.

Детали подключения тарифа и оплату можно согласовать с владельцем бота.
`.trim();

const HELP_TEXT = `
Этот бот помогает владельцам магазинов одежды генерировать фото моделей с вашей одеждой.

Перед началом работы бот попросит:
• название магазина
• ссылку на Instagram или Telegram
• контакт для связи

После регистрации администратор проверит заявку и активирует пробные генерации.

Как пользоваться:
1️⃣ После активации нажмите "🎨 Попробовать генерацию".
2️⃣ Отправьте фото вещи (на вешалке, плоско, как удобно).
3️⃣ Выберите тип вещи, пол и возраст модели, позу и фон.
4️⃣ Получите готовые фото, которые можно использовать в соцсетях и на сайте.

Бот использует Gemini 2.5 Flash Image для генерации изображений.
`.trim();

// ============================================================================
// Промпт для Gemini
// ============================================================================

function buildPromptFromSession(session) {
  const t = session.tmp;

  const genderText =
    t.gender === "Мужчина"
      ? "a male fashion model"
      : t.gender === "Женщина"
      ? "a female fashion model"
      : "a unisex fashion model";

  const ageText = t.age || "young adult";
  const poseText = t.pose || "standing";

  const bgText =
    t.background === "Чистый студийный фон"
      ? "minimal clean studio background"
      : t.background === "Улица города"
      ? "modern city street background"
      : t.background === "Интерьер (комната)"
      ? "cozy interior room background"
      : t.background === "Подиум / фэшн-съёмка"
      ? "fashion runway / editorial background"
      : "simple neutral background";

  const itemType = t.itemType || "clothing item";

  const prompt = `
A photorealistic portrait of ${genderText}, ${ageText}, wearing the reference ${itemType}.
The model is in a ${poseText} pose, showing how the clothes fit on the body.
Scene: ${bgText}.
Soft professional fashion lighting, high-quality editorial photography, Instagram-ready, vertical format.
Clothing and folds must follow the reference garment.
`.trim();

  return prompt;
}

// ============================================================================
// Обработчики для магазинов (пользовательская часть)
// ============================================================================

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
        `Снова привет, ${shop.name}! 👋\n\nВаша заявка отправлена администратору и находится на рассмотрении.\nПосле подтверждения вы получите ${TRIAL_CREDITS} пробных генераций.\n\nНажмите «🏬 Мой магазин», чтобы посмотреть статус.`,
        getBaseKeyboard(chatId)
      );
      return;
    }

    if (shop.status === "blocked") {
      await sendMessage(
        chatId,
        `Снова привет, ${shop.name}.\n\nК сожалению, доступ к генерации для вашего магазина заблокирован. Свяжитесь с администратором для уточнения деталей.\n\nНажмите «🏬 Мой магазин», чтобы посмотреть информацию.`,
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
      ? "⏳ Ожидает подтверждения администратором"
      : shop.status === "blocked"
      ? "⛔ Заблокирован"
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

// Тарифы
async function handleTariffs(chatId) {
  await sendMessage(chatId, TARIFF_TEXT, getBaseKeyboard(chatId));
}

// Помощь
async function handleHelp(chatId) {
  await sendMessage(chatId, HELP_TEXT, getBaseKeyboard(chatId));
}

// Запуск сценария генерации
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
      "Ваша заявка ещё не подтверждена администратором.\nПосле одобрения вы получите пробные генерации и сможете протестировать сервис.",
      getBaseKeyboard(chatId)
    );
    return;
  }

  if (shop.status === "blocked") {
    await sendMessage(
      chatId,
      "Доступ к генерации для вашего магазина заблокирован. Свяжитесь с администратором, если считаете, что это ошибка.",
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
    "Отправьте фото вещи (например, худи, куртка, штаны и т.п.). Лучше всего — в хорошем освещении.",
    {}
  );
}

// Фото от пользователя
async function handleIncomingPhoto(chatId, message) {
  const session = getSession(chatId);

  if (session.step !== "await_photo") {
    await sendMessage(
      chatId,
      "Сначала нажмите «🎨 Попробовать генерацию» в меню, чтобы запустить сценарий.",
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

// ============================================================================
// Админ-панель
// ============================================================================

function listShopsByStatus(status) {
  return Object.values(shops).filter((s) => s.status === status);
}

function listAllShops() {
  return Object.values(shops);
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
    const shop = shops[targetId];
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
      `Ваша заявка одобрена! 🎉\nВам выдано ${TRIAL_CREDITS} пробных генераций. Нажмите «🎨 Попробовать генерацию», чтобы начать.`,
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
    const shop = shops[targetId];
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
      "К сожалению, ваша заявка на использование сервиса отклонена. Если вы считаете, что это ошибка — свяжитесь с администратором.",
      getBaseKeyboard(shop.chatId)
    );
    return;
  }

  // /list_shops (все)
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

  // Кнопки админ-панели
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

  // если не админ-команда — игнор
}

// ============================================================================
// Обработка текстов (единая точка входа)
// ============================================================================

async function handleTextMessage(chatId, text) {
  const session = getSession(chatId);

  // Админ-команды
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

  // Глобальная кнопка возврата
  if (text === "⬅️ В главное меню") {
    session.step = "idle";
    session.tmp = {};
    await sendMessage(chatId, "Главное меню:", getBaseKeyboard(chatId));
    return;
  }

  // Команды
  if (text === "/start") {
    await handleStart(chatId);
    return;
  }
  if (text === "🎨 Попробовать генерацию") {
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
      `Готово! Мы зарегистрировали ваш магазин «${shop.name}».\n\nЗаявка отправлена администратору на проверку.\nПосле подтверждения вы получите ${TRIAL_CREDITS} пробных генераций, и бот уведомит вас.`,
      getBaseKeyboard(chatId)
    );

    await notifyAdminNewShop(shop);
    return;
  }

  // === Сценарий генерации ===

  if (session.step === "await_item_type") {
    session.tmp.itemType = text;
    session.step = "await_gender";

    await sendMessage(
      chatId,
      "Кто будет моделью?",
      genderKeyboard()
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
        "Ваша заявка ещё не подтверждена администратором. После одобрения вы сможете запускать генерацию.",
        getBaseKeyboard(chatId)
      );
      return;
    }

    if (shop.status === "blocked") {
      session.step = "idle";
      await sendMessage(
        chatId,
        "Доступ к генерации для вашего магазина заблокирован. Свяжитесь с администратором.",
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

  // Фолбэк
  await sendMessage(
    chatId,
    "Не понял сообщение. Используйте кнопки ниже 👇",
    getBaseKeyboard(chatId)
  );
}

// ============================================================================
// Netlify handler
// ============================================================================

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
