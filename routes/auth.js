const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // First try admin login
        let { data: admin, error: adminError } = await supabase
            .from('admins')
            .select('*')
            .eq('email', email)
            .single();

        if (admin && password === admin.password) { // In production, use proper password hashing
            req.session.user = {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: 'admin'
            };
            return res.redirect('/admin/dashboard');
        }

        // Try user login
        let { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (user && password === user.password) { // In production, use proper password hashing
            req.session.user = {
                id: user.id,
                email: user.email,
                name: user.name,
                role: 'user'
            };
            return res.redirect('/user/dashboard');
        }

        // If no matching user found
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

// Register
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

        // Create new user
        const { data: user, error } = await supabase
            .from('users')
            .insert([
                { name, email, password, role: 'user' }
            ])
            .select()
            .single();

        if (error) throw error;

        // Set session
        req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
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

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

module.exports = router; 