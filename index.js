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

// Создание папки для загрузок
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

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Лимиты
const LIMITS = {
  guest: 20,
  registered: 50,
  basic: 250,
  premium: 500,
};

// Чат с лимитами
app.post("/chat", async (req, res) => {
  const { text, email } = req.body;
  let user;

  try {
    if (!email) {
      return res.status(400).json({ error: "Email обязателен" });
    }

    const { data, error } = await supabase.from("users").select("*").eq("email", email).single();
    if (error || !data) {
      return res.status(403).json({ error: "Пользователь не найден" });
    }

    user = data;

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
  } catch (error) {
    console.error("❌ Ошибка в /chat:", error);
    res.status(500).json({ error: "Ошибка чата" });
  }
});

// Webhook от Тинькофф
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
