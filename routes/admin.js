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

// Route to display farmer info page with data
router.get('/farmer-info', isAdmin, async (req, res) => {
    try {
        const { data: landData, error } = await supabase
            .from('farmers_land')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.render('admin/farmer-info', { landData });
    } catch (error) {
        console.error('Error fetching farmer data:', error);
        res.render('admin/farmer-info', { 
            landData: [],
            error: 'Failed to fetch farmer data'
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

        res.render('admin/farmer-info', { landData });
    } catch (error) {
        console.error('Error searching land:', error);
        res.render('admin/farmer-info', { 
            landData: [],
            error: 'Failed to search land data'
        });
    }
});

module.exports = router; 