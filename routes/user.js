const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
<<<<<<< HEAD
=======
const fs = require('fs');
const path = require('path');
>>>>>>> deba7f6 (added the gemni API key for the catbot)

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

// Make sure these directories exist
const ensureDirectoryExists = (directory) => {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
};

// Add this before your routes
ensureDirectoryExists(path.join(__dirname, '../public/pdfs'));
ensureDirectoryExists(path.join(__dirname, '../public/images'));

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

// Orders route
router.get('/orders', isAuthenticated, async (req, res, next) => {
    try {
<<<<<<< HEAD
=======
        // Fetch orders with their items and vegetable details
>>>>>>> deba7f6 (added the gemni API key for the catbot)
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
<<<<<<< HEAD
                    vegetables (*)
=======
                    vegetables:vegetable_id (*)
>>>>>>> deba7f6 (added the gemni API key for the catbot)
                )
            `)
            .eq('user_id', req.session.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.render('user/orders', {
<<<<<<< HEAD
            orders,
            orderCount: orders.length,
            user: req.session.user,
=======
            orders: orders || [],
>>>>>>> deba7f6 (added the gemni API key for the catbot)
            currentPage: 'orders'
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
<<<<<<< HEAD
        res.render('user/orders', {
            orders: [],
            orderCount: 0,
            error: 'Failed to fetch orders',
            user: req.session.user,
            currentPage: 'orders'
        });
=======
        next(error);
>>>>>>> deba7f6 (added the gemni API key for the catbot)
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
<<<<<<< HEAD
        const deliveryFee = 50;
        const tax = subtotal * 0.05;
        const total = Math.round((subtotal + deliveryFee + tax) * 100); // Convert to paise
=======
        
        const deliveryFee = 50.00; // Fixed delivery fee
        const tax = subtotal * 0.05;  // 5% tax
        const total = subtotal + deliveryFee + tax;

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(total * 100), // Convert to paise
            currency: 'INR',
            receipt: `order_${Date.now()}`
        });
>>>>>>> deba7f6 (added the gemni API key for the catbot)

        // Create order in database
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([{
                user_id: req.session.user.id,
<<<<<<< HEAD
                total_amount: total / 100, // Store in rupees
                status: 'pending'
=======
                total_amount: total,
                delivery_fee: deliveryFee,  // Add delivery fee
                subtotal: subtotal,         // Add subtotal
                tax: tax,                   // Add tax
                status: 'pending',
                razorpay_order_id: razorpayOrder.id
>>>>>>> deba7f6 (added the gemni API key for the catbot)
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

<<<<<<< HEAD
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
=======
        // Clear cart after successful order creation
        const { error: clearCartError } = await supabase
            .from('cart_items')
            .delete()
            .eq('user_id', req.session.user.id);

        if (clearCartError) throw clearCartError;
>>>>>>> deba7f6 (added the gemni API key for the catbot)

        res.json({
            orderId: order.id,
            razorpayOrderId: razorpayOrder.id,
<<<<<<< HEAD
            amount: total,
            currency: 'INR'
=======
            amount: razorpayOrder.amount,
            subtotal,
            deliveryFee,
            tax,
            total
>>>>>>> deba7f6 (added the gemni API key for the catbot)
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

<<<<<<< HEAD
// Add this route to generate and download order receipt
router.get('/order-receipt/:orderId', isAuthenticated, async (req, res) => {
    try {
        const { orderId } = req.params;

=======
router.get('/orders/:orderId/pdf', isAuthenticated, async (req, res) => {
    try {
>>>>>>> deba7f6 (added the gemni API key for the catbot)
        // Fetch order details
        const { data: order, error } = await supabase
            .from('orders')
            .select(`
                *,
<<<<<<< HEAD
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
=======
                items:order_items (
                    *,
                    vegetables:vegetable_id (*)
                )
            `)
            .eq('id', req.params.orderId)
            .eq('user_id', req.session.user.id)
            .single();

        if (error || !order) {
            throw new Error('Order not found');
        }

        // Create PDF document
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            bufferPages: true
        });

        // Create a write stream for the PDF
        const pdfPath = path.join(__dirname, `../public/pdfs/order-${order.id.slice(-8)}.pdf`);
        const writeStream = fs.createWriteStream(pdfPath);

        // Pipe the PDF to both the file and the response
        doc.pipe(writeStream);
        doc.pipe(res);

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=order-${order.id.slice(-8)}.pdf`);

        try {
            // Add logo if exists
            const logoPath = path.join(__dirname, '../public/images/greenscart-logo.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, {
                    fit: [150, 150],
                    align: 'center'
                });
            }

            // Add company logo/header
            doc
                .fontSize(20)
                .text('GreenScart', { align: 'center' })
                .fontSize(16)
                .text('Order Acknowledgment', { align: 'center' })
                .moveDown(2);

            // Add order information
            doc
                .fontSize(12)
                .text('Order Information', { underline: true })
                .moveDown(0.5)
                .text(`Order ID: #${order.id.slice(-8)}`)
                .text(`Order Date: ${new Date(order.created_at).toLocaleString()}`)
                .text(`Status: ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}`)
                .moveDown(1.5);

            // Add items table header
            doc
                .fontSize(14)
                .text('Order Items', { underline: true })
                .moveDown(0.5);

            // Add items with proper formatting
            order.items.forEach((item, index) => {
                doc
                    .fontSize(12)
                    .text(`${index + 1}. ${item.vegetables.name}`, { continued: true })
                    .text(`   Quantity: ${item.quantity}`, { continued: true })
                    .text(`   Price: ₹${item.price.toFixed(2)}`, { continued: true })
                    .text(`   Total: ₹${(item.quantity * item.price).toFixed(2)}`)
                    .moveDown(0.5);
            });

            // Add order summary
            doc
                .moveDown(1.5)
                .fontSize(12)
                .text('Order Summary', { underline: true })
                .moveDown(0.5)
                .text(`Subtotal: ₹${(order.total_amount - order.delivery_fee).toFixed(2)}`)
                .text(`Delivery Fee: ₹${order.delivery_fee.toFixed(2)}`)
                .moveDown(0.5)
                .fontSize(14)
                .text(`Total Amount: ₹${order.total_amount.toFixed(2)}`, { bold: true })
                .moveDown(2);

            // Add footer
            doc
                .fontSize(10)
                .text('Thank you for shopping with GreenScart!', { align: 'center', color: 'green' })
                .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });

            // End the document
            doc.end();

            // Clean up the temporary file after sending
            writeStream.on('finish', () => {
                fs.unlink(pdfPath, (err) => {
                    if (err) console.error('Error deleting temporary PDF:', err);
                });
            });

        } catch (pdfError) {
            console.error('Error generating PDF content:', pdfError);
            doc.end(); // Make sure to end the document even if there's an error
            res.status(500).send('Error generating PDF content');
        }

    } catch (error) {
        console.error('Error fetching order data:', error);
        res.status(500).send('Failed to generate PDF');
>>>>>>> deba7f6 (added the gemni API key for the catbot)
    }
});

module.exports = router; 