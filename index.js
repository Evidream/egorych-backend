const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const axios = require("axios");

require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    console.error("Ошибка при обработке запроса:", error);
    res.status(500).json({ error: "Произошла ошибка при обработке запроса" });
  }
});

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
    console.error("Ошибка при озвучке:", error);
    res.status(500).json({ error: "Ошибка при генерации озвучки" });
  }
});

app.listen(port, () => {
  console.log(`Egorych backend is running on port ${port}`);
});
