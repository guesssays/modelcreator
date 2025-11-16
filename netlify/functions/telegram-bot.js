// netlify/functions/telegram-bot.js

// === Конфиг из переменных окружения ===
//
// Обязательно задай в Netlify:
//  - TG_BOT_TOKEN        — токен бота из BotFather
//  - GEMINI_API_KEY      — API ключ Gemini (Google AI Studio)
//  - TELEGRAM_WEBHOOK_SECRET (опционально) — любая строка, если хочешь простую защиту
//
const TELEGRAM_TOKEN = process.env.TG_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || null;

if (!TELEGRAM_TOKEN) {
  console.error("TG_BOT_TOKEN is not set");
}
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set");
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}`;

// Простенькие сессии в памяти (MVP).
// Для продакшена лучше вынести в внешнюю БД.
const sessions = {};

// Получить / создать сессию по chatId
function getSession(chatId) {
  if (!sessions[chatId]) {
    sessions[chatId] = {
      step: "idle",
      tmp: {},
      freeCredits: 3 // кол-во пробных генераций
    };
  }
  return sessions[chatId];
}

// === Утилиты Telegram ===

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
  // 1) Получаем путь к файлу
  const resMeta = await fetch(
    `${TELEGRAM_API}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const metaJson = await resMeta.json();
  if (!metaJson.ok) {
    throw new Error("Failed to getFile from Telegram");
  }
  const filePath = metaJson.result.file_path;

  // 2) Скачиваем сам файл
  const fileRes = await fetch(`${TELEGRAM_FILE_API}/${filePath}`);
  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// === Gemini ===
//
// Генерация картинки по промпту + референс-фото вещи (из Telegram)
// Используем REST API gemini-2.5-flash-image (text+image -> image). :contentReference[oaicite:0]{index=0}
async function generateImageWithGemini(prompt, referenceImageBuffer) {
  const base64Image = referenceImageBuffer.toString("base64");

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: "image/jpeg", // Telegram обычно шлёт jpeg; при желании можно детектить
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

  // Ищем первую часть с inline_data (base64 картинка)
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

// === Логика бота ===

function mainMenuKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [
          { text: "🎨 Попробовать генерацию" },
          { text: "💳 Тарифы и цены" }
        ],
        [{ text: "ℹ️ Помощь" }]
      ],
      resize_keyboard: true
    }
  };
}

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

// Текст по тарифам (пока просто описание, без оплаты)
const TARIFF_TEXT = `
💳 Тарифы и цены (пример)

🔹 Free — 3 генерации в месяц, базовые настройки.
🔹 Standard — 100 генераций в месяц, приоритетная очередь.
🔹 Pro — 500+ генераций, персональные стили под ваш магазин.

Оплату и подключение тарифа можно согласовать с владельцем бота.
`.trim();

// Помощь
const HELP_TEXT = `
Этот бот помогает владельцам магазинов одежды генерировать фото моделей с вашей одеждой.

Как пользоваться:
1️⃣ Нажмите "🎨 Попробовать генерацию".
2️⃣ Отправьте фото вещи (на вешалке, плоско, как удобно).
3️⃣ Выберите тип вещи, пол и возраст модели, позу и фон.
4️⃣ Получите готовые фото, которые можно использовать в соцсетях и на сайте.

Бот использует Gemini 2.5 Flash Image для генерации изображений.
`.trim();

// Сборка промпта для Gemini
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

  // Промпт в духе гайдов Gemini: описываем сцену, а не кидаем просто ключевые слова. :contentReference[oaicite:1]{index=1}
  const prompt = `
A photorealistic portrait of ${genderText}, ${ageText}, wearing the reference ${itemType}.
The model is in a ${poseText} pose, showing how the clothes fit on the body.
Scene: ${bgText}.
Soft professional fashion lighting, high-quality editorial photography, Instagram-ready, vertical format.
Clothing and folds must follow the reference garment.
`.trim();

  return prompt;
}

