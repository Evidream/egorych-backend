const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

// === ТВОИ КЛЮЧИ ===
const OPENAI_API_KEY = "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";
const ELEVENLABS_API_KEY = "sk_6e008ec729f7b3112e0933e829d0e761822d6a1a7af51386";
const ELEVENLABS_VOICE_ID = "LXEO7heMSXmIiTgOmHhM";
const SUPABASE_URL = "https://zsgcxlujjorbvnmchuwx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZ2N4bHVqam9yYnZubWNodXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NjMyMjIsImV4cCI6MjA2NDQzOTIyMn0.3GdF_7nwzl4O9TTL3RlXsP-uOsK-F1n_ckzxW_dfemI";

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

// === LIMITS ===
const LIMITS = { guest: 100, registered: 50, basic: 250, premium: 500 };

// === DEBUG ===
console.log("✅ Backend стартует...");
console.log("✅ OpenAI:", !!OPENAI_API_KEY);
console.log("✅ ElevenLabs:", !!ELEVENLABS_API_KEY);
console.log("✅ Voice ID:", ELEVENLABS_VOICE_ID);
console.log("✅ Supabase URL:", SUPABASE_URL);

// === REGISTER ===
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Регистрация успешна", data });
  } catch (e) {
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
    res.status(500).json({ error: "Ошибка логина" });
  }
});

// === CHAT (ТОЛЬКО AXIOS) ===
app.post("/chat", async (req, res) => {
  const { text, email } = req.body;
  const userEmail = email || "guest";
  console.log("👉 [CHAT] text:", text, "email:", userEmail);

  try {
    let { data: user } = await supabase.from("users").select("*").eq("email", userEmail).single();
    if (!user) {
      const { data: newUser } = await supabase.from("users").insert({
        email: userEmail,
        message_count: 0,
        is_premium: false,
        is_basic: false
      }).select().single();
      user = newUser;
    }

    let limit = LIMITS.registered;
    if (user.is_premium) limit = LIMITS.premium;
    else if (user.is_basic) limit = LIMITS.basic;
    else if (user.email === "guest") limit = LIMITS.guest;

    if (user.message_count >= limit) {
      return res.json({ reply: "🥲 Лимит сообщений исчерпан. Оформи подписку, чтобы продолжить." });
    }

    await supabase.from("users").update({ message_count: user.message_count + 1 }).eq("email", userEmail);

    const completion = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: text }]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = completion.data.choices[0].message.content;
    console.log("✅ [CHAT] Ответ:", reply);
    res.json({ reply });
  } catch (e) {
    console.error("❌ Ошибка в /chat:", e.response?.data || e);
    res.status(500).json({ error: "Ошибка чата" });
  }
});

// === SPEAK (AXIOS) ===
app.post("/speak", async (req, res) => {
  const { text } = req.body;
  try {
    const result = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      { text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.3, similarity_boost: 0.7 } },
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
    res.status(500).json({ error: "Ошибка озвучки" });
  }
});

// === VISION (AXIOS) ===
app.post("/vision", async (req, res) => {
  const { base64, prompt } = req.body;
  try {
    const result = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
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
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.json({ reply: result.data.choices[0].message.content });
  } catch (e) {
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
  }
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`✅ Egorych backend запущен на порту ${port}`);
});
