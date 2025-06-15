const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// === ТВОИ ДАННЫЕ ===
const OPENAI_API_KEY = "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";
const ELEVENLABS_API_KEY = "sk_6e008ec729f7b3112e0933e829d0e761822d6a1a7af51386";
const ELEVENLABS_VOICE_ID = "LXEO7heMSXmIiTgOmHhM";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// === ЧАТ ===
app.post("/chat", async (req, res) => {
  const { text } = req.body;
  console.log("👉 [CHAT] text:", text);

  if (!text) {
    return res.status(400).json({ error: "Нет текста" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: text }],
    });

    const reply = completion.choices[0].message.content;
    console.log("✅ [CHAT] Ответ:", reply);
    res.json({ reply });
  } catch (e) {
    console.error("❌ Ошибка OpenAI:", e);
    res.status(500).json({ error: "Ошибка чата" });
  }
});

// === SPEAK ===
app.post("/speak", async (req, res) => {
  const { text } = req.body;
  console.log("👉 [SPEAK] text:", text);

  try {
    const result = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.3, similarity_boost: 0.7 },
      },
      {
        responseType: "arraybuffer",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    res.set({ "Content-Type": "audio/mpeg" });
    res.send(result.data);
  } catch (e) {
    console.error("❌ Ошибка в /speak:", e);
    res.status(500).json({ error: "Ошибка озвучки" });
  }
});

app.listen(port, () => {
  console.log(`✅ Egorych backend работает на порту ${port}`);
});
