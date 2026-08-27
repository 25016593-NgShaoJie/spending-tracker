const db = require('../config/db');

// Render Dashboard View
exports.getDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Fetch user budget settings
        const [settingsRows] = await db.execute(
            'SELECT monthly_income, target_savings_percentage FROM budget_settings WHERE user_id = ?',
            [userId]
        );

        const monthlyIncome = settingsRows.length ? Number(settingsRows[0].monthly_income) : 0;
        const targetSavingsPercentage = settingsRows.length ? Number(settingsRows[0].target_savings_percentage) : 20;

        // Fetch total spent this month
        const [monthlySpentRows] = await db.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses 
             WHERE user_id = ? AND MONTH(date_spent) = MONTH(CURRENT_DATE()) AND YEAR(date_spent) = YEAR(CURRENT_DATE())`,
            [userId]
        );
        const spentThisMonth = Number(monthlySpentRows[0].total);

        // Fetch total spent today
        const [todaySpentRows] = await db.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses 
             WHERE user_id = ? AND date_spent = CURRENT_DATE()`,
            [userId]
        );
        const spentToday = Number(todaySpentRows[0].total);

        // Financial calculations
        const targetSavingsAmount = (monthlyIncome * targetSavingsPercentage) / 100;
        const totalSpendableAllowance = monthlyIncome - targetSavingsAmount;
        const remainingMonthlyAllowance = totalSpendableAllowance - spentThisMonth;

        const now = new Date();
        const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysRemaining = totalDaysInMonth - now.getDate() + 1;
        const safeDailyAllowance = remainingMonthlyAllowance > 0 ? (remainingMonthlyAllowance / daysRemaining) : 0;

        // Recent expenses for dashboard
        const [recentExpenses] = await db.execute(
            `SELECT id, amount, category, description, image_url, date_spent FROM expenses 
             WHERE user_id = ? ORDER BY date_spent DESC, created_at DESC LIMIT 5`,
            [userId]
        );

        res.render('dashboard', {
            title: 'Dashboard',
            metrics: {
                monthlyIncome,
                targetSavingsPercentage,
                targetSavingsAmount,
                totalSpendableAllowance,
                spentThisMonth,
                remainingMonthlyAllowance,
                spentToday,
                safeDailyAllowance,
                daysRemaining
            },
            recentExpenses
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        req.flash('error', 'Failed to load dashboard.');
        res.redirect('/login');
    }
};

// Render & Update Settings View
exports.getSettings = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [rows] = await db.execute(
            `SELECT u.google_sheet_id, b.monthly_income, b.target_savings_percentage 
             FROM users u LEFT JOIN budget_settings b ON u.id = b.user_id WHERE u.id = ?`,
            [userId]
        );

        const settings = rows[0] || {};
        res.render('settings', {
            title: 'Settings',
            settings: {
                monthlyIncome: settings.monthly_income || 0,
                targetSavingsPercentage: settings.target_savings_percentage || 20,
                googleSheetId: settings.google_sheet_id || ''
            }
        });
    } catch (error) {
        console.error('Error loading settings:', error);
        res.redirect('/dashboard');
    }
};

exports.updateBudget = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { monthly_income, target_savings_percentage } = req.body;

        await db.execute(
            `INSERT INTO budget_settings (user_id, monthly_income, target_savings_percentage) 
             VALUES (?, ?, ?) 
             ON DUPLICATE KEY UPDATE 
                monthly_income = VALUES(monthly_income), 
                target_savings_percentage = VALUES(target_savings_percentage)`,
            [userId, monthly_income, target_savings_percentage]
        );

        req.flash('success', 'Budget updated!');
        res.redirect('/settings');
    } catch (error) {
        console.error('Error updating budget:', error);
        req.flash('error', 'Failed to update budget.');
        res.redirect('/settings');
    }
};