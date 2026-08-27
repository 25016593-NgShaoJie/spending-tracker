const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isLoggedIn } = require('../middleware/auth');
const db = require('../config/db');

router.get('/dashboard', isLoggedIn, dashboardController.getDashboard);

router.get('/settings', isLoggedIn, async (req, res) => {
    try {
        const userId = req.session.user ? req.session.user.id : null;

        if (!userId) {
            return res.redirect('/login');
        }

        // Fetch settings from database safely
        let userSettings = {
            monthlyIncome: 0,
            targetSavingsPercentage: 0,
            googleSheetId: null
        };

        try {
            const [rows] = await db.query('SELECT * FROM settings WHERE user_id = ?', [userId]);
            if (rows && rows.length > 0) {
                userSettings = {
                    monthlyIncome: rows[0].monthly_income || 0,
                    targetSavingsPercentage: rows[0].target_savings_percentage || 0,
                    googleSheetId: rows[0].google_sheet_id || null
                };
            }
        } catch (dbError) {
            console.error('Settings DB Query Error:', dbError);
        }

        // Render settings page
        res.render('settings', {
            title: 'Settings - CashWisely',
            settings: userSettings
        });
    } catch (error) {
        // Log the exact error to Render logs
        console.error('CRITICAL SETTINGS ROUTE ERROR:', error);
        req.flash('error', 'Unable to load settings.');
        res.redirect('/dashboard');
    }
});

router.post('/settings/budget', isLoggedIn, dashboardController.updateBudget);

module.exports = router;