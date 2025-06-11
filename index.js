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
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Папка для загрузок
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Лимиты
const LIMITS = {
  guest: 20,
  registered: 50,
  basic: 250,
  premium: 500,
};

// Регистрация пользователя
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Регистрация успешна", data });
  } catch (e) {
    console.error("Ошибка регистрации:", e);
    res.status(500).json({ error: "Ошибка регистрации" });
  }
});

// Логин пользователя
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Логин успешен", data });
  } catch (e) {
    console.error("Ошибка логина:", e);
    res.status(500).json({ error: "Ошибка логина" });
  }
});

// Чат
app.post("/chat", async (req, res) => {
  const { text, email } = req.body;
  if (!email) return res.status(400).json({ error: "Email обязателен" });

  try {
    let { data: user, error } = await supabase.from("users").select("*").eq("email", email).single();
    if (error || !user) {
      const { data: newUser } = await supabase.from("users").insert({ email, message_count: 0 }).select().single();
      user = newUser;
    }

    let limit = LIMITS.registered;
    if (user.is_premium) limit = LIMITS.premium;
    else if (user.is_basic) limit = LIMITS.basic;

    if (user.message_count >= limit) {
      return res.json({ reply: "🥲 Лимит сообщений исчерпан. Оформи подписку, чтобы продолжить." });
    }

    await supabase.from("users").update({ message_count: user.message_count + 1 }).eq("email", email);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: text }],
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (e) {
    console.error("Ошибка в /chat:", e);
    res.status(500).json({ error: "Ошибка чата" });
  }
});

// Озвучка
app.post("/speak", async (req, res) => {
  const { text } = req.body;
  try {
    const result = await axios.post(
      "https://api.elevenlabs.io/v1/text-to-speech/" + process.env.ELEVENLABS_VOICE_ID,
      { text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.3, similarity_boost: 0.7 } },
      { responseType: "arraybuffer", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" } }
    );
    res.set({ "Content-Type": "audio/mpeg" });
    res.send(result.data);
  } catch (e) {
    console.error("Ошибка озвучки:", e);
    res.status(500).json({ error: "Ошибка озвучки" });
  }
});

// Vision
app.post("/vision", async (req, res) => {
  const { base64, prompt } = req.body;
  try {
    const result = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Ты — заботливый помощник, который понимает изображения." },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: base64 } },
            { type: "text", text: prompt || "Что на фото?" },
          ],
        },
      ],
    });
    res.json({ reply: result.choices[0].message.content });
  } catch (e) {
    console.error("Ошибка в /vision:", e);
    res.status(500).json({ error: "Ошибка vision" });
  }
});

// Upload
app.post("/upload", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;
  const fileData = fs.readFileSync(filePath);
  const base64 = `data:${req.file.mimetype};base64,` + fileData.toString("base64");
  fs.unlinkSync(filePath);
  res.json({ base64 });
});

// Webhook
app.post("/webhook", async (req, res) => {
  const { Status, OrderId, Amount } = req.body;
  if (Status === "CONFIRMED") {
    let update = { is_basic: true };
    if (Amount >= 149900) update = { is_premium: true };
    await supabase.from("users").update({ ...update }).eq("email", OrderId);
    console.log(`✅ Подписка обновлена для ${OrderId}`);
  }
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`✅ Egorych backend is running on port ${port}`);
});
