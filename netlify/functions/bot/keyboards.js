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

// Активный магазин
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

// Динамическая клавиатура
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

// Клавиатуры шагов генерации
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

module.exports = {
  registrationKeyboard,
  pendingKeyboard,
  blockedKeyboard,
  activeShopKeyboard,
  adminKeyboard,
  getBaseKeyboard,
  itemTypeKeyboard,
  genderKeyboard,
  poseKeyboard,
  backgroundKeyboard
};
