const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { Pool } = require('pg');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.redirect('/');
    }
};

// Apply admin middleware to all routes
router.use(isAdmin);

// Create a new pool using the connection URL
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || 'postgres://postgres.fmvjtpjooqnlfwwqbbiz:Chinnu%402518@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
    ssl: {
        rejectUnauthorized: false
    }
});

// Route to display farmer info page with data
router.get('/farmer-info', async (req, res) => {
    try {
        const { data: landData, error } = await supabase
            .from('farmers_land')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.render('admin/farmer-info', { 
            landData,
            currentPage: 'farmer-info'
        });
    } catch (error) {
        console.error('Error fetching farmer data:', error);
        res.render('admin/farmer-info', { 
            landData: [],
            error: 'Failed to fetch farmer data',
            currentPage: 'farmer-info'
        });
    }
});

// Route to handle search
router.get('/search-land', async (req, res) => {
    try {
        const { landNumber } = req.query;
        let query = supabase.from('farmers_land').select('*');
        
        if (landNumber) {
            query = query.ilike('land_number', `%${landNumber}%`);
        }

        const { data: landData, error } = await query;
        if (error) throw error;

        res.render('admin/farmer-info', { 
            landData,
            currentPage: 'farmer-info',
            query: landNumber
        });
    } catch (error) {
        console.error('Error searching land:', error);
        res.render('admin/farmer-info', { 
            landData: [],
            error: 'Failed to search land data',
            currentPage: 'farmer-info'
        });
    }
});

// Route to display manage vegetables page
router.get('/vegetables', async (req, res) => {
    try {
        const { data: vegetables, error } = await supabase
            .from('vegetables')
            .select('*')
            .order('name');

        if (error) throw error;

        res.render('admin/manage-vegetables', { 
            vegetables,
            currentPage: 'vegetables'
        });
    } catch (error) {
        console.error('Error fetching vegetables:', error);
        res.render('admin/manage-vegetables', { 
            vegetables: [],
            error: 'Failed to fetch vegetables',
            currentPage: 'vegetables'
        });
    }
});

// Route to add new vegetable
router.post('/vegetables', async (req, res) => {
    try {
        const { name, description, price, unit, stock_quantity, image_url, category } = req.body;
        
        const { data, error } = await supabase
            .from('vegetables')
            .insert([{
                name,
                description,
                price,
                unit,
                stock_quantity,
                image_url,
                category
            }]);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding vegetable:', error);
        res.status(500).json({ error: 'Failed to add vegetable' });
    }
});

// Route to update vegetable
router.put('/vegetables', async (req, res) => {
    try {
        const { id, name, description, price, unit, stock_quantity, image_url, category } = req.body;
        
        const { data, error } = await supabase
            .from('vegetables')
            .update({
                name,
                description,
                price,
                unit,
                stock_quantity,
                image_url,
                category,
                updated_at: new Date()
            })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating vegetable:', error);
        res.status(500).json({ error: 'Failed to update vegetable' });
    }
});

// Route to delete vegetable
router.delete('/vegetables/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('vegetables')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting vegetable:', error);
        res.status(500).json({ error: 'Failed to delete vegetable' });
    }
});

// Admin routes...
router.get('/dashboard', async (req, res) => {
    try {
        // Fetch admin-specific data
        const { data: stats, error: statsError } = await supabase
            .from('admin_statistics')
            .select('*')
            .single();

        if (statsError) throw statsError;

        res.render('admin/dashboard', {
            user: req.session.user,
            stats,
            currentPage: 'dashboard'
        });
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        res.render('admin/dashboard', {
            user: req.session.user,
            error: 'Failed to load dashboard data',
            currentPage: 'dashboard'
        });
    }
});

// Weather route
router.get('/weather', async (req, res) => {
    try {
        const weatherData = {
            location: {
                pincode: "626126",
                district: "Virudhunagar",
                state: "Tamil Nadu"
            },
            current: {
                temperature: 32,
                humidity: 65,
                windSpeed: 12,
                condition: "Partly Cloudy",
                rainfall: 0
            },
            forecast: [
                {
                    date: "2024-03-20",
                    maxTemp: 34,
                    minTemp: 24,
                    condition: "Sunny",
                    rainfall: 0
                },
                {
                    date: "2024-03-21",
                    maxTemp: 33,
                    minTemp: 23,
                    condition: "Partly Cloudy",
                    rainfall: 20
                },
                {
                    date: "2024-03-22",
                    maxTemp: 31,
                    minTemp: 22,
                    condition: "Light Rain",
                    rainfall: 45
                }
            ],
            farmingTips: [
                "Ideal conditions for vegetable cultivation",
                "Consider irrigation due to low rainfall",
                "Monitor humidity levels for pest control",
                "Good time for planting leafy vegetables"
            ]
        };

        res.render('admin/weather', {
            weatherData,
            currentPage: 'weather',
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading weather data:', error);
        res.render('admin/weather', {
            error: 'Failed to load weather data',
            currentPage: 'weather',
            user: req.session.user
        });
    }
});

// Update the orders route
router.get('/orders', isAdmin, async (req, res) => {
    try {
        // Add logging to track connection
        console.log('Using database URL:', process.env.POSTGRES_URL);
        
        const query = `
            SELECT 
                o.*,
                u.name as user_name,
                u.email as user_email,
                u.phone as user_phone,
                COALESCE(
                    json_agg(
                        CASE WHEN oi.id IS NOT NULL THEN
                            json_build_object(
                                'id', oi.id,
                                'quantity', oi.quantity,
                                'price', oi.price,
                                'vegetables', json_build_object(
                                    'id', v.id,
                                    'name', v.name,
                                    'image_url', v.image_url,
                                    'price', v.price,
                                    'unit', v.unit
                                )
                            )
                        ELSE NULL
                        END
                    ) FILTER (WHERE oi.id IS NOT NULL),
                    '[]'
                ) as order_items
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN vegetables v ON oi.vegetable_id = v.id
            GROUP BY o.id, u.name, u.email, u.phone
            ORDER BY o.created_at DESC
        `;

        console.log('Attempting to connect to database...');
        const { rows: orders } = await pool.query(query);
        console.log('Orders fetched:', orders.length);

        const formattedOrders = orders.map(order => {
            const orderItems = Array.isArray(order.order_items) ? order.order_items : [];
            return {
                ...order,
                users: {
                    name: order.user_name,
                    email: order.user_email,
                    phone: order.user_phone
                },
                order_items: orderItems.filter(item => item !== null),
                subtotal: orderItems.reduce((sum, item) => 
                    sum + (item ? (item.price * item.quantity) : 0), 0),
                items_count: orderItems.reduce((sum, item) => 
                    sum + (item ? item.quantity : 0), 0)
            };
        });

        console.log('Orders formatted successfully');
        res.render('admin/orders', {
            orders: formattedOrders,
            currentPage: 'orders',
            user: req.session.user
        });
    } catch (error) {
        console.error('Database error details:', error);
        res.render('admin/orders', {
            orders: [],
            error: `Failed to fetch orders: ${error.message}`,
            currentPage: 'orders',
            user: req.session.user
        });
    }
});

// Update order status route
router.post('/orders/:orderId/status', isAdmin, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const query = `
            UPDATE orders 
            SET status = $1, updated_at = NOW() 
            WHERE id = $2
        `;

        await pool.query(query, [status, orderId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

module.exports = router; 