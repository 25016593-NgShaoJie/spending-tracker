const db = require('../config/db');
const sheetService = require('../services/sheetService'); 

// Add Expense
exports.createExpense = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { amount, category, date_spent, description } = req.body;

        if (!amount || !category || !date_spent) {
            req.flash('error', 'Please fill in required fields.');
            return res.redirect('/dashboard');
        }

        // Cloudinary gives us the web link in req.file.path
        const imageUrl = req.file ? req.file.path : null;

        // 1. Save to MySQL First
        const [result] = await db.execute(
            `INSERT INTO expenses (user_id, amount, category, description, image_url, date_spent) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, amount, category, description || null, imageUrl, date_spent]
        );

        const insertedExpenseId = result.insertId;

        // Redirect user immediately so the page doesn't lag
        req.flash('success', 'Expense logged successfully!');
        res.redirect('/dashboard');

        // 2. THIS IS STEP 6: Background Sync to Google Sheets
        sheetService.appendExpenseToSheet(userId, {
            date_spent,
            category,
            amount,
            description,
            imageUrl
        }).then(async (synced) => {
            if (synced) {
                // Mark expense as synced in database
                await db.execute(
                    `UPDATE expenses SET synced_to_sheets = TRUE WHERE id = ?`, 
                    [insertedExpenseId]
                );
            }
        });

    } catch (error) {
        console.error('Error creating expense:', error);
        req.flash('error', 'Failed to log expense.');
        res.redirect('/dashboard');
    }
};

// Get Expenses & History
exports.getExpenses = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { startDate, endDate, category } = req.query;

        let query = `SELECT * FROM expenses WHERE user_id = ?`;
        let params = [userId];

        if (startDate) { query += ` AND date_spent >= ?`; params.push(startDate); }
        if (endDate) { query += ` AND date_spent <= ?`; params.push(endDate); }
        if (category && category !== 'All') { query += ` AND category = ?`; params.push(category); }

        query += ` ORDER BY date_spent DESC, created_at DESC`;
        const [expenses] = await db.execute(query, params);

        res.render('expenses', {
            title: 'Expense History',
            expenses,
            filters: { startDate: startDate || '', endDate: endDate || '', category: category || 'All' }
        });
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.redirect('/dashboard');
    }
};