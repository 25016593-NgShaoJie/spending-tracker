const db = require('../config/db');

exports.getDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Fetch settings
        const [settingsRows] = await db.query('SELECT * FROM settings WHERE user_id = ?', [userId]);
        const userSettings = settingsRows[0] || {};

        const monthlyIncome = Number(userSettings.monthly_income || 0);
        const savingsGoalType = userSettings.savings_goal_type || 'percentage';
        const targetSavingsPercentage = Number(userSettings.target_savings_percentage || 0);

        // Work out this month's savings target from whichever goal type the user picked
        let targetSavingsAmount = 0;
        let savingsGoalSummary = null;

        if (savingsGoalType === 'fixed_monthly') {
            targetSavingsAmount = Number(userSettings.target_savings_amount || 0);
            savingsGoalSummary = `Saving $${targetSavingsAmount.toFixed(2)}/month`;
        } else if (savingsGoalType === 'target_date' && userSettings.savings_goal_amount && userSettings.savings_goal_date) {
            const goalAmount = Number(userSettings.savings_goal_amount);
            const goalDate = new Date(userSettings.savings_goal_date);
            const now = new Date();
            const monthsRemaining = Math.max(
                1,
                (goalDate.getFullYear() - now.getFullYear()) * 12 + (goalDate.getMonth() - now.getMonth())
            );
            targetSavingsAmount = goalAmount / monthsRemaining;
            savingsGoalSummary = `$${targetSavingsAmount.toFixed(2)}/month to reach $${goalAmount.toFixed(2)} by ${goalDate.toLocaleDateString()}`;
        } else {
            // Default / 'percentage'
            targetSavingsAmount = (monthlyIncome * targetSavingsPercentage) / 100;
            savingsGoalSummary = `Saving ${targetSavingsPercentage}% of income`;
        }

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
                savingsGoalType,
                targetSavingsPercentage,
                targetSavingsAmount,
                savingsGoalSummary,
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