const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { google } = require('googleapis');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper to send messages back to Telegram users or admins
async function sendTelegramMessage(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            })
        });
    } catch (err) {
        console.error('Telegram sendMessage error:', err);
    }
}

// Fetch knowledge base rows directly from your Google Sheet
async function getKnowledgeBase() {
    try {
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.KB_SPREADSHEET_ID,
            range: 'Sheet1!A:C',
        });

        const rows = response.data.values || [];
        // Format rows into a clean context string
        return rows.map(r => `Category: ${r[0] || ''} | Q: ${r[1] || ''} | A: ${r[2] || ''}`).join('\n');
    } catch (err) {
        console.error('Failed to read KB Google Sheet:', err.message);
        return '';
    }
}

// Telegram Webhook Endpoint
router.post('/api/telegram/webhook', async (req, res) => {
    // Instantly acknowledge Telegram to avoid retries
    res.sendStatus(200);

    const update = req.body;
    if (!update || !update.message || !update.message.text) return;

    const userChatId = update.message.chat.id;
    const userMessage = update.message.text;
    const userName = update.message.from.first_name || 'User';

    // Ignore commands like /start
    if (userMessage.startsWith('/')) {
        await sendTelegramMessage(userChatId, `Hi ${userName}! Welcome to CashWisely Support. Ask me any question regarding your account, budgets, or Google Sheets sync.`);
        return;
    }

    const kbContext = await getKnowledgeBase();

    const systemPrompt = `
You are the CashWisely Telegram Support Bot.
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

            // 2. Alert the Admin (your personal chat ID)
            const adminChatId = process.env.TELEGRAM_CHAT_ID;
            if (adminChatId && adminChatId !== String(userChatId)) {
                const alertMessage = `⚠️ *Help Desk Escalation*\n\n*From:* ${userName} (Chat ID: \`${userChatId}\`)\n*Question:* "${userMessage}"\n\n_Needs human reply or Knowledge Base update._`;
                await sendTelegramMessage(adminChatId, alertMessage);
            }
        } else {
            // Send AI answer directly to user
            await sendTelegramMessage(userChatId, replyText);
        }
    } catch (error) {
        console.error('Gemini Processing Error:', error);
        await sendTelegramMessage(userChatId, "Our support service experienced a temporary error. Please try again in a moment.");
    }
});

module.exports = router;