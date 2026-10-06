require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/command', async (req, res) => {
    try {
        const userPrompt = req.body.prompt;
        
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `You are an AI game assistant in Roblox. Analyze the user's request: "${userPrompt}".
        Return ONLY valid JSON with two fields:
        1. "action": "move" or "none"
        2. "vector": [x, y, z] array of movement offset numbers.
        
        Example request: "move up 10 studs" -> {"action": "move", "vector": [0, 10, 0]}
        Example request: "move left 5 and down 2" -> {"action": "move", "vector": [-5, -2, 0]}`;

        const result = await model.generateContent(prompt);
        const data = JSON.parse(result.response.text());

        console.log(`[AI Response] Prompt: "${userPrompt}" ->`, data);
        res.json(data);
    } catch (err) {
        console.error("Error processing prompt:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => {
    console.log('Server is running locally on http://localhost:3000');
});
