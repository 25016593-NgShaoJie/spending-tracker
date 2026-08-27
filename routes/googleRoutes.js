const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

// Helper function to resolve the correct callback URI
const getRedirectUri = () => {
    // 1. First choice: Use GOOGLE_REDIRECT_URI or GOOGLE_CALLBACK_URL if defined in environment
    if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
    if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;

    // 2. Fallback check based on deployment mode
    if (process.env.NODE_ENV === 'production') {
        return 'https://cashwisely.onrender.com/auth/google/callback';
    }

    // 3. Default local development fallback
    return 'http://localhost:4000/auth/google/callback';
};

// Initialize OAuth2 Client using dynamic URI
const getOAuth2Client = () => {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        getRedirectUri()
    );
};

// Route to initiate Google Auth
router.get('/auth/google', (req, res) => {
    const oauth2Client = getOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/spreadsheets'
        ]
    });
    res.redirect(url);
});

// Route to handle Google Auth Callback
// Route to handle Google Auth Callback
router.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        req.session.tokens = tokens;

        // Initialize Google Sheets API
        const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

        // Create a new Google Spreadsheet for the user
        const resource = {
            properties: {
                title: 'CashWisely - Expense Tracker',
            },
        };

        const spreadsheet = await sheets.spreadsheets.create({
            resource,
            fields: 'spreadsheetId,spreadsheetUrl',
        });

        const spreadsheetId = spreadsheet.data.spreadsheetId;
        const spreadsheetUrl = spreadsheet.data.spreadsheetUrl;

        // Save spreadsheet details to session (or update user in DB)
        req.session.spreadsheetId = spreadsheetId;
        // Example DB update: await db.query('UPDATE users SET spreadsheet_id = ? WHERE id = ?', [spreadsheetId, req.session.user.id]);

        // Format headers in the new sheet
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Sheet1!A1:D1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [['Date', 'Category', 'Amount ($)', 'Description']]
            }
        });

        req.flash('success', `Google Account connected! Sheet created: ${spreadsheetUrl}`);
        res.redirect('/settings');
    } catch (error) {
        console.error('Google Sheets Linking Error:', error);
        req.flash('error', 'Connected account, but failed to initialize Google Sheet.');
        res.redirect('/settings');
    }
});

module.exports = router;