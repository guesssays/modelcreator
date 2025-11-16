// bot/validators.js

function normalize(str) {
  return (str || "").trim();
}

// instagram / telegram link / handle
function validateShopLink(inputRaw) {
  const input = normalize(inputRaw);
  if (!input) return { ok: false, value: null };

  const lower = input.toLowerCase();
  if (lower === "нет" || lower === "none" || lower === "-") {
    return { ok: true, value: "" };
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
  const phone = /^\+?\d[\d\s\-()]{7,}$/;

  if (telegramHandle.test(input) || phone.test(input)) {
    return { ok: true, value: input };
  }
  return { ok: false, value: null };
}

module.exports = {
  normalize,
  validateShopLink,
  validateContact
};
