// bot/store.js
const {
  TRIAL_CREDITS,
  DAILY_LIMIT_BY_PLAN,
  DEFAULT_DAILY_LIMIT
} = require("./config");

const sessions = {}; // состояния диалогов по chatId
const shops = {};    // магазины по chatId (по одному магазину на аккаунт Telegram)

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
  if (shop && !shop.status) {
    shop.status = "active";
  }
  return shop;
}

// Создаём магазин со статусом pending
function createShop(chatId, { name, instagram, contact }) {
  const today = getToday();
  const shop = {
    id: String(chatId),
    chatId,
    name,
    instagram,
    contact,
    status: "pending",      // pending | active | blocked
    plan: "trial",
    creditsTotal: 0,
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

// Удалить магазин по chatId
function deleteShop(chatId) {
  if (shops[chatId]) {
    delete shops[chatId];
    console.log("Shop deleted for chatId:", chatId);
    return true;
  }
  return false;
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

function listShopsByStatus(status) {
  return Object.values(shops).filter((s) => s.status === status);
}

function listAllShops() {
  return Object.values(shops);
}

module.exports = {
  getToday,
  getSession,
  getShop,
  createShop,
  deleteShop,
  ensureDailyCounters,
  getDailyLimitForPlan,
  listShopsByStatus,
  listAllShops,
  TRIAL_CREDITS
};
