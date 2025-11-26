// bot/texts.js

const CARD_NUMBER = "9860 1701 0389 2262";
const CARD_OWNER = "REDKO D.";

// ====== RU ======

const TARIFF_TEXT_RU = `
💳 Тарифы и пополнение

1 генерация = 1 кредит.

🔹 Trial
• Цена: 0 сум
• 10 генераций, чтобы протестировать сервис
• Активируется после автоматической проверки магазина

🔹 Start
• Цена: ~99 000 сум
• 100 генераций
• Подойдёт для небольших шоурумов и начинающих магазинов

🔹 Pro
• Цена: ~249 000 сум
• 300 генераций
• Для стабильных магазинов с регулярными съёмками

🔹 Max
• Цена: ~449 000 сум
• 700 генераций
• Для крупных магазинов/сетей и маркетплейсов

👇 Нажмите кнопку «Выбрать тариф» под этим сообщением, чтобы выбрать план и отправить чек об оплате прямо в бота.
`.trim();

const TARIFF_PLAN_TEXTS_RU = {
  start: `
💳 Тариф Start

• 100 генераций
• Подходит для небольших шоурумов и теста сервиса
• Удобный тариф для старта
• Цена: ~99 000 сум

Реквизиты для оплаты:
• Uzcard/Humo: ${CARD_NUMBER}
• Владелец: ${CARD_OWNER}

После оплаты нажмите кнопку «Отправить чек оплаты» ниже и прикрепите скриншот
или напишите последние 4 цифры карты, с которой оплачивали.
`.trim(),

  pro: `
💳 Тариф Pro

• 300 генераций
• Для стабильных магазинов с регулярными съёмками
• Подходит для контента на месяц вперёд
• Цена: ~249 000 сум

Реквизиты для оплаты:
• Uzcard/Humo: ${CARD_NUMBER}
• Владелец: ${CARD_OWNER}

После оплаты нажмите кнопку «Отправить чек оплаты» ниже и прикрепите скриншот
или напишите последние 4 цифры карты, с которой оплачивали.
`.trim(),

  max: `
💳 Тариф Max

• 700 генераций
• Для крупных магазинов, сетей и маркетплейсов
• Максимальная выгода по цене за 1 генерацию
• Цена: ~449 000 сум

Реквизиты для оплаты:
• Uzcard/Humo: ${CARD_NUMBER}
• Владелец: ${CARD_OWNER}

После оплаты нажмите кнопку «Отправить чек оплаты» ниже и прикрепите скриншот
или напишите последние 4 цифры карты, с которой оплачивали.
`.trim()
};

const HELP_TEXT_RU = `
Этот бот помогает владельцам магазинов одежды генерировать фото моделей с вашей одеждой.

Как пользоваться:
1️⃣ После активации нажмите "🎨 Генерировать".
2️⃣ Отправьте фото вещи.
3️⃣ Выберите тип вещи, формат (один человек или пара), пол/тип пары, возраст, позу и фон.
4️⃣ Получите готовые фото, которые можно использовать в соцсетях и на маркетплейсах.

Пополнение и тарифы:
• Нажмите кнопку «💳 Тарифы и цены», выберите тариф и отправьте чек прямо в бота.
• После проверки оплаты администратор начислит кредиты на ваш магазин.

Связаться с администратором сервиса:
• Telegram: @dcoredanil
`.trim();

// ====== UZ ======

const TARIFF_TEXT_UZ = `
💳 Tariflar va to'ldirish

1 generatsiya = 1 kredit.

🔹 Trial
• Narx: 0 so'm
• Xizmatni sinab ko'rish uchun 10 ta generatsiya
• Do'kon avtomatik tekshiruvdan o'tgandan so'ng faollashadi

🔹 Start
• Narx: ~99 000 so'm
• 100 ta generatsiya
• Kichik shourumlar va yangi do'konlar uchun

🔹 Pro
• Narx: ~249 000 so'm
• 300 ta generatsiya
• Doimiy kontent kerak bo'ladigan do'konlar uchun

🔹 Max
• Narx: ~449 000 so'm
• 700 ta generatsiya
• Katta do'konlar/tarmoqlar va marketplace'lar uchun

👇 Tarifni tanlash va chekni bot ichida yuborish uchun pastdagi «Tarifni tanlash» tugmasini bosing.
`.trim();

