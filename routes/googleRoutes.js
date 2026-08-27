const express = require('express');
const router = express.Router();
const googleController = require('../controllers/googleController');
const { isLoggedIn } = require('../middleware/auth');

router.get('/auth/google', isLoggedIn, googleController.redirectToGoogle);
router.get('/auth/google/callback', isLoggedIn, googleController.handleGoogleCallback);
router.post('/settings/google-sheet', isLoggedIn, googleController.saveSheetId);

module.exports = router;