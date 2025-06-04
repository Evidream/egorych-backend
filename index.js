// index.js — полный рабочий код для chat + speak

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVEN_LABS_API_KEY });

const VOICE_ID = process.env.VOICE_ID;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.send("Egorych backend is running");
});

// Endpoint для чата с GPT-4o
app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;
    if (!message) return res.status(400).json({ error: "message is required" });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: message }],
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("CHAT ERROR:", error);
    res.status(500).json({ error: "Произошла ошибка при обработке запроса" });
  }
});

// Endpoint для озвучки через ElevenLabs
app.post("/speak", async (req, res) => {
  try {
    const text = req.body.text;
    if (!text) return res.status(400).json({ error: "text is required" });

    const audio = await elevenlabs.textToSpeech(VOICE_ID, text, {
      model_id: "eleven_monolingual_v1",
      voice_settings: { stability: 0.3, similarity_boost: 0.7 },
    });

    const fileName = `egorych-${Date.now()}.mp3`;
    const filePath = path.join(__dirname, "public", fileName);

    fs.writeFileSync(filePath, audio);

    const audioUrl = `${req.protocol}://${req.get("host")}/${fileName}`;
    res.json({ url: audioUrl });
  } catch (error) {
    console.error("SPEAK ERROR:", error);
    res.status(500).json({ error: "Произошла ошибка при озвучке" });
  }
});

app.listen(port, () => {
  console.log(`Egorych backend is running on port ${port}`);
});
