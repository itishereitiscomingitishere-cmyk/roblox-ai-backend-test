require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// List of models in order of preference
const MODELS = [
    "gemini-3.8-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
];

async function generateWithFallback(systemPrompt) {
    let lastError = null;

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { 
                    responseMimeType: "application/json",
                    maxOutputTokens: 100 // Limits output length to speed up delivery
                }
            });

            const result = await model.generateContent(systemPrompt);
            return result.response.text();
        } catch (error) {
            console.warn(`[AI] ${modelName} failed (${error.status || error.message}). Trying next fallback model...`);
            lastError = error;
        }
    }

    throw lastError || new Error("All AI models are currently busy.");
}

app.post('/command', async (req, res) => {
    try {
        const userPrompt = req.body.prompt;

        if (!userPrompt) {
            return res.status(400).json({ error: "No prompt provided." });
        }

        const systemPrompt = `You are an AI game assistant in Roblox. Analyze the user's request: "${userPrompt}".
        Return ONLY valid JSON with two fields:
        1. "action": "move" or "none"
        2. "vector": [x, y, z] array of movement offset numbers.
        
        Example request: "move up 10 studs" -> {"action": "move", "vector": [0, 10, 0]}
        Example request: "move left 5 and down 2" -> {"action": "move", "vector": [-5, -2, 0]}`;

        const rawText = await generateWithFallback(systemPrompt);
        const data = JSON.parse(rawText);

        console.log(`[AI Response] Prompt: "${userPrompt}" ->`, data);
        res.json({ success: true, data });

    } catch (err) {
        console.error("Error processing prompt:", err.message);
        
        res.status(503).json({ 
            success: false, 
            error: "AI service temporarily unavailable. Please try again." 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
