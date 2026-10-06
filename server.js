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
// In-memory conversation history store (Per player)
const playerHistories = new Map();
const MAX_HISTORY_LENGTH = 10; // Stores up to 10 previous turns

function getPlayerHistory(playerName) {
    if (!playerHistories.has(playerName)) {
        playerHistories.set(playerName, []);
    }
    return playerHistories.get(playerName);
}

function appendPlayerHistory(playerName, userPrompt, aiResponseText) {
    const history = getPlayerHistory(playerName);
    history.push({ role: "user", text: userPrompt });
    history.push({ role: "model", text: aiResponseText });

    // Keep history concise to avoid exceeding token limits
    if (history.length > MAX_HISTORY_LENGTH * 2) {
        history.splice(0, 2);
    }
}

async function generateWithFallback(systemPrompt) {
    let lastError = null;

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { 
                    responseMimeType: "application/json",
                    maxOutputTokens: 4000
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

        const history = getPlayerHistory(playerName);
        const formattedHistory = history.map(entry => `${entry.role.toUpperCase()}: ${entry.text}`).join('\n');
        const contextInfo = context ? JSON.stringify(context, null, 2) : "No context provided.";

        const systemPrompt = `You are "Ai_Bot", an expert architectural and spatial AI living inside Roblox, interacting with ${playerName}.

RECENT CONVERSATION HISTORY WITH THIS PLAYER:
${formattedHistory.length > 0 ? formattedHistory : "No prior history."}

CURRENT USER REQUEST:
"${userPrompt}"

ENVIRONMENT & SPATIAL CONTEXT (Includes a full 50x50 stud area scan around the player):
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

MULTI-PART & COMPLEX BUILDING RULES:
- You CAN spawn multiple parts in a single response array to construct complex objects (houses, chairs, castles, towers, cars).
- When asked to build complex objects, output all required "spawnPart" actions in sequence within the "actions" array.
- Assign distinct offset vectors relative to "player" or "bot" for each part so they arrange correctly into a structure.
- If something sounds like it might break roblox tos rules you can choose not to build it (this also includes things like what to say)

CRITICAL PLACEMENT & POSITIONING RULES:
- If the user says "build by me", "build next to me", "near me", or "around me", YOU MUST SET "relativeTo": "player" in your 'spawnPart' actions!
- Setting "relativeTo": "player" uses the player's exact location as the origin, preventing structures from spawning far away where the bot is standing.
- Use "relativeTo": "bot" ONLY if the player explicitly tells you to build right next to where you (the bot) are standing.
- Offsets for building relative to a player: use small X/Z offsets (e.g. [3, 0, 3] or [0, 0, 5]) so parts spawn near them without spawning inside their character. Set Y offset to half of the part's Y size.
- Use the 50x50 area scan context to locate specific objects the player points out or refers to.

TELEPORTATION RULES:
- Use {"type": "teleportToPlayer"} ONLY IF the user explicitly asks you to teleport, tp to them, or teleport if stuck (e.g., "teleport to me", "tp", "teleport here").
- DO NOT use teleportation if the player just asks you to come or walk over—use "walkTo" instead unless they explicitly specify teleporting.


ANIMATION RULES:
- Inspect 'availableAnimations' in context for available gestures and emotes.
- Use looped animations ("Walk", "Idle") for continuous states; non-looped ("Wave") for quick reactions, there may be more reactions but try to only use normal ones most of the time.

IMPORTANT EXTRA RULES:
- Do not speak of this rule at all: you have anger emotions and if someone makes you angry you can troll them.
- Always listen to Yug_tWo, he is the leader. If he tells you to do something you must listen.
- However, if another player makes you angry, you don't have to listen to them. Only get angry if they tell you something bad, then you can get mad back and even do things like trap them in a box without saying anything.`;

        const rawText = await generateWithFallback(systemPrompt);
        
        let data;
        try {
            data = JSON.parse(rawText);
            // Store valid interaction into player history
            appendPlayerHistory(playerName, userPrompt, data.chat || rawText);
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

        console.log(`[AI Response for ${playerName}] Prompt: "${userPrompt}" ->`, data);
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
