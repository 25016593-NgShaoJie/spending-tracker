const db = require('../config/db');
const { appendExpenseToSheet } = require('./googleController');

exports.addExpense = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { amount, category, description, date_spent } = req.body;
        
        // Read file buffer from upload input
        const receiptData = req.file ? req.file.buffer : null;
        const receiptMimetype = req.file ? req.file.mimetype : null;

        // Save expense & image binary into MySQL
        const [result] = await db.query(
            'INSERT INTO expenses (user_id, amount, category, description, date_spent, receipt_data, receipt_mimetype) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, amount, category, description || null, date_spent, receiptData, receiptMimetype]
        );

        const expenseId = result.insertId;
        const imageUrl = receiptData ? `/expenses/receipt/${expenseId}` : null;

        // Sync expense payload to Google Sheets
        const expensePayload = { date_spent, category, amount, description, imageUrl };
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
            'SELECT id, amount, category, description, date_spent, (receipt_data IS NOT NULL) AS has_receipt FROM expenses WHERE user_id = ? ORDER BY date_spent DESC',
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

// Serving route: Anyone clicking the link can view the stored receipt image
exports.getReceiptImage = async (req, res) => {
    try {
        const expenseId = req.params.id;

        const [rows] = await db.query(
            'SELECT receipt_data, receipt_mimetype FROM expenses WHERE id = ?',
            [expenseId]
        );

        if (rows.length === 0 || !rows[0].receipt_data) {
            return res.status(404).send('No image attached to this expense.');
        }

        const receipt = rows[0];
        res.setHeader('Content-Type', receipt.receipt_mimetype || 'image/jpeg');
        res.setHeader('Content-Disposition', 'inline');
        res.send(receipt.receipt_data);
    } catch (error) {
        console.error('Get Receipt Error:', error);
        res.status(500).send('Error retrieving receipt image.');
    }
};