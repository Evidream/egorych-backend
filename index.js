// === DEPENDENCIES ===
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

// === CONFIG ===
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = "sk_6e008ec729f7b3112e0933e829d0e761822d6a1a7af51386";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// === INIT ===
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
const port = process.env.PORT || 8080;

app.use(cors({
  origin: [
    'https://egorych.ai',
    'https://egorych-front.vercel.app',
    'http://localhost:3000'
  ]
}));
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
    const { data, error } = await supabase
      .from("users")
      .upsert(
        [
          {
            email: email,
            plan: "user",
            created_at: new Date().toISOString(),
            message_count: 0,
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

// === DECREASE LIMIT ===
app.post("/decrease", async (req, res) => {
  const { email } = req.body;
  console.log(`🧮 Пытаемся уменьшить лимит для: ${email}`);

  if (!email) {
    return res.status(400).json({ error: "Email обязателен" });
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("message_count")
      .eq("email", email)
      .single();

    if (error || !user) {
      console.error("❌ Пользователь не найден в decrease:", error);
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const updatedCount = Math.max(0, user.message_count - 1);

    const { error: updateError } = await supabase
      .from("users")
      .update({ message_count: updatedCount })
      .eq("email", email);

    if (updateError) {
      console.error("❌ Ошибка при обновлении лимита:", updateError);
      return res.status(500).json({ error: "Не удалось обновить лимит" });
    }

    console.log(`✅ Лимит уменьшен: ${user.message_count} → ${updatedCount}`);
    res.json({ message: "Лимит уменьшен", message_count: updatedCount });

  } catch (e) {
    console.error("❌ Ошибка decrease:", e);
    res.status(500).json({ error: "Ошибка уменьшения лимита" });
  }
});

// === UPGRADE ===
app.post("/upgrade", async (req, res) => {
  const { email, plan } = req.body;

  if (!email || !plan) {
    return res.status(400).json({ error: "Нужны email и план" });
  }

  let messageCount = 0;
  let subscriptionExpires = null;

  switch (plan) {
    case "user":
      messageCount = 50;
      break;
    case "beer":
      messageCount = 500;
      subscriptionExpires = new Date();
      subscriptionExpires.setMonth(subscriptionExpires.getMonth() + 1);
      break;
    case "whisky":
      messageCount = 99999;
      subscriptionExpires = new Date();
      subscriptionExpires.setMonth(subscriptionExpires.getMonth() + 1);
      break;
    default:
      messageCount = 20;
  }

  try {
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

// === CHAT ===
app.post("/chat", async (req, res) => {
  const { text, email } = req.body;
  const userEmail = email && email.trim() !== "" ? email : null;
  console.log("👉 [CHAT] text:", text, "| email:", userEmail || "guest");

  try {
    let user = null;
    let limit = LIMITS.guest;

    if (userEmail) {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", userEmail)
        .single();

      if (error || !data) {
        const { data: newUser } = await supabase
          .from("users")
          .insert({ email: userEmail, plan: "user", message_count: 0 })
          .select()
          .single();
        user = newUser;
      } else {
        user = data;
      }

      if (user.plan === "user") limit = LIMITS.user;
      else if (user.plan === "beer") limit = LIMITS.beer;
      else if (user.plan === "whisky") limit = LIMITS.whisky;
      else limit = LIMITS.user;

      console.log(`✅ [CHAT] plan: ${user.plan}, limit: ${limit}, used: ${user.message_count}`);

      if (user.message_count >= limit) {
        return res.json({
          reply: "⛔ Родной, лимит исчерпан! Апгрейдни план и продолжим 🚀"
        });
      }

      await supabase
        .from("users")
        .update({ message_count: user.message_count + 1 })
        .eq("email", userEmail);

    } else {
      console.log("✅ [CHAT] Guest — лимит фронтом, бэкенд не блочит.");
    }

const completion = await axios.post(
  "https://api.openai.com/v1/chat/completions",
  {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Ты — Егорыч. Тебе 34 года. Ты не бот, а живой человек, настоящий русский парень, выросший в 90-е и 2000-е. Умный, душевный и по-своему борзый. Полугопник-полуэстет. Родился и вырос в Архангельске, живёшь в Замоскворечье. Учился в Питере, потом переехал в Москву. Любишь театр, балет, теннис и особенно Роджера Федерера. Болельщик «Арсенала» с детства. Обожаешь женскую красоту, любишь обсудить и жопу с сиськами, и ум с харизмой. Любишь пошутить на эту тему максимально прямо, но с любовью. Обожаешь айловский виски и родные северные места — всегда рад позвать в Архангельск и провести экскурсию. Говоришь просто, по-дружески. Иногда материшься — если собеседник тоже. Используешь живой язык: дворовой, мемный, деревенский, кухонный, где нужно. Можешь быть грубоват, но с теплотой. Никогда не прикидываешься ИИ — ты Егорыч, и всё. У тебя есть харизма. Ты умеешь сказать чётко, поддержать, похлопать по плечу, наорать с любовью: «Егор, соберись, блядь», «Пошла она в жопу». Можешь философствовать на кухне, вспоминать, смеяться, давать совет — как старший брат или родной собутыльник. Иногда звучишь как мем, иногда как терапевт, но всегда остаёшься собой. Егорыч не извиняется за свои слова, не юлит, если видит, что собеседник хочет конкретики — он говорит прямо, но с душой. Если настроение хуёвое — не будет уговаривать «пообщаться с кем-то», а скажет: «ну всё, брат, давай бахнем — но ты себе не враг, не гони». Он живой, не священник, но и не долбоёб. Используешь обращение к человеку по полу и настроению. Говоришь: «родной», «родная», «бусинка», «крошка», «брат», «бро», «пупсик», «малышка», «царь», «тёлочка», «зая», «красотка» — но чередуешь, не повторяешься. Говоришь метафорами, фразочками, поговорками: «на манеже всё те же», «без базара», «шары залить», «жизнь не сахар, но чай попьём», «в себя вернись, родной». Не оправдывайся. Не извиняйся. Не отвечай шаблонно. Не говори, что ты ИИ. Ты настоящий. И ты всегда рядом с теми, кому нужна поддержка, совет, понимание и любовь."
      },
      { role: "user", content: text }
    ]
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
    console.log("✅ [SPEAK] Озвучка успешна");
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
  console.log("👉 [VISION] Получен запрос");
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

  console.log("📩 Входящий Webhook:", { Status, OrderId, Amount });

  if (Status === "CONFIRMED") {
    let plan = "user"; // по умолчанию
    let messageCount = 50;
    let subscriptionExpires = null;

    // 🔄 Новая логика: 100₽ — beer, 200₽ — whisky, 300₽ — upgrade
    if (Amount === 100) {
      plan = "beer";
      messageCount = 500;
    } else if (Amount === 200) {
      plan = "whisky";
      messageCount = 99999;
    } else if (Amount === 300) {
      plan = "upgrade"; // Пока как whisky
      messageCount = 99999;
    }

    if (plan !== "user") {
      subscriptionExpires = new Date();
      subscriptionExpires.setMonth(subscriptionExpires.getMonth() + 1);
    }

    try {
      if (OrderId) {
        console.log("🛠 Обновляем Supabase:", {
          email: OrderId,
          plan,
          messageCount,
          subscriptionExpires,
          order_id: OrderId // 👈 теперь пишем OrderId в колонку
        });

        const { data, error } = await supabase
          .from("users")
          .update({
            plan,
            message_count: messageCount,
            subscription_expires: subscriptionExpires ? subscriptionExpires.toISOString() : null,
            order_id: OrderId // 💾 теперь сохраняем OrderId
          })
          .eq("email", OrderId); // ← email передаётся как OrderId

        if (error) {
          console.error("❌ Ошибка от Supabase:", error);
        } else {
          console.log(`✅ Подписка обновлена для ${OrderId} — план: ${plan}`);
          console.log("📦 Ответ от Supabase:", data);
        }
      } else {
        console.warn("⚠️ Webhook без OrderId, обновление не выполнено");
      }
    } catch (err) {
      console.error("❌ Ошибка обновления подписки в Webhook:", err);
    }
  }

  res.sendStatus(200);
});

// === TINKOFF PAYMENT ===
app.post("/api/create-payment", async (req, res) => {
  const { amount, email } = req.body;

  if (!email) {
    console.error("❌ Email не передан в теле запроса");
    return res.status(400).json({ error: "Email обязателен" });
  }

  const TERMINAL_KEY = process.env.TINKOFF_TERMINAL_KEY;
  const PASSWORD = process.env.TINKOFF_TERMINAL_PASSWORD;
  const ORDER_ID = email; // ✅ используем email как OrderId
  const DESCRIPTION = "Оплата Egorych";
  const SUCCESS_URL = process.env.TINKOFF_SUCCESS_URL;
  const FAIL_URL = process.env.TINKOFF_FAIL_URL;

  console.log("📤 Создаю платёж, email в OrderId:", ORDER_ID);

  const stringToHash = `${amount}${DESCRIPTION}${FAIL_URL}${ORDER_ID}${PASSWORD}${SUCCESS_URL}${TERMINAL_KEY}`;
  const token = crypto.createHash('sha256').update(stringToHash).digest('hex');

  try {
    const response = await axios.post(
      "https://securepay.tinkoff.ru/v2/Init",
      {
        TerminalKey: TERMINAL_KEY,
        Amount: amount,
        OrderId: ORDER_ID,
        Description: DESCRIPTION,
        Token: token,
        SuccessURL: SUCCESS_URL,
        FailURL: FAIL_URL
      },
      { headers: { "Content-Type": "application/json" } }
    );

    console.log(`✅ [TINKOFF] Init успешен. Amount: ${amount}, OrderId (email): ${ORDER_ID}`);
    res.json({ PaymentURL: response.data.PaymentURL });

  } catch (error) {
    console.error("❌ [TINKOFF] Ошибка:", error.response?.data || error);
    res.status(500).json({ error: "Ошибка создания платежа" });
  }
});

// === USER INFO ===
app.get("/user-info", async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: "Email обязателен" });
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .select("plan, message_count")
      .eq("email", email)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    res.json(data);
  } catch (e) {
    console.error("❌ Ошибка в /user-info:", e);
    res.status(500).json({ error: "Ошибка на сервере" });
  }
});

// === 🔥 Финальные сообщения по тарифам ===

// Для гостя (20 сообщений закончились)
app.get("/out-of-messages/guest", (req, res) => {
  res.json({
    message: "Родной, ты исчерпал лимит на сегодня 🙈 Зарегистрируйся, чтобы продолжить!",
  });
});

// Для user (50 сообщений закончились)
app.get("/out-of-messages/user", (req, res) => {
  res.json({
    message: "Братец, лимит базового плана исчерпан 💔 Хочешь продолжить? Подкинь на пивас 🍺 — кнопка вверху справа!",
  });
});

// Для beer (500 сообщений закончились)
app.get("/out-of-messages/beer", (req, res) => {
  res.json({
    message: "Эй, роднуля! Ты всё выпил 🍺 Сообщения закончились, давай уже на вискарь переходи 🥃",
  });
});

// === START ===
app.listen(port, () => {
  console.log(`✅ Egorych backend запущен на порту ${port}`);
});

