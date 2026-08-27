const db = require('../config/db');
const { appendExpenseToSheet } = require('./googleController');

exports.addExpense = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { amount, category, description, date_spent } = req.body;
        const imageUrl = req.file ? req.file.path : null;

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

        // 3. Sync to Google Sheets (awaited so it can't be lost to a restart/redeploy)
        const synced = await appendExpenseToSheet(userId, expensePayload, req.session.tokens);

        if (synced) {
            req.flash('success', 'Expense logged successfully!');
        } else {
            req.flash('success', 'Expense logged, but Google Sheets sync failed - check your connection in Settings.');
        }
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

        const filters = {
            startDate: req.query.startDate || '',
            endDate: req.query.endDate || '',
            category: req.query.category || 'All'
        };

        let query = 'SELECT * FROM expenses WHERE user_id = ?';
        const params = [userId];

        if (filters.startDate) {
            query += ' AND date_spent >= ?';
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            query += ' AND date_spent <= ?';
            params.push(filters.endDate);
        }
        if (filters.category && filters.category !== 'All') {
            query += ' AND category = ?';
            params.push(filters.category);
        }

        query += ' ORDER BY date_spent DESC';

        const [expenses] = await db.query(query, params);

        res.render('expenses', {
            title: 'Expense History - CashWisely',
            expenses,
            filters
        });
    } catch (error) {
        console.error('Fetch Expenses Error:', error);
        req.flash('error', 'Unable to load expenses.');
        res.redirect('/dashboard');
    }
};