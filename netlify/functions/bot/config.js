// bot/config.js

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

// Настройки кредитов/лимитов
// 1 генерация ≈ 1 кредит
const TRIAL_CREDITS = 10;

// 🔹 реферальные бонусы
const REF_BONUS_FOR_REFERRER = 5; // сколько даём пригласившему
const REF_BONUS_FOR_INVITED = 5;  // сколько даём приглашённому магазину

const DAILY_LIMIT_BY_PLAN = {
  trial: 20,  // можно протестить
  start: 150, // малый магазин
  pro: 400,   // средний
  max: 1000   // крупный, на будущее
};

const DEFAULT_DAILY_LIMIT = 20;
const COOLDOWN_MS = 10_000; // 10 секунд

module.exports = {
  TELEGRAM_TOKEN,
  GEMINI_API_KEY,
  WEBHOOK_SECRET,
  ADMIN_CHAT_ID,
  TELEGRAM_API,
  TELEGRAM_FILE_API,
  TRIAL_CREDITS,
  DAILY_LIMIT_BY_PLAN,
  DEFAULT_DAILY_LIMIT,
  COOLDOWN_MS,
  REF_BONUS_FOR_REFERRER,
  REF_BONUS_FOR_INVITED
};
