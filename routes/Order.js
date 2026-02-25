const express = require('express');
const router = express.Router();
const orderController = require('../Controllers/orderController');

// Get all orders
router.get('/getallorders', orderController.getAllOrders);

// Get customer orders
router.get('/customer/:id', orderController.getCustomerOrders);

// Get today's orders
router.get('/today/orders', orderController.getOrdersToday);

// Place order
router.post('/placeorder', orderController.placeOrder);

// Update order status
router.put('/update/status/:id', orderController.updateStatus);

// Update payment status
router.put('/update/payment/:id', orderController.updatePaymentStatus);

// Get order statistics
router.get('/stats/overview', orderController.getOrderStats);

// Delete order
router.delete('/delete/:id', orderController.deleteOrder);

// Send "ready for pickup" WhatsApp message for an order
router.post('/:id/notify-whatsapp-ready', orderController.sendReadyWhatsAppMessage);

// Get single order
router.get('/:id', orderController.getOrderById);

module.exports = router;
