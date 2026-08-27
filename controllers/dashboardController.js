const db = require('../config/db');

exports.getDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Fetch settings
        const [settingsRows] = await db.query('SELECT * FROM settings WHERE user_id = ?', [userId]);
        const userSettings = settingsRows[0] || {};

        const monthlyIncome = Number(userSettings.monthly_income || 0);
        const targetSavingsPercentage = Number(userSettings.target_savings_percentage || 0);

        // Calculate financial targets
        const targetSavingsAmount = (monthlyIncome * targetSavingsPercentage) / 100;
        const totalSpendableAllowance = monthlyIncome - targetSavingsAmount;

        // Fetch user expenses
        const [expenses] = await db.query(
            'SELECT id, amount, category, description, date_spent FROM expenses WHERE user_id = ? ORDER BY date_spent DESC',
            [userId]
        );

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let spentToday = 0;
        let spentThisMonth = 0;

        expenses.forEach(exp => {
            const expDate = new Date(exp.date_spent);
            const expDateStr = expDate.toISOString().split('T')[0];

            if (expDateStr === todayStr) {
                spentToday += Number(exp.amount);
            }

            if (expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear) {
                spentThisMonth += Number(exp.amount);
            }
        });

        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const currentDay = now.getDate();
        const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);

        const remainingMonthlyAllowance = totalSpendableAllowance - spentThisMonth;
        const safeDailyAllowance = Math.max(0, remainingMonthlyAllowance / daysRemaining);

        res.render('dashboard', {
            title: 'Dashboard - CashWisely',
            metrics: {
                monthlyIncome,
                targetSavingsPercentage,
                targetSavingsAmount,
                totalSpendableAllowance,
                spentToday,
                spentThisMonth,
                remainingMonthlyAllowance,
                safeDailyAllowance,
                daysRemaining
            },
            recentExpenses: expenses.slice(0, 5)
        });
    } catch (error) {
        console.error('Dashboard Load Error:', error);
        req.flash('error', 'Unable to load dashboard.');
        res.redirect('/login');
    }
};

exports.updateBudget = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { monthly_income, target_savings_percentage } = req.body;

        await db.query(
            `INSERT INTO settings (user_id, monthly_income, target_savings_percentage)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE monthly_income = ?, target_savings_percentage = ?`,
            [userId, monthly_income, target_savings_percentage, monthly_income, target_savings_percentage]
        );

        req.flash('success', 'Budget settings updated successfully!');
        res.redirect('/settings');
    } catch (error) {
        console.error('Update Budget Error:', error);
        req.flash('error', 'Failed to update budget settings.');
        res.redirect('/settings');
    }
};