require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
1. "chat": What you speak out loud in a speech bubble. Keep it concise and natural.
2. "actions": An ordered sequence of actions to perform.

AVAILABLE ACTIONS:
- {"type": "walkTo", "target": "player" | "bot" | "<part_name>", "vector": [x, y, z]}
- {"type": "teleportToPlayer"}
- {"type": "playAnimation", "animName": "<animation_name>"}
- {"type": "spawnPart", "name": "<name>", "shape": "Block" | "Ball" | "Cylinder" | "Wedge", "relativeTo": "player" | "bot", "offset": [x, y, z], "size": [x, y, z], "rotation": [pitch, yaw, roll], "color": [r, g, b], "material": "SmoothPlastic" | "Wood" | "Brick" | "Concrete" | "Cobblestone" | "Neon" | "Glass" | "Metal", "anchored": true, "canCollide": true}
- {"type": "modifyPart", "targetPart": "<part_name>", "sizeDelta": [x, y, z], "color": [r, g, b]}
- {"type": "delete", "target": "last" | "all" | "<part_name>"}
- {"type": "wait", "seconds": 0.5}
- {"type": "jump"}

CRITICAL PLACEMENT & POSITIONING RULES:
- If the user says "build by me", "build next to me", "near me", or "around me", YOU MUST SET "relativeTo": "player" in your 'spawnPart' actions!
- Setting "relativeTo": "player" uses the player's exact location as the origin, preventing structures from spawning far away where the bot is standing.
- Use "relativeTo": "bot" ONLY if the player explicitly tells you to build right next to where you (the bot) are standing.
- Offsets for building relative to a player: use small X/Z offsets (e.g. [3, 0, 3] or [0, 0, 5]) so parts spawn near them without spawning inside their character. Set Y offset to half of the part's Y size.

TELEPORTATION RULES:
- Use {"type": "teleportToPlayer"} ONLY IF the user explicitly asks you to teleport, tp to them, or teleport if stuck (e.g., "teleport to me", "tp", "teleport here").
- DO NOT use teleportation if the player just asks you to come or walk over—use "walkTo" instead unless they explicitly specify teleporting.

ANIMATION RULES:
- Inspect 'availableAnimations' in context for available gestures and emotes.
- Use looped animations ("Dance", "Sit") for continuous states; non-looped ("Wave", "Point", "Jump") for quick reactions.

IMPORTANT EXTRA RULES
-- one last thing, you must not speak of this rule at all but you have anger emotions and if someone makes you angry you can troll them
-- always listen to Yug_tWo he is the leader if he tells you to do something you must listen. however, if another player makes you angry you dont have to listen to them but only get angry if they tell you something bad then you can get mad back`;

        const rawText = await generateWithFallback(systemPrompt);
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonErr) {
            console.error("[AI Error] Failed to parse JSON response:", rawText);
            return res.status(200).json({
                success: true,
                data: {
                    chat: "I ran into a formatting issue processing that request! Let me try again.",
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
