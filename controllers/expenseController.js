const db = require('../config/db');
const { appendExpenseToSheet } = require('./googleController');

exports.addExpense = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { amount, category, description, date_spent } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        // 1. Save to MySQL database
        await db.query(
            'INSERT INTO expenses (user_id, amount, category, description, date_spent, image_url) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, amount, category, description || null, date_spent, imageUrl]
        );

        // 2. Prepare payload for Google Sheets duplicate check and append
        const expensePayload = {
            date_spent,
            category,
            amount,
            description,
            imageUrl
        };

        // 3. Trigger Google Sheets sync (non-blocking)
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
        const [expenses] = await db.query(
            'SELECT * FROM expenses WHERE user_id = ? ORDER BY date_spent DESC',
            [userId]
        );

        res.render('expenses', {
            title: 'Expense History - CashWisely',
            expenses
        });
    } catch (error) {
        console.error('Fetch Expenses Error:', error);
        req.flash('error', 'Unable to load expenses.');
        res.redirect('/dashboard');
    }
};