const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

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
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
                    vegetables (*)
                )
            `)
            .eq('user_id', req.session.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

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

// Update the create-order route
router.post('/create-order', isAuthenticated, async (req, res) => {
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
        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Calculate total
        const subtotal = cartItems.reduce((sum, item) => {
            return sum + (item.vegetables.price * item.quantity);
        }, 0);
        const deliveryFee = 50;
        const tax = subtotal * 0.05;
        const total = Math.round((subtotal + deliveryFee + tax) * 100); // Convert to paise

        // Create order in database
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([{
                user_id: req.session.user.id,
                total_amount: total / 100, // Store in rupees
                status: 'pending'
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

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: total,
            currency: 'INR',
            receipt: order.id,
            payment_capture: 1
        });

        // Update order with Razorpay order ID
        await supabase
            .from('orders')
            .update({ razorpay_order_id: razorpayOrder.id })
            .eq('id', order.id);

        res.json({
            orderId: order.id,
            razorpayOrderId: razorpayOrder.id,
            amount: total,
            currency: 'INR'
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Order success page
router.get('/order-success', isAuthenticated, (req, res) => {
    res.render('user/order-success', {
        user: req.session.user,
        currentPage: 'orders'
    });
});

// Verify payment route
router.post('/verify-payment', isAuthenticated, async (req, res) => {
    try {
        const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

        // Update order status
        const { error: orderError } = await supabase
            .from('orders')
            .update({
                status: 'completed',
                payment_id: razorpay_payment_id
            })
            .eq('id', orderId);

        if (orderError) throw orderError;

        // Clear cart
        const { error: clearError } = await supabase
            .from('cart_items')
            .delete()
            .eq('user_id', req.session.user.id);

        if (clearError) throw clearError;

        res.json({ 
            success: true,
            message: 'Payment verified successfully'
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Payment verification failed'
        });
    }
});

// Add this route to generate and download order receipt
router.get('/order-receipt/:orderId', isAuthenticated, async (req, res) => {
    try {
        const { orderId } = req.params;

        // Fetch order details
        const { data: order, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
                    vegetables (*)
                )
            `)
            .eq('id', orderId)
            .single();

        if (error) throw error;

        // Create PDF
        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=order-${orderId}.pdf`);
        doc.pipe(res);

        // Add content to PDF
        doc.fontSize(20).text('Order Receipt', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Order ID: ${orderId}`);
        doc.text(`Date: ${new Date(order.created_at).toLocaleString()}`);
        doc.moveDown();

        // Add items
        doc.text('Items:', { underline: true });
        order.order_items.forEach(item => {
            doc.text(`${item.vegetables.name} x ${item.quantity} - ₹${(item.price * item.quantity).toFixed(2)}`);
        });

        doc.moveDown();
        doc.text(`Subtotal: ₹${order.total_amount.toFixed(2)}`);
        doc.text(`Delivery Fee: ₹50.00`);
        doc.text(`Tax (5%): ₹${(order.total_amount * 0.05).toFixed(2)}`);
        doc.text(`Total: ₹${(order.total_amount + 50 + (order.total_amount * 0.05)).toFixed(2)}`, { bold: true });

        doc.end();
    } catch (error) {
        console.error('Error generating receipt:', error);
        res.status(500).send('Failed to generate receipt');
    }
});

module.exports = router; 