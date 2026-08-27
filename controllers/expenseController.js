const db = require('../config/db');
const { appendExpenseToSheet } = require('./googleController');

exports.addExpense = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { amount, category, description, date_spent } = req.body;
        
        // Extract raw image buffer and mime type if uploaded
        const receiptData = req.file ? req.file.buffer : null;
        const receiptMimetype = req.file ? req.file.mimetype : null;

        // 1. Insert expense record and raw image buffer into MySQL
        const [result] = await db.query(
            'INSERT INTO expenses (user_id, amount, category, description, date_spent, receipt_data, receipt_mimetype) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, amount, category, description || null, date_spent, receiptData, receiptMimetype]
        );

        const expenseId = result.insertId;
        const imageUrl = receiptData ? `/expenses/receipt/${expenseId}` : null;

        // 2. Sync to Google Sheets
        const expensePayload = {
            id: expenseId,
            date_spent,
            category,
            amount,
            description,
            imageUrl
        };

        const synced = await appendExpenseToSheet(userId, expensePayload, req.session.tokens);

        if (synced) {
            req.flash('success', 'Expense logged and synced to Google Sheets!');
        } else {
            req.flash('success', 'Expense logged successfully (Google Sheets sync bypassed or disconnected).');
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

        let query = 'SELECT id, amount, category, description, date_spent, (receipt_data IS NOT NULL) AS has_receipt FROM expenses WHERE user_id = ?';
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

// Route controller to retrieve and display stored receipt image binary from MySQL
exports.getReceiptImage = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const expenseId = req.params.id;

        const [rows] = await db.query(
            'SELECT receipt_data, receipt_mimetype FROM expenses WHERE id = ? AND user_id = ?',
            [expenseId, userId]
        );

        if (rows.length === 0 || !rows[0].receipt_data) {
            return res.status(404).send('Receipt image not found.');
        }

        const receipt = rows[0];
        res.setHeader('Content-Type', receipt.receipt_mimetype || 'image/jpeg');
        res.send(receipt.receipt_data);
    } catch (error) {
        console.error('Get Receipt Error:', error);
        res.status(500).send('Error retrieving receipt image.');
    }
};