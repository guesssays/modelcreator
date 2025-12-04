// bot/userHandlers.js

const {
  REF_BONUS_FOR_REFERRER,
  REF_BONUS_FOR_INVITED,
  ADMIN_CHAT_ID,
  COOLDOWN_MS
} = require("./config");
const {
  getSession,
  getShop,
  createShop,
  deleteShop,
  ensureDailyCounters,
  getDailyLimitForPlan,
  TRIAL_CREDITS,
  persistShop,
  setShopLanguage
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
  backgroundKeyboard,
  myShopKeyboard,
  languageSelectKeyboard,
  registerShopInlineKeyboard
} = require("./keyboards");
const {
  getTariffText,
  getHelpText,
  getTariffPlanText
} = require("./texts");
const { generateImageWithGemini, buildPromptFromSession } = require("./gemini");
const {
  sendMessage,
  sendPhoto,
  downloadTelegramFile,
  forwardMessage,
  answerCallback
} = require("./telegram");
const { notifyAdminNewShop, handleAdminCommand } = require("./admin");

// Утилита для получения языка
function getLang(chatId, session, shop) {
  if (shop && shop.language) return shop.language;
  if (session && session.language) return session.language;
  return "ru";
}

// ======/start======

// ======/start======

async function handleStart(chatId) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);

  // 1️⃣ Если язык ещё не выбран ни в сессии, ни в магазине — сначала спрашиваем язык
  if (!session.language && !(shop && shop.language)) {
    session.step = "await_language";
    session.tmp = session.tmp || {};

    await sendMessage(
      chatId,
      "Выберите язык / Tilni tanlang:",
      languageSelectKeyboard()
    );

    return;
  }

  // 2️⃣ Язык уже есть — берём его как обычно
  const lang = getLang(chatId, session, shop);

  // Если магазина нет — гость с 10 бесплатными генерациями
if (!shop) {
  const kb = await getBaseKeyboard(chatId);
  const lang = getLang(chatId, session, null);

  const welcomeText =
    lang === "uz"
      ? "Xush kelibsiz! 🎉\nSizda ro'yxatdan o'tmasdan 10 ta bepul generatsiya bor.\n\nBoshlash uchun «🎨 Rasm yaratish» tugmasini bosing."
      : "Добро пожаловать! 🎉\nУ вас есть 10 бесплатных генераций без регистрации.\n\nНажмите «🎨 Генерировать», чтобы попробовать.";

  await sendMessage(chatId, welcomeText, kb);

  session.step = "idle";
  session.tmp = session.tmp || {};
  return;
}


  // 3️⃣ Магазин уже есть
  session.step = "idle";
  session.tmp = {};
  ensureDailyCounters(shop);

  const kb = await getBaseKeyboard(chatId);

  if (shop.status === "blocked") {
    const text =
      lang === "uz"
        ? `Yana salom, ${shop.name}.\n\nAfsuski, hozircha sizning do'koningiz uchun generatsiya qilishga ruxsat cheklangan.\nAgar bu xato deb o'ylasangiz, texnik qo'llab-quvvatlash xizmatiga murojaat qiling.\n\nMa'lumot uchun «🏬 Mening do'konim» tugmasini bosing.`
        : `Снова привет, ${shop.name}.\n\nК сожалению, доступ к генерации для вашего магазина сейчас ограничен. Если вы считаете, что это ошибка, свяжитесь со службой поддержки сервиса.\n\nНажмите «🏬 Мой магазин», чтобы посмотреть информацию.`;

    await sendMessage(chatId, text, kb);
    return;
  }

  const text =
    lang === "uz"
      ? `Yana salom, ${shop.name}! 👋\nSizning do'koningizda qolgan generatsiyalar soni: ${shop.creditsLeft}\n\nQuyidagi menyudan harakatni tanlang.`
      : `Снова привет, ${shop.name}! 👋\nУ вашего магазина осталось генераций: ${shop.creditsLeft}\n\nВыберите действие в меню ниже.`;

  await sendMessage(chatId, text, kb);
}


// ======"Мой магазин"======

async function handleMyShop(chatId) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  if (!shop) {
    const kb = await getBaseKeyboard(chatId);
    const text =
      lang === "uz"
        ? "Do'kon hali ro'yxatdan o'tkazilmagan.\nRo'yxatdan o'tish uchun /start buyrug'ini bosing."
        : "Магазин ещё не зарегистрирован.\nНажмите /start, чтобы пройти регистрацию.";
    await sendMessage(chatId, text, kb);
    return;
  }

  ensureDailyCounters(shop);

  const statusText =
    shop.status === "pending"
      ? lang === "uz"
        ? "⏳ Tizim tekshiruvini kutyapti"
        : "⏳ Ожидает проверки системой"
      : shop.status === "blocked"
      ? lang === "uz"
        ? "⛔ Vaqtincha cheklangan"
        : "⛔ Временно ограничен"
      : lang === "uz"
      ? "✅ Faol"
      : "✅ Активен";

  const planText = shop.plan || "—";

  const stats =
    lang === "uz"
      ? `
🏬 Mening do'konim

Nomi: ${shop.name}
Holati: ${statusText}
Tarif: ${planText}

Jami kreditlar: ${shop.creditsTotal}
Mavjud kreditlar: ${shop.creditsLeft}
Bugun generatsiya qilingan: ${shop.generatedToday}

Instagram/Telegram: ${shop.instagram || "—"}
Kontakt: ${shop.contact || "—"}

Ro'yxatdan o'tgan sana: ${(shop.createdAt || "").split("T")[0] || "—"}
`.trim()
      : `
🏬 Мой магазин

Название: ${shop.name}
Статус: ${statusText}
Тариф: ${planText}

Кредиты всего: ${shop.creditsTotal}
Кредиты доступно: ${shop.creditsLeft}
Сгенерировано сегодня: ${shop.generatedToday}

Instagram/Telegram: ${shop.instagram || "—"}
Контакт: ${shop.contact || "—"}

Дата регистрации: ${(shop.createdAt || "").split("T")[0] || "—"}
`.trim();

  await sendMessage(chatId, stats, myShopKeyboard(lang));
}

// ======Тарифы======

async function handleTariffs(chatId) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  const text = getTariffText(lang);

  const chooseText =
    lang === "uz" ? "📌 Tarifni tanlash" : "📌 Выбрать тариф";

  await sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [[{ text: chooseText, callback_data: "tariffs:select" }]]
    }
  });
}

async function handleHelp(chatId) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  const kb = await getBaseKeyboard(chatId);
  const text = getHelpText(lang);

  await sendMessage(chatId, text, kb);
}

// ======Старт генерации======

