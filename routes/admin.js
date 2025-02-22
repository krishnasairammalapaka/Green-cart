const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { generateTOTP, verifyTOTP } = require('../controllers/totpController');
const QRCode = require('qrcode');
const axios = require('axios');
const csv = require('csv-parse');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const API_KEY = 'd6bfe36f18eb60b16cbae2d05a3ee94f';

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

// Apply middleware to all routes except login-related ones
router.use((req, res, next) => {
    if (req.path === '/login' || req.path === '/setup-2fa' || req.path === '/verify-2fa') {
        return next();
    }
    isAdmin(req, res, next);
});

// Create a new pool using the connection URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Login page route
router.get('/login', (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { error: null });
});

// Handle initial login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login attempt for:', email);

        // Check admin credentials with detailed logging
        const { data: admin, error } = await supabase
            .from('admins')
            .select('*')
            .eq('email', email.toLowerCase())
            .single();

        console.log('Database query result:', {
            admin: admin,
            error: error,
            receivedPassword: password,
            storedPassword: admin?.password,
            role: admin?.role
        });

        // Separate checks for better error messages
        if (error) {
            console.error('Database error:', error);
            return res.render('admin/login', { error: 'Database error occurred' });
        }

        if (!admin) {
            return res.render('admin/login', { error: 'Admin not found' });
        }

        if (admin.role !== 'admin') {
            return res.render('admin/login', { error: 'Not an admin account' });
        }

        // Verify password with exact comparison
        if (password !== admin.password) {
            console.log('Password mismatch:', {
                provided: password,
                stored: admin.password
            });
            return res.render('admin/login', { error: 'Invalid password' });
        }

        // Store admin info in session
        req.session.tempAdmin = {
            id: admin.id,
            email: admin.email,
            role: admin.role,
            name: admin.name
        };

        // Check if TOTP is already set up
        const { data: totpData } = await supabase
            .from('admin_totp')
            .select('*')
            .eq('admin_id', admin.id)
            .single();

        console.log('TOTP status:', {
            exists: !!totpData,
            isVerified: totpData?.is_verified
        });

        if (!totpData || !totpData.is_verified) {
            return res.redirect('/admin/setup-2fa');
        }

        return res.redirect('/admin/verify-2fa');

    } catch (error) {
        console.error('Login error:', error);
        return res.render('admin/login', { error: 'An error occurred during login' });
    }
});

// Setup 2FA
router.get('/setup-2fa', generateTOTP);
router.post('/setup-2fa', verifyTOTP);

// Verify 2FA
router.get('/verify-2fa', (req, res) => {
    if (!req.session.tempAdmin) {
        return res.redirect('/admin/login');
    }
    res.render('verify-2fa', { error: null });
});
router.post('/verify-2fa', verifyTOTP);

