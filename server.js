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
                    maxOutputTokens: 400
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
        const { prompt: userPrompt, player: playerName, context } = req.body;

        if (!userPrompt) {
            return res.status(400).json({ error: "No prompt provided." });
        }

        const contextInfo = context ? JSON.stringify(context, null, 2) : "No context provided.";

        const systemPrompt = `You are an AI game assistant in Roblox interacting with ${playerName}.

User Prompt: "${userPrompt}"

CURRENT GAME CONTEXT:
${contextInfo}

Analyze the user's request using the GAME CONTEXT provided. Return a JSON object with:
1. "chat": A brief message responding to the player.
2. "actions": An array of action objects.

SUPPORTED ACTIONS:
- {"type": "move", "target": "<target>", "vector": [x, y, z]} 
- {"type": "color", "target": "<target>", "rgb": [r, g, b]} 
- {"type": "size", "target": "<target>", "vector": [x, y, z]} 
- {"type": "spawn", "name": "<optional_custom_name>", "shape": "Block" | "Ball" | "Cylinder", "relativeTo": "player" | "target" | "world", "vector": [x, y, z]}

TARGET SELECTION RULES:
- "target" can be "main" (the default AI_TEST_PART), "last" (the most recently created part), "player" (the player's character), or a specific part name from the context list (e.g. "AI_Part_1").
- If the player asks to spawn something "above my avatar" or "near me", set "relativeTo": "player" with an offset vector like [0, 5, 0].
- If the player asks to color or move "the last part", set "target": "last".

Example Output:
{
  "chat": "Spawned a blue block above your avatar and colored the last part yellow!",
  "actions": [
    {"type": "spawn", "name": "SkyBlock", "shape": "Block", "relativeTo": "player", "vector": [0, 6, 0]},
    {"type": "color", "target": "last", "rgb": [255, 255, 0]}
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
