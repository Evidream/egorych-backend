const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bodyParser = require("body-parser");
const axios = require("axios");
const { OpenAI } = require("openai");
const FormData = require("form-data");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;
const upload = multer();

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
    console.error("Ошибка в /chat:", error.message);
    res.status(500).json({ error: "Ошибка в чате" });
  }
});

app.post("/speak", async (req, res) => {
  const { message } = req.body;
  try {
    const response = await axios({
      method: "post",
      url: "https://api.elevenlabs.io/v1/text-to-speech/9I24fSa5sa0KXtXf6KWb",
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
    console.error("Ошибка в /speak:", error.message);
    res.status(500).json({ error: "Ошибка при озвучке" });
  }
});

app.post("/whisper", upload.single("audio"), async (req, res) => {
  try {
    const file = req.file;
    const formData = new FormData();
    formData.append("file", file.buffer, {
      filename: "audio.webm",
      contentType: "audio/webm",
    });
    formData.append("model", "whisper-1");
    formData.append("language", "ru");

    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders(),
        },
      }
    );

    res.json({ text: response.data.text });
  } catch (error) {
    console.error("Ошибка в /whisper:", error.response?.data || error.message);
    res.status(500).json({ error: "Ошибка при расшифровке речи" });
  }
});

app.listen(port, () => {
  console.log(`✅ Egorych backend is running on port ${port}`);
});
