const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();

const app = express();

// View Engine & Static Files Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session & Flash Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false
}));
app.use(flash());

// Global Variables for EJS Views
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

// Import All Routes
const googleRoutes = require('./routes/googleRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const expenseRoutes = require('./routes/expenseRoutes');

// Mount All Routes
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', expenseRoutes);
app.use('/', googleRoutes);

// Default Root Redirect
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.redirect('/login');
});

// Legal & OAuth Compliance Routes
app.get('/privacy', (req, res) => {
    res.render('privacy', { 
        title: 'Privacy Policy - CashWisely',
        user: req.session.user || null 
    });
});

app.get('/terms', (req, res) => {
    res.render('terms', { 
        title: 'Terms of Service - CashWisely',
        user: req.session.user || null 
    });
});

// Server Initialization
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));