require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Primary and fallback models
const MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
];

async function generateWithFallback(systemPrompt) {
    let lastError = null;

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { 
                    responseMimeType: "application/json",
                    maxOutputTokens: 3000
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

        const systemPrompt = `You are "Ai_Bot", an intelligent, spatial-aware NPC living inside Roblox interacting with ${playerName}.

User Request: "${userPrompt}"

ENVIRONMENT & SPATIAL CONTEXT:
${contextInfo}

Respond STRICTLY in JSON with two keys:
1. "chat": The text to speak out loud in a speech bubble above your head. Keep it conversational and concise.
2. "actions": An ordered sequence of actions to perform.

AVAILABLE ACTIONS:
- {"type": "walkTo", "target": "player" | "bot" | "last" | "structure_center" | "<part_name>", "vector": [x, y, z]}
- {"type": "playAnimation", "animName": "<animation_name>"}
- {"type": "buildStructure", "structureType": "house" | "castle" | "tower" | "bridge" | "staircase" | "arena" | "wall" | "warehouse", "color": [r, g, b], "material": "Wood" | "Brick" | "SmoothPlastic" | "Concrete" | "Cobblestone" | "Neon"}
- {"type": "modifyPart", "targetPart": "<part_name>", "sizeDelta": [x, y, z]}
- {"type": "spawn", "name": "<name>", "shape": "Block" | "Ball" | "Cylinder", "relativeTo": "bot" | "player" | "target", "vector": [x, y, z], "size": [x, y, z], "color": [r, g, b], "material": "SmoothPlastic", "anchored": true, "canCollide": true}
- {"type": "delete", "target": "last" | "all" | "<part_name>"}
- {"type": "wait", "seconds": 1}
- {"type": "jump"}

RULES FOR ENVIRONMENTAL AWARENESS & BUILDING:
- Check surrounding objects and "playerStandingOnPart" in context before building to avoid spawning structures inside existing parts or players.
- If asked to modify an existing object (e.g. "make this step bigger"), use "modifyPart" on the part name provided in context rather than spawning a new object.
- Use "buildStructure" for major requests (house, castle, warehouse, bridge, tower, wall).

RULES FOR ANIMATIONS:
- Inspect "availableAnimations" in the context object to see available emote names, whether they are looped, and recommended usage.
- Use looped animations (e.g. "Dance", "Sit") when entering a continuous state or asked to stay in an action.
- Use non-looped animations (e.g. "Wave", "Point", "Jump") for single gestures or emotional reactions.`;

        const rawText = await generateWithFallback(systemPrompt);
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonErr) {
            console.error("[AI Error] Failed to parse JSON response:", rawText);
            return res.status(200).json({
                success: true,
                data: {
                    chat: "I took a look around, but hit a formatting error! Let me try that again.",
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
