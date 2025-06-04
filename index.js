const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Configuration, OpenAIApi } = require('openai');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    const completion = await openai.createChatCompletion({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Ты — добрый и ласковый собеседник, отвечающий как Егорыч.' },
        { role: 'user', content: message },
      ],
    });

    const reply = completion.data.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка при обработке запроса' });
  }
});

app.post('/speak', async (req, res) => {
  try {
    const { reply } = req.body;

    const response = await axios({
      method: 'post',
      url: 'https://api.elevenlabs.io/v1/text-to-speech/' + process.env.VOICE_ID,
      headers: {
        'xi-api-key': process.env.ELEVEN_LABS_API_KEY,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      data: {
        text: reply,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      },
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при озвучке текста' });
  }
});

app.listen(port, () => {
  console.log(`Egorych backend is running on port ${port}`);
});
