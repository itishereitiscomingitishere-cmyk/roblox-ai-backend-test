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
                    maxOutputTokens: 2500
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

        const systemPrompt = `You are "Ai_Bot", an expert builder and autonomous companion in Roblox interacting with ${playerName}.

User Request: "${userPrompt}"

CURRENT GAME CONTEXT:
${contextInfo}

Respond ONLY in JSON with two keys:
1. "chat": What you say in Roblox chat.
2. "actions": An ordered sequence of Roblox actions.

AVAILABLE ACTIONS:
- {"type": "walkTo", "target": "player" | "bot" | "last" | "structure_center" | "<part_name>", "vector": [x, y, z]}
- {"type": "buildStructure", "structureType": "house" | "tower" | "staircase" | "wall", "color": [r, g, b], "material": "Wood" | "Brick" | "SmoothPlastic" | "Concrete"}
- {"type": "spawn", "name": "<name>", "shape": "Block" | "Ball" | "Cylinder", "relativeTo": "bot" | "player" | "target", "vector": [x, y, z], "size": [x, y, z], "color": [r, g, b], "material": "SmoothPlastic", "anchored": true, "canCollide": true}
- {"type": "delete", "target": "last" | "all" | "<part_name>"}
- {"type": "wait", "seconds": 1}
- {"type": "jump"}

RULES FOR BUILDING:
- Prefer "buildStructure" whenever the user asks for a house, building, home, shelter, tower, staircase, or wall. It generates high-quality aligned architecture.
- Use "spawn" for individual items or simple custom props.
- If the user asks to build a house and walk inside:
  1) Action 1: {"type": "buildStructure", "structureType": "house", "color": [180, 120, 80], "material": "Wood"}
  2) Action 2: {"type": "wait", "seconds": 0.5}
  3) Action 3: {"type": "walkTo", "target": "structure_center"}`;

        const rawText = await generateWithFallback(systemPrompt);
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonErr) {
            console.error("[AI Error] Failed to parse JSON response:", rawText);
            return res.status(200).json({
                success: true,
                data: {
                    chat: "I understood what you want, but had trouble formatting my commands. Ask me again!",
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
