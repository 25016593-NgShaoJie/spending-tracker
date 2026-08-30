const express = require('express');
const router = express.Router();
const depositController = require('../controllers/depositController');
const { isLoggedIn } = require('../middleware/auth');

router.post('/deposits', isLoggedIn, depositController.addDeposit);

module.exports = router;