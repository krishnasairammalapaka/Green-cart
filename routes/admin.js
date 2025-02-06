const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.redirect('/auth/login');
    }
};

// Add this at the beginning of your routes
router.get('/', isAdmin, (req, res) => {
    res.redirect('/admin/dashboard');
});

// Route to display farmer info page with data
router.get('/farmer-info', isAdmin, async (req, res) => {
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
router.get('/search-land', isAdmin, async (req, res) => {
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
router.get('/vegetables', isAdmin, async (req, res) => {
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
router.post('/vegetables', isAdmin, async (req, res) => {
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
router.put('/vegetables', isAdmin, async (req, res) => {
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
router.delete('/vegetables/:id', isAdmin, async (req, res) => {
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

// Add this route at the beginning of your routes
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        res.render('admin/dashboard', { 
            currentPage: 'dashboard'
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.render('admin/dashboard', { 
            error: 'Failed to load dashboard',
            currentPage: 'dashboard'
        });
    }
});

module.exports = router; 