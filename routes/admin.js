const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const adminAuth = require('../middleware/adminAuth');

// Public admin routes (no auth required)
router.get('/login', (req, res) => {
    if (req.session.isAdmin && req.session.adminId) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { error: null });
});

// Handle admin login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const { data: admin, error } = await supabase
            .from('admins')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !admin) {
            return res.render('admin/login', { error: 'Invalid credentials' });
        }

        if (password !== admin.password) {
            return res.render('admin/login', { error: 'Invalid credentials' });
        }

        // Check if TOTP is required
        if (!admin.totp_enabled || !admin.totp_secret) {
            req.session.setupTOTP = {
                adminId: admin.id,
                email: admin.email
            };
            return res.redirect('/auth/setup-2fa');
        }

        // Show TOTP verification
        req.session.tempAdmin = {
            id: admin.id,
            email: admin.email
        };
        res.redirect('/auth/verify-admin-totp');

    } catch (error) {
        console.error('Login error:', error);
        res.render('admin/login', { error: 'An error occurred during login' });
    }
});

// Protected routes - require authentication
router.use(adminAuth);

// Admin dashboard - Primary page after authentication
router.get('/dashboard', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch all required statistics
        const [
            { count: totalOrders },
            { count: activeOrders },
            { count: totalUsers },
            { count: newUsersToday },
            { data: products },
            { data: completedOrders },
            { data: activities }
        ] = await Promise.all([
            supabase.from('orders').select('*', { count: 'exact' }),
            supabase.from('orders').select('*', { count: 'exact' }).eq('status', 'active'),
            supabase.from('users').select('*', { count: 'exact' }),
            supabase.from('users').select('*', { count: 'exact' }).gte('created_at', today),
            supabase.from('vegetables').select('*'),
            supabase.from('orders').select('total_amount').eq('status', 'completed'),
            supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(5)
        ]);

        // Calculate revenue statistics
        const revenue = {
            total: completedOrders?.reduce((sum, order) => sum + (parseFloat(order.total_amount) || 0), 0) || 0,
            today: 0,
            this_week: 0,
            this_month: 0,
            completed_orders: completedOrders?.length || 0,
            average_order: 0
        };

        // Calculate average order value
        revenue.average_order = revenue.completed_orders ? revenue.total / revenue.completed_orders : 0;

        const stats = {
            total_orders: totalOrders || 0,
            active_orders: activeOrders || 0,
            total_users: totalUsers || 0,
            new_users_today: newUsersToday || 0,
            total_products: products?.length || 0,
            low_stock_items: products?.filter(p => p.stock_quantity < 10).length || 0,
            revenue,
            recent_activities: activities || [],
            active_deliveries: activeOrders || 0
        };

        res.render('admin/dashboard', { 
            stats,
            currentPage: 'dashboard',
            adminEmail: req.session.adminEmail
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { 
            message: 'Error loading dashboard',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
});

module.exports = router; 