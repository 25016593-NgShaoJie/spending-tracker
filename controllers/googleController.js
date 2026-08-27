const { google } = require('googleapis');
const db = require('../config/db');

const getOAuthClient = () => {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
};

// Redirect user to Google permissions page
exports.redirectToGoogle = (req, res) => {
    const oauth2Client = getOAuthClient();
    const scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/userinfo.email'
    ];

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Required to get a refresh token
        prompt: 'consent',     // Guarantees we get a refresh_token every time
        scope: scopes
    });

    res.redirect(url);
};

// Handle OAuth Callback from Google
exports.handleGoogleCallback = async (req, res) => {
    try {
        const { code } = req.query;
        const userId = req.session.user.id;
        const oauth2Client = getOAuthClient();

        const { tokens } = await oauth2Client.getToken(code);

        if (tokens.refresh_token) {
            await db.execute(
                `UPDATE users SET google_refresh_token = ? WHERE id = ?`,
                [tokens.refresh_token, userId]
            );
            req.flash('success', 'Connected Google Account successfully!');
        } else {
            req.flash('success', 'Google Account re-authenticated.');
        }

        res.redirect('/settings');
    } catch (error) {
        console.error('Google Callback Error:', error);
        req.flash('error', 'Failed to connect Google Account.');
        res.redirect('/settings');
    }
};

// Save Google Sheet ID from Settings page
exports.saveSheetId = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { google_sheet_id } = req.body;

        if (!google_sheet_id) {
            req.flash('error', 'Please provide a valid Sheet ID.');
            return res.redirect('/settings');
        }

        await db.execute(
            `UPDATE users SET google_sheet_id = ? WHERE id = ?`,
            [google_sheet_id.trim(), userId]
        );

        req.flash('success', 'Google Sheet ID saved!');
        res.redirect('/settings');
    } catch (error) {
        console.error('Save Sheet ID Error:', error);
        req.flash('error', 'Failed to save Sheet ID.');
        res.redirect('/settings');
    }
};