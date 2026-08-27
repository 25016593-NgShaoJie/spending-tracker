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