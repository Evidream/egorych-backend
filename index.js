const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Папка для загрузок
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// 💬 Chat с лимитами
app.post("/chat", async (req, res) => {
  const { text, email } = req.body;

  try {
    let limit = 10; // default guest limit

    if (email) {
      const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .single();

      if (!user) {
        await supabase.from("users").insert([{ email, messages: 1 }]);
        limit = 20;
      } else {
        if (user.subscription === "premium") limit = 9999;
        else if (user.subscription === "standard") limit = 100;
        else limit = 20;

        if (user.messages >= limit) {
          return res.json({
            reply: "🥃 Брат, ты выговорился. Дальше — только по подписке. Закинь Егорычу на пивас.",
            limitReached: true,
          });
        }

        await supabase
          .from("users")
          .update({ messages: user.messages + 1 })
          .eq("email", email);
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: text }],
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("❌ Ошибка чата:", error);
    res.status(500).json({ error: "Ошибка обработки запроса" });
  }
});

// 🔊 Озвучка
app.post("/speak", async (req, res) => {
  const { message } = req.body;
  try {
    const response = await axios.post(
      "https://api.elevenlabs.io/v1/text-to-speech/9I24fSa5sa0KXtXf6KWb",
      {
        text: message,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.3, similarity_boost: 0.8 },
      },
      {
        headers: {
          "xi-api-key": process.env.ELEVEN_LABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        responseType: "arraybuffer",
      }
    );

    res.set("Content-Type", "audio/mpeg");
    res.send(response.data);
  } catch (error) {
    console.error("❌ Ошибка озвучки:", error);
    res.status(500).json({ error: "Ошибка генерации озвучки" });
  }
});

// 📤 Загрузка файла
app.post("/upload", upload.single("file"), (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Файл не был загружен" });
    res.json({ message: "Файл успешно загружен", filename: file.filename });
  } catch (error) {
    console.error("❌ Ошибка загрузки:", error);
    res.status(500).json({ error: "Ошибка загрузки файла" });
  }
});

// 👁 Vision
app.post("/vision", async (req, res) => {
  const { base64 } = req.body;

  if (!base64) return res.status(400).json({ error: "Изображение не передано" });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "system",
          content: `
Ты — тёплый и внимательный ассистент по имени Егорыч. Пользователь прислал тебе изображение. 
Рассмотри его внимательно и опиши, что ты видишь. Говори по-человечески, с душой.
        `.trim(),
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
            {
              type: "text",
              text: "Что ты видишь на этом изображении?",
            },
          ],
        },
      ],
      max_tokens: 300,
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("❌ Ошибка Vision:", error);
    res.status(500).json({ error: "Ошибка обработки изображения" });
  }
});

app.listen(port, () => {
  console.log(`✅ Egorych backend is running on port ${port}`);
});
