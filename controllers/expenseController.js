const db = require('../config/db');
const { appendExpenseToSheet } = require('./googleController');

exports.addExpense = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { amount, category, description, date_spent } = req.body;

        // Save expense into MySQL
        const [result] = await db.query(
            'INSERT INTO expenses (user_id, amount, category, description, date_spent) VALUES (?, ?, ?, ?, ?)',
            [userId, amount, category, description || null, date_spent]
        );

        // Sync expense payload to Google Sheets
        const expensePayload = { date_spent, category, amount, description };
        appendExpenseToSheet(userId, expensePayload, req.session.tokens);

        req.flash('success', 'Expense logged successfully!');
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Add Expense Error:', error);
        req.flash('error', 'Failed to log expense.');
        res.redirect('/dashboard');
    }
};

exports.getExpenses = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { startDate = '', endDate = '', category = 'All' } = req.query;

        let sql = 'SELECT id, amount, category, description, date_spent FROM expenses WHERE user_id = ?';
        const params = [userId];

        if (startDate) {
            sql += ' AND date_spent >= ?';
            params.push(startDate);
        }
        if (endDate) {
            sql += ' AND date_spent <= ?';
            params.push(endDate);
        }
        if (category && category !== 'All') {
            sql += ' AND category = ?';
            params.push(category);
        }

        sql += ' ORDER BY date_spent DESC';

        const [expenses] = await db.query(sql, params);

        res.render('expenses', {
            title: 'Expense History - CashWisely',
            expenses,
            filters: { startDate, endDate, category }
        });
    } catch (error) {
        console.error('Fetch Expenses Error:', error);
        req.flash('error', 'Unable to load expenses.');
        res.redirect('/dashboard');
    }
};