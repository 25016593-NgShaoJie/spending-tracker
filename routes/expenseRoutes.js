const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const upload = require('../middleware/upload');
const { isLoggedIn } = require('../middleware/auth');

router.get('/expenses', isLoggedIn, expenseController.getExpenses);
router.post('/expenses', isLoggedIn, upload.single('receiptImage'), expenseController.addExpense);

// Route to render image binary directly from MySQL
router.get('/expenses/receipt/:id', isLoggedIn, expenseController.getReceiptImage);

module.exports = router;