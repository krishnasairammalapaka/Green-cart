require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const { supabase, pool } = require('./config/supabase');
const passport = require('passport');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up session middleware before routes
app.use(session({
<<<<<<< HEAD
    secret: process.env.JWT_SECRET,
=======
    secret: process.env.SESSION_SECRET || 'your-secret-key',
>>>>>>> deba7f6 (added the gemni API key for the catbot)
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set to true if using HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

// Set view engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Middleware to make session available to all views
app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

// Add this middleware to check database connection
app.use(async (req, res, next) => {
    try {
        const { data, error } = await supabase.from('users').select('count');
        if (error) throw error;
        next();
    } catch (err) {
        console.error('Database connection error:', err);
        res.status(500).send('Database connection error');
    }
});

// Add this before your routes
app.use(express.static(path.join(__dirname, 'public')));

// Add this near the top of app.js with other middleware definitions
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth/login');
    }
};

// Routes
const { router: authRouter } = require('./routes/auth');
app.use('/auth', authRouter);
app.use('/', require('./routes/pages'));
const adminRouter = require('./routes/admin');
app.use('/admin', adminRouter);
app.use('/user', require('./routes/user'));
app.use('/farmer', require('./routes/farmer'));

// User Profile Route
app.get('/user/profile', isAuthenticated, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.session.user.id)  // Changed from req.user.id to req.session.user.id
            .single();

        if (error) throw error;

        res.render('user/profile', { 
            user,
            currentPage: 'profile'
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.redirect('/user/dashboard');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    // Set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // Determine the response format based on the request
    if (req.accepts('html')) {
        // Render the error page
        res.status(err.status || 500);
        res.render('error', {
            message: err.message || 'An unexpected error occurred',
            error: req.app.get('env') === 'development' ? err : {}
        });
    } else {
        // Send JSON response for API requests
        res.status(err.status || 500).json({
            error: err.message || 'An unexpected error occurred'
        });
    }
});

// 404 handler
app.use((req, res, next) => {
    if (req.accepts('html')) {
        res.status(404).render('error', {
            message: 'Page Not Found',
            error: { status: 404 }
        });
    } else {
        res.status(404).json({ error: 'Not Found' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 