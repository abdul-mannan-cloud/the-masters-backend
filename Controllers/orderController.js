const Order = require('../Models/Order');
const Customer = require('../Models/Customer');
const Product = require('../Models/Product');

exports.getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('customer', 'name phone')
            .populate('products')
            .sort({ date: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching orders', error: error.message });
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('customer')
            .populate('products');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.status(200).json(order);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching order', error: error.message });
    }
};

exports.getCustomerOrders = async (req, res) => {
    try {
        const orders = await Order.find({ customer: req.params.id })
            .populate('products')
            .sort({ date: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching customer orders', error: error.message });
    }
};

exports.placeOrder = async (req, res) => {
    try {
        const { customer, products, total, status = 'pending', paid = false } = req.body;

        // Validate customer exists
        const customerExists = await Customer.findById(customer);
        if (!customerExists) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Create products first
        const productIds = [];
        for (let productData of products) {
            const product = new Product({
                type: productData.type,
                instructions: productData.instructions,
                price: productData.price,
                options: productData.options
            });
            const savedProduct = await product.save();
            productIds.push(savedProduct._id);
        }

        const order = new Order({
            customer,
            products: productIds, // Use the array of product IDs
            total,
            status,
            paid
        });

        await order.save();

        // Update customer's orders array
        await Customer.findByIdAndUpdate(
            customer,
            { $push: { orders: order._id } }
        );

        // Fetch the complete order with populated products
        const populatedOrder = await Order.findById(order._id)
            .populate('customer')
            .populate('products');

        res.status(201).json(populatedOrder);
    } catch (error) {
        res.status(500).json({ message: 'Error creating order', error: error.message });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'in progress', 'completed', 'shipped'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { status, lastUpdated: new Date() },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.status(200).json(order);
    } catch (error) {
        res.status(500).json({ message: 'Error updating order status', error: error.message });
    }
};

exports.updatePaymentStatus = async (req, res) => {
    try {
        const { paid } = req.body;
        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { paid, lastUpdated: new Date() },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.status(200).json(order);
    } catch (error) {
        res.status(500).json({ message: 'Error updating payment status', error: error.message });
    }
};

exports.getOrderStats = async (req, res) => {
    try {
        const stats = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$total' },
                    averageOrderValue: { $avg: '$total' },
                    pendingOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    completedOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    }
                }
            }
        ]);

        res.status(200).json(stats[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching order stats', error: error.message });
    }
};

exports.deleteOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Remove order reference from customer
        await Customer.findByIdAndUpdate(
            order.customer,
            { $pull: { orders: order._id } }
        );

        await Order.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Order deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting order', error: error.message });
    }
};

exports.getOrdersToday = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const orders = await Order.find({
            date: {
                $gte: today,
                $lt: tomorrow
            }
        }).populate('customer', 'name phone')
            .populate('products')
            .sort({ date: -1 });

        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching today\'s orders', error: error.message });
    }
};