const db = require('../config/db');
const { parseSavingsGoal, computeSavingsPlan } = require('../utils/savingsGoal');

exports.getDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Fetch settings and work out this month's savings target from
        // whichever goal type the user picked (percentage / fixed / target date)
        const [settingsRows] = await db.query('SELECT * FROM settings WHERE user_id = ?', [userId]);
        const userSettings = settingsRows[0] || {};
        const plan = computeSavingsPlan(userSettings);
        const { monthlyIncome, savingsGoalType, targetSavingsPercentage, targetSavingsAmount, savingsGoalSummary } = plan;

        const totalSpendableAllowance = monthlyIncome - targetSavingsAmount;

        // Fetch user expenses
        const [expenses] = await db.query(
            'SELECT id, amount, category, description, date_spent FROM expenses WHERE user_id = ? ORDER BY date_spent DESC',
            [userId]
        );

        // Fetch deposits — extra money added on top of the baseline income
        const [deposits] = await db.query(
            'SELECT id, amount, source, date_added FROM deposits WHERE user_id = ? ORDER BY date_added DESC',
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

        let depositsThisMonth = 0;
        deposits.forEach(dep => {
            const depDate = new Date(dep.date_added);
            if (depDate.getMonth() === currentMonth && depDate.getFullYear() === currentYear) {
                depositsThisMonth += Number(dep.amount);
            }
        });

        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const currentDay = now.getDate();
        const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);

        const remainingMonthlyAllowance = (totalSpendableAllowance + depositsThisMonth) - spentThisMonth;
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
                depositsThisMonth,
                spentToday,
                spentThisMonth,
                remainingMonthlyAllowance,
                safeDailyAllowance,
                daysRemaining
            },
            recentExpenses: expenses.slice(0, 5),
            recentDeposits: deposits.slice(0, 5)
        });
    } catch (error) {
        console.error('Dashboard Load Error:', error);
        req.flash('error', 'Unable to load dashboard.');
        res.redirect('/login');
    }
};

exports.getSettings = async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [rows] = await db.query('SELECT * FROM settings WHERE user_id = ?', [userId]);
        const userSettings = rows[0] || {};
        const plan = computeSavingsPlan(userSettings);

        // Format the goal date for the <input type="date"> value
        let savingsGoalDate = '';
        if (userSettings.savings_goal_date) {
            savingsGoalDate = new Date(userSettings.savings_goal_date).toISOString().split('T')[0];
        }

        res.render('settings', {
            title: 'Settings - CashWisely',
            settings: {
                monthlyIncome: userSettings.monthly_income || 0,
                savingsGoalType: userSettings.savings_goal_type || 'percentage',
                targetSavingsPercentage: userSettings.target_savings_percentage || 0,
                targetSavingsAmount: userSettings.target_savings_amount || 0,
                savingsGoalAmount: userSettings.savings_goal_amount || '',
                savingsGoalDate,
                googleSheetId: userSettings.google_sheet_id || null
            },
            plan
        });
    } catch (error) {
        console.error('Settings Load Error:', error);
        req.flash('error', 'Unable to load settings.');
        res.redirect('/dashboard');
    }
};

exports.updateBudget = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { monthly_income } = req.body;

        const numericIncome = Number(monthly_income);
        if (isNaN(numericIncome) || numericIncome <= 0) {
            req.flash('error', 'Monthly income must be greater than $0.');
            return res.redirect('/settings');
        }

        const goal = parseSavingsGoal(req.body);
        if (goal.error) {
            req.flash('error', goal.error);
            return res.redirect('/settings');
        }

        await db.query(
            `INSERT INTO settings
                (user_id, monthly_income, savings_goal_type, target_savings_percentage, target_savings_amount, savings_goal_amount, savings_goal_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                monthly_income = VALUES(monthly_income),
                savings_goal_type = VALUES(savings_goal_type),
                target_savings_percentage = VALUES(target_savings_percentage),
                target_savings_amount = VALUES(target_savings_amount),
                savings_goal_amount = VALUES(savings_goal_amount),
                savings_goal_date = VALUES(savings_goal_date)`,
            [
                userId,
                numericIncome,
                goal.data.savings_goal_type,
                goal.data.target_savings_percentage,
                goal.data.target_savings_amount,
                goal.data.savings_goal_amount,
                goal.data.savings_goal_date
            ]
        );

        req.flash('success', 'Budget settings updated successfully!');
        res.redirect('/settings');
    } catch (error) {
        console.error('Update Budget Error:', error);
        req.flash('error', 'Failed to update budget settings.');
        res.redirect('/settings');
    }
};