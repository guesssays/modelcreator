// bot/gemini.js

const { GEMINI_API_KEY, ADMIN_CHAT_ID } = require("./config");
const { sendMessage } = require("./telegram");

async function notifyGeminiError(message) {
  try {
    if (!ADMIN_CHAT_ID) return;
    const text = `❗ Ошибка Gemini\n\n${String(message).slice(0, 3500)}`;
    await sendMessage(ADMIN_CHAT_ID, text);
  } catch (e) {
    console.error("Failed to notify admin about Gemini error:", e);
  }
}

// Основная функция генерации с ретраем и логом
async function generateImageWithGemini(prompt, referenceImageBuffer) {
  const base64Image = referenceImageBuffer.toString("base64");

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64Image
            }
          }
        ]
      }
    ]
  };

  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY
          },
          body: JSON.stringify(body)
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("Gemini error:", res.status, text);
        throw new Error(`Gemini API error: ${res.status} ${text.slice(0, 500)}`);
      }

      const json = await res.json();

      let imageBase64 = null;
      const candidates = json.candidates || [];
      if (candidates.length > 0) {
        const parts = candidates[0].content?.parts || [];
        for (const part of parts) {
          const inline = part.inlineData || part.inline_data;
          if (inline?.data) {
            imageBase64 = inline.data;
            break;
          }
        }
      }

      if (!imageBase64) {
        console.error(
          "No image data in Gemini response",
          JSON.stringify(json).slice(0, 2000)
        );
        throw new Error("No image data from Gemini");
      }

      return Buffer.from(imageBase64, "base64");
    } catch (err) {
      lastError = err;
      console.error(`Gemini attempt ${attempt} failed:`, err);

      if (attempt === 2) {
        // отправляем лог админу и падаем
        await notifyGeminiError(err.message || String(err));
        throw err;
      }

      // небольшая пауза перед ретраем
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // теоретически не дойдём сюда
  throw lastError || new Error("Unknown Gemini error");
}

// --- Маппинги значений из бота в английский текст ---

function mapItemType(item) {
  switch (item) {
    case "Худи": return "hoodie";
    case "Свитшот": return "sweatshirt";
    case "Футболка": return "t-shirt";
    case "Куртка": return "jacket";
    case "Пальто": return "coat";
    case "Жилет": return "vest";
    case "Штаны": return "pants";
    case "Джинсы": return "jeans";
    case "Шорты": return "shorts";
    case "Платье": return "dress";
    case "Юбка": return "skirt";
    case "Костюм": return "suit";
    case "Обувь": return "shoes";
    case "Комплект": return "coordinated outfit set";
    case "Аксессуары": return "fashion accessories";
    default:
      return item || "clothing item";
  }
}

// ОБНОВЛЁННЫЕ позы (пока ориентируемся на русские варианты)
function mapPose(pose) {
  switch (pose) {
    case "Стоя, полный рост":
      return "standing full-body pose";
    case "По пояс":
      return "waist-up pose";
    case "В движении":
      return "dynamic walking pose";
    case "Сидя":
      return "seated pose";
    case "Полубоком":
      return "three-quarter standing pose, body slightly turned to the side";
    case "Руки в карманах":
      return "relaxed pose with hands in pockets, casual streetwear style";
    case "Скрестив руки":
      return "confident pose with arms crossed on the chest";
    case "Опираясь на стену":
      return "relaxed pose leaning against a wall";
    case "Крупный план (портрет)":
      return "close-up portrait framing the head and upper chest";
    default:
      return "natural, relaxed fashion pose";
  }
}

// ОБНОВЛЁННЫЕ фоны (ориентир по русским вариантам)
function mapBackground(bg) {
  switch (bg) {
    case "Чистый студийный фон":
      return "minimal clean studio background";
    case "Минималистичный светлый фон":
      return "minimal bright studio background with lots of negative space";
    case "Нейтральный градиентный фон":
      return "simple neutral gradient background with soft tones";
    case "Улица (день)":
      return "modern city street background in daytime with natural light";
    case "Улица (вечер / неон)":
      return "night city street background with neon lights and moody atmosphere";
    case "Интерьер (комната)":
      return "cozy modern room interior background";
    case "Лофт-интерьер":
      return "industrial loft interior background with concrete walls and big windows";
    case "Магазин одежды / шоурум":
      return "fashion clothing store showroom background with racks and spotlights";
    case "Кафе / кофейня":
      return "cozy coffee shop background with tables and warm lights";
    case "Подиум / фэшн-съёмка":
      return "fashion runway / editorial background";
    default:
      return "simple neutral background";
  }
}

// Сборка промпта
function buildPromptFromSession(session) {
  const t = session.tmp || {};

  const peopleMode = t.peopleMode === "pair" ? "pair" : "single";
  const ageText = t.age || "young adult";

  let subjectText;
  if (peopleMode === "pair") {
    const pair = t.pairType || "Парень — девушка";
    const lower = pair.toLowerCase();
    if (lower.includes("парень") && lower.includes("девушка")) {
      subjectText = "a fashion couple: one male and one female model";
    } else if (lower.includes("парень")) {
      subjectText = "two male fashion models";
    } else if (lower.includes("девушка")) {
      subjectText = "two female fashion models";
    } else {
      subjectText = "two fashion models";
    }
  } else {
    if (t.gender === "Мужчина") {
      subjectText = "a male fashion model";
    } else if (t.gender === "Женщина") {
      subjectText = "a female fashion model";
    } else {
      subjectText = "a fashion model";
    }
  }

  const itemText = mapItemType(t.itemType || "clothing item");
  const poseText = mapPose(t.pose);
  const bgText = mapBackground(t.background);

  const firstLine =
    peopleMode === "pair"
      ? `A photorealistic vertical photo of ${subjectText}, ${ageText}, both wearing the reference ${itemText}.`
      : `A photorealistic vertical portrait of ${subjectText}, ${ageText}, wearing the reference ${itemText}.`;

  const subjectPronoun = peopleMode === "pair" ? "models are" : "model is";

  const prompt = `
${firstLine}
The ${subjectPronoun} in a ${poseText}, clearly showing how the clothes fit on the body.
Scene: ${bgText}.
Soft professional fashion lighting, high-quality editorial photography, Instagram-ready 4:5 format.
Clothing, fit and fabric folds must follow the reference garment exactly.
`.trim();

  return prompt;
}

module.exports = {
  generateImageWithGemini,
  buildPromptFromSession
};
