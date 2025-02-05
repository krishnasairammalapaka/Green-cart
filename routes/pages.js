const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    next();
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/');
    }
    next();
};

// Index/Login page
router.get('/', (req, res) => {
    if (req.session.user) {
        return req.session.user.role === 'admin' 
            ? res.redirect('/admin/dashboard')
            : res.redirect('/user/dashboard');
    }
    res.render('index', { error: null });
});

// Register page
router.get('/register', (req, res) => {
    if (req.session.user) {
        return req.session.user.role === 'admin' 
            ? res.redirect('/admin/dashboard')
            : res.redirect('/user/dashboard');
    }
    res.render('register', { error: null });
});

// Admin Dashboard
router.get('/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        // Fetch all land information
        const { data: landData, error } = await supabase
            .from('farmer_lands')
            .select('*')
            .order('farmer_name', { ascending: true });

        console.log('Fetched land data:', landData); // Debug log
        console.log('Error if any:', error);    // Debug log

        if (error) throw error;

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            user: req.session.user,
            landData: landData || [],
            searchResult: null,
            error: null
        });
    } catch (error) {
        console.error('Error fetching land data:', error);
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            user: req.session.user,
            landData: [],
            error: 'Failed to fetch land data'
        });
    }
});

// User Dashboard
router.get('/user/dashboard', requireAuth, (req, res) => {
    if (req.session.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    res.render('user/dashboard', {
        title: 'User Dashboard',
        user: req.session.user
    });
});

// Search Land Information
router.get('/admin/search-land', requireAdmin, async (req, res) => {
    try {
        const { landNumber } = req.query;

        // Fetch all land data for the table
        const { data: landData, error: landError } = await supabase
            .from('farmer_lands')
            .select('*')
            .order('farmer_name', { ascending: true });

        if (landError) throw landError;

        if (!landNumber) {
            return res.render('admin/dashboard', {
                title: 'Admin Dashboard',
                user: req.session.user,
                landData: landData || [],
                searchResult: null
            });
        }

        // Search for specific land number
        const { data: searchData, error: searchError } = await supabase
            .from('farmer_lands')
            .select('*')
            .eq('land_number', landNumber)
            .single();

        if (searchError) throw searchError;

        if (!searchData) {
            return res.render('admin/dashboard', {
                title: 'Admin Dashboard',
                user: req.session.user,
                landData: landData || [],
                error: 'No land found with this number'
            });
        }

        const searchResult = {
            land_number: searchData.land_number,
            farmer_name: searchData.farmer_name,
            area: `${searchData.acres_of_land} acres`,
            soil_type: searchData.soil_type
        };

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            user: req.session.user,
            landData: landData || [],
            searchResult
        });

    } catch (error) {
        console.error('Search error:', error);
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            user: req.session.user,
            landData: [],
            error: 'An error occurred while searching'
        });
    }
});

module.exports = router; 