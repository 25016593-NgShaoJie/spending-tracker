const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isLoggedIn } = require('../middleware/auth');

router.get('/dashboard', isLoggedIn, dashboardController.getDashboard);
router.get('/settings', isLoggedIn, dashboardController.getSettings);
router.post('/settings/budget', isLoggedIn, dashboardController.updateBudget);

module.exports = router;