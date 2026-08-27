const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { isLoggedIn } = require('../middleware/auth');

router.get('/expenses', isLoggedIn, expenseController.getExpenses);
router.post('/expenses', isLoggedIn, expenseController.addExpense);

module.exports = router;
