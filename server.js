require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to handle transient 503 / busy errors with retries
async function generateWithRetry(userPrompt, systemPrompt) {
    const modelsToTry = ["gemini-3.8-flash", "gemini-2.5-flash"];

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });
            
            const result = await model.generateContent(systemPrompt);
            return result.response.text();
        } catch (error) {
            console.warn(`[AI] ${modelName} unavailable (${error.status || error.message}). Trying fallback...`);
        }
    }
    throw new Error("All AI models are currently busy.");
}

app.post('/command', async (req, res) => {
    try {
        const userPrompt = req.body.prompt;

        if (!userPrompt) {
            return res.status(400).json({ error: "No prompt provided." });
        }

        // Active production model
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const systemPrompt = `You are an AI game assistant in Roblox. Analyze the user's request: "${userPrompt}".
        Return ONLY valid JSON with two fields:
        1. "action": "move" or "none"
        2. "vector": [x, y, z] array of movement offset numbers.
        
        Example request: "move up 10 studs" -> {"action": "move", "vector": [0, 10, 0]}
        Example request: "move left 5 and down 2" -> {"action": "move", "vector": [-5, -2, 0]}`;

        // Call model with auto-retry handling
        const rawText = await generateWithRetry(model, systemPrompt);
        const data = JSON.parse(rawText);

        console.log(`[AI Response] Prompt: "${userPrompt}" ->`, data);
        res.json({ success: true, data });

    } catch (err) {
        console.error("Error processing prompt:", err.message);
        
        // Prevents Roblox HttpService from crashing by sending standard error JSON
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
