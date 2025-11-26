// bot/keyboards.js
const { ADMIN_CHAT_ID } = require("./config");
const { getShop, getSession } = require("./store");

// Клавиатура выбора языка при старте / смене языка
function languageSelectKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Русский 🇷🇺" }, { text: "O'zbekcha 🇺🇿" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

// Этап регистрации
function registrationKeyboard(lang = "ru") {
  const helpText = lang === "uz" ? "ℹ️ Yordam" : "ℹ️ Помощь";

  return {
    reply_markup: {
      keyboard: [[{ text: helpText }]],
      resize_keyboard: true
    }
  };
}

// Магазин pending
function pendingKeyboard(lang = "ru") {
  const myShop =
    lang === "uz" ? "🏬 Mening do'konim" : "🏬 Мой магазин";
  const helpText = lang === "uz" ? "ℹ️ Yordam" : "ℹ️ Помощь";
  const langBtn = lang === "uz" ? "🌐 Til" : "🌐 Язык";

  return {
    reply_markup: {
      keyboard: [
        [{ text: myShop }],
        [{ text: helpText }],
        [{ text: langBtn }]
      ],
      resize_keyboard: true
    }
  };
}

// Магазин заблокирован
function blockedKeyboard(lang = "ru") {
  const myShop =
    lang === "uz" ? "🏬 Mening do'konim" : "🏬 Мой магазин";
  const helpText = lang === "uz" ? "ℹ️ Yordam" : "ℹ️ Помощь";
  const langBtn = lang === "uz" ? "🌐 Til" : "🌐 Язык";

  return {
    reply_markup: {
      keyboard: [
        [{ text: myShop }],
        [{ text: helpText }],
        [{ text: langBtn }]
      ],
      resize_keyboard: true
    }
  };
}

// Активный магазин — главная клавиатура (без удаления)
function activeShopKeyboard(lang = "ru") {
  const generate =
    lang === "uz" ? "🎨 Rasm yaratish" : "🎨 Генерировать";
  const myShop =
    lang === "uz" ? "🏬 Mening do'konim" : "🏬 Мой магазин";
  const tariffs =
    lang === "uz" ? "💳 Tariflar va narxlar" : "💳 Тарифы и цены";
  const helpText = lang === "uz" ? "ℹ️ Yordam" : "ℹ️ Помощь";
  const langBtn = lang === "uz" ? "🌐 Til" : "🌐 Язык";

  return {
    reply_markup: {
      keyboard: [
        [{ text: generate }, { text: myShop }],
        [{ text: tariffs }],
        [{ text: helpText }],
        [{ text: langBtn }]
      ],
      resize_keyboard: true
    }
  };
}

// Клавиатура внутри раздела "Мой магазин"
function myShopKeyboard(lang = "ru") {
  const generate =
    lang === "uz" ? "🎨 Rasm yaratish" : "🎨 Генерировать";
  const deleteShop =
    lang === "uz" ? "🗑 Do'konni o'chirish" : "🗑 Удалить магазин";
  const backMain =
    lang === "uz"
      ? "⬅️ Asosiy menyu"
      : "⬅️ В главное меню";

  return {
    reply_markup: {
      keyboard: [
        [{ text: generate }],
        [{ text: deleteShop }],
        [{ text: backMain }]
      ],
      resize_keyboard: true
    }
  };
}

// Админ-панель (оставим по-русски)
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

// Динамическая клавиатура (async) — учитываем язык магазина/сессии
async function getBaseKeyboard(chatId) {
  if (ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID)) {
    return adminKeyboard();
  }

  const shop = await getShop(chatId);
  const session = getSession(chatId);
  const lang = (shop && shop.language) || session.language || "ru";

  if (!shop) return registrationKeyboard(lang);
  if (shop.status === "pending") return pendingKeyboard(lang);
  if (shop.status === "blocked") return blockedKeyboard(lang);
  return activeShopKeyboard(lang);
}

// Клавиатуры шагов генерации

