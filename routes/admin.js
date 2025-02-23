const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const adminAuth = require('../middleware/adminAuth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middleware/auth');
const fetch = require('node-fetch');

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

        // Set admin session
        req.session.adminId = admin.id;
        req.session.adminEmail = admin.email;
        req.session.isAdmin = true;

        res.redirect('/admin/dashboard');
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
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.redirect('/admin/dashboard');
        }
        res.clearCookie('connect.sid'); // Clear the session cookie
        res.redirect('/admin/login');
    });
});

// Vegetables Management
router.get('/vegetables', async (req, res) => {
    try {
        const { data: vegetables, error } = await supabase
            .from('vegetables')
            .select('*');

        if (error) throw error;

        res.render('admin/manage-vegetables', { 
            vegetables,
            currentPage: 'vegetables'
        });
    } catch (error) {
        res.status(500).render('admin/manage-vegetables', { 
            vegetables: [],
            error: 'Failed to load vegetables',
            currentPage: 'vegetables'
        });
    }
});

// Add this helper function at the top of your file
async function debugOrderData() {
    try {
        // Check orders table
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*');
        console.log('Orders in database:', orders);
        if (ordersError) console.error('Orders error:', ordersError);

        // Check users table
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('*');
        console.log('Users in database:', users);
        if (usersError) console.error('Users error:', usersError);

        // Check order_items table
        const { data: orderItems, error: itemsError } = await supabase
            .from('order_items')
            .select('*');
        console.log('Order items in database:', orderItems);
        if (itemsError) console.error('Order items error:', itemsError);

    } catch (error) {
        console.error('Debug error:', error);
    }
}

// Orders Management
router.get('/orders', adminAuth, async (req, res) => {
    try {
        // First fetch orders
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (ordersError) {
            console.error('Orders fetch error:', ordersError);
            throw ordersError;
        }

        // Get unique user IDs from orders
        const userIds = [...new Set(orders.map(order => order.user_id))];

        // Fetch user details for these orders
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('*')
            .in('id', userIds);

        if (usersError) {
            console.error('Users fetch error:', usersError);
            throw usersError;
        }

        // Create a map of user details for quick lookup
        const userMap = users.reduce((acc, user) => {
            acc[user.id] = user;
            return acc;
        }, {});

        // Process the orders data with user details
        const processedOrders = orders.map(order => {
            const user = userMap[order.user_id] || {};
            return {
                _id: order.id,
                customerName: user.name || order.customer_name || 'Unknown',
                customerEmail: user.email || order.email || 'N/A',
                products: [{
                    name: order.item_name || 'Product',
                    quantity: order.quantity || 1
                }],
                totalAmount: order.amount || 0,
                status: order.status || 'Pending',
                orderDate: order.created_at,
                address: user.address || order.address || 'N/A',
                phone: user.phone_number || order.phone || 'N/A',
                userId: order.user_id
            };
        });

        console.log('Processed orders:', processedOrders);

        res.render('admin/orders', { 
            orders: processedOrders,
            currentPage: 'orders'
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('admin/orders', {
            orders: [],
            currentPage: 'orders',
            error: 'Failed to load orders'
        });
    }
});

// Update order status
router.post('/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const { error } = await supabase
            .from('orders')
            .update({ status })
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Get single order details
router.get('/orders/:id/details', async (req, res) => {
    try {
        // Fetch order details
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (orderError) throw orderError;

        // Fetch user details if user_id exists
        let user = {};
        if (order.user_id) {
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', order.user_id)
                .single();

            if (!userError && userData) {
                user = userData;
            }
        }

        // Combine order and user data
        res.json({
            ...order,
            customerName: user.name || order.customer_name || 'Unknown',
            customerEmail: user.email || order.email || 'N/A',
            phone: user.phone_number || order.phone || 'N/A',
            address: user.address || order.address || 'N/A'
        });

    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).json({ error: 'Failed to fetch order details' });
    }
});

// Update delivery tracking
router.post('/orders/:id/tracking', async (req, res) => {
    try {
        const { id } = req.params;
        const { delivery_latitude, delivery_longitude, estimated_delivery_time } = req.body;

        const { error } = await supabase
            .from('orders')
            .update({
                delivery_latitude,
                delivery_longitude,
                estimated_delivery_time,
                status: 'out_for_delivery'
            })
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Update tracking error:', error);
        res.status(500).json({ error: 'Failed to update tracking information' });
    }
});

// Update order location and ETA
router.post('/orders/:id/update-location', async (req, res) => {
    try {
        const { id } = req.params;
        const { latitude, longitude, eta } = req.body;

        const { error } = await supabase
            .from('orders')
            .update({
                delivery_latitude: latitude,
                delivery_longitude: longitude,
                estimated_delivery_time: eta,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Update delivery location error:', error);
        res.status(500).json({ error: 'Failed to update delivery location' });
    }
});

// Users Management
router.get('/users', async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*');

        if (error) throw error;

        res.render('admin/users', { 
            users,
            currentPage: 'users'
        });
    } catch (error) {
        res.status(500).render('admin/users', { 
            users: [],
            error: 'Failed to load users',
            currentPage: 'users'
        });
    }
});

// Routes
router.get('/farmer-info', adminController.getFarmerInfo);
router.get('/search-land', adminController.searchLand);
router.delete('/delete-land/:id', adminController.deleteLand);

// Weather Information
router.get('/weather', async (req, res) => {
  try {
    const location = req.query.location;
    if (!location) {
      return res.render('admin/weather', { weather: null, forecast: null, error: null });
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;
    
    // Get coordinates first
    const geocodeUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`;
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (!geocodeData.length) {
      throw new Error('Location not found');
    }

    const { lat, lon } = geocodeData[0];

    // Get current weather
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();

    // Get 5-day forecast
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
    const forecastResponse = await fetch(forecastUrl);
    const forecastData = await forecastResponse.json();

    // Add country name to weather data
    weatherData.country = geocodeData[0].country;

    res.render('admin/weather', {
      weather: weatherData,
      forecast: forecastData,
      error: null
    });

  } catch (error) {
    console.error('Weather API Error:', error);
    res.render('admin/weather', {
      weather: null,
      forecast: null,
      error: 'Failed to fetch weather data. Please try again.'
    });
  }
});

// API Routes for CRUD operations
router.post('/vegetables', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vegetables')
            .insert(req.body);

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create vegetable' });
    }
});

router.put('/vegetables/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vegetables')
            .update(req.body)
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update vegetable' });
    }
});

router.delete('/vegetables/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('vegetables')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete vegetable' });
    }
});

// Farmer Information route
router.get('/farmer-info', async (req, res) => {
    try {
        const { data: landData, error } = await supabase
            .from('farmers_land')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase query error:', error);
            throw error;
        }

        res.render('admin/farmer-info', {
            landData: landData || [],
            error: null,
            query: req.query.landNumber || '',
            currentPage: 'farmer-info'
        });
    } catch (error) {
        console.error('Error fetching farmer data:', error);
        res.render('admin/farmer-info', {
            landData: [],
            error: 'Failed to fetch farmer data. Please try again.',
            query: req.query.landNumber || '',
            currentPage: 'farmer-info'
        });
    }
});

// Search land route
router.get('/search-land', adminController.searchLand);

// Delete land route
router.delete('/delete-land/:id', adminController.deleteLand);

module.exports = router; 