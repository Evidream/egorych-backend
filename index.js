const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const { OpenAI } = require("openai");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;
const upload = multer();

app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔹 Обработка текста
app.post("/chat", async (req, res) => {
  const { text } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: text }],
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("Ошибка в /chat:", error.message);
    res.status(500).json({ error: "Ошибка в ChatGPT" });
  }
});

// 🔹 Озвучка
app.post("/speak", async (req, res) => {
  const { message } = req.body;

  try {
    const response = await axios({
      method: "post",
      url: "https://api.elevenlabs.io/v1/text-to-speech/9I24fSa5sa0KXtXf6KWb",
      headers: {
        "xi-api-key": process.env.ELEVEN_LABS_API_KEY,
        "Content-Type": "application/json",
        "accept": "audio/mpeg",
      },
      data: {
        text: message,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.3,
          similarity_boost: 0.8,
        },
      },
      responseType: "arraybuffer",
    });

    res.set("Content-Type", "audio/mpeg");
    res.send(response.data);
  } catch (error) {
    console.error("Ошибка в /speak:", error.message);
    res.status(500).json({ error: "Ошибка озвучки" });
  }
});

// 🔹 Распознавание речи
app.post("/whisper", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) throw new Error("Файл не получен");

    const transcription = await openai.audio.transcriptions.create({
      file: req.file.buffer,
      model: "whisper-1",
      language: "ru",
      response_format: "json",
    });

    res.json({ text: transcription.text });
  } catch (error) {
    console.error("Ошибка в /whisper:", error.message);
    res.status(500).json({ error: "Ошибка при расшифровке голоса" });
  }
});

app.listen(port, () => {
  console.log(`✅ Egorych backend is running on port ${port}`);
});