// Обработка команды /start
async function handleStart(chatId) {
  const session = getSession(chatId);
  session.step = "idle";

  await sendMessage(
    chatId,
    "Привет! 👋 Я бот, который помогает владельцам магазинов одежды генерировать фото моделей с вашей одеждой.\n\nНажми «🎨 Попробовать генерацию», чтобы сделать пробные картинки.",
    mainMenuKeyboard()
  );
}

// Показ тарифов
async function handleTariffs(chatId) {
  await sendMessage(chatId, TARIFF_TEXT, mainMenuKeyboard());
}

// Помощь
async function handleHelp(chatId) {
  await sendMessage(chatId, HELP_TEXT, mainMenuKeyboard());
}

// Запуск сценария генерации
async function handleStartGeneration(chatId) {
  const session = getSession(chatId);

  if (session.freeCredits <= 0) {
    await sendMessage(
      chatId,
      "У вас закончились пробные генерации. Посмотрите тарифы 👇",
      mainMenuKeyboard()
    );
    await handleTariffs(chatId);
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

// Обработка входящего фото
async function handleIncomingPhoto(chatId, message) {
  const session = getSession(chatId);

  if (session.step !== "await_photo") {
    // Если фото прилетело не в нужный момент — игнорируем сценарий
    await sendMessage(
      chatId,
      "Сначала нажмите «🎨 Попробовать генерацию» в меню, чтобы запустить сценарий.",
      mainMenuKeyboard()
    );
    return;
  }

  const photos = message.photo || [];
  if (photos.length === 0) {
    await sendMessage(chatId, "Не вижу фото 🤔 Попробуйте ещё раз.");
    return;
  }

  // Берём самую "крупную" версию (последний элемент массива)
  const fileId = photos[photos.length - 1].file_id;
  session.tmp.photoFileId = fileId;
  session.step = "await_item_type";

  await sendMessage(
    chatId,
    "Отлично! Что это за вещь?",
    itemTypeKeyboard()
  );
}

// Обработка текста в зависимости от step
async function handleTextMessage(chatId, text) {
  const session = getSession(chatId);

  // Глобальная кнопка возврата
  if (text === "⬅️ В главное меню") {
    session.step = "idle";
    session.tmp = {};
    await sendMessage(chatId, "Главное меню:", mainMenuKeyboard());
    return;
  }

  // Команды меню
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

  // Шаг: тип вещи
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

  // Шаг: пол модели
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

  // Шаг: возраст
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

  // Шаг: поза
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

  // Шаг: фон -> запускаем генерацию
  if (session.step === "await_background") {
    session.tmp.background = text;
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

      await sendPhoto(
        chatId,
        imageBuffer,
        "Вот сгенерированная модель с вашей вещью 🎨"
      );

      session.freeCredits = Math.max(0, (session.freeCredits || 0) - 1);
      session.step = "idle";
      session.tmp = {};

      if (session.freeCredits <= 0) {
        await sendMessage(
          chatId,
          "Пробные генерации закончились. Посмотрите тарифы 👇",
          mainMenuKeyboard()
        );
        await handleTariffs(chatId);
      } else {
        await sendMessage(
          chatId,
          `У вас осталось пробных генераций: ${session.freeCredits}`,
          mainMenuKeyboard()
        );
      }
    } catch (err) {
      console.error("Error during generation:", err);
      session.step = "idle";
      await sendMessage(
        chatId,
        "Произошла ошибка при генерации изображения. Попробуйте ещё раз позже.",
        mainMenuKeyboard()
      );
    }

    return;
  }

  // Если текст не попал ни в какой сценарий
  await sendMessage(
    chatId,
    "Не понял сообщение. Нажмите одну из кнопок ниже 👇",
    mainMenuKeyboard()
  );
}

// === Netlify handler ===
exports.handler = async function (event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 200,
        body: "OK"
      };
    }

    // Простейшая защита по секрету (опционально)
    if (WEBHOOK_SECRET) {
      const url = new URL(event.rawUrl || event.headers["x-original-url"] || "");
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
          mainMenuKeyboard()
        );
      }
    }

    // Можно добавить обработку callback_query, если захочешь inline-кнопки

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
