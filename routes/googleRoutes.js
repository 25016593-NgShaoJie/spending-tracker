const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const db = require('../config/db');

// Dynamic callback URI selection
const getRedirectUri = () => {
    if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
    if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;

    if (process.env.NODE_ENV === 'production') {
        return 'https://cashwisely.onrender.com/auth/google/callback';
    }

    return 'http://localhost:4000/auth/google/callback';
};

const getOAuth2Client = () => {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        getRedirectUri()
    );
};

// Route to initiate Google OAuth
router.get('/auth/google', (req, res) => {
    if (!req.session || !req.session.user) {
        req.flash('error', 'Please log in before connecting Google.');
        return res.redirect('/login');
    }

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

// Route to handle Google OAuth Callback
router.get('/auth/google/callback', async (req, res) => {
    // Check if user session was lost during redirect
    if (!req.session || !req.session.user) {
        console.error('OAuth Callback Error: Session lost during cross-site redirect.');
        if (req.flash) req.flash('error', 'Session expired during login. Please try again.');
        return res.redirect('/login');
    }

    const { code } = req.query;
    if (!code) {
        if (req.flash) req.flash('error', 'No authorization code returned from Google.');
        return res.redirect('/settings');
    }

    try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        req.session.tokens = tokens;
        const userId = req.session.user.id;

        // Save refresh token to user record if provided
        if (tokens.refresh_token) {
            await db.query(
                'UPDATE users SET google_refresh_token = ? WHERE id = ?',
                [tokens.refresh_token, userId]
            );
        }

        // Create Google Spreadsheet (using updated requestBody parameter)
        const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
        const spreadsheet = await sheets.spreadsheets.create({
            requestBody: { 
                properties: { title: 'CashWisely Expenses' } 
            },
            fields: 'spreadsheetId'
        });

        const spreadsheetId = spreadsheet.data.spreadsheetId;

        // Initialize header row (using updated requestBody parameter)
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Sheet1!A1:D1',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['Date', 'Category', 'Amount ($)', 'Description']]
            }
        });

        // Store sheet ID in settings table
        await db.query(
            `INSERT INTO settings (user_id, google_sheet_id) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE google_sheet_id = ?`,
            [userId, spreadsheetId, spreadsheetId]
        );

        req.flash('success', 'Successfully connected Google Account and initialized Sheet!');
        res.redirect('/settings');
    } catch (error) {
        const errorDetails = error.response ? error.response.data : error.message;
        console.error('Google OAuth Error:', errorDetails);
        
        req.flash('error', 'Failed to connect Google Account: ' + (errorDetails.error_description || error.message));
        res.redirect('/settings');
    }
});

module.exports = router;