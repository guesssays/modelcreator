// bot/keyboards.js
const { ADMIN_CHAT_ID } = require("./config");
const { getShop } = require("./store");

// Этап регистрации
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

// Магазин pending
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

// Магазин заблокирован
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

// Активный магазин — главная клавиатура (без удаления)
function activeShopKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [
          { text: "🎨 Генерировать" },
          { text: "🏬 Мой магазин" }
        ],
        [{ text: "💳 Тарифы и цены" }],
        [{ text: "ℹ️ Помощь" }]
      ],
      resize_keyboard: true
    }
  };
}

// Клавиатура внутри раздела "Мой магазин"
function myShopKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🎨 Генерировать" }],
        [{ text: "🗑 Удалить магазин" }],
        [{ text: "⬅️ В главное меню" }]
      ],
      resize_keyboard: true
    }
  };
}

// Админ-панель
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

// Динамическая клавиатура (теперь async)
async function getBaseKeyboard(chatId) {
  if (ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID)) {
    return adminKeyboard();
  }
  const shop = await getShop(chatId);
  if (!shop) return registrationKeyboard();
  if (shop.status === "pending") return pendingKeyboard();
  if (shop.status === "blocked") return blockedKeyboard();
  return activeShopKeyboard();
}

// Клавиатуры шагов генерации

function itemTypeKeyboard() {
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

function peopleModeKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Один человек" }, { text: "Пара" }],
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
        [{ text: "Мужчина" }, { text: "Женщина" }],
        [{ text: "⬅️ В главное меню" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

function pairTypeKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Парень — парень" }, { text: "Парень — девушка" }],
        [{ text: "Девушка — девушка" }],
        [{ text: "⬅️ В главное меню" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

// ОБНОВЛЁННАЯ клавиатура поз
function poseKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Стоя, полный рост" }, { text: "По пояс" }],
        [{ text: "В движении" }, { text: "Сидя" }],
        [{ text: "Полубоком" }, { text: "Руки в карманах" }],
        [{ text: "Скрестив руки" }, { text: "Опираясь на стену" }],
        [{ text: "Крупный план (портрет)" }],
        [{ text: "⬅️ В главное меню" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

// ОБНОВЛЁННАЯ клавиатура фонов
function backgroundKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "Чистый студийный фон" }, { text: "Минималистичный светлый фон" }],
        [{ text: "Нейтральный градиентный фон" }],
        [{ text: "Улица (день)" }, { text: "Улица (вечер / неон)" }],
        [{ text: "Интерьер (комната)" }, { text: "Лофт-интерьер" }],
        [{ text: "Магазин одежды / шоурум" }, { text: "Кафе / кофейня" }],
        [{ text: "Подиум / фэшн-съёмка" }],
        [{ text: "⬅️ В главное меню" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  };
}

module.exports = {
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
