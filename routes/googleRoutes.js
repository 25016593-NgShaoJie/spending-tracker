const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

// Initialize OAuth2 Client using the env variable
const getOAuth2Client = () => {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback'
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
router.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);
        
        req.session.tokens = tokens;
        
        req.flash('success', 'Successfully connected Google Account!');
        res.redirect('/settings');
    } catch (error) {
        console.error('Google OAuth Error:', error);
        req.flash('error', 'Failed to connect Google Account.');
        res.redirect('/settings');
    }
});

module.exports = router;