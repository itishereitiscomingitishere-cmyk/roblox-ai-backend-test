require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to handle transient 503 / busy errors with retries
async function generateWithRetry(model, prompt, retries = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            // Check for 503 (Service Unavailable / High Demand) or 429 (Rate Limit)
            const isTransientError = error.status === 503 || error.status === 429 || (error.message && error.message.includes('503'));
            
            if (isTransientError && attempt < retries) {
                console.warn(`[AI] Busy (Attempt ${attempt}/${retries}). Retrying in ${delayMs}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                delayMs *= 2; // Exponential backoff delay
            } else {
                throw error;
            }
        }
    }
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
