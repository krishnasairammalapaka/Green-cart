const express = require('express');
const router = express.Router();
const { pool } = require('../config/supabase');

// Login
router.post('/login', async (req, res) => {
    const client = await pool.connect();
    try {
        const { email, password } = req.body;
        console.log('Attempting login for email:', email);

        // Check admin table first
        const adminResult = await client.query(
            'SELECT * FROM admins WHERE email = $1',
            [email]
        );
        
        const admin = adminResult.rows[0];
        
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

        // If not admin, check users table
        const userResult = await client.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        const user = userResult.rows[0];

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

        console.log('Login failed: Invalid credentials');
        return res.render('index', {
            error: 'Invalid email or password'
        });

    } catch (error) {
        console.error('Login error:', error.message);
        return res.render('index', {
            error: 'An error occurred during login'
        });
    } finally {
        client.release();
    }
});

// Register
router.post('/register', async (req, res) => {
    const client = await pool.connect();
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        const existingUser = await client.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.render('register', {
                error: 'Email already registered'
            });
        }

        // Create new user
        const result = await client.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, email, password, 'user']
        );

        const user = result.rows[0];

        // Set session
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: 'user'
        };

        return res.redirect('/user/dashboard');
    } catch (error) {
        console.error('Registration error:', error.message);
        return res.render('register', {
            error: 'Registration failed'
        });
    } finally {
        client.release();
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