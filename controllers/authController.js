const bcrypt = require('bcrypt');
const db = require('../config/db');

// Render Pages
exports.getRegister = (req, res) => res.render('auth/register', { title: 'Register' });
exports.getLogin = (req, res) => res.render('auth/login', { title: 'Login' });

// Register Logic
exports.registerUser = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            req.flash('error', 'All fields are required.');
            return res.redirect('/register');
        }

        // Check if user exists
        const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            req.flash('error', 'Email is already registered.');
            return res.redirect('/register');
        }

        // Hash password & insert user
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );

        // Initialize default budget settings (1:1 record)
        await db.execute('INSERT INTO settings (user_id) VALUES (?)', [result.insertId]);

        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    } catch (error) {
        console.error('Registration error:', error);
        req.flash('error', 'Something went wrong during registration.');
        res.redirect('/register');
    }
};

// Login Logic
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        // Set session
        req.session.user = { id: user.id, username: user.username, email: user.email };
        req.flash('success', `Welcome back, ${user.username}!`);
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Login error:', error);
        req.flash('error', 'Something went wrong during login.');
        res.redirect('/login');
    }
};

// Logout Logic
exports.logoutUser = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
};