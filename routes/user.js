const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth/login');
    }
};

// Route to display marketplace
router.get('/marketplace', isAuthenticated, async (req, res) => {
    try {
        const { data: vegetables, error } = await supabase
            .from('vegetables')
            .select('*')
            .gt('stock_quantity', 0)
            .order('name');

        if (error) throw error;

        res.render('user/marketplace', { 
            vegetables,
            user: req.session.user // Pass the user data to the template
        });
    } catch (error) {
        console.error('Error fetching vegetables:', error);
        res.render('user/marketplace', { 
            vegetables: [],
            error: 'Failed to fetch vegetables',
            user: req.session.user
        });
    }
});

// Route to display shopping cart
router.get('/cart', isAuthenticated, async (req, res) => {
    try {
        const { data: cartItems, error } = await supabase
            .from('cart_items')
            .select(`
                *,
                vegetables (*)
            `)
            .eq('user_id', req.session.user.id);

        if (error) throw error;

        res.render('user/cart', { 
            cartItems,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.render('user/cart', { 
            cartItems: [],
            error: 'Failed to fetch cart items',
            user: req.session.user
        });
    }
});

// Route to add item to cart
router.post('/cart/add', isAuthenticated, async (req, res) => {
    try {
        const { vegetableId, quantity } = req.body;
        const userId = req.session.user.id;

        // Check if item already exists in cart
        const { data: existingItem, error: checkError } = await supabase
            .from('cart_items')
            .select('*')
            .eq('user_id', userId)
            .eq('vegetable_id', vegetableId)
            .single();

        if (checkError && checkError.code !== 'PGRST116') throw checkError;

        if (existingItem) {
            // Update quantity if item exists
            const { error: updateError } = await supabase
                .from('cart_items')
                .update({ quantity: existingItem.quantity + parseInt(quantity) })
                .eq('id', existingItem.id);

            if (updateError) throw updateError;
        } else {
            // Insert new item if it doesn't exist
            const { error: insertError } = await supabase
                .from('cart_items')
                .insert([{
                    user_id: userId,
                    vegetable_id: vegetableId,
                    quantity: parseInt(quantity)
                }]);

            if (insertError) throw insertError;
        }

        // Get updated cart count
        const { count, error: countError } = await supabase
            .from('cart_items')
            .select('*', { count: 'exact' })
            .eq('user_id', userId);

        if (countError) throw countError;

        res.json({ success: true, cartCount: count });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ error: 'Failed to add to cart' });
    }
});

// Route to get cart count
router.get('/cart/count', isAuthenticated, async (req, res) => {
    try {
        const { count, error } = await supabase
            .from('cart_items')
            .select('*', { count: 'exact' })
            .eq('user_id', req.session.user.id);

        if (error) throw error;

        res.json({ count: count || 0 });
    } catch (error) {
        console.error('Error getting cart count:', error);
        res.status(500).json({ error: 'Failed to get cart count' });
    }
});

// Update cart item quantity
router.put('/cart/update/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;
        
        const { error } = await supabase
            .from('cart_items')
            .update({ quantity })
            .eq('id', id)
            .eq('user_id', req.session.user.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({ error: 'Failed to update cart' });
    }
});

// Remove item from cart
router.delete('/cart/remove/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        
        const { error } = await supabase
            .from('cart_items')
            .delete()
            .eq('id', id)
            .eq('user_id', req.session.user.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing item:', error);
        res.status(500).json({ error: 'Failed to remove item' });
    }
});

module.exports = router; 