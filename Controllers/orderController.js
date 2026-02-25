const Order = require('../Models/Order');
const Customer = require('../Models/Customer');
const Product = require('../Models/Product');
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePhoneForWhatsApp = (phone = '') => {
    const raw = String(phone || '').trim().replace(/[\s()-]/g, '');
    if (!raw) return '';

    if (raw.startsWith('+')) {
        return `+${raw.slice(1).replace(/\D/g, '')}`;
    }

    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('92')) return `+${digits}`;
    if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith('3')) return `+92${digits}`;

    return `+${digits}`;
};

const buildReadyForPickupMessage = ({ customerName, orderId, customerOrderNumber, products, total, paid }) => {
    const productsText = (products || [])
        .map((p, idx) => `${idx + 1}. ${p?.type || 'Item'}${p?.price ? ` - Rs ${p.price}` : ''}`)
        .join('\n');

    const paymentText = paid ? 'Paid' : `Pending (Rs ${Number(total || 0)})`;
    const readableOrderNumber = customerOrderNumber || orderId;

    return [
        `Assalam o Alaikum ${customerName || 'Customer'},`,
        '',
        `Your order is ready for pickup.`,
        `Order Number: ${readableOrderNumber}`,
        '',
        'Items:',
        productsText || '1. Custom order item',
        '',
        `Payment: ${paymentText}`,
        '',
        'Please collect it from the shop. Thank you.'
    ].join('\n');
};

const getPagination = (req) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
    const skip = (page - 1) * limit;
    const query = (req.query.query || '').trim();
    return { page, limit, skip, query };
};

const buildOrderSearchMatch = (query) => {
    if (!query) return {};

    const searchRegex = new RegExp(escapeRegex(query), 'i');
    const numericQuery = Number(query);
    const orConditions = [
        { status: searchRegex },
        { notes: searchRegex },
        { 'customerData.name': searchRegex },
        { 'customerData.phone': searchRegex },
        { 'productsData.type': searchRegex },
        { 'productsData.instructions': searchRegex },
        { 'productsData.options.name': searchRegex },
        { 'productsData.options.customization': searchRegex }
    ];

    if (!Number.isNaN(numericQuery)) {
        orConditions.push({ total: numericQuery });
    }

    return { $or: orConditions };
};

exports.getAllOrders = async (req, res) => {
    try {
        const { page, limit, skip, query } = getPagination(req);

        const pipeline = [
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customerData'
                }
            },
            {
                $unwind: {
                    path: '$customerData',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: 'products',
                    foreignField: '_id',
                    as: 'productsData'
                }
            },
            {
                $match: buildOrderSearchMatch(query)
            },
            { $sort: { date: -1 } },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                customer: {
                                    _id: '$customerData._id',
                                    name: '$customerData.name',
                                    phone: '$customerData.phone'
                                },
                                products: '$productsData',
                                date: 1,
                                total: 1,
                                status: 1,
                                paid: 1,
                                notes: 1,
                                lastUpdated: 1,
                                createdAt: 1,
                                updatedAt: 1
                            }
                        }
                    ],
                    metadata: [{ $count: 'total' }]
                }
            }
        ];

        const [result] = await Order.aggregate(pipeline);
        const orders = result?.data || [];
        const total = result?.metadata?.[0]?.total || 0;
        const totalPages = Math.ceil(total / limit) || 1;

        res.status(200).json({
            orders,
            data: orders,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            query
        });
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
        const { page, limit, skip, query } = getPagination(req);
        const customerId = req.params.id;

        const baseMatch = { customer: customerId };
        if (query) {
            const searchRegex = new RegExp(escapeRegex(query), 'i');
            const numericQuery = Number(query);
            baseMatch.$or = [
                { status: searchRegex },
                { notes: searchRegex }
            ];
            if (!Number.isNaN(numericQuery)) {
                baseMatch.$or.push({ total: numericQuery });
            }
        }

        const [orders, total] = await Promise.all([
            Order.find(baseMatch)
                .populate('products')
                .sort({ date: -1 })
                .skip(skip)
                .limit(limit),
            Order.countDocuments(baseMatch)
        ]);

        const totalPages = Math.ceil(total / limit) || 1;
        res.status(200).json({
            orders,
            data: orders,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            query
        });
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

exports.sendReadyWhatsAppMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id)
            .populate('customer')
            .populate('products');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (!order.customer || !order.customer.phone) {
            return res.status(400).json({ message: 'Customer phone number is missing for this order' });
        }

        const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
        const WA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const WA_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

        if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
            return res.status(500).json({
                message: 'WhatsApp API is not configured',
                missing: [
                    !WA_TOKEN ? 'WHATSAPP_ACCESS_TOKEN' : null,
                    !WA_PHONE_NUMBER_ID ? 'WHATSAPP_PHONE_NUMBER_ID' : null
                ].filter(Boolean)
            });
        }

        const to = normalizePhoneForWhatsApp(order.customer.phone);
        if (!to) {
            return res.status(400).json({ message: 'Invalid customer phone number format' });
        }

        const generatedMessage = buildReadyForPickupMessage({
            customerName: order.customer.name,
            orderId: String(order._id),
            customerOrderNumber: order.customer.orderNumber,
            products: order.products,
            total: order.total,
            paid: order.paid
        });

        const customMessage = String(req.body?.message || '').trim();
        const messageToSend = customMessage || generatedMessage;

        const apiUrl = `https://graph.facebook.com/${WA_API_VERSION}/${WA_PHONE_NUMBER_ID}/messages`;
        const payload = {
            messaging_product: 'whatsapp',
            to: to.replace('+', ''),
            type: 'text',
            text: { body: messageToSend }
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${WA_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json({
                message: 'Failed to send WhatsApp message',
                error: data
            });
        }

        return res.status(200).json({
            message: 'WhatsApp message sent successfully',
            to,
            orderId: order._id,
            whatsappResponse: data
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error sending WhatsApp message', error: error.message });
    }
};
