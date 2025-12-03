// bot/userHandlers.js
const { ADMIN_CHAT_ID, COOLDOWN_MS } = require("./config");
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
  languageSelectKeyboard
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

// /start
async function handleStart(chatId) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);

  // Если магазина нет — сначала выбор языка
  if (!shop) {
    if (!session.language) {
      session.step = "await_language";
      session.tmp = {};
      await sendMessage(
        chatId,
        "Выберите язык / Tilni tanlang:",
        languageSelectKeyboard()
      );
      return;
    }

    const lang = session.language || "ru";
    session.step = "await_shop_name";
    session.tmp = {};

    const text =
      lang === "uz"
        ? "Salom! 👋 Men sizning kiyimlaringizdan model fotosuratlar yaratib beradigan botman.\n\nAvval do'konni ro'yxatdan o'tkazamiz.\n\nKiyim do'koningiz nomini yozing:"
        : "Привет! 👋 Я бот, который генерирует профессиональные фото моделей с вашей одеждой.\n\nДавайте начнём с регистрации.\n\nНапишите название вашего магазина одежды:";

    await sendMessage(chatId, text, registrationKeyboard(lang));
    return;
  }

  const lang = getLang(chatId, session, shop);

  session.step = "idle";
  session.tmp = {};
  ensureDailyCounters(shop);

  const kb = await getBaseKeyboard(chatId);

  if (shop.status === "pending") {
    const text =
      lang === "uz"
        ? `Yana salom, ${shop.name}! 👋\n\nSizning arizangiz tizim tomonidan avtomatik tekshiruvdan o'tmoqda.\nTekshiruv muvaffaqiyatli yakunlangach, siz ${TRIAL_CREDITS} ta bepul generatsiya olasiz.\n\nHolatni ko'rish uchun «🏬 Mening do'konim» tugmasini bosing.`
        : `Снова привет, ${shop.name}! 👋\n\nВаша заявка принята системой и проходит автоматическую проверку.\nПосле успешной проверки вы получите ${TRIAL_CREDITS} пробных генераций.\n\nНажмите «🏬 Мой магазин», чтобы посмотреть статус.`;

    await sendMessage(chatId, text, kb);
    return;
  }

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

// "Мой магазин"
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

Ro'yxatdan o'tgan sana: ${shop.createdAt.split("T")[0]}
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

