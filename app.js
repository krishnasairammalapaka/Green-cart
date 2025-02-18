const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
require('dotenv').config();
const { supabase, pool } = require('./config/supabase');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up session middleware before routes
app.use(session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set to true if using HTTPS
}));

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

// Routes
const { router: authRouter } = require('./routes/auth');
app.use('/auth', authRouter);
app.use('/', require('./routes/pages'));
const adminRouter = require('./routes/admin');
app.use('/admin', adminRouter);
app.use('/user', require('./routes/user'));
app.use('/farmer', require('./routes/farmer'));

// Add this before your routes
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        message: 'Something broke!',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 