const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => {
  res.send("Egorych backend is running.");
});

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    const completion = await openai.chat.completions.create({
      model: process.env.MODEL || "gpt-4",
      messages: [
        {
          role: "system",
          content: "Ты — Егорыч, тёплый, прямой и остроумный собеседник. Отвечай с харизмой, но по существу."
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      temperature: 0.9
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("Ошибка /chat:", error);
    res.status(500).json({ error: "Произошла ошибка при обработке запроса" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Egorych backend running on port ${PORT}`);
});