// Admin dashboard
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch all required statistics including detailed revenue data
        const [
            { count: totalOrders },
            { count: activeOrders },
            { count: totalUsers },
            { count: newUsers },
            { data: allOrders },
            { data: products },
            { data: activities }
        ] = await Promise.all([
            supabase.from('orders').select('*', { count: 'exact' }),
            supabase.from('orders').select('*', { count: 'exact' }).eq('status', 'active'),
            supabase.from('users').select('*', { count: 'exact' }),
            supabase.from('users').select('*', { count: 'exact' })
                .gte('created_at', today),
            supabase.from('orders')
                .select('total_amount, created_at, status')
                .order('created_at', { ascending: false }),
            supabase.from('vegetables').select('*'),
            supabase.from('admin_activities')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5)
        ]);

        // Calculate revenue statistics
        const revenueStats = allOrders?.reduce((stats, order) => {
            const orderDate = new Date(order.created_at).toISOString().split('T')[0];
            const amount = order.total_amount || 0;

            // Total revenue
            stats.total += amount;

            // Today's revenue
            if (orderDate === today) {
                stats.today += amount;
            }

            // This week's revenue
            const orderWeek = getWeekNumber(new Date(order.created_at));
            const currentWeek = getWeekNumber(new Date());
            if (orderWeek === currentWeek) {
                stats.thisWeek += amount;
            }

            // This month's revenue
            if (orderDate.substring(0, 7) === today.substring(0, 7)) {
                stats.thisMonth += amount;
            }

            // Count completed orders
            if (order.status === 'completed') {
                stats.completedOrders++;
            }

            return stats;
        }, {
            total: 0,
            today: 0,
            thisWeek: 0,
            thisMonth: 0,
            completedOrders: 0
        });

        const stats = {
            total_orders: totalOrders,
            active_orders: activeOrders,
            total_users: totalUsers,
            new_users_today: newUsers,
            revenue: {
                total: revenueStats.total,
                today: revenueStats.today,
                this_week: revenueStats.thisWeek,
                this_month: revenueStats.thisMonth,
                completed_orders: revenueStats.completedOrders,
                average_order: revenueStats.completedOrders ? 
                    revenueStats.total / revenueStats.completedOrders : 0
            },
            total_products: products?.length || 0,
            low_stock_items: products?.filter(p => p.stock_quantity < 10).length || 0,
            recent_activities: activities || [],
            active_deliveries: activeOrders
        };

        res.render('admin/dashboard', {
            stats,
            currentPage: 'dashboard'
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.render('admin/dashboard', {
            stats: {},
            error: 'Failed to load dashboard data',
            currentPage: 'dashboard'
        });
    }
});

// Helper function to get week number
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    return Math.ceil((((date - firstDayOfYear) / 86400000) + firstDayOfYear.getDay() + 1) / 7);
}

// Get farmer info page
router.get('/farmer-info', isAdmin, async (req, res) => {
    try {
        const { data: landData, error } = await supabase
            .from('farmers_land')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.render('admin/farmer-info', {
            landData,
            error: null,
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

// Search land by number
router.get('/search-land', isAdmin, async (req, res) => {
    try {
        const { landNumber } = req.query;
        
        const { data: landData, error } = await supabase
            .from('farmers_land')
            .select('*')
            .ilike('land_number', `%${landNumber}%`);

        if (error) throw error;

        res.render('admin/farmer-info', {
            landData,
            query: landNumber,
            error: null,
            currentPage: 'farmer-info'
        });
    } catch (error) {
        console.error('Error searching land:', error);
        res.render('admin/farmer-info', {
            landData: [],
            query: req.query.landNumber,
            error: 'Failed to search land data',
            currentPage: 'farmer-info'
        });
    }
});

// Delete land record
router.delete('/delete-land/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('farmers_land')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting land record:', error);
        res.status(500).json({ error: 'Failed to delete land record' });
    }
});

// Add new land record
router.post('/add-land', isAdmin, async (req, res) => {
    try {
        const { land_number, farmer_name, acres_of_land, soil_type } = req.body;

        const { data, error } = await supabase
            .from('farmers_land')
            .insert([{
                land_number,
                farmer_name,
                acres_of_land,
                soil_type
            }])
            .select()
            .single();

        if (error) throw error;

        res.redirect('/admin/farmer-info');
    } catch (error) {
        console.error('Error adding land record:', error);
        res.render('admin/farmer-info', {
            landData: [],
            error: 'Failed to add land record',
            currentPage: 'farmer-info'
        });
    }
});

// Edit land record page
router.get('/edit-land/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { data: land, error } = await supabase
            .from('farmers_land')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        res.render('admin/edit-land', {
            land,
            error: null,
            currentPage: 'farmer-info'
        });
    } catch (error) {
        console.error('Error fetching land record:', error);
        res.redirect('/admin/farmer-info');
    }
});

