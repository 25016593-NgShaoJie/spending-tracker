const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isLoggedIn } = require('../middleware/auth');
const db = require('../config/db');

router.get('/dashboard', isLoggedIn, dashboardController.getDashboard);

router.get('/settings', isLoggedIn, async (req, res) => {
    try {
        const userId = req.session.user.id;

        // 1. Fetch user settings
        let [rows] = await db.query('SELECT * FROM settings WHERE user_id = ?', [userId]);

        // 2. If user has no settings row yet, insert a default row automatically
        if (rows.length === 0) {
            await db.query(
                'INSERT INTO settings (user_id, monthly_income, target_savings_percentage) VALUES (?, 0, 0)',
                [userId]
            );
            [rows] = await db.query('SELECT * FROM settings WHERE user_id = ?', [userId]);
        }

        const userSettings = rows[0] || {};

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