function itemTypeKeyboard(lang = "ru") {
  if (lang === "uz") {
    return {
      reply_markup: {
        keyboard: [
          [{ text: "Xudi" }, { text: "Svitshot" }, { text: "Futbolka" }],
          [{ text: "Kurtka" }, { text: "Palto" }, { text: "Jilet" }],
          [{ text: "Shim" }, { text: "Jinsi" }, { text: "Shorti" }],
          [{ text: "Koylak" }, { text: "Yubka" }, { text: "Kostyum" }],
          [{ text: "Oyoq kiyim" }, { text: "Komplekt" }, { text: "Aksessuarlar" }],
          [{ text: "⬅️ Asosiy menyu" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
  }

  // ru
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Худи" }, { text: "Свитшот" }, { text: "Футболка" }],
        [{ text: "Куртка" }, { text: "Пальто" }, { text: "Жилет" }],
        [{ text: "Штаны" }, { text: "Джинсы" }, { text: "Шорты" }],
        [{ text: "Платье" }, { text: "Юбка" }, { text: "Костюм" }],
        [{ text: "Обувь" }, { text: "Комплект" }, { text: "Аксессуары" }],
        [{ text: "⬅️ В главное меню" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function peopleModeKeyboard(lang = "ru") {
  const one =
    lang === "uz" ? "Bitta model" : "Один человек";
  const pair =
    lang === "uz" ? "Juftlik" : "Пара";
  const back =
    lang === "uz"
      ? "⬅️ Asosiy menyu"
      : "⬅️ В главное меню";

  return {
    reply_markup: {
      keyboard: [
        [{ text: one }, { text: pair }],
        [{ text: back }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function genderKeyboard(lang = "ru") {
  const man = lang === "uz" ? "Erkak" : "Мужчина";
  const woman = lang === "uz" ? "Ayol" : "Женщина";
  const back =
    lang === "uz"
      ? "⬅️ Asosiy menyu"
      : "⬅️ В главное меню";

  return {
    reply_markup: {
      keyboard: [
        [{ text: man }, { text: woman }],
        [{ text: back }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function pairTypeKeyboard(lang = "ru") {
  const p1 =
    lang === "uz" ? "Yigit — yigit" : "Парень — парень";
  const p2 =
    lang === "uz" ? "Yigit — qiz" : "Парень — девушка";
  const p3 =
    lang === "uz" ? "Qiz — qiz" : "Девушка — девушка";
  const back =
    lang === "uz"
      ? "⬅️ Asosiy menyu"
      : "⬅️ В главное меню";

  return {
    reply_markup: {
      keyboard: [
        [{ text: p1 }, { text: p2 }],
        [{ text: p3 }],
        [{ text: back }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

// ОБНОВЛЁННАЯ клавиатура поз
function poseKeyboard(lang = "ru") {
  const back =
    lang === "uz"
      ? "⬅️ Asosiy menyu"
      : "⬅️ В главное меню";

  if (lang === "uz") {
    return {
      reply_markup: {
        keyboard: [
          [{ text: "Tik turgan, bo'yi to'liq" }, { text: "Belgacha" }],
          [{ text: "Harakatda" }, { text: "O'tirgan" }],
          [{ text: "Yarim yon tomondan" }, { text: "Qo'llar cho'ntakda" }],
          [{ text: "Qo'llar ko'krakda chalishtirilgan" }, { text: "Devorga suyanib" }],
          [{ text: "Yaqin kadr (portret)" }],
          [{ text: back }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
  }

  // ru
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Стоя, полный рост" }, { text: "По пояс" }],
        [{ text: "В движении" }, { text: "Сидя" }],
        [{ text: "Полубоком" }, { text: "Руки в карманах" }],
        [{ text: "Скрестив руки" }, { text: "Опираясь на стену" }],
        [{ text: "Крупный план (портрет)" }],
        [{ text: back }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

// ОБНОВЛЁННАЯ клавиатура фонов
function backgroundKeyboard(lang = "ru") {
  const back =
    lang === "uz"
      ? "⬅️ Asosiy menyu"
      : "⬅️ В главное меню";

  if (lang === "uz") {
    return {
      reply_markup: {
        keyboard: [
          [{ text: "Toza studiya foni" }, { text: "Minimalistik yorug' fon" }],
          [{ text: "Neytral gradient fon" }],
          [{ text: "Ko'cha (kun)" }, { text: "Ko'cha (kechqurun / neon)" }],
          [{ text: "Interyer (xonada)" }, { text: "Loft-interyer" }],
          [{ text: "Kiyim do'koni / shourum" }, { text: "Kafe / qahvaxona" }],
          [{ text: "Podyum / moda suratga olish" }],
          [{ text: back }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
  }

  // ru
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Чистый студийный фон" }, { text: "Минималистичный светлый фон" }],
        [{ text: "Нейтральный градиентный фон" }],
        [{ text: "Улица (день)" }, { text: "Улица (вечер / неон)" }],
        [{ text: "Интерьер (комната)" }, { text: "Лофт-интерьер" }],
        [{ text: "Магазин одежды / шоурум" }, { text: "Кафе / кофейня" }],
        [{ text: "Подиум / фэшн-съёмка" }],
        [{ text: back }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

module.exports = {
  languageSelectKeyboard,
  registrationKeyboard,
  pendingKeyboard,
  blockedKeyboard,
  activeShopKeyboard,
  myShopKeyboard,
  adminKeyboard,
  getBaseKeyboard,
  itemTypeKeyboard,
  peopleModeKeyboard,
  genderKeyboard,
  pairTypeKeyboard,
  poseKeyboard,
  backgroundKeyboard
};
