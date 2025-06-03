// speak.js
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/speak', async (req, res) => {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/9I24fSa5sa0KXtXf6KWb/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVEN_LABS_API_KEY
      },
      body: JSON.stringify({
        text: req.body.text,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'inline'
    });

    response.body.pipe(res);

  } catch (error) {
    console.error('Error generating speech:', error);
    res.status(500).send({ error: 'Something went wrong.' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Text-to-speech server is running on port ${port}`);
});
