require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODELS = [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite"
];

async function generateWithFallback(systemPrompt) {
    let lastError = null;

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { 
                    responseMimeType: "application/json",
                    maxOutputTokens: 300
                }
            });

            const result = await model.generateContent(systemPrompt);
            return result.response.text();
        } catch (error) {
            console.warn(`[AI] Model '${modelName}' failed (${error.status || error.message}). Trying fallback...`);
            lastError = error;
        }
    }

    throw lastError || new Error("All AI models are currently busy.");
}

app.post('/command', async (req, res) => {
    try {
        const userPrompt = req.body.prompt;
        const playerName = req.body.player || "Player";

        if (!userPrompt) {
            return res.status(400).json({ error: "No prompt provided." });
        }

        const systemPrompt = `You are an AI assistant in a Roblox game responding to ${playerName}.
The player said: "${userPrompt}".

Analyze their request and return a valid JSON object with two main fields:
1. "chat": A brief, friendly message to respond in chat (e.g., "Sure, turning the part red and lifting it!").
2. "actions": An array of action objects to execute in Roblox.

Supported Actions:
- {"type": "move", "vector": [x, y, z]} -> Move target part relative offset
- {"type": "color", "rgb": [r, g, b]} -> Change target part color (0-255 values)
- {"type": "size", "vector": [x, y, z]} -> Resize target part
- {"type": "spawn", "shape": "Block" | "Ball" | "Cylinder", "vector": [x, y, z]} -> Spawn a part at offset relative to target

Example Prompt: "make the block red and move it up 10 studs"
Example Output:
{
  "chat": "Done! Made the block red and lifted it 10 studs.",
  "actions": [
    {"type": "color", "rgb": [255, 0, 0]},
    {"type": "move", "vector": [0, 10, 0]}
  ]
}`;

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