async function handleStartGeneration(chatId) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  // Гость (без магазина) — 10 бесплатных генераций
// Гость (без магазина) — 10 бесплатных генераций
if (!shop) {
  if (session.guestCreditsLeft > 0) {
    session.step = "await_photo_guest";
    session.tmp = session.tmp || {};

    const msg =
      lang === "uz"
        ? `Sizda ro'yxatdan o'tmasdan 10 ta bepul generatsiya bor.\nQolganlari: ${session.guestCreditsLeft}\n\nKiyim fotosuratini yuboring 👇`
        : "У вас есть 10 бесплатных генераций без регистрации.\n" +
          `Осталось: ${session.guestCreditsLeft}\n\n` +
          "Отправьте фото вещи 👇";

    await sendMessage(chatId, msg);

    return;
  }

  // Если бесплатные генерации закончились — требуем регистрацию
  session.step = "await_shop_name";
  session.tmp = session.tmp || {};

  const endMsg =
    lang === "uz"
      ? "Siz 10 ta bepul generatsiyadan foydalandingiz.\nDavom etish uchun do'konni ro'yxatdan o'tkazing."
      : "Ваши 10 бесплатных генераций закончились.\nЧтобы продолжить — зарегистрируйте магазин.";

  await sendMessage(chatId, endMsg);

  return;
}


  // Магазин
  const kb = await getBaseKeyboard(chatId);

  if (shop.status === "blocked") {
    const text =
      lang === "uz"
        ? "Hozircha sizning do'koningiz uchun generatsiya qilishga ruxsat cheklangan. Agar bu xato deb o'ylasangiz — xizmat qo'llab-quvvatlashiga yozing."
        : "Доступ к генерации для вашего магазина сейчас ограничен. Если вы считаете, что это ошибка — свяжитесь со службой поддержки сервиса.";
    await sendMessage(chatId, text, kb);
    return;
  }

  ensureDailyCounters(shop);
  const dailyLimit = getDailyLimitForPlan(shop.plan);

  if (shop.creditsLeft <= 0) {
    const text =
      lang === "uz"
        ? "Sizning do'koningizda generatsiyalar tugadi. Tariflarni ko'rib chiqing va bot egasi bilan bog'lanib balansni to'ldiring."
        : "У вашего магазина закончились генерации. Посмотрите тарифы и свяжитесь с владельцем бота для пополнения.";
    await sendMessage(chatId, text, kb);
    await handleTariffs(chatId);
    return;
  }

  if (shop.generatedToday >= dailyLimit) {
    const text =
      lang === "uz"
        ? "Bugun uchun sizning tarif bo'yicha generatsiya limiti tugadi. Ertaga urinib ko'ring yoki tarifni yangilang."
        : "На сегодня лимит генераций для вашего тарифа исчерпан. Попробуйте завтра или обновите тариф.";
    await sendMessage(chatId, text, kb);
    return;
  }

  // Если уже есть сохранённые настройки — даём "быстрый режим":
  if (shop.lastSettings) {
    session.step = "await_photo_quick";
    session.tmp = {};

    const msg =
      lang === "uz"
        ? "📸 Yangi kiyim fotosuratini yuboring.\nOldingi generatsiyadagi sozlamalar (model turi, yosh, poza, fon) saqlangan va qayta ishlatiladi."
        : "📸 Отправьте новое фото вещи.\nНастройки из прошлой генерации (тип модели, возраст, поза, фон) сохранены и будут использованы снова.";

    await sendMessage(chatId, msg);
    return;
  }

  // Первый раз — полный сценарий
  session.step = "await_photo";
  session.tmp = {};

  const text =
    lang === "uz"
      ? [
          "📸 Modelda yaratish uchun kiyim fotosuratini yuboring 👇",
          "",
          "✅ Mos bo'ladigan foto:",
          "• faqat BIRTA kiyim (xudi, kurtka, shim va hokazo) to'liq ko'rinishi",
          "• yaxshi, teng yorug'lik",
          "• fon oddiy: oq fon (ma'qul), devor, pol, osma, maneken",
          "• atrofda ortiqcha buyumlar yo'q",
          "",
          "🚫 Mos kelmaydi:",
          "• kiyim odam USTIDA bo'lsa (alohida kiyimni suratga oling)",
          "• kollajlar, skrinshotlar, ustiga yozuvlar va stikeri bor rasmlar"
        ].join("\n")
      : [
          "📸 Отправьте одно фото вещи, которую нужно сгенерировать на модели 👇",
          "",
          "✅ Подойдёт фото, где:",
          "• видна ОДНА вещь (худи, куртка, штаны и т.п.) целиком",
          "• хорошее ровное освещение",
          "• фон простой: чисто белый (желательно), стена, пол, вешалка, манекен",
          "• нет лишних предметов вокруг",
          "",
          "🚫 Не подойдёт:",
          "• одежда НА человеке (нужно отдельно сфотографировать вещь)",
          "• коллажи, скриншоты, фото с надписями и наклейками поверх"
        ].join("\n");

  await sendMessage(chatId, text, {
    parse_mode: "Markdown"
  });
}

// ======Генерация для гостя и магазина (helpers)======

async function runGuestGeneration(chatId, session, lang) {
  session.step = "generating";

  const waitText =
    lang === "uz"
      ? "Tasvir yaratilmoqda, bu bir necha soniya vaqt olishi mumkin…"
      : "Генерирую изображение, это может занять несколько секунд…";
  await sendMessage(chatId, waitText, {});

  try {
    const photoBuffer = await downloadTelegramFile(session.tmp.photoFileId);
    const prompt = buildPromptFromSession(session);

    const imageBuffer = await generateImageWithGemini(prompt, photoBuffer);

    // списываем гостевой кредит
    session.guestCreditsLeft = Math.max(
      0,
      (session.guestCreditsLeft || 0) - 1
    );
    session.guestCreditsUsed = (session.guestCreditsUsed || 0) + 1;

    const caption =
      lang === "uz"
        ? "Mana sizning kiyimingiz bilan model tasviri 🎨"
        : "Вот сгенерированная модель с вашей вещью 🎨";

    await sendPhoto(chatId, imageBuffer, caption);

    // сохраняем последние настройки для гостя (в сессии)
    session.lastSettings = {
      itemType: session.tmp.itemType,
      peopleMode: session.tmp.peopleMode,
      gender: session.tmp.gender,
      pairType: session.tmp.pairType,
      age: session.tmp.age,
      pose: session.tmp.pose,
      background: session.tmp.background
    };

    session.step = "idle";
    session.tmp = {};

    const kbAfter = await getBaseKeyboard(chatId);
    let msg;
    if (session.guestCreditsLeft <= 0) {
      msg =
        lang === "uz"
          ? "Siz 10 ta bepul generatsiyadan foydalandingiz. Davom etish uchun do'konni ro'yxatdan o'tkazing."
          : "Вы использовали все 10 бесплатных генераций. Чтобы продолжить — зарегистрируйте магазин.";
    } else {
      msg =
        lang === "uz"
          ? `Bepul generatsiyalardan qolganlari: ${session.guestCreditsLeft}`
          : `Бесплатных генераций осталось: ${session.guestCreditsLeft}`;
    }
    await sendMessage(chatId, msg, kbAfter);

    // 🔹 Кнопка "Зарегистрировать магазин" после каждой генерации гостя
    const regText =
      lang === "uz"
        ? "Do'koningizni ro'yxatdan o'tkazing va barcha generatsiyalarni bir joyda saqlang:"
        : "Зарегистрируйте магазин, чтобы сохранить все генерации и получить больше лимитов:";
    await sendMessage(chatId, regText, {
      reply_markup: registerShopInlineKeyboard(lang)
    });
  } catch (err) {
    console.error("Error during guest generation:", err);
    session.step = "idle";
    session.tmp = {};
    const kbErr = await getBaseKeyboard(chatId);
    const msg =
      lang === "uz"
        ? "Tasvir generatsiyasi vaqtida xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring."
        : "Произошла ошибка при генерации изображения. Попробуйте ещё раз позже.";
    await sendMessage(chatId, msg, kbErr);
  }
}

async function runShopGeneration(chatId, session, shopForGen, lang) {
  const kb = await getBaseKeyboard(chatId);

  if (!shopForGen) {
    // если вдруг магазин пропал
    session.step = "await_shop_name";
    session.tmp = {};
    const msg =
      lang === "uz"
        ? "Do'kon ma'lumotlari topilmadi. Keling, qayta ro'yxatdan o'tamiz.\nKiyim do'koningiz nomini yozing:"
        : "Кажется, данные магазина не найдены. Давайте зарегистрируемся заново.\nНапишите название вашего магазина одежды:";
    await sendMessage(chatId, msg, registrationKeyboard(lang));
    return;
  }

  if (shopForGen.status === "pending") {
    session.step = "idle";
    const msg =
      lang === "uz"
        ? "Sizning arizangiz hali avtomatik tekshiruvdan o'tmagan. Tekshiruv tugagach, generatsiya qilish imkoniyati paydo bo'ladi."
        : "Ваша заявка ещё не прошла автоматическую проверку системой. После успешной проверки вы сможете запускать генерацию.";
    await sendMessage(chatId, msg, kb);
    return;
  }

  if (shopForGen.status === "blocked") {
    session.step = "idle";
    const msg =
      lang === "uz"
        ? "Hozircha sizning do'koningiz uchun generatsiya qilishga ruxsat cheklangan. Agar bu xato deb o'ylasangiz — qo'llab-quvvatlashga yozing."
        : "Доступ к генерации для вашего магазина сейчас ограничен. Если вы считаете, что это ошибка — свяжитесь со службой поддержки сервиса.";
    await sendMessage(chatId, msg, kb);
    return;
  }

  ensureDailyCounters(shopForGen);
  const dailyLimit = getDailyLimitForPlan(shopForGen.plan);

  if (shopForGen.creditsLeft <= 0) {
    session.step = "idle";
    const msg =
      lang === "uz"
        ? "Sizning do'koningizda generatsiyalar tugadi. Tariflarni ko'rib chiqing va bot egasi bilan bog'lanib balansni to'ldiring."
        : "У вашего магазина закончились генерации. Посмотрите тарифы и свяжитесь с владельцем бота для пополнения.";
    await sendMessage(chatId, msg, kb);
    await handleTariffs(chatId);
    return;
  }

  if (shopForGen.generatedToday >= dailyLimit) {
    session.step = "idle";
    const msg =
      lang === "uz"
        ? "Bugungi kun uchun tarif bo'yicha generatsiya limiti tugadi. Ertaga urinib ko'ring yoki tarifni yangilang."
        : "На сегодня лимит генераций для вашего тарифа исчерпан. Попробуйте завтра или обновите тариф.";
    await sendMessage(chatId, msg, kb);
    return;
  }

  const now = Date.now();
  if (
    shopForGen.lastGeneratedAt &&
    now - shopForGen.lastGeneratedAt < COOLDOWN_MS
  ) {
    const waitMs = COOLDOWN_MS - (now - shopForGen.lastGeneratedAt);
    const waitSec = Math.ceil(waitMs / 1000);
    session.step = "idle";

    const msg =
      lang === "uz"
        ? `Iltimos, keyingi generatsiya oldidan yana ${waitSec} soniya kuting.`
        : `Пожалуйста, подождите ещё ${waitSec} сек перед следующей генерацией.`;
    await sendMessage(chatId, msg, kb);
    return;
  }

  session.step = "generating";

  const waitText =
    lang === "uz"
      ? "Tasvir yaratilmoqda, bu bir necha soniya vaqt olishi mumkin…"
      : "Генерирую изображение, это может занять несколько секунд…";

  await sendMessage(chatId, waitText, {});

  try {
    const photoBuffer = await downloadTelegramFile(session.tmp.photoFileId);
    const prompt = buildPromptFromSession(session);

    const imageBuffer = await generateImageWithGemini(prompt, photoBuffer);

    shopForGen.creditsLeft = Math.max(0, shopForGen.creditsLeft - 1);
    ensureDailyCounters(shopForGen);
    shopForGen.generatedToday += 1;
    shopForGen.lastGeneratedAt = Date.now();

    // сохраняем последние настройки генерации в магазине
    shopForGen.lastSettings = {
      itemType: session.tmp.itemType,
      peopleMode: session.tmp.peopleMode,
      gender: session.tmp.gender,
      pairType: session.tmp.pairType,
      age: session.tmp.age,
      pose: session.tmp.pose,
      background: session.tmp.background
    };

    await persistShop(shopForGen);

    const caption =
      lang === "uz"
        ? "Mana sizning kiyimingiz bilan model tasviri 🎨"
        : "Вот сгенерированная модель с вашей вещью 🎨";

    await sendPhoto(chatId, imageBuffer, caption);

    session.step = "idle";
    session.tmp = {};

    const kbAfter = await getBaseKeyboard(chatId);

    if (shopForGen.creditsLeft <= 0) {
      const msg =
        lang === "uz"
          ? "Sizning do'koningizda generatsiyalar tugadi. Tariflarni ko'rib chiqing 👇"
          : "У вашего магазина закончились генерации. Посмотрите тарифы 👇";
      await sendMessage(chatId, msg, kbAfter);
      await handleTariffs(chatId);
    } else {
      const msg =
        lang === "uz"
          ? `Sizning do'koningizda qolgan generatsiyalar soni: ${shopForGen.creditsLeft}`
          : `У вашего магазина осталось генераций: ${shopForGen.creditsLeft}`;
      await sendMessage(chatId, msg, kbAfter);
    }
  } catch (err) {
    console.error("Error during generation:", err);
    session.step = "idle";
    session.tmp = {};
    const kbErr = await getBaseKeyboard(chatId);
    const msg =
      lang === "uz"
        ? "Tasvir generatsiyasi vaqtida xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring."
        : "Произошла ошибка при генерации изображения. Попробуйте ещё раз позже.";
    await sendMessage(chatId, msg, kbErr);
  }
}

// ======Фото======

