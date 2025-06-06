const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// Создание папки для загрузок, если её нет
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Настройка multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Инициализация OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Чат-ответ
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
    console.error("❌ Ошибка при обработке запроса:", error);
    res.status(500).json({ error: "Произошла ошибка при обработке запроса" });
  }
});

// Озвучка
app.post("/speak", async (req, res) => {
  const { message } = req.body;
  try {
    const response = await axios({
      method: "post",
      url: `https://api.elevenlabs.io/v1/text-to-speech/9I24fSa5sa0KXtXf6KWb`,
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
    console.error("❌ Ошибка при озвучке:", error);
    res.status(500).json({ error: "Ошибка при генерации озвучки" });
  }
});

// Загрузка файла
app.post("/upload", upload.single("file"), (req, res) => {
  try {
    const file = req.file;
    console.log("📥 Получен файл:", file);

    if (!file) {
      console.error("❌ Файл не был передан");
      return res.status(400).json({ error: "Файл не был загружен" });
    }

    res.json({ message: "Файл успешно загружен", filename: file.filename });
  } catch (error) {
    console.error("❌ Ошибка при загрузке файла:", error);
    res.status(500).json({ error: "Ошибка при загрузке файла" });
  }
});

// Vision — реакция на изображение
app.post("/vision", async (req, res) => {
  const { base64 } = req.body;

  if (!base64) {
    return res.status(400).json({ error: "Изображение не передано" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "system",
          content: `
Ты — тёплый и внимательный ассистент по имени Егорыч. Пользователь прислал тебе изображение. 
Рассмотри его внимательно и опиши, что ты видишь. Не пиши формально — будь человечным, простым и живым.
Если на изображении есть люди — расскажи, что они делают, какое у них настроение.
Если это объект или пейзаж — опиши его. Если не уверен — всё равно скажи, что примерно видишь. 
Твоя задача — откликнуться с теплом, будто это друг прислал тебе фото, и ты хочешь поддержать разговор.
        `.trim(),
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
              },
            },
            {
              type: "text",
              text: "Что ты видишь на этом изображении? Просто расскажи по-человечески.",
            }
          ],
        },
      ],
      max_tokens: 300,
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("❌ Ошибка Vision:", error);
    res.status(500).json({ error: "Ошибка обработки изображения GPT-4-Vision" });
  }
});

app.listen(port, () => {
  console.log(`Egorych backend is running on port ${port}`);
});
