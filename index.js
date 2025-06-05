const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
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

// ✅ Чат (GPT)
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
    res.status(500).json({ error: "Произошла ошибка при обработке запроса" });
  }
});

// ✅ Озвучка (ElevenLabs)
app.post("/speak", async (req, res) => {
  const { message } = req.body;

  try {
    const response = await axios({
      method: "post",
      url: "https://api.elevenlabs.io/v1/text-to-speech/9I24fSa5sa0KXtXf6KWb", // voice_id
      headers: {
        "xi-api-key": process.env.ELEVEN_LABS_API_KEY,
        "Content-Type": "application/json",
        accept: "audio/mpeg",
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
    res.status(500).json({ error: "Ошибка при генерации озвучки" });
  }
});

// ✅ Распознавание речи (Whisper)
app.post("/whisper", upload.single("audio"), async (req, res) => {
  try {
    const buffer = req.file.buffer;
    const filePath = path.join(__dirname, "temp_audio.mp3");

    // сохраняем временный mp3
    fs.writeFileSync(filePath, buffer);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1",
      language: "ru",
      response_format: "json",
    });

    fs.unlinkSync(filePath); // удаляем временный файл
    res.json({ text: transcription.text });
  } catch (error) {
    console.error("Ошибка в /whisper:", error.message);
    res.status(500).json({ error: "Ошибка при расшифровке голоса" });
  }
});

// ✅ Запуск сервера
app.listen(port, () => {
  console.log(`✅ Egorych backend is running on port ${port}`);
});
