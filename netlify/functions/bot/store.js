// bot/store.js

const {
  TRIAL_CREDITS,
  DAILY_LIMIT_BY_PLAN,
  DEFAULT_DAILY_LIMIT
} = require("./config");

const { getStore, connectLambda } = require("@netlify/blobs");

// Ленивая инициализация хранилища Blobs
let blobStore = null;

const sessions = {}; // состояния диалогов по chatId (можно не сохранять, это временное)
let shops = {};      // магазины по chatId
let shopsLoaded = false;

// Вызываем ОДИН РАЗ на каждый запуск Lambda из handler
function initBlobStore(event) {
  if (blobStore) return; // уже инициализировано

  try {
    // Настраиваем окружение Blobs для Netlify Functions v1
    connectLambda(event);

    // Открываем стор (siteID / token Netlify пробросит сам)
    blobStore = getStore("wrape-shops");
    console.log("Netlify Blobs store 'wrape-shops' initialized");
  } catch (e) {
    console.error("Failed to init Netlify Blobs store:", e);
    throw e;
  }
}

function ensureStore() {
  if (!blobStore) {
    throw new Error(
      "Blob store is not initialized. Call initBlobStore(event) in your function handler before using store methods."
    );
  }
}

function getToday() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ---------- Загрузка/сохранение магазинов в Blobs ----------

async function loadShops() {
  ensureStore();
  if (shopsLoaded) return;
  try {
    const data = await blobStore.get("shops.json", { type: "json" });
    if (data && typeof data === "object") {
      shops = data;
    } else {
      shops = {};
    }
  } catch (e) {
    console.error("Failed to load shops from Netlify Blobs:", e);
    shops = {};
  }
  shopsLoaded = true;
}

async function saveShops() {
  ensureStore();
  try {
    await blobStore.set("shops.json", JSON.stringify(shops || {}), {
      contentType: "application/json"
    });
  } catch (e) {
    console.error("Failed to save shops to Netlify Blobs:", e);
  }
}

// ---------- Сессии (остаются в памяти, это нормально) ----------

function getSession(chatId) {
  if (!sessions[chatId]) {
    sessions[chatId] = {
      step: "idle",
      tmp: {}
    };
  }
  return sessions[chatId];
}

// ---------- Работа с магазинами (уже с учётом Blobs) ----------

async function getShop(chatId) {
  await loadShops();
  const shop = shops[chatId] || null;
  if (shop && !shop.status) {
    shop.status = "active";
  }
  return shop;
}

// Создаём магазин со статусом pending
async function createShop(chatId, { name, instagram, contact }) {
  await loadShops();
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
  await saveShops();
  return shop;
}

async function deleteShop(chatId) {
  await loadShops();
  if (shops[chatId]) {
    console.log("Shop deleted:", shops[chatId]);
    delete shops[chatId];
    await saveShops();
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

// план -> дневной лимит
function getDailyLimitForPlan(plan) {
  // Ограничиваем только пробный тариф,
  // для платных — фактически без дневного лимита
  if (plan === "trial") {
    return DAILY_LIMIT_BY_PLAN.trial || DEFAULT_DAILY_LIMIT;
  }

  // Практически бесконечный лимит на день
  return Number.MAX_SAFE_INTEGER;
}

async function listShopsByStatus(status) {
  await loadShops();
  return Object.values(shops).filter((s) => s.status === status);
}

async function listAllShops() {
  await loadShops();
  return Object.values(shops);
}

// Админские утилиты

async function addCreditsToShop(chatId, credits) {
  await loadShops();
  const shop = shops[chatId];
  if (!shop) return null;
  shop.creditsTotal += credits;
  shop.creditsLeft += credits;
  await saveShops();
  return shop;
}

async function setShopPlan(chatId, plan) {
  await loadShops();
  const shop = shops[chatId];
  if (!shop) return null;
  shop.plan = plan;
  await saveShops();
  return shop;
}

async function persistShop(shop) {
  await loadShops();
  shops[shop.chatId] = shop;
  await saveShops();
}

module.exports = {
  initBlobStore,          // <-- важно вызывать из handler
  getToday,
  getSession,
  getShop,
  createShop,
  deleteShop,
  ensureDailyCounters,
  getDailyLimitForPlan,
  listShopsByStatus,
  listAllShops,
  addCreditsToShop,
  setShopPlan,
  persistShop,
  TRIAL_CREDITS
};
