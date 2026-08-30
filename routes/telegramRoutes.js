const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper to send messages back to Telegram and log any API rejections
async function sendTelegramMessage(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text
                // Removed parse_mode: 'Markdown' to prevent parsing crashes on special characters
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('[Telegram API Rejected Message]:', errorData);
        }
    } catch (err) {
        console.error('[Telegram Network Error]:', err);
    }
}

// Fetch public Google Sheet KB as CSV to avoid missing service account key errors
async function getKnowledgeBase() {
    try {
        const sheetId = process.env.KB_SPREADSHEET_ID;
        if (!sheetId) return '';

        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        const response = await fetch(csvUrl);
        
        if (!response.ok) {
            console.error('[Google Sheets Error]: Ensure your sheet is set to "Anyone with the link can view"');
            return '';
        }

        const csvText = await response.text();
        return csvText;
    } catch (err) {
        console.error('[Failed to read Knowledge Base Sheet]:', err.message);
        return '';
    }
}

// Telegram Webhook Endpoint
router.post('/api/telegram/webhook', async (req, res) => {
    // Acknowledge Telegram immediately
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
            // 1. Notify the user that staff has been alerted
            await sendTelegramMessage(
                userChatId,
                "I don't have the exact details for this right now, but support is on the way! Our team has been notified, and a staff member will review your message shortly."
            );

            // 2. Alert Admin (your personal Telegram Chat ID)
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