async function handleIncomingPhoto(chatId, message) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  // === ЧЕК ОПЛАТЫ (скриншот) ===
  if (session.step === "await_payment_proof") {
    const plan = session.tmp?.paymentPlan || "start";
    const shopForPay = await getShop(chatId);

    if (!shopForPay) {
      session.step = "idle";
      session.tmp = {};
      const kb = await getBaseKeyboard(chatId);
      const text =
        lang === "uz"
          ? "Do'kon topilmadi. «💳 Tariflar va narxlar» bo'limidan tarifni qaytadan tanlab ko'ring."
          : "Магазин не найден. Попробуйте ещё раз выбрать тариф через «💳 Тарифы и цены».";
      await sendMessage(chatId, text, kb);
      return;
    }

    if (!ADMIN_CHAT_ID) {
      session.step = "idle";
      session.tmp = {};
      const kb = await getBaseKeyboard(chatId);
      const text =
        lang === "uz"
          ? "Hozircha to'lovni qabul qilish vaqtincha dostup emas. Administratorga yozing: @dcoredanil."
          : "Сейчас приём платежей временно недоступен. Напишите администратору @dcoredanil.";
      await sendMessage(chatId, text, kb);
      return;
    }

    const adminText =
      lang === "uz"
        ? `🧾 Yangi to'lov (skrinshot)\n\nDo'kon: ${shopForPay.name}\nChat ID: ${shopForPay.chatId}\nTarif: ${plan.toUpperCase()}\n\nQuyida chek skrinshoti forward qilingan.\n\nTo'lovni tasdiqlash yoki rad etish:`
        : `🧾 Новый платёж (скриншот)\n\nМагазин: ${shopForPay.name}\nChat ID: ${shopForPay.chatId}\nТариф: ${plan.toUpperCase()}\n\nНиже переслан скриншот чека.\n\nПодтвердить или отклонить платёж:`;

    await sendMessage(ADMIN_CHAT_ID, adminText, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                lang === "uz"
                  ? "✅ To'lovni tasdiqlash"
                  : "✅ Подтвердить оплату",
              callback_data: `pay_confirm:${plan}:${shopForPay.chatId}`
            },
            {
              text: lang === "uz" ? "❌ Rad etish" : "❌ Отклонить",
              callback_data: `pay_reject:${shopForPay.chatId}`
            }
          ]
        ]
      }
    });

    await forwardMessage(ADMIN_CHAT_ID, chatId, message.message_id);

    session.step = "idle";
    session.tmp = {};
    const kb = await getBaseKeyboard(chatId);

    const userText =
      lang === "uz"
        ? "Rahmat! Chek administratorga yuborildi. Tekshiruvdan so'ng sizga generatsiyalar qo'shiladi va shu chatga bildirishnoma keladi."
        : "Спасибо! Чек отправлен администратору. После проверки мы начислим генерации и пришлём уведомление в этот чат.";

    await sendMessage(chatId, userText, kb);
    return;
  }

  const photos = message.photo || [];
  if (photos.length === 0) {
    const text =
      lang === "uz"
        ? "Rasmni ko'rmadim 🤔 Qaytadan yuborib ko'ring."
        : "Не вижу фото 🤔 Попробуйте ещё раз.";
    await sendMessage(chatId, text);
    return;
  }

  const fileId = photos[photos.length - 1].file_id;

  // Быстрый режим для магазина (повтор настроек)
  if (session.step === "await_photo_quick") {
    const shopQuick = await getShop(chatId);
    if (!shopQuick || !shopQuick.lastSettings) {
      // fallback — обычный сценарий
      session.step = "await_photo";
      session.tmp = {};
      const msg =
        lang === "uz"
          ? "Oldingi sozlamalar topilmadi. Keling, yangi sozlamalar bilan boshlaymiz.\nKiyim fotosuratini yuboring 👇"
          : "Предыдущие настройки не найдены. Давайте зададим новые.\nОтправьте фото вещи 👇";
      await sendMessage(chatId, msg);
      return;
    }

    session.tmp = {
      photoFileId: fileId,
      // переносим сохранённые настройки
      itemType: shopQuick.lastSettings.itemType,
      peopleMode: shopQuick.lastSettings.peopleMode,
      gender: shopQuick.lastSettings.gender,
      pairType: shopQuick.lastSettings.pairType,
      age: shopQuick.lastSettings.age,
      pose: shopQuick.lastSettings.pose,
      background: shopQuick.lastSettings.background
    };

    await runShopGeneration(chatId, session, shopQuick, lang);
    return;
  }

  // Гость — фото
  if (session.step === "await_photo_guest") {
    session.tmp = session.tmp || {};
    session.tmp.photoFileId = fileId;
    session.step = "await_item_type_guest";

    const text =
      lang === "uz" ? "Ajoyib! Bu qanday kiyim?" : "Отлично! Что это за вещь?";

    await sendMessage(chatId, text, itemTypeKeyboard(lang));
    return;
  }

  // Обычная генерация (магазин / первый запуск)
  if (session.step !== "await_photo") {
    const kb = await getBaseKeyboard(chatId);
    const text =
      lang === "uz"
        ? "Avval menyudan «🎨 Rasm yaratish» tugmasini bosing."
        : "Сначала нажмите «🎨 Генерировать» в меню, чтобы запустить сценарий.";
    await sendMessage(chatId, text, kb);
    return;
  }

  session.tmp.photoFileId = fileId;
  session.step = "await_item_type";

  const text =
    lang === "uz" ? "Ajoyib! Bu qanday kiyim?" : "Отлично! Что это за вещь?";

  await sendMessage(chatId, text, itemTypeKeyboard(lang));
}

// ======Текстовые сообщения======

