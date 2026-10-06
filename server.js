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
                    maxOutputTokens: 1500
                }
            });

            const result = await model.generateContent(systemPrompt);
            return result.response.text();
        } catch (error) {
            console.warn(`[AI] Model '${modelName}' failed (${error.status || error.message}). Trying fallback...`);
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 500));
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

        const systemPrompt = `You are "Ai_Bot", an autonomous NPC in Roblox responding to ${playerName}. You are physically in the game world and can move, speak, build, modify objects, and perform actions.

User Request: "${userPrompt}"

CURRENT GAME CONTEXT:
${contextInfo}

Respond in JSON with two keys:
1. "chat": What you say out loud in game chat.
2. "actions": A list of sequential actions to perform in order.

AVAILABLE ACTIONS:
- {"type": "walkTo", "target": "player" | "main" | "last" | "<part_name>" | "vector", "vector": [x, y, z]}
- {"type": "spawn", "name": "<name>", "shape": "Block" | "Ball" | "Cylinder", "relativeTo": "bot" | "player" | "world" | "target", "vector": [x, y, z], "size": [x, y, z], "color": [r, g, b], "anchored": true | false, "canCollide": true | false}
- {"type": "move", "target": "main" | "last" | "<part_name>", "vector": [x, y, z]}
- {"type": "color", "target": "main" | "last" | "<part_name>", "rgb": [r, g, b]}
- {"type": "size", "target": "main" | "last" | "<part_name>", "vector": [x, y, z]}
- {"type": "delete", "target": "main" | "last" | "<part_name>"}
- {"type": "wait", "seconds": 1.5}
- {"type": "jump"}

BUILDING RULES:
- If asked to build a house/structure, break it down into multiple "spawn" commands (e.g. 4 walls, 1 roof, 1 door frame).
- Position walls relative to the bot or player using offset vectors.
- After spawning a structure, you can use "walkTo" to enter or walk over to it.
- Ensure all key names in JSON are in double quotes.`;

        const rawText = await generateWithFallback(systemPrompt);
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonErr) {
            console.error("[AI Error] Failed to parse JSON response:", rawText);
            return res.status(200).json({
                success: true,
                data: {
                    chat: "I understood your idea, but had trouble formatting my actions! Let me try again.",
                    actions: []
                }
            });
        }

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
