const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const upload = require('../middleware/upload');
const { isLoggedIn } = require('../middleware/auth');

router.get('/expenses', isLoggedIn, expenseController.getExpenses);

// Accepts file uploads from input fields named 'receipt' or 'receiptImage'
router.post('/expenses', isLoggedIn, upload.single('receiptImage'), expenseController.addExpense);

// Public route to open and view the receipt image directly in the browser
router.get('/expenses/receipt/:id', expenseController.getReceiptImage);

module.exports = router;