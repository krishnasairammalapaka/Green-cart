const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Login route for all users (admin, user, farmer)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Attempting login for email:', email);

        // Check in all tables using Supabase
        const { data: admin } = await supabase
            .from('admins')
            .select('*')
            .eq('email', email)
            .single();

        // Check admin first
        if (admin && admin.password === password) {
            console.log('Admin login successful');
            req.session.user = {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: 'admin'
            };
            return res.redirect('/admin/dashboard');
        }

        // Check user credentials
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (user && user.password === password) {
            console.log('User login successful');
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: 'user'
            };
            return res.redirect('/user/dashboard');
        }

        // If no match found
        console.log('Login failed: Invalid credentials');
        return res.render('index', {
            error: 'Invalid email or password'
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.render('index', {
            error: 'An error occurred during login'
        });
    }
});

// Register route (for users only)
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.render('register', {
                error: 'Email already registered'
            });
        }

        // Create new user with plain password for now
        const { data: newUser, error } = await supabase
            .from('users')
            .insert([
                {
                    name,
                    email,
                    password, // Store password directly for now
                    role: 'user'
                }
            ])
            .select()
            .single();

        if (error) throw error;

        // Set session
        req.session.user = {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: 'user'
        };

        return res.redirect('/user/dashboard');
    } catch (error) {
        console.error('Registration error:', error);
        return res.render('register', {
            error: 'Registration failed'
        });
    }
});

// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// Add admin middleware
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).redirect('/');
    }
};

// Export both router and middleware
module.exports = {
    router,
    isAdmin
}; 