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
  const { email } = req.body;
  try {
    // 1️⃣ Если пользователь есть — апдейтим план и сбрасываем счётчик
    // 2️⃣ Если нет — создаём с планом user и счётчиком 0
    const { data, error } = await supabase
      .from("users")
      .upsert(
        [
          {
            email: email,
            plan: "user", // 👈 теперь сразу plan: user
            created_at: new Date().toISOString(),
            message_count: 0, // 👈 сбрасываем/ставим новый
          },
        ],
        { onConflict: 'email' }
      );

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Регистрация успешна или обновлена", data });

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

// === УНИВЕРСАЛЬНЫЙ UPGRADE ===
app.post("/upgrade", async (req, res) => {
  const { email, plan } = req.body;

  if (!email || !plan) {
    return res.status(400).json({ error: "Нужны email и план" });
  }

  // 🔑 Задаём лимит и срок в зависимости от плана
  let messageCount = 0;
  let subscriptionExpires = null;

  switch (plan) {
    case "user":
      messageCount = 50; // при апгрейде с guest на user
      break;
    case "beer":
      messageCount = 500;
      subscriptionExpires = new Date();
      subscriptionExpires.setMonth(subscriptionExpires.getMonth() + 1); // +1 месяц
      break;
    case "whisky":
      messageCount = 99999;
      subscriptionExpires = new Date();
      subscriptionExpires.setFullYear(subscriptionExpires.getMonth() + 1); // +1 месяц
      break;
    default:
      messageCount = 20; // fallback → guest
  }

  try {
    // ✅ Обновляем план и лимиты
    const { data, error } = await supabase
      .from("users")
      .update({
        plan: plan,
        message_count: messageCount, 
        subscription_expires: subscriptionExpires ? subscriptionExpires.toISOString() : null
      })
      .eq("email", email);

    if (error) {
      console.error("❌ Ошибка апгрейда:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: `План обновлён на ${plan}`, data });
  } catch (e) {
    console.error("❌ Ошибка апгрейда:", e);
    res.status(500).json({ error: "Ошибка апгрейда" });
  }
});

// === CHAT (ФИНАЛ FIX CLEAN) ===
app.post("/chat", async (req, res) => {
  const { text, email } = req.body;

  // 1️⃣ Определяем email чётко
  const userEmail = email && email.trim() !== "" ? email : null;
  console.log("👉 [CHAT] text:", text, "email:", userEmail || "guest");

  try {
    let user = null;

    if (userEmail) {
      // 2️⃣ Есть email → юзер должен быть в базе!
      let { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", userEmail)
        .single();

      if (error || !data) {
        // fallback safety: создаём с plan:user
        const { data: newUser } = await supabase
          .from("users")
          .insert({
            email: userEmail,
            plan: "user",
            message_count: 0,
          })
          .select()
          .single();
        user = newUser;
      } else {
        user = data;
      }
    } else {
      // 3️⃣ Нет email → полностью локальный guest (НЕ сохраняем в Supabase!)
      user = {
        plan: "guest",
        message_count: req.body.localCount || 0 // если хочешь — можешь пробросить с фронта
      };
    }

    // 4️⃣ Определяем лимит
    let limit = LIMITS.user;
    if (user.plan === "guest") limit = LIMITS.guest;
    else if (user.plan === "beer") limit = LIMITS.beer;
    else if (user.plan === "whisky") limit = LIMITS.whisky;

    console.log(`👉 [CHAT] plan: ${user.plan}, limit: ${limit}, message_count: ${user.message_count}`);

    // 5️⃣ Проверка лимита
    if (user.message_count >= limit) {
      return res.json({
        reply: "Слушай, а чё мы как не родные? Видишь вверху чёрную кнопку? Жми и зарегайся пыренько — там реально 5 сек. А я пока сбегаю в толчок 😆"
      });
    }

    // 6️⃣ Если есть email → обновляем счётчик в Supabase
    if (userEmail) {
      await supabase
        .from("users")
        .update({ message_count: user.message_count + 1 })
        .eq("email", userEmail);
    } else {
      // Нет email → счётчик локально на фронт
    }

    // 7️⃣ Запрос в OpenAI
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

    // Если guest → вернём обновлённый localCount
    res.json({
      reply,
      localCount: userEmail ? undefined : user.message_count + 1
    });

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

// === TINKOFF CREATE PAYMENT ===
const crypto = require("crypto");

app.post("/api/create-payment", async (req, res) => {
  const { amount } = req.body;

  const TERMINAL_KEY = process.env.TINKOFF_TERMINAL_KEY;
  const PASSWORD = process.env.TINKOFF_TERMINAL_PASSWORD; // это твой SecretKey!
  const ORDER_ID = Date.now().toString();
  const DESCRIPTION = "Оплата Egorych";

  // ✅ Правильный расчёт токена
  const params = {
    Amount: amount,
    Description: DESCRIPTION,
    OrderId: ORDER_ID,
    TerminalKey: TERMINAL_KEY
  };

  // Сортируем ключи
  const sortedKeys = Object.keys(params).sort();

  // Формируем строку для хеширования
  let stringToHash = '';
  sortedKeys.forEach(key => {
    stringToHash += `${key}=${params[key]}`;
  });
  stringToHash += PASSWORD;

  // Хешируем
  const token = crypto.createHash('sha256').update(stringToHash).digest('hex');

  // ✅ Лог запроса для саппорта!
  console.log("✅ [TINKOFF] Init request JSON:", {
    ...params,
    Token: token,
    SuccessURL: process.env.TINKOFF_SUCCESS_URL,
    FailURL: process.env.TINKOFF_FAIL_URL
  });

  try {
    const response = await axios.post(
      "https://securepay.tinkoff.ru/v2/Init",
      {
        ...params,
        Token: token,
        SuccessURL: process.env.TINKOFF_SUCCESS_URL,
        FailURL: process.env.TINKOFF_FAIL_URL
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    console.log("✅ [TINKOFF] Init response:", response.data);

    res.json({
      PaymentURL: response.data.PaymentURL
    });

  } catch (error) {
    console.error("❌ [TINKOFF] Ошибка:", error.response?.data || error);
    res.status(500).json({ error: "Ошибка создания платежа" });
  }
});
// === START ===
app.listen(port, () => {
  console.log(`✅ Egorych backend запущен на порту ${port}`);
});
