const bcrypt = require('bcrypt');
const db = require('../config/db');

// Render Pages
exports.getRegister = (req, res) => res.render('auth/register', { title: 'Register' });
exports.getLogin = (req, res) => res.render('auth/login', { title: 'Login' });

// Register Logic
exports.registerUser = async (req, res) => {
    try {
        const {
            username, email, password,
            monthly_income,
            savings_goal_type,
            target_savings_percentage,
            target_savings_amount,
            savings_goal_amount,
            savings_goal_date
        } = req.body;

        if (!username || !email || !password || !monthly_income || !savings_goal_type) {
            req.flash('error', 'All fields are required.');
            return res.redirect('/register');
        }

        // Validate whichever savings goal option they picked
        let percentage = 0;
        let fixedMonthlyAmount = 0;
        let goalAmount = null;
        let goalDate = null;

        if (savings_goal_type === 'percentage') {
            if (target_savings_percentage === undefined || target_savings_percentage === '') {
                req.flash('error', 'Please enter what percentage of your income you want to save.');
                return res.redirect('/register');
            }
            percentage = Number(target_savings_percentage);
            if (isNaN(percentage) || percentage < 0 || percentage > 100) {
                req.flash('error', 'Savings percentage must be between 0 and 100.');
                return res.redirect('/register');
            }
        } else if (savings_goal_type === 'fixed_monthly') {
            if (!target_savings_amount) {
                req.flash('error', 'Please enter how much you want to save per month.');
                return res.redirect('/register');
            }
            fixedMonthlyAmount = Number(target_savings_amount);
            if (isNaN(fixedMonthlyAmount) || fixedMonthlyAmount < 0) {
                req.flash('error', 'Monthly savings amount must be a valid number.');
                return res.redirect('/register');
            }
        } else if (savings_goal_type === 'target_date') {
            if (!savings_goal_amount || !savings_goal_date) {
                req.flash('error', 'Please enter both a savings goal amount and a target date.');
                return res.redirect('/register');
            }
            goalAmount = Number(savings_goal_amount);
            goalDate = savings_goal_date;
            if (isNaN(goalAmount) || goalAmount <= 0) {
                req.flash('error', 'Savings goal amount must be a valid number.');
                return res.redirect('/register');
            }
            if (new Date(goalDate) <= new Date()) {
                req.flash('error', 'Target date must be in the future.');
                return res.redirect('/register');
            }
        } else {
            req.flash('error', 'Please choose a valid savings goal option.');
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

        // Initialize budget settings using what they chose at signup
        await db.execute(
            `INSERT INTO settings
                (user_id, monthly_income, savings_goal_type, target_savings_percentage, target_savings_amount, savings_goal_amount, savings_goal_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [result.insertId, monthly_income, savings_goal_type, percentage, fixedMonthlyAmount, goalAmount, goalDate]
        );

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