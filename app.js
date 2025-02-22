require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const { supabase } = require('./config/supabase');
const passport = require('./config/passport-google');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up session middleware with more secure configuration
app.use(session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
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

// Import the index router
const indexRouter = require('./routes/index');

// Routes - Add index router first
app.use('/', indexRouter);  // This should be the first route

// Other routes
const { router: authRouter } = require('./routes/auth');
app.use('/auth', authRouter);  // This mounts all auth routes under /auth
app.use('/admin', require('./routes/admin'));
app.use('/user', require('./routes/user'));
app.use('/farmer', require('./routes/farmer'));
app.use('/', require('./routes/pages'));

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

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).render('error', { 
        message: err.message || 'An unexpected error occurred',
        error: req.app.get('env') === 'development' ? err : {}
    });
});

// Handle 404
app.use((req, res) => {
    res.status(404).render('error', { 
        message: 'Page not found',
        error: {}
    });
});

const PORT = process.env.PORT || 3000;

// Improved error handling for server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

server.on('error', (error) => {
    console.error('Server error:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
}); 