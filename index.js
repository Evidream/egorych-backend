// === DEPENDENCIES ===
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

// === CONFIG ===
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // ✅ Только из Variables
const ELEVENLABS_API_KEY = "sk_6e008ec729f7b3112e0933e829d0e761822d6a1a7af51386";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// === INIT ===
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// === UPLOAD ===
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// === DEBUG ===
console.log("✅ Backend стартует...");
console.log("✅ OpenAI:", !!OPENAI_API_KEY);
console.log("✅ ElevenLabs:", !!ELEVENLABS_API_KEY);
console.log("✅ Voice ID:", ELEVENLABS_VOICE_ID);
console.log("✅ Supabase URL:", SUPABASE_URL);

// === LIMITS ===
const LIMITS = {
  guest: 20,
  user: 50,
  beer: 500,
  whisky: 99999,
};

// === REGISTER ===
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Регистрация успешна", data });
  } catch (e) {
    console.error("❌ Ошибка регистрации:", e);
    res.status(500).json({ error: "Ошибка регистрации" });
  }
});

// === LOGIN ===
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Логин успешен", data });
  } catch (e) {
    console.error("❌ Ошибка логина:", e);
    res.status(500).json({ error: "Ошибка логина" });
  }
});

// === CHAT ===
app.post("/chat", async (req, res) => {
  const { text, email } = req.body;
  const userEmail = email || "guest";

  console.log("👉 [CHAT] text:", text, "email:", userEmail);

  try {
    // 1️⃣ Проверяем юзера или создаём нового
    let { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", userEmail)
      .single();

    if (error || !user) {
      const { data: newUser } = await supabase
        .from("users")
        .insert({
          email: userEmail,
          plan: "guest", // ✅ Гарантия: новый = guest
          message_count: 0
        })
        .select()
        .single();
      user = newUser;
    }

    // 2️⃣ Определяем лимит по plan
    let limit = LIMITS.user; // по умолчанию user
    if (user.plan === "whisky") limit = LIMITS.whisky;
    else if (user.plan === "beer") limit = LIMITS.beer;
    else if (user.plan === "guest") limit = LIMITS.guest;

    // 3️⃣ Если лимит исчерпан — стоп чат и предлагаем регистрацию
    if (user.message_count >= limit) {
      return res.json({
        reply: "Слушай, а чё мы как не родные то? Видишь справа вверху чёрную кнопку? Жми на неё и зарегайся пыренько — там рели 5 сек. Хоть познакомимся нормально, а то как два гуся! Регайся скорее и продолжим лялякать. Жду тебя — а пока сбегаю в толчок как раз."
      });
    }

    // 4️⃣ Увеличиваем счётчик сообщений
    await supabase
      .from("users")
      .update({ message_count: user.message_count + 1 })
      .eq("email", userEmail);

    // 5️⃣ Отправляем запрос в OpenAI
    const completion = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: text }],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = completion.data.choices[0].message.content;
    console.log("✅ [CHAT] OpenAI ответ:", reply);
    res.json({ reply });

  } catch (e) {
    console.error("❌ Ошибка в /chat:", e.response?.data || e);
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
    console.log("✅ [SPEAK] Озвучка прошла успешно");
    res.set({ "Content-Type": "audio/mpeg" });
    res.send(result.data);
  } catch (e) {
    console.error("❌ Ошибка в /speak:", e.response?.data || e);
    res.status(500).json({ error: "Ошибка озвучки" });
  }
});

// === VISION ===
app.post("/vision", async (req, res) => {
  const { base64, prompt } = req.body;
  console.log("👉 [VISION] Запрос vision получен");
  try {
    const result = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Ты — помощник, который понимает изображения." },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: base64 } },
              { type: "text", text: prompt || "Что на фото?" },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ [VISION] Ответ:", result.data.choices[0].message.content);
    res.json({ reply: result.data.choices[0].message.content });
  } catch (e) {
    console.error("❌ Ошибка в /vision:", e.response?.data || e);
    res.status(500).json({ error: "Ошибка vision" });
  }
});

// === UPLOAD ===
app.post("/upload", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;
  const fileData = fs.readFileSync(filePath);
  const base64 = `data:${req.file.mimetype};base64,` + fileData.toString("base64");
  fs.unlinkSync(filePath);
  res.json({ base64 });
});

// === WEBHOOK ===
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

// === START ===
app.listen(port, () => {
  console.log(`✅ Egorych backend запущен на порту ${port}`);
});
