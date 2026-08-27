const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isLoggedIn } = require('../middleware/auth');
const db = require('../config/db'); // Added missing DB import

router.get('/dashboard', isLoggedIn, dashboardController.getDashboard);

// Added isLoggedIn middleware to protect session access
router.get('/settings', isLoggedIn, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Fetch user settings safely from database
        const [rows] = await db.query('SELECT * FROM settings WHERE user_id = ?', [userId]);
        const userSettings = rows.length > 0 ? rows[0] : {};

        res.render('settings', {
            title: 'Settings - CashWisely',
            settings: {
                monthlyIncome: userSettings.monthly_income || 0,
                targetSavingsPercentage: userSettings.target_savings_percentage || 0,
                googleSheetId: userSettings.google_sheet_id || null
            }
        });
    } catch (error) {
        console.error('Error loading settings:', error);
        req.flash('error', 'Unable to load settings.');
        res.redirect('/dashboard');
    }
});

router.post('/settings/budget', isLoggedIn, dashboardController.updateBudget);

module.exports = router;