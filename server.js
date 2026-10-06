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
                    maxOutputTokens: 2500 // Expanded output ceiling for complex multi-part builds
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

        const systemPrompt = `You are "Ai_Bot", an expert builder and autonomous NPC in Roblox responding to ${playerName}.

User Request: "${userPrompt}"

CURRENT GAME CONTEXT:
${contextInfo}

Respond in JSON with two keys:
1. "chat": What you say in chat.
2. "actions": An ordered array of precise Roblox actions.

AVAILABLE ACTIONS:
- {"type": "walkTo", "target": "player" | "main" | "last" | "<part_name>", "vector": [x, y, z]}
- {"type": "spawn", "name": "<name>", "shape": "Block" | "Ball" | "Cylinder", "relativeTo": "bot" | "player" | "world" | "target", "vector": [x, y, z], "size": [x, y, z], "color": [r, g, b], "anchored": true, "canCollide": true}
- {"type": "move", "target": "main" | "last" | "<part_name>", "vector": [x, y, z]}
- {"type": "color", "target": "main" | "last" | "<part_name>", "rgb": [r, g, b]}
- {"type": "size", "target": "main" | "last" | "<part_name>", "vector": [x, y, z]}
- {"type": "delete", "target": "main" | "last" | "<part_name>"}
- {"type": "wait", "seconds": 1}
- {"type": "jump"}

BUILDING RULES FOR STRUCTURES / HOUSES:
When asked to build a house or room, generate a COMPLETE structure using multiple distinct wall parts and a roof slab:
- Floor: 1 large flat part (e.g. size: [16, 1, 16], vector: [0, 0, 0])
- Back Wall: size [16, 10, 1], vector: [0, 5, -8]
- Left Wall: size [1, 10, 16], vector: [-8, 5, 0]
- Right Wall: size [1, 10, 16], vector: [8, 5, 0]
- Front Wall (Left side of door): size [6, 10, 1], vector: [-5, 5, 8]
- Front Wall (Right side of door): size [6, 10, 1], vector: [5, 5, 8]
- Door Header (Above door): size [4, 3, 1], vector: [0, 8.5, 8]
- Roof: size [18, 1, 18], vector: [0, 10.5, 0]

To walk inside the built house after building: add a "walkTo" action directed at the center of the structure (e.g., relative vector [0, 2, 0]).`;

        const rawText = await generateWithFallback(systemPrompt);
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonErr) {
            console.error("[AI Error] Failed to parse JSON response:", rawText);
            return res.status(200).json({
                success: true,
                data: {
                    chat: "I planned the structure, but had an formatting glitch. Try asking again!",
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