async function handleTextMessage(chatId, text) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  const KIDS_LABEL_RU = "Детская одежда";
  const KIDS_LABEL_UZ = "Bolalar kiyimi";

  const KIDS_AGE_OPTIONS_RU = [
    "0-6 месяц",
    "0.6-1 год",
    "1-3 года",
    "3-6 лет",
    "До 10 лет",
    "10-12",
    "12-14",
    "14-16"
  ];

  const KIDS_AGE_OPTIONS_UZ = [
    "0-6 oy",
    "0.6-1 yil",
    "1-3 yil",
    "3-6 yil",
    "10 yoshgacha",
    "10-12",
    "12-14",
    "14-16"
  ];

  // ======Админ-команды======
  if (ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID)) {
    if (
      text.startsWith("/approve ") ||
      text.startsWith("/reject ") ||
      text.startsWith("/add_credits ") ||
      text.startsWith("/set_plan ") ||
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

  // ======Выбор языка (await_language)======
  if (session.step === "await_language") {
    let newLang = null;
    if (text.startsWith("Русский")) newLang = "ru";
    if (text.startsWith("O'zbekcha")) newLang = "uz";

    if (!newLang) {
      await sendMessage(
        chatId,
        "Выберите язык / Tilni tanlang:",
        languageSelectKeyboard()
      );
      return;
    }

    session.language = newLang;

    const hasShop = !!shop;
    if (hasShop) {
      await setShopLanguage(chatId, newLang);
      session.step = "idle";
      session.tmp = {};
      const kb = await getBaseKeyboard(chatId);
      const confirmText =
        newLang === "uz"
          ? "Til o'zgartirildi. Asosiy menyu:"
          : "Язык изменён. Главное меню:";
      await sendMessage(chatId, confirmText, kb);
      return;
    }

    // Гость без магазина
    session.step = "idle";
    session.tmp = {};
    const kb = await getBaseKeyboard(chatId);
    const msgGuest =
      newLang === "uz"
        ? "Til tanlandi. Sizda 10 ta bepul generatsiya bor. Boshlash uchun «🎨 Rasm yaratish» tugmasini bosing."
        : "Язык выбран. У вас есть 10 бесплатных генераций. Нажмите «🎨 Генерировать», чтобы начать.";
    await sendMessage(chatId, msgGuest, kb);
    return;
  }

  // ======Кнопка "назад в главное меню"======
  if (text === "⬅️ В главное меню" || text === "⬅️ Asosiy menyu") {
    session.step = "idle";
    session.tmp = {};
    const kb = await getBaseKeyboard(chatId);
    const msg = lang === "uz" ? "Asosiy menyu:" : "Главное меню:";
    await sendMessage(chatId, msg, kb);
    return;
  }

  // ======Смена языка из главного меню======
  if (
    text === "🌐 Язык" ||
    text === "🌐 Til" ||
    text === "🌐 Язык / Til"
  ) {
    session.step = "await_language";
    session.tmp = {};
    await sendMessage(
      chatId,
      "Выберите язык / Tilni tanlang:",
      languageSelectKeyboard()
    );
    return;
  }

  // ======/start + рефералка======
  if (text.startsWith("/start")) {
    const parts = text.split(" ");
    if (parts.length > 1 && parts[1].startsWith("ref_")) {
      const refId = parts[1].slice(4);
      if (refId && refId !== String(chatId)) {
        // сохраняем пригласившего в сессию, если ещё не сохранён
        if (!session.referrerId) {
          session.referrerId = refId;
        }
      }
    }

    await handleStart(chatId);
    return;
  }

  // ======Главные кнопки======

  if (text === "🎨 Генерировать" || text === "🎨 Rasm yaratish") {
    await handleStartGeneration(chatId);
    return;
  }

  if (text === "💳 Тарифы и цены" || text === "💳 Tariflar va narxlar") {
    await handleTariffs(chatId);
    return;
  }

  if (text === "ℹ️ Помощь" || text === "ℹ️ Yordam") {
    await handleHelp(chatId);
    return;
  }

  if (text === "🏬 Мой магазин" || text === "🏬 Mening do'konim") {
    await handleMyShop(chatId);
    return;
  }

  // ======Удаление магазина======

  if (text === "🗑 Удалить магазин" || text === "🗑 Do'konni o'chirish") {
    const shopToDelete = await getShop(chatId);
    const kb = await getBaseKeyboard(chatId);

    if (!shopToDelete) {
      const msg =
        lang === "uz"
          ? "Sizda hali ro'yxatdan o'tgan do'kon yo'q."
          : "У вас ещё нет зарегистрированного магазина.";
      await sendMessage(chatId, msg, kb);
      return;
    }
    session.step = "confirm_delete_shop";
    session.tmp = {};

    const yesText =
      lang === "uz" ? "✅ Ha, o'chirish" : "✅ Да, удалить";
    const cancelText =
      lang === "uz" ? "❌ Bekor qilish" : "❌ Отмена";

    const question =
      lang === "uz"
        ? `Rostdan ham «${shopToDelete.name}» do'konini o'chirmoqchimisiz?\n\n«${yesText}» yoki «${cancelText}» tugmasini bosing.`
        : `Вы уверены, что хотите удалить магазин «${shopToDelete.name}»?\n\nНажмите «${yesText}» или «${cancelText}».`;

    await sendMessage(chatId, question, {
      reply_markup: {
        keyboard: [[{ text: yesText }], [{ text: cancelText }]],
        resize_keyboard: true
      }
    });
    return;
  }

  if (session.step === "confirm_delete_shop") {
    const yesRu = "✅ Да, удалить";
    const yesUz = "✅ Ha, o'chirish";
    const cancelRu = "❌ Отмена";
    const cancelUz = "❌ Bekor qilish";

    if (text === yesRu || text === yesUz) {
      const ok = await deleteShop(chatId);
      if (ok) {
        session.step = "await_shop_name";
        session.tmp = {};
        const msg =
          lang === "uz"
            ? "Do'kon o'chirildi.\n\nYangi do'kon yaratamiz.\nKiyim do'koningiz nomini yozing:"
            : "Магазин удалён.\n\nДавайте создадим новый магазин.\nНапишите название вашего магазина одежды:";
        await sendMessage(chatId, msg, registrationKeyboard(lang));
      } else {
        session.step = "idle";
        session.tmp = {};
        const kb = await getBaseKeyboard(chatId);
        const msg =
          lang === "uz" ? "Do'kon topilmadi." : "Магазин не найден.";
        await sendMessage(chatId, msg, kb);
      }
      return;
    }

    // Любой ответ — отмена
    if (text === cancelRu || text === cancelUz) {
      session.step = "idle";
      session.tmp = {};
      const kb = await getBaseKeyboard(chatId);
      const msg =
        lang === "uz"
          ? "O'chirish bekor qilindi."
          : "Удаление отменено.";
      await sendMessage(chatId, msg, kb);
      return;
    }

    // Если что-то другое — тоже отменяем
    session.step = "idle";
    session.tmp = {};
    const kb = await getBaseKeyboard(chatId);
    const msg =
      lang === "uz"
        ? "O'chirish bekor qilindi."
        : "Удаление отменено.";
    await sendMessage(chatId, msg, kb);
    return;
  }

  // ======Чек оплаты (текст)======

  if (session.step === "await_payment_proof") {
    const plan = session.tmp?.paymentPlan || "start";
    const shopForPay = await getShop(chatId);

    if (!shopForPay) {
      session.step = "idle";
      session.tmp = {};
      const kb = await getBaseKeyboard(chatId);
      const msg =
        lang === "uz"
          ? "Do'kon topilmadi. «💳 Tariflar va narxlar» bo'limidan tarifni qaytadan tanlab ko'ring."
          : "Магазин не найден. Попробуйте ещё раз выбрать тариф через «💳 Тарифы и цены».";
      await sendMessage(chatId, msg, kb);
      return;
    }

    if (!ADMIN_CHAT_ID) {
      session.step = "idle";
      session.tmp = {};
      const kb = await getBaseKeyboard(chatId);
      const msg =
        lang === "uz"
          ? "Hozircha to'lovni qabul qilish vaqtincha mavjud emas. Administratorga yozing: @dcoredanil."
          : "Сейчас приём платежей временно недоступен. Напишите администратору @dcoredanil.";
      await sendMessage(chatId, msg, kb);
      return;
    }

    const adminText =
      lang === "uz"
        ? `🧾 Yangi to'lov (chek matni)\n\nDo'kon: ${shopForPay.name}\nChat ID: ${shopForPay.chatId}\nTarif: ${plan.toUpperCase()}\n\nDo'kondan izoh:\n${text}\n\nTo'lovni tasdiqlash yoki rad etish:`
        : `🧾 Новый платёж (без скриншота)\n\nМагазин: ${shopForPay.name}\nChat ID: ${shopForPay.chatId}\nТариф: ${plan.toUpperCase()}\n\nКомментарий от магазина:\n${text}\n\nПодтвердить или отклонить платёж:`;

    await sendMessage(ADMIN_CHAT_ID, adminText, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                lang === "uz"
                  ? "✅ To'lovni tasdiqlash"
                  : "✅ Подтвердить оплату",
              callback_data: `pay_confirm:${plan}:${shopForPay.chatId}`
            },
            {
              text: lang === "uz" ? "❌ Rad etish" : "❌ Отклонить",
              callback_data: `pay_reject:${shopForPay.chatId}`
            }
          ]
        ]
      }
    });

    session.step = "idle";
    session.tmp = {};
    const kb = await getBaseKeyboard(chatId);
    const msg =
      lang === "uz"
        ? "Rahmat! To'lov haqida ma'lumot administratorga yuborildi. Tekshiruvdan so'ng generatsiyalar balansingizga qo'shiladi."
        : "Спасибо! Информация об оплате отправлена администратору. После проверки вы получите уведомление о начислении генераций.";
    await sendMessage(chatId, msg, kb);
    return;
  }

  // ======Регистрация магазина======

  if (session.step === "await_shop_name") {
    session.tmp.shopName = text;
    session.step = "await_shop_instagram";

    const msg =
      lang === "uz"
        ? "Ajoyib! Do'koningiz Instagram manzilini yoki Telegram kanal/chat havolasini yuboring.\nMisollar:\n• https://instagram.com/yourshop\n• https://t.me/yourshop\n• @yourshop\n\nAgar hozircha profil bo'lmasa, «yo'q» deb yozing."
        : "Отлично! Вставьте ссылку на Instagram вашего магазина или Telegram-канал/чат.\nПримеры:\n• https://instagram.com/yourshop\n• https://t.me/yourshop\n• @yourshop\n\nИли напишите «нет», если пока нет профиля.";

    await sendMessage(chatId, msg, registrationKeyboard(lang));
    return;
  }

  if (session.step === "await_shop_instagram") {
    const { ok, value } = validateShopLink(text);
    if (!ok) {
      const msg =
        lang === "uz"
          ? "Havola noto'g'ri ko'rinmoqda.\nQuyidagi ko'rinishda yuboring:\n• https://instagram.com/yourshop\n• https://t.me/yourshop\n• @yourshop\nyoki «yo'q» deb yozing."
          : "Похоже, ссылка некорректна.\nВведите ссылку вида:\n• https://instagram.com/yourshop\n• https://t.me/yourshop\n• @yourshop\nили напишите «нет».";
      await sendMessage(chatId, msg, registrationKeyboard(lang));
      return;
    }

    session.tmp.shopInstagram = value || "";
    session.step = "await_shop_contact";

    const msg =
      lang === "uz"
        ? "Aloqa uchun kontaktni yozing (Telegram @username yoki telefon raqam, masalan +998901234567):"
        : "Укажите контакт для связи (телеграм @username или номер телефона, например +998901234567):";

    await sendMessage(chatId, msg, registrationKeyboard(lang));
    return;
  }

  if (session.step === "await_shop_contact") {
    const { ok, value } = validateContact(text);
    if (!ok) {
      const msg =
        lang === "uz"
          ? "Kontakt noto'g'ri ko'rinmoqda.\nKo'rsating:\n• Telegram @username (kamida 5 ta belgi)\nyoki\n• telefon raqam, masalan +9989XXXXXXXX."
          : "Похоже, контакт некорректен.\nУкажите:\n• Telegram @username (не короче 5 символов)\nили\n• номер телефона, например +9989XXXXXXXX.";
      await sendMessage(chatId, msg, registrationKeyboard(lang));
      return;
    }

    session.tmp.shopContact = value;

    const shopData = {
      name: session.tmp.shopName,
      instagram: session.tmp.shopInstagram,
      contact: session.tmp.shopContact,
      language: lang,
      referrerId: session.referrerId || null
    };

    const newShop = await createShop(chatId, shopData);

    // 🔹 Реферальные бонусы
// 🔹 Реферальные бонусы
if (newShop.referrerId) {
  try {
    const refShop = await getShop(newShop.referrerId);
    if (refShop) {
      // бонус пригласившему
      refShop.creditsLeft += REF_BONUS_FOR_REFERRER;
      refShop.creditsTotal += REF_BONUS_FOR_REFERRER;
      await persistShop(refShop);

      const refLang = refShop.language || "ru";
      const refMsg =
        refLang === "uz"
          ? `🎁 Sizning referal havolangiz orqali yangi «${newShop.name}» do'koni ro'yxatdan o'tdi.\n\nSizga +${REF_BONUS_FOR_REFERRER} ta generatsiya qo'shildi.`
          : `🎁 По вашей реферальной ссылке зарегистрировался новый магазин «${newShop.name}».\n\nВам начислено +${REF_BONUS_FOR_REFERRER} генераций.`;

      await sendMessage(Number(refShop.chatId), refMsg);
    }

    // бонус приглашённому магазину
    newShop.creditsLeft += REF_BONUS_FOR_INVITED;
    newShop.creditsTotal += REF_BONUS_FOR_INVITED;
    await persistShop(newShop);

    const invitedMsg =
      lang === "uz"
        ? `🎉 Siz referal havola orqali ro'yxatdan o'tdingiz.\n\nDo'kon balansiga qo'shimcha +${REF_BONUS_FOR_INVITED} ta generatsiya qo'shildi.`
        : `🎉 Вы зарегистрировались по реферальной ссылке.\n\nНа баланс магазина начислено +${REF_BONUS_FOR_INVITED} дополнительных генераций.`;

    await sendMessage(chatId, invitedMsg);
  } catch (e) {
    console.error("Referral bonus error:", e);
  }
}


    session.step = "idle";
    session.tmp = {};

    const kb = await getBaseKeyboard(chatId);
    const msg =
      lang === "uz"
        ? `Hammasi tayyor! Biz sizning «${newShop.name}» do'koningizni ro'yxatdan o'tkazdik.\n\nDo'koningiz darhol faollashtirildi va siz ${TRIAL_CREDITS} ta bepul generatsiya oldingiz.`
        : `Готово! Мы зарегистрировали ваш магазин «${newShop.name}».\n\nМагазин сразу активирован, и вы получили ${TRIAL_CREDITS} пробных генераций.`;

    await sendMessage(chatId, msg, kb);

    await notifyAdminNewShop(newShop);
    return;
  }

  // ======Сценарий генерации (гость)======

  if (session.step === "await_item_type_guest") {
    session.tmp.itemType = text;
    session.step = "await_people_mode_guest";

    const msg =
      lang === "uz"
        ? "Surat formatini tanlang:"
        : "Выберите формат съёмки:";
    await sendMessage(chatId, msg, peopleModeKeyboard(lang));
    return;
  }

  if (session.step === "await_people_mode_guest") {
    const oneRu = "Один человек";
    const oneUz = "Bitta model";
    const pairRu = "Пара";
    const pairUz = "Juftlik";

    if (text === oneRu || text === oneUz) {
      session.tmp.peopleMode = "single";
      session.step = "await_gender_guest";

      const msg =
        lang === "uz"
          ? "Model jinsi kim bo'ladi?"
          : "Кто будет моделью?";
      await sendMessage(chatId, msg, genderKeyboard(lang));
      return;
    }

    if (text === pairRu || text === pairUz) {
      session.tmp.peopleMode = "pair";
      session.step = "await_pair_type_guest";

      const msg =
        lang === "uz"
          ? "Qanday juftlikni ko'rsatamiz?"
          : "Какую пару показать?";
      await sendMessage(chatId, msg, pairTypeKeyboard(lang));
      return;
    }

    const msg =
      lang === "uz"
        ? "Iltimos, klaviaturadagi variantlardan birini tanlang: «Bitta model» yoki «Juftlik»."
        : "Пожалуйста, выберите вариант на клавиатуре: «Один человек» или «Пара».";
    await sendMessage(chatId, msg, peopleModeKeyboard(lang));
    return;
  }

  if (session.step === "await_gender_guest") {
    session.tmp.gender = text;
    session.step = "await_age_guest";

    const kidsLabel = lang === "uz" ? KIDS_LABEL_UZ : KIDS_LABEL_RU;

    const msg =
      lang === "uz"
        ? "Model yoshi (masalan: 18-25, 25-35) ni tanlang yoki yozing. Agar bolalar uchun kiyim bo'lsa — «Bolalar kiyimi» ni tanlang:"
        : "Укажи возраст модели (например: 18-25, 25-35). Если это детская одежда — выбери «Детская одежда»:";
    await sendMessage(chatId, msg, {
      reply_markup: {
        keyboard: [
          [{ text: kidsLabel }, { text: "18-25" }],
          [{ text: "25-35" }, { text: "35-45" }],
          [{ text: "45+" }],
          [
            {
              text:
                lang === "uz"
                  ? "⬅️ Asosiy menyu"
                  : "⬅️ В главное меню"
            }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    return;
  }

  if (session.step === "await_pair_type_guest") {
    session.tmp.pairType = text;
    session.step = "await_age_guest";

    const kidsLabel = lang === "uz" ? KIDS_LABEL_UZ : KIDS_LABEL_RU;

    const msg =
      lang === "uz"
        ? "Modellar yoshi (masalan: 18-25, 25-35) ni tanlang yoki yozing. Agar bolalar uchun kiyim bo'lsa — «Bolalar kiyimi» ni tanlang:"
        : "Укажи возраст моделей (например: 18-25, 25-35). Если это детская одежда — выбери «Детская одежда»:";
    await sendMessage(chatId, msg, {
      reply_markup: {
        keyboard: [
          [{ text: kidsLabel }, { text: "18-25" }],
          [{ text: "25-35" }, { text: "35-45" }],
          [{ text: "45+" }],
          [
            {
              text:
                lang === "uz"
                  ? "⬅️ Asosiy menyu"
                  : "⬅️ В главное меню"
            }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    return;
  }

  if (session.step === "await_age_guest") {
    if (text === KIDS_LABEL_RU || text === KIDS_LABEL_UZ) {
      session.step = "await_kids_age_guest";

      const options =
        lang === "uz" ? KIDS_AGE_OPTIONS_UZ : KIDS_AGE_OPTIONS_RU;

      const msg =
        lang === "uz"
          ? "Bolalar kiyimi uchun yosh toifasini tanlang:"
          : "Выбери возрастную категорию детской одежды:";
      await sendMessage(chatId, msg, {
        reply_markup: {
          keyboard: [
            [{ text: options[0] }, { text: options[1] }],
            [{ text: options[2] }, { text: options[3] }],
            [{ text: options[4] }, { text: options[5] }],
            [{ text: options[6] }, { text: options[7] }],
            [
              {
                text:
                  lang === "uz"
                    ? "⬅️ Asosiy menyu"
                    : "⬅️ В главное меню"
              }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return;
    }

    session.tmp.age = text;
    session.step = "await_pose_guest";

    const msg =
      lang === "uz"
        ? "Model pozasini tanlang:"
        : "Выбери позу модели:";
    await sendMessage(chatId, msg, poseKeyboard(lang));
    return;
  }

  if (session.step === "await_kids_age_guest") {
    const validOptions =
      lang === "uz" ? KIDS_AGE_OPTIONS_UZ : KIDS_AGE_OPTIONS_RU;

    if (!validOptions.includes(text)) {
      const options = validOptions;
      const msg =
        lang === "uz"
          ? "Iltimos, bolalar yoshi uchun variantlardan birini tanlang."
          : "Пожалуйста, выбери один из вариантов возраста детской одежды.";
      await sendMessage(chatId, msg, {
        reply_markup: {
          keyboard: [
            [{ text: options[0] }, { text: options[1] }],
            [{ text: options[2] }, { text: options[3] }],
            [{ text: options[4] }, { text: options[5] }],
            [{ text: options[6] }, { text: options[7] }],
            [
              {
                text:
                  lang === "uz"
                    ? "⬅️ Asosiy menyu"
                    : "⬅️ В главное меню"
              }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return;
    }

    session.tmp.age = text;
    session.step = "await_pose_guest";

    const msg =
      lang === "uz"
        ? "Model pozasini tanlang:"
        : "Выбери позу модели:";
    await sendMessage(chatId, msg, poseKeyboard(lang));
    return;
  }

  if (session.step === "await_pose_guest") {
    session.tmp.pose = text;
    session.step = "await_background_guest";

    const msg =
      lang === "uz"
        ? "Endi fonni tanlang:"
        : "Теперь выбери фон:";
    await sendMessage(chatId, msg, backgroundKeyboard(lang));
    return;
  }

  if (session.step === "await_background_guest") {
    session.tmp.background = text;
    await runGuestGeneration(chatId, session, lang);
    return;
  }

  // ======Сценарий генерации (магазин, полный путь)======

  if (session.step === "await_item_type") {
    session.tmp.itemType = text;
    session.step = "await_people_mode";

    const msg =
      lang === "uz"
        ? "Surat formatini tanlang:"
        : "Выберите формат съёмки:";
    await sendMessage(chatId, msg, peopleModeKeyboard(lang));
    return;
  }

  if (session.step === "await_people_mode") {
    const oneRu = "Один человек";
    const oneUz = "Bitta model";
    const pairRu = "Пара";
    const pairUz = "Juftlik";

    if (text === oneRu || text === oneUz) {
      session.tmp.peopleMode = "single";
      session.step = "await_gender";

      const msg =
        lang === "uz"
          ? "Model jinsi kim bo'ladi?"
          : "Кто будет моделью?";
      await sendMessage(chatId, msg, genderKeyboard(lang));
      return;
    }

    if (text === pairRu || text === pairUz) {
      session.tmp.peopleMode = "pair";
      session.step = "await_pair_type";

      const msg =
        lang === "uz"
          ? "Qanday juftlikni ko'rsatamiz?"
          : "Какую пару показать?";
      await sendMessage(chatId, msg, pairTypeKeyboard(lang));
      return;
    }

    const msg =
      lang === "uz"
        ? "Iltimos, klaviaturadagi variantlardan birini tanlang: «Bitta model» yoki «Juftlik»."
        : "Пожалуйста, выберите вариант на клавиатуре: «Один человек» или «Пара».";
    await sendMessage(chatId, msg, peopleModeKeyboard(lang));
    return;
  }

  if (session.step === "await_gender") {
    session.tmp.gender = text;
    session.step = "await_age";

    const kidsLabel = lang === "uz" ? KIDS_LABEL_UZ : KIDS_LABEL_RU;

    const msg =
      lang === "uz"
        ? "Model yoshi (masalan: 18-25, 25-35) ni tanlang yoki yozing. Agar bolalar uchun kiyim bo'lsa — «Bolalar kiyimi» ni tanlang:"
        : "Укажи возраст модели (например: 18-25, 25-35). Если это детская одежда — выбери «Детская одежда»:";
    await sendMessage(chatId, msg, {
      reply_markup: {
        keyboard: [
          [{ text: kidsLabel }, { text: "18-25" }],
          [{ text: "25-35" }, { text: "35-45" }],
          [{ text: "45+" }],
          [
            {
              text:
                lang === "uz"
                  ? "⬅️ Asosiy menyu"
                  : "⬅️ В главное меню"
            }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    return;
  }

  if (session.step === "await_pair_type") {
    session.tmp.pairType = text;
    session.step = "await_age";

    const kidsLabel = lang === "uz" ? KIDS_LABEL_UZ : KIDS_LABEL_RU;

    const msg =
      lang === "uz"
        ? "Modellar yoshi (masalan: 18-25, 25-35) ni tanlang yoki yozing. Agar bolalar uchun kiyim bo'lsa — «Bolalar kiyimi» ni tanlang:"
        : "Укажи возраст моделей (например: 18-25, 25-35). Если это детская одежда — выбери «Детская одежда»:";
    await sendMessage(chatId, msg, {
      reply_markup: {
        keyboard: [
          [{ text: kidsLabel }, { text: "18-25" }],
          [{ text: "25-35" }, { text: "35-45" }],
          [{ text: "45+" }],
          [
            {
              text:
                lang === "uz"
                  ? "⬅️ Asosiy menyu"
                  : "⬅️ В главное меню"
            }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    return;
  }

  if (session.step === "await_age") {
    if (text === KIDS_LABEL_RU || text === KIDS_LABEL_UZ) {
      session.step = "await_kids_age";

      const options =
        lang === "uz" ? KIDS_AGE_OPTIONS_UZ : KIDS_AGE_OPTIONS_RU;

      const msg =
        lang === "uz"
          ? "Bolalar kiyimi uchun yosh toifasini tanlang:"
          : "Выбери возрастную категорию детской одежды:";
      await sendMessage(chatId, msg, {
        reply_markup: {
          keyboard: [
            [{ text: options[0] }, { text: options[1] }],
            [{ text: options[2] }, { text: options[3] }],
            [{ text: options[4] }, { text: options[5] }],
            [{ text: options[6] }, { text: options[7] }],
            [
              {
                text:
                  lang === "uz"
                    ? "⬅️ Asosiy menyu"
                    : "⬅️ В главное меню"
              }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return;
    }

    session.tmp.age = text;
    session.step = "await_pose";

    const msg =
      lang === "uz"
        ? "Model pozasini tanlang:"
        : "Выбери позу модели:";
    await sendMessage(chatId, msg, poseKeyboard(lang));
    return;
  }

  if (session.step === "await_kids_age") {
    const validOptions =
      lang === "uz" ? KIDS_AGE_OPTIONS_UZ : KIDS_AGE_OPTIONS_RU;

    if (!validOptions.includes(text)) {
      const options = validOptions;
      const msg =
        lang === "uz"
          ? "Iltimos, bolalar yoshi uchun variantlardan birini tanlang."
          : "Пожалуйста, выбери один из вариантов возраста детской одежды.";
      await sendMessage(chatId, msg, {
        reply_markup: {
          keyboard: [
            [{ text: options[0] }, { text: options[1] }],
            [{ text: options[2] }, { text: options[3] }],
            [{ text: options[4] }, { text: options[5] }],
            [{ text: options[6] }, { text: options[7] }],
            [
              {
                text:
                  lang === "uz"
                    ? "⬅️ Asosiy menyu"
                    : "⬅️ В главное меню"
              }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      return;
    }

    session.tmp.age = text;
    session.step = "await_pose";

    const msg =
      lang === "uz"
        ? "Model pozasini tanlang:"
        : "Выбери позу модели:";
    await sendMessage(chatId, msg, poseKeyboard(lang));
    return;
  }

  if (session.step === "await_pose") {
    session.tmp.pose = text;
    session.step = "await_background";

    const msg =
      lang === "uz"
        ? "Endi fonni tanlang:"
        : "Теперь выбери фон:";
    await sendMessage(chatId, msg, backgroundKeyboard(lang));
    return;
  }

  if (session.step === "await_background") {
    session.tmp.background = text;

    const shopForGen = await getShop(chatId);

    if (!shopForGen) {
      // на всякий случай — чувак мог успеть удалить магазин
      await runGuestGeneration(chatId, session, lang);
      return;
    }

    await runShopGeneration(chatId, session, shopForGen, lang);
    return;
  }

  // ======fallback======

  const kb = await getBaseKeyboard(chatId);
  const msg =
    lang === "uz"
      ? "Xabarni tushunmadim. Quyidagi tugmalarni ishlating 👇"
      : "Не понял сообщение. Используйте кнопки ниже 👇";
  await sendMessage(chatId, msg, kb);
}

// ====== CALLBACK'и ПОЛЬЗОВАТЕЛЯ (inline-кнопки тарифов / отправка чека / регистрация магазина) ======

async function handleUserCallback(chatId, data, callbackId) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  if (!data) return;

  // 🔹 Быстрая регистрация магазина после генерации
  if (data === "register_shop") {
    if (callbackId) await answerCallback(callbackId);

    session.step = "await_shop_name";
    session.tmp = session.tmp || {};

    const msg =
      lang === "uz"
        ? "Keling, do'konni 1–2 qadamda ro'yxatdan o'tkazamiz.\n\nDo'kon nomini yozing:"
        : "Давайте зарегистрируем магазин в 1–2 шага.\n\nНапишите название вашего магазина:";
    await sendMessage(chatId, msg, registrationKeyboard(lang));
    return;
  }

  // Открыть список тарифов
  if (data === "tariffs:select") {
    if (callbackId) await answerCallback(callbackId);

    const chooseText =
      lang === "uz" ? "Tarifni tanlang:" : "Выберите тариф:";

    const startText =
      lang === "uz"
        ? "Start — 100 ta generatsiya"
        : "Start — 100 генераций";
    const proText =
      lang === "uz"
        ? "Pro — 300 ta generatsiya"
        : "Pro — 300 генераций";
    const maxText =
      lang === "uz"
        ? "Max — 700 ta generatsiya"
        : "Max — 700 генераций";

    await sendMessage(chatId, chooseText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: startText, callback_data: "tariff:start" }],
          [{ text: proText, callback_data: "tariff:pro" }],
          [{ text: maxText, callback_data: "tariff:max" }]
        ]
      }
    });
    return;
  }

  // Подробности по конкретному тарифу
  if (data.startsWith("tariff:")) {
    const plan = data.split(":")[1];
    const text = getTariffPlanText(plan, lang);

    if (!text) {
      if (callbackId) {
        await answerCallback(
          callbackId,
          lang === "uz" ? "Noma'lum tarif" : "Неизвестный тариф",
          true
        );
      }
      return;
    }

    if (callbackId) await answerCallback(callbackId);

    const payButtonText =
      lang === "uz"
        ? "To'lov chekini yuborish"
        : "Отправить чек оплаты";
    const backButtonText =
      lang === "uz"
        ? "⬅️ Boshqa tarifni tanlash"
        : "⬅️ Выбрать другой тариф";

    await sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: payButtonText,
              callback_data: `tariff_pay:${plan}`
            }
          ],
          [
            {
              text: backButtonText,
              callback_data: "tariffs:select"
            }
          ]
        ]
      }
    });
    return;
  }

  // Начать сценарий отправки чека
  if (data.startsWith("tariff_pay:")) {
    const plan = data.split(":")[1];

    session.step = "await_payment_proof";
    session.tmp = session.tmp || {};
    session.tmp.paymentPlan = plan;

    if (callbackId) await answerCallback(callbackId);

    const msg =
      lang === "uz"
        ? "To'lov chekining skrinshotini yuboring YOKI qaysi kartadan to'langan bo'lsa, o'sha kartaning oxirgi 4 raqamini yozing.\n\nTekshiruvdan so'ng administrator sizning do'koningiz balansiga generatsiyalarni qo'shadi."
        : "Отправьте скриншот чека оплаты ИЛИ напишите последние 4 цифры карты, с которой была оплата.\n\nПосле проверки администратор начислит генерации на ваш магазин.";

    await sendMessage(chatId, msg);
    return;
  }
}

module.exports = {
  handleStart,
  handleMyShop,
  handleTariffs,
  handleHelp,
  handleStartGeneration,
  handleIncomingPhoto,
  handleTextMessage,
  handleUserCallback
};
