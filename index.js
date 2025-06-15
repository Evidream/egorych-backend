const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

// === ТВОИ ПРЯМЫЕ КЛЮЧИ ===
const OPENAI_API_KEY = "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";
const ELEVENLABS_API_KEY = "sk_6e008ec729f7b3112e0933e829d0e761822d6a1a7af51386";
const ELEVENLABS_VOICE_ID = "LXEO7heMSXmIiTgOmHhM";

const supabase = createClient(
  "https://zsgcxluijorbvmnchuwx.supabase.co",
  "ТВОЙ_SUPABASE_KEY_ОСТАВЬ"
);

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// === Upload Dir ===
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

console.log("✅ Backend ready | OpenAI:", !!OPENAI_API_KEY, "| ElevenLabs:", !!ELEVENLABS_API_KEY);

const LIMITS = {
  guest: 20,
  registered: 50,
  basic: 250,
  premium: 500,
};

app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "Регистрация успешна", data });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "Логин успешен", data });
});

app.post("/chat", async (req, res) => {
  const { text, email } = req.body;
  const userEmail = email || "guest";
  console.log("[CHAT]", text);

  let { data: user, error } = await supabase.from("users").select("*").eq("email", userEmail).single();
  if (error || !user) {
    const { data: newUser } = await supabase.from("users").insert({ email: userEmail, message_count: 0 }).select().single();
    user = newUser;
  }

  let limit = LIMITS.registered;
  if (user.is_premium) limit = LIMITS.premium;
  else if (user.is_basic) limit = LIMITS.basic;
  else if (user.email === "guest") limit = LIMITS.guest;

  if (user.message_count >= limit) {
    return res.json({ reply: "🥲 Лимит сообщений исчерпан. Купи подписку!" });
  }

  await supabase.from("users").update({ message_count: user.message_count + 1 }).eq("email", userEmail);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: text }],
  });

  const reply = completion.choices[0].message.content;
  res.json({ reply });
});

app.post("/speak", async (req, res) => {
  const { text } = req.body;
  console.log("[SPEAK]", text);

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
});

app.post("/vision", async (req, res) => {
  const { base64, prompt } = req.body;
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
});

app.post("/upload", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;
  const fileData = fs.readFileSync(filePath);
  const base64 = `data:${req.file.mimetype};base64,` + fileData.toString("base64");
  fs.unlinkSync(filePath);
  res.json({ base64 });
});

app.listen(port, () => {
  console.log(`✅ Egorych backend running on ${port}`);
});
