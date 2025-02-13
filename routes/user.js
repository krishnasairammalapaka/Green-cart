const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth/login');
    }
};

// Add Razorpay
const razorpay = new Razorpay({
    key_id: 'rzp_test_CVbypqu6YtbzvT',
    key_secret: 'Qi0jllHSrENWlNxGl0QXbJC5'
});

// Add this helper function at the top of the file
async function getOrderCount(userId) {
    const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);
    return count || 0;
}

// Route to display marketplace
router.get('/marketplace', isAuthenticated, async (req, res) => {
    try {
        const [{ data: vegetables, error }, orderCount] = await Promise.all([
            supabase
                .from('vegetables')
                .select('*')
                .gt('stock_quantity', 0)
                .order('name'),
            getOrderCount(req.session.user.id)
        ]);

        if (error) throw error;

        res.render('user/marketplace', { 
            vegetables,
            orderCount,
            user: req.session.user,
            currentPage: 'marketplace'
        });
    } catch (error) {
        console.error('Error:', error);
        res.render('user/marketplace', { 
            vegetables: [],
            orderCount: 0,
            error: 'Failed to fetch data',
            user: req.session.user,
            currentPage: 'marketplace'
        });
    }
});

// Route to display shopping cart
router.get('/cart', isAuthenticated, async (req, res) => {
    try {
        const [{ data: cartItems, error }, orderCount] = await Promise.all([
            supabase
                .from('cart_items')
                .select(`
                    *,
                    vegetables (*)
                `)
                .eq('user_id', req.session.user.id),
            getOrderCount(req.session.user.id)
        ]);

        if (error) throw error;

        res.render('user/cart', { 
            cartItems,
            orderCount,
            user: req.session.user,
            currentPage: 'cart'
        });
    } catch (error) {
        console.error('Error:', error);
        res.render('user/cart', { 
            cartItems: [],
            orderCount: 0,
            error: 'Failed to fetch cart',
            user: req.session.user,
            currentPage: 'cart'
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

// Route to display orders
router.get('/orders', isAuthenticated, async (req, res) => {
    try {
        // Get orders with items and vegetables
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                items:order_items (
                    *,
                    vegetables:vegetables (*)
                )
            `)
            .eq('user_id', req.session.user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Database error:', error);
            throw error;
        }

        console.log('Orders fetched:', orders); // For debugging

        res.render('user/orders', { 
            orders,
            orderCount: orders.length,
            user: req.session.user,
            currentPage: 'orders'
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.render('user/orders', { 
            orders: [],
            orderCount: 0,
            error: 'Failed to fetch orders',
            user: req.session.user,
            currentPage: 'orders'
        });
    }
});

// Update the create order route
router.post('/orders/create', isAuthenticated, async (req, res) => {
    try {
        // Get cart items
        const { data: cartItems, error: cartError } = await supabase
            .from('cart_items')
            .select(`
                *,
                vegetables (*)
            `)
            .eq('user_id', req.session.user.id);

        if (cartError) throw cartError;
        if (!cartItems.length) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Calculate total
        const subtotal = cartItems.reduce((sum, item) => {
            return sum + (item.vegetables.price * item.quantity);
        }, 0);
        const deliveryFee = 50;
        const tax = subtotal * 0.05;
        const total = subtotal + deliveryFee + tax;

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(total * 100), // Convert to paise
            currency: 'INR',
            receipt: `order_${Date.now()}`
        });

        // Create order in database
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([{
                user_id: req.session.user.id,
                total_amount: total,
                delivery_fee: deliveryFee,
                status: 'pending',
                razorpay_order_id: razorpayOrder.id
            }])
            .select()
            .single();

        if (orderError) throw orderError;

        // Create order items
        const orderItems = cartItems.map(item => ({
            order_id: order.id,
            vegetable_id: item.vegetable_id,
            quantity: item.quantity,
            price: item.vegetables.price
        }));

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems);

        if (itemsError) throw itemsError;

        res.json({
            orderId: order.id,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Verify payment route
router.post('/orders/verify-payment', isAuthenticated, async (req, res) => {
    try {
        const {
            orderId,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
        } = req.body;

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", "Qi0jllHSrENWlNxGl0QXbJC5")
            .update(body.toString())
            .digest("hex");

        if (expectedSignature === razorpay_signature) {
            // Update order status
            const { error: orderError } = await supabase
                .from('orders')
                .update({
                    status: 'completed',
                    payment_id: razorpay_payment_id,
                    payment_verified: true
                })
                .eq('id', orderId);

            if (orderError) throw orderError;

            // Clear cart after successful payment
            const { error: clearError } = await supabase
                .from('cart_items')
                .delete()
                .eq('user_id', req.session.user.id);

            if (clearError) throw clearError;

            res.json({ 
                success: true,
                message: 'Payment verified successfully'
            });
        } else {
            // If signature verification fails
            await supabase
                .from('orders')
                .update({
                    status: 'failed',
                    payment_verified: false
                })
                .eq('id', orderId);

            throw new Error('Invalid payment signature');
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Payment verification failed'
        });
    }
});

module.exports = router; 