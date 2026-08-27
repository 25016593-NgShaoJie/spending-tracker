const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isLoggedIn, isLoggedOut } = require('../middleware/auth');

router.get('/register', isLoggedOut, authController.getRegister);
router.post('/register', isLoggedOut, authController.registerUser);

router.get('/login', isLoggedOut, authController.getLogin);
router.post('/login', isLoggedOut, authController.loginUser);

router.get('/logout', isLoggedIn, authController.logoutUser);

module.exports = router;