const db = require('../config/db');

exports.addDeposit = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { amount, source, date_added } = req.body;

        const numericAmount = Number(amount);
        if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
            req.flash('error', 'Amount added must be greater than $0.');
            return res.redirect('/dashboard');
        }

        await db.query(
            'INSERT INTO deposits (user_id, amount, source, date_added) VALUES (?, ?, ?, ?)',
            [userId, numericAmount, source || null, date_added]
        );

        req.flash('success', 'Money added successfully!');
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Add Deposit Error:', error);
        req.flash('error', 'Failed to add money.');
        res.redirect('/dashboard');
    }
};