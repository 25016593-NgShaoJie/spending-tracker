const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const passport = require('passport'); // 1. Imported Passport
require('dotenv').config();

// Initialize Database Connection
require('./config/db'); // 2. Connect to database on boot

const app = express();

// Trust Render's HTTPS Reverse Proxy
app.set('trust proxy', 1); // 3. Fixes session cookie loss on Render

// View Engine & Static Files Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Requires HTTPS on live server
        sameSite: 'lax'
    }
}));

// Initialize Passport & Session Handling
app.use(passport.initialize()); // 4. Required for Passport Google OAuth
app.use(passport.session());

app.use(flash());

// Global Variables for EJS Views
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || req.user || null;
    res.locals.currentPath = req.path;
    next();
});

// Import All Routes
const googleRoutes = require('./routes/googleRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const depositRoutes = require('./routes/depositRoutes');

// Mount All Routes
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', expenseRoutes);
app.use('/', depositRoutes);
app.use('/', googleRoutes);

// Default Root Redirect
app.get('/', (req, res) => {
    if (req.session.user || req.user) return res.redirect('/dashboard');
    res.redirect('/login');
});

// Legal & OAuth Compliance Routes
app.get('/privacy', (req, res) => {
    res.render('privacy', { 
        title: 'Privacy Policy - CashWisely',
        user: req.session.user || req.user || null 
    });
});

app.get('/terms', (req, res) => {
    res.render('terms', { 
        title: 'Terms of Service - CashWisely',
        user: req.session.user || req.user || null 
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    if (req.flash) {
        req.flash('error', 'Something went wrong: ' + err.message);
    }
    res.redirect(req.headers.referer || '/dashboard');
});

// Server Initialization
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));