const TARIFF_PLAN_TEXTS_UZ = {
  start: `
💳 Start tarifi

• 100 ta generatsiya
• Kichik shourumlar va servisni sinab ko'rish uchun qulay
• Boshlash uchun eng mos tarif
• Narx: ~99 000 so'm

To'lov uchun rekvizitlar:
• Uzcard/Humo: ${CARD_NUMBER}
• Egasi: ${CARD_OWNER}

To'lovdan keyin pastdagi «To'lov chekini yuborish» tugmasini bosing
va chek skrinshotini yuboring yoki qaysi kartadan to'langanini ko'rsatib 4 ta oxirgi raqamni yozing.
`.trim(),

  pro: `
💳 Pro tarifi

• 300 ta generatsiya
• Doimiy kontent chiqaradigan do'konlar uchun
• Taxminan bir oyga yetadigan kontent hajmi
• Narx: ~249 000 so'm

To'lov uchun rekvizitlar:
• Uzcard/Humo: ${CARD_NUMBER}
• Egasi: ${CARD_OWNER}

To'lovdan keyin pastdagi «To'lov chekini yuborish» tugmasini bosing
va chek skrinshotini yuboring yoki kartaning oxirgi 4 raqamini yozing.
`.trim(),

  max: `
💳 Max tarifi

• 700 ta generatsiya
• Katta do'konlar, tarmoqlar va marketplace'lar uchun
• 1 ta generatsiya narxi bo'yicha eng foydali tarif
• Narx: ~449 000 so'm

To'lov uchun rekvizitlar:
• Uzcard/Humo: ${CARD_NUMBER}
• Egasi: ${CARD_OWNER}

To'lovdan keyin pastdagi «To'lov chekini yuborish» tugmasini bosing
va chek skrinshotini yuboring yoki kartaning oxirgi 4 raqamini yozing.
`.trim()
};

const HELP_TEXT_UZ = `
Bu bot kiyim do'konlari egalari uchun kiyimlaringiz asosida model fotosuratlarini yaratishga yordam beradi.

Qanday ishlaydi:
1️⃣ Botni ishga tushirgandan keyin "🎨 Rasm yaratish" tugmasini bosing.
2️⃣ Kiyimning fotosuratini yuboring.
3️⃣ Kiyim turini, formatini (bitta model yoki juftlik), jins/juftlik turini, yosh, poza va fonni tanlang.
4️⃣ Tayyor fotosuratlarni oling va ularni ijtimoiy tarmoqlarda va marketplace'larda ishlating.

To'ldirish va tariflar:
• «💳 Tariflar va narxlar» tugmasini bosing, tarifni tanlang va chekni to'g'ridan-to'g'ri botga yuboring.
• To'lov tekshirilgandan so'ng, administrator sizning do'koningizga kreditlar qo'shadi.

Xizmat administratoriga yozish:
• Telegram: @dcoredanil
`.trim();

// ====== API ======

function getTariffText(lang = "ru") {
  return lang === "uz" ? TARIFF_TEXT_UZ : TARIFF_TEXT_RU;
}

function getTariffPlanText(plan, lang = "ru") {
  const table = lang === "uz" ? TARIFF_PLAN_TEXTS_UZ : TARIFF_PLAN_TEXTS_RU;
  return table[plan] || null;
}

function getHelpText(lang = "ru") {
  return lang === "uz" ? HELP_TEXT_UZ : HELP_TEXT_RU;
}

module.exports = {
  CARD_NUMBER,
  CARD_OWNER,
  getTariffText,
  getTariffPlanText,
  getHelpText
};