Дата регистрации: ${shop.createdAt.split("T")[0]}
`.trim();

  await sendMessage(chatId, stats, myShopKeyboard(lang));
}

// Тарифы — теперь с кнопкой "Выбрать тариф"
async function handleTariffs(chatId) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  const text = getTariffText(lang);

  const chooseText =
    lang === "uz" ? "📌 Tarifni tanlash" : "📌 Выбрать тариф";

  await sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: chooseText, callback_data: "tariffs:select" }]
      ]
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

// Старт генерации
async function handleStartGeneration(chatId) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  if (!shop) {
    session.step = "await_shop_name";
    session.tmp = {};
    const text =
      lang === "uz"
        ? "Avval do'konni ro'yxatdan o'tkazing.\n\nKiyim do'koningiz nomini yozing:"
        : "Сначала зарегистрируйте магазин.\n\nНапишите название вашего магазина одежды:";
    await sendMessage(chatId, text, registrationKeyboard(lang));
    return;
  }

  const kb = await getBaseKeyboard(chatId);

  if (shop.status === "pending") {
    const text =
      lang === "uz"
        ? "Sizning arizangiz hali tizim tomonidan avtomatik tekshiruvdan o'tmagan.\nTekshiruv muvaffaqiyatli yakunlangach, siz bepul generatsiyalarni olasiz va servisni sinab ko'rasiz."
        : "Ваша заявка ещё не прошла автоматическую проверку системой.\nПосле успешной проверки вы получите пробные генерации и сможете протестировать сервис.";
    await sendMessage(chatId, text, kb);
    return;
  }

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

// Фото
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
              text: lang === "uz" ? "✅ To'lovni tasdiqlash" : "✅ Подтвердить оплату",
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

  // === Обычное фото для генерации ===
  if (session.step !== "await_photo") {
    const kb = await getBaseKeyboard(chatId);
    const text =
      lang === "uz"
        ? "Avval menyudan «🎨 Rasm yaratish» tugmasini bosing."
        : "Сначала нажмите «🎨 Генерировать» в меню, чтобы запустить сценарий.";
    await sendMessage(chatId, text, kb);
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
  session.tmp.photoFileId = fileId;
  session.step = "await_item_type";

  const text =
    lang === "uz"
      ? "Ajoyib! Bu qanday kiyim?"
      : "Отлично! Что это за вещь?";

  await sendMessage(chatId, text, itemTypeKeyboard(lang));
}

// Тексты (общий вход)
async function handleTextMessage(chatId, text) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  const KIDS_LABEL_RU = "Детская одежда";
  const KIDS_LABEL_UZ = "Bolalar kiyimi";

  const KIDS_AGE_OPTIONS_RU = ["До 10 лет", "10-12", "12-14", "14-16"];
  const KIDS_AGE_OPTIONS_UZ = ["10 yoshgacha", "10-12", "12-14", "14-16"];

  // Админ
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

  // Выбор языка (шаг await_language)
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

    // Если магазина ещё нет — сразу в регистрацию
    session.step = "await_shop_name";
    session.tmp = {};
    const msg =
      newLang === "uz"
        ? "Salom! 👋 Men sizning kiyimlaringizdan model fotosuratlar yaratib beradigan botman.\n\nAvval do'konni ro'yxatdan o'tkazamiz.\n\nKiyim do'koningiz nomini yozing:"
        : "Привет! 👋 Я бот, который генерирует профессиональные фото моделей с вашей одеждой.\n\nДавайте начнём с регистрации.\n\nНапишите название вашего магазина одежды:";
    await sendMessage(chatId, msg, registrationKeyboard(newLang));
    return;
  }

  // Кнопка "назад в главное меню"
  if (
    text === "⬅️ В главное меню" ||
    text === "⬅️ Asosiy menyu"
  ) {
    session.step = "idle";
    session.tmp = {};
    const kb = await getBaseKeyboard(chatId);
    const msg =
      lang === "uz"
        ? "Asosiy menyu:"
        : "Главное меню:";
    await sendMessage(chatId, msg, kb);
    return;
  }

  // Смена языка из главного меню
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

  // Команды / базовые кнопки
  if (text === "/start") {
    await handleStart(chatId);
    return;
  }

  if (
    text === "🎨 Генерировать" ||
    text === "🎨 Rasm yaratish"
  ) {
    await handleStartGeneration(chatId);
    return;
  }

  if (
    text === "💳 Тарифы и цены" ||
    text === "💳 Tariflar va narxlar"
  ) {
    await handleTariffs(chatId);
    return;
  }

  if (
    text === "ℹ️ Помощь" ||
    text === "ℹ️ Yordam"
  ) {
    await handleHelp(chatId);
    return;
  }

  if (
    text === "🏬 Мой магазин" ||
    text === "🏬 Mening do'konim"
  ) {
    await handleMyShop(chatId);
    return;
  }

  // Удаление магазина (кнопка внутри раздела "Мой магазин")
  if (
    text === "🗑 Удалить магазин" ||
    text === "🗑 Do'konni o'chirish"
  ) {
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
      lang === "uz"
        ? "✅ Ha, o'chirish"
        : "✅ Да, удалить";
    const cancelText =
      lang === "uz"
        ? "❌ Bekor qilish"
        : "❌ Отмена";

    const question =
      lang === "uz"
        ? `Rostdan ham «${shopToDelete.name}» do'konini o'chirmoqchimisiz?\n\n«${yesText}» yoki «${cancelText}» tugmasini bosing.`
        : `Вы уверены, что хотите удалить магазин «${shopToDelete.name}»?\n\nНажмите «${yesText}» или «${cancelText}».`;

    await sendMessage(chatId, question, {
      reply_markup: {
        keyboard: [
          [{ text: yesText }],
          [{ text: cancelText }]
        ],
        resize_keyboard: true
      }
    });
    return;
  }

  // Подтверждение удаления магазина
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
          lang === "uz"
            ? "Do'kon topilmadi."
            : "Магазин не найден.";
        await sendMessage(chatId, msg, kb);
      }
      return;
    }

    // Любой другой ответ — отмена
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

    // Если что-то другое — тоже просто отменяем
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

  // === ЧЕК ОПЛАТЫ (текст: последние 4 цифры, комментарий и т.п.) ===
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

    await sendMessage(
      ADMIN_CHAT_ID,
      adminText,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: lang === "uz" ? "✅ To'lovni tasdiqlash" : "✅ Подтвердить оплату",
                callback_data: `pay_confirm:${plan}:${shopForPay.chatId}`
              },
              {
                text: lang === "uz" ? "❌ Rad etish" : "❌ Отклонить",
                callback_data: `pay_reject:${shopForPay.chatId}`
              }
            ]
          ]
        }
      }
    );

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

  // === Регистрация магазина ===
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
      name: session.tmp.shopName || "Без названия",
      instagram: session.tmp.shopInstagram || "",
      contact: session.tmp.shopContact || "",
      language: lang
    };

    const newShop = await createShop(chatId, shopData);

    session.step = "idle";
    session.tmp = {};

    const kb = await getBaseKeyboard(chatId);
    const msg =
      lang === "uz"
        ? `Hammasi tayyor! Biz sizning «${newShop.name}» do'koningizni ro'yxatdan o'tkazdik.\n\nArizangiz tizimga yuborildi va avtomatik tekshiruvdan o'tadi.\nTekshiruv muvaffaqiyatli tugagach siz ${TRIAL_CREDITS} ta bepul generatsiya olasiz va bot bu haqida xabar beradi.`
        : `Готово! Мы зарегистрировали ваш магазин «${newShop.name}».\n\nЗаявка принята и отправлена на проверку.\nПосле успешной проверки вы получите ${TRIAL_CREDITS} пробных генераций, и бот уведомит вас.`;

    await sendMessage(chatId, msg, kb);

    await notifyAdminNewShop(newShop);
    return;
  }

  // === Сценарий генерации ===
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
    // Если выбрали категорию детской одежды — переходим на подвыбор возрастов
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

    // Обычный взрослый возраст
    session.tmp.age = text;
    session.step = "await_pose";

    const msg =
      lang === "uz"
        ? "Model pozasini tanlang:"
        : "Выбери позу модели:";
    await sendMessage(chatId, msg, poseKeyboard(lang));
    return;
  }

  // Новый шаг: выбор конкретного детского возраста
  if (session.step === "await_kids_age") {
    const validOptions =
      lang === "uz" ? KIDS_AGE_OPTIONS_UZ : KIDS_AGE_OPTIONS_RU;

    if (!validOptions.includes(text)) {
      const msg =
        lang === "uz"
          ? "Iltimos, bolalar yoshi uchun variantlardan birini tanlang."
          : "Пожалуйста, выбери один из вариантов возраста детской одежды.";
      await sendMessage(chatId, msg, {
        reply_markup: {
          keyboard: [
            [{ text: validOptions[0] }, { text: validOptions[1] }],
            [{ text: validOptions[2] }, { text: validOptions[3] }],
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

    // Сохраняем выбранный детский возраст
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
    const kb = await getBaseKeyboard(chatId);

    if (!shopForGen) {
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
    if (shopForGen.lastGeneratedAt && now - shopForGen.lastGeneratedAt < COOLDOWN_MS) {
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

      const imageBuffer = await generateImageWithGemini(
        prompt,
        photoBuffer
      );

      shopForGen.creditsLeft = Math.max(0, shopForGen.creditsLeft - 1);
      ensureDailyCounters(shopForGen);
      shopForGen.generatedToday += 1;
      shopForGen.lastGeneratedAt = Date.now();
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

    return;
  }

  // fallback
  const kb = await getBaseKeyboard(chatId);
  const msg =
    lang === "uz"
      ? "Xabarni tushunmadim. Quyidagi tugmalarni ishlating 👇"
      : "Не понял сообщение. Используйте кнопки ниже 👇";
  await sendMessage(chatId, msg, kb);
}

// ====== CALLBACK'и ПОЛЬЗОВАТЕЛЯ (inline-кнопки тарифов / отправка чека) ======

async function handleUserCallback(chatId, data, callbackId) {
  const session = getSession(chatId);
  const shop = await getShop(chatId);
  const lang = getLang(chatId, session, shop);

  if (!data) return;

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
