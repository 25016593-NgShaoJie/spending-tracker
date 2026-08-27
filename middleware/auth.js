module.exports = {
    isLoggedIn: (req, res, next) => {
        if (req.session.user) return next();
        req.flash('error', 'Please log in to view this page.');
        res.redirect('/login');
    },
    isLoggedOut: (req, res, next) => {
        if (!req.session.user) return next();
        res.redirect('/dashboard');
    }
};