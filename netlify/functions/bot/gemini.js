// bot/gemini.js
const { GEMINI_API_KEY } = require("./config");

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
    throw new Error("Gemini API error");
  }

  const json = await res.json();

  let imageBase64 = null;
  const candidates = json.candidates || [];
  if (candidates.length > 0) {
    const parts = candidates[0].content?.parts || [];
    for (const part of parts) {
      if (part.inline_data?.data) {
        imageBase64 = part.inline_data.data;
        break;
      }
    }
  }

  if (!imageBase64) {
    console.error("No image data in Gemini response", JSON.stringify(json));
    throw new Error("No image data from Gemini");
  }

  return Buffer.from(imageBase64, "base64");
}

// Сборка промпта
function buildPromptFromSession(session) {
  const t = session.tmp || {};

  const genderText =
    t.gender === "Мужчина"
      ? "a male fashion model"
      : t.gender === "Женщина"
      ? "a female fashion model"
      : "a unisex fashion model";

  const ageText = t.age || "young adult";
  const poseText = t.pose || "standing";

  const bgText =
    t.background === "Чистый студийный фон"
      ? "minimal clean studio background"
      : t.background === "Улица города"
      ? "modern city street background"
      : t.background === "Интерьер (комната)"
      ? "cozy interior room background"
      : t.background === "Подиум / фэшн-съёмка"
      ? "fashion runway / editorial background"
      : "simple neutral background";

  const itemType = t.itemType || "clothing item";

  const prompt = `
A photorealistic portrait of ${genderText}, ${ageText}, wearing the reference ${itemType}.
The model is in a ${poseText} pose, showing how the clothes fit on the body.
Scene: ${bgText}.
Soft professional fashion lighting, high-quality editorial photography, Instagram-ready, vertical format.
Clothing and folds must follow the reference garment.
`.trim();

  return prompt;
}

module.exports = {
  generateImageWithGemini,
  buildPromptFromSession
};