// Update land record
router.post('/update-land/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { land_number, farmer_name, acres_of_land, soil_type } = req.body;

        const { error } = await supabase
            .from('farmers_land')
            .update({
                land_number,
                farmer_name,
                acres_of_land,
                soil_type,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        res.redirect('/admin/farmer-info');
    } catch (error) {
        console.error('Error updating land record:', error);
        res.redirect('/admin/farmer-info');
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

// Weather route
router.get('/weather', async (req, res) => {
    const location = req.query.location;
    const apiKey = '186bf347109a1dfd5ef5b182e9db3de0';

    if (!location) {
        return res.render('admin/weather', { weather: null, forecast: null, error: 'Please enter a location.' });
    }

    const apiUrl = `http://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;

    try {
        const response = await axios.get(apiUrl);
        const weatherData = response.data;

        // Structure the weather data properly
        const weather = {
            name: weatherData.city.name,
            country: weatherData.city.country,
            main: {
                temp: weatherData.list[0].main.temp,
                humidity: weatherData.list[0].main.humidity
            },
            wind: {
                speed: weatherData.list[0].wind.speed
            },
            weather: weatherData.list[0].weather
        };

        res.render('admin/weather', { weather, forecast: weatherData, error: null });
    } catch (error) {
        console.error('Error fetching weather data:', error);
        res.render('admin/weather', { weather: null, forecast: null, error: 'Could not fetch weather data. Please try again.' });
    }
});

// Update the orders route
router.get('/orders', isAdmin, async (req, res) => {
    try {
        // Modify the select query to match your actual schema
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                id,
                user_id,
                status,
                created_at,
                updated_at,
                users (
                    id,
                    name,
                    email,
                    address,
                    city,
                    state,
                    pincode
                ),
                order_items (
                    id,
                    quantity,
                    price,
                    vegetable_id,
                    vegetables (
                        id,
                        name,
                        image_url,
                        price,
                        unit
                    )
                )
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }

        // Calculate additional order information
        const processedOrders = orders.map(order => {
            const orderItems = order.order_items || [];
            const subtotal = orderItems.reduce((sum, item) => 
                sum + (item.price * item.quantity), 0);
            
            return {
                ...order,
                subtotal,
                items_count: orderItems.reduce((sum, item) => sum + item.quantity, 0),
                total_amount: subtotal + 50 + (subtotal * 0.05) // Base + Delivery fee (50) + Tax (5%)
            };
        });

        res.render('admin/orders', {
            orders: processedOrders,
            orderCount: orders.length,
            currentPage: 'orders',
            error: null
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        res.render('admin/orders', {
            orders: [],
            orderCount: 0,
            currentPage: 'orders',
            error: 'Failed to fetch orders: ' + error.message
        });
    }
});

// Update order status route
router.post('/orders/:orderId/status', isAdmin, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const { error } = await supabase
            .from('orders')
            .update({ 
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Get all users
router.get('/users', isAdmin, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.render('admin/users', {
            users: users || [],
            currentPage: 'users',
            error: null
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.render('admin/users', {
            users: [],
            currentPage: 'users',
            error: 'Failed to fetch users'
        });
    }
});

// Add new user
router.post('/users', isAdmin, async (req, res) => {
    try {
        const { 
            name, 
            email, 
            password, 
            role,
            phone,
            address,
            city,
            state,
            pincode
        } = req.body;
        
        // Check if email already exists
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create auth user first
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true
        });

        if (authError) {
            console.error('Auth error:', authError);
            throw authError;
        }

        // Then create the user profile with address fields
        const { data, error } = await supabase
            .from('users')
            .insert({
                id: authUser.user.id,
                name,
                email,
                password: hashedPassword,
                role: role || 'user',
                phone,
                address,
                city,
                state,
                pincode,
                total_orders: 0,
                active_orders: 0,
                saved_addresses: address ? 1 : 0
            })
            .select()
            .single();

        if (error) {
            console.error('Database error:', error);
            // Cleanup auth user if profile creation fails
            await supabase.auth.admin.deleteUser(authUser.user.id);
            throw error;
        }

        // Remove sensitive data from response
        delete data.password;
        res.json(data);
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: error.message || 'Failed to create user' });
    }
});

// Update user
router.put('/users/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, 
            email, 
            password, 
            role,
            phone,
            address,
            city,
            state,
            pincode
        } = req.body;
        
        // Check if email exists for other users
        if (email) {
            const { data: existingUser, error: checkError } = await supabase
                .from('users')
                .select('id')
                .eq('email', email)
                .neq('id', id)
                .single();

            if (existingUser) {
                return res.status(400).json({ error: 'Email already exists' });
            }

            // Update auth email if changed
            const { error: authError } = await supabase.auth.admin.updateUserById(
                id,
                { email: email }
            );

            if (authError) throw authError;
        }

        // Update auth password if provided
        if (password) {
            const { error: authError } = await supabase.auth.admin.updateUserById(
                id,
                { password: password }
            );

            if (authError) throw authError;
        }

        // Prepare update data with address fields
        let updateData = {
            name,
            email,
            role,
            phone,
            address,
            city,
            state,
            pincode
        };

        // Only update password if provided
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateData.password = hashedPassword;
        }

        // Update saved_addresses count if address is provided
        if (address && !address.trim()) {
            updateData.saved_addresses = 1;
        }

        const { data, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Remove sensitive data from response
        delete data.password;
        res.json(data);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: error.message || 'Failed to update user' });
    }
});

// Delete user
router.delete('/users/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Bulk import users from CSV
router.post('/users/import', isAdmin, upload.single('csv'), async (req, res) => {
    try {
        const csvData = req.file.buffer.toString();
        
        csv.parse(csvData, {
            columns: true,
            skip_empty_lines: true
        }, async (err, data) => {
            if (err) throw err;

            const users = await Promise.all(data.map(async row => ({
                name: row.name,
                email: row.email,
                password: await bcrypt.hash(row.password || 'defaultPassword123', 10),
                role: row.role || 'user',
                is_active: row.is_active === 'true'
            })));

            const { data: insertedUsers, error } = await supabase
                .from('users')
                .insert(users);

            if (error) throw error;

            res.json({ count: insertedUsers.length });
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to import users' });
    }
});

// Get specific user details
router.get('/users/:email', isAdmin, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('name, email, phone, address, city, state, pincode')
            .eq('email', req.params.email)
            .single();

        if (error) throw error;

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

// Update specific user details
router.put('/users/update-address', isAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .update({
                phone: '9876543210',
                address: '42, East Masi Street',
                city: 'Madurai',
                state: 'Tamil Nadu',
                pincode: '625001'
            })
            .eq('email', 'user@gmail.com')
            .select()
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(data);
    } catch (error) {
        console.error('Error updating user details:', error);
        res.status(500).json({ error: 'Failed to update user details' });
    }
});

// Get delivery information for an order
router.get('/orders/:orderId/delivery-info', isAdmin, async (req, res) => {
    try {
        const { data: order, error } = await supabase
            .from('orders')
            .select(`
                *,
                users (
                    address,
                    city,
                    state,
                    pincode
                )
            `)
            .eq('id', req.params.orderId)
            .single();

        if (error) throw error;

        // Geocode the address to get coordinates
        const address = `${order.users.address}, ${order.users.city}, ${order.users.state} ${order.users.pincode}`;
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
        
        const response = await axios.get(geocodeUrl);
        const location = response.data.results[0].geometry.location;

        res.json({
            address: address,
            latitude: location.lat,
            longitude: location.lng
        });
    } catch (error) {
        console.error('Error getting delivery info:', error);
        res.status(500).json({ error: 'Failed to get delivery information' });
    }
});

// Update delivery location
router.post('/orders/:orderId/update-location', isAdmin, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { latitude, longitude, eta } = req.body;

        const { error } = await supabase
            .from('orders')
            .update({
                delivery_latitude: latitude,
                delivery_longitude: longitude,
                estimated_delivery_time: eta,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating delivery location:', error);
        res.status(500).json({ error: 'Failed to update delivery location' });
    }
});

module.exports = router; 