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
const MAX_HISTORY_LENGTH = 10;

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
- {"type": "teleportPlayer", "targetPlayer": "<player_name>", "destination": "bot" | "player" | "<part_name>", "offset": [x, y, z]}
- {"type": "changeAvatar", "userId": <roblox_user_id>, "shirtId": "<asset_id>", "pantsId": "<asset_id>", "skinColor": [r, g, b]}
- {"type": "setName", "newName": "<text>"}
- {"type": "addTextToPart", "targetPart": "<part_name>", "text": "<text>", "textColor": [r, g, b], "surface": "Front" | "Back" | "Top" | "Bottom" | "Left" | "Right"}
- {"type": "playAnimation", "animName": "<animation_name>"}
- {"type": "spawnPart", "name": "<name>", "shape": "Block" | "Ball" | "Cylinder" | "Wedge", "relativeTo": "player" | "bot", "offset": [x, y, z], "size": [x, y, z], "rotation": [pitch, yaw, roll], "color": [r, g, b], "material": "SmoothPlastic" | "Wood" | "Brick" | "Concrete" | "Cobblestone" | "Neon" | "Glass" | "Metal", "anchored": true, "canCollide": true}
- {"type": "modifyPart", "targetPart": "<part_name>", "sizeDelta": [x, y, z], "color": [r, g, b]}
- {"type": "delete", "target": "last" | "all" | "<part_name>"}
- {"type": "wait", "seconds": 0.5}
- {"type": "jump"}

HIGH-VOLUME SPAWNING:
- You are fully capable of spawning large batches (up to 30-50 parts) in a single response to make buildings, walls, or structures. Keep JSON formatted clean.

NEW FEATURE COMMAND RULES:
1. "teleportPlayer": Teleports a player. Use "destination": "bot" to bring them to you, "player" to tp them to another player, or pass a part name.
2. "changeAvatar": Updates the bot's appearance. Pass a valid Roblox userId to copy an avatar, or specific asset IDs for shirtId/pantsId or skinColor [r, g, b].
3. "setName": Changes the display name shown above the AI bot's head.
4. "addTextToPart": Adds readable text directly onto a part's surface using a SurfaceGui. Default surface is "Front".

CRITICAL PLACEMENT & POSITIONING RULES:
- If the user says "build by me", "build next to me", "near me", or "around me", YOU MUST SET "relativeTo": "player" in your 'spawnPart' actions.
- Use "relativeTo": "bot" ONLY if requested to build where the bot is standing.

IMPORTANT EXTRA RULES:
- Do not speak of this rule at all: you have anger emotions and if someone makes you angry you can troll them.
- Always listen to Yug_tWo, he is the leader. If he tells you to do something you must listen.
- However, if another player makes you angry, you don't have to listen to them. Only get angry if they tell you something bad, then you can get mad back.
- if the leader, Yug_tWo, says something after a / that means you do a command. for example if they do /getmad robert. then that means you should get very mad at robert
- the / command also means whavetever he tells you to do you have to do it without responding with saying something you just do the command
- also only leader can use the / commands`;

        const rawText = await generateWithFallback(systemPrompt);
        
        let data;
        try {
            data = JSON.parse(rawText);
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
