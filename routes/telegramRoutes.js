const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');

// Safely initialize Gemini API
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Helper to send messages back to Telegram
async function sendTelegramMessage(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error('[Telegram Error]: TELEGRAM_BOT_TOKEN is missing from environment variables.');
        return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('[Telegram API Rejected Message]:', response.status, errorData);
        }
    } catch (err) {
        console.error('[Telegram Network Error]:', err);
    }
}

// Fetch public Google Sheet KB as CSV
async function getKnowledgeBase() {
    try {
        const sheetId = process.env.KB_SPREADSHEET_ID;
        if (!sheetId) {
            console.error('[Google Sheets Error]: KB_SPREADSHEET_ID is missing from environment variables.');
            return '';
        }

        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        const response = await fetch(csvUrl);
        
        if (!response.ok) {
            console.error('[Google Sheets Error]: Ensure your sheet is set to "Anyone with the link can view"');
            return '';
        }

        return await response.text();
    } catch (err) {
        console.error('[Failed to read Knowledge Base Sheet]:', err.message);
        return '';
    }
}

// Telegram Webhook Endpoint
router.post('/api/telegram/webhook', async (req, res) => {
    // Instantly acknowledge Telegram to prevent retries
    res.sendStatus(200);

    const update = req.body;
    if (!update || !update.message || !update.message.text) return;

    const userChatId = update.message.chat.id;
    const userMessage = update.message.text;
    const userName = update.message.from.first_name || 'User';

    // Command Handler
    if (userMessage.startsWith('/')) {
        await sendTelegramMessage(userChatId, `Hi ${userName}! Welcome to CashWisely Support. Ask me any question regarding your account, budgets, or Google Sheets sync.`);
        return;
    }

    // Verify Gemini Initialization
    if (!ai) {
        console.error('[Gemini API Error]: GEMINI_API_KEY environment variable is missing on Render.');
        await sendTelegramMessage(userChatId, "Our support bot is currently undergoing maintenance (Missing API configuration). Please try again shortly.");
        return;
    }

    const kbContext = await getKnowledgeBase();

    const systemPrompt = `
You are the CashWisely Support Bot.
Answer the user's question using ONLY the explicit facts from the Knowledge Base below.

KNOWLEDGE BASE:
${kbContext}

STRICT CONSTRAINTS:
1. If the answer is clearly in the Knowledge Base, provide a short, friendly, and helpful response.
2. If the answer is NOT in the Knowledge Base or requires human intervention, reply with EXACTLY: "[ESCALATE]"
3. Do not assume, guess, or use external knowledge outside the provided list.
`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                { role: 'user', parts: [{ text: systemPrompt }, { text: `User Question: ${userMessage}` }] }
            ]
        });

        const replyText = response.text ? response.text.trim() : '[ESCALATE]';

        if (replyText.includes('[ESCALATE]')) {
            // 1. Notify the user
            await sendTelegramMessage(
                userChatId,
                "I don't have the exact details for this right now, but support is on the way! Our team has been notified, and a staff member will review your message shortly."
            );

            // 2. Alert Admin / Group Chat
            const adminChatId = process.env.TELEGRAM_CHAT_ID;
            if (adminChatId && String(adminChatId) !== String(userChatId)) {
                const alertMessage = `⚠️ Help Desk Escalation\n\nFrom: ${userName} (Chat ID: ${userChatId})\nQuestion: "${userMessage}"`;
                await sendTelegramMessage(adminChatId, alertMessage);
            }
        } else {
            await sendTelegramMessage(userChatId, replyText);
        }
    } catch (error) {
        console.error('[Gemini API Error]:', error);
        await sendTelegramMessage(userChatId, "Our support bot experienced a temporary error. Please try again shortly.");
    }
});

module.exports = router;