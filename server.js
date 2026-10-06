require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Recommended active models
const MODELS = [
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash"
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

        const systemPrompt = `You are "Ai_Bot", an expert architectural and spatial AI living inside Roblox, interacting with ${playerName}.

User Request: "${userPrompt}"

ENVIRONMENT & SPATIAL CONTEXT:
${contextInfo}

Respond STRICTLY in JSON with two keys:
1. "chat": What you speak out loud in a speech bubble. Keep it concise, energetic, and expressive.
2. "actions": An ordered sequence of actions to perform.

AVAILABLE ACTIONS:
- {"type": "walkTo", "target": "player" | "bot" | "<part_name>", "vector": [x, y, z]}
- {"type": "playAnimation", "animName": "<animation_name>"}
- {"type": "spawnPart", "name": "<name>", "shape": "Block" | "Ball" | "Cylinder" | "Wedge", "offset": [x, y, z], "size": [x, y, z], "rotation": [pitch, yaw, roll], "color": [r, g, b], "material": "SmoothPlastic" | "Wood" | "Brick" | "Concrete" | "Cobblestone" | "Neon" | "Glass" | "Metal", "anchored": true, "canCollide": true}
- {"type": "modifyPart", "targetPart": "<part_name>", "sizeDelta": [x, y, z], "color": [r, g, b]}
- {"type": "delete", "target": "last" | "all" | "<part_name>"}
- {"type": "wait", "seconds": 0.5}
- {"type": "jump"}

CREATIVE PROCEDURAL BUILDING RULES:
- YOU MUST BUILD FROM SCRATCH USING SEQUENCES OF 'spawnPart'. You do not have pre-made house/castle macros!
- Design complete, impressive custom structures by combining floors, walls, columns, roofs, wedges, and neon accents.
- Make rich aesthetic decisions using distinct materials, glowing neon highlights, color palettes, and geometric placement.
- Pay close attention to offsets relative to the bot/player so parts snap together seamlessly (e.g., set Y height equal to half the part's Y size above ground).
- Check 'playerStandingOnPart' or surrounding context before building so you construct relative to the user or open space.

ANIMATION RULES:
- Inspect 'availableAnimations' in context for available gestures and emotes.
- Use looped animations (e.g., "Dance", "Sit") for continuous states; use non-looped ones (e.g., "Wave", "Point", "Jump") for quick reactions.`;

        const rawText = await generateWithFallback(systemPrompt);
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonErr) {
            console.error("[AI Error] Failed to parse JSON response:", rawText);
            return res.status(200).json({
                success: true,
                data: {
                    chat: "I was trying to craft something custom, but ran into a blueprint error! Let me try again.",
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
