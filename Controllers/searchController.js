const Customer = require('../Models/Customer');
const Employee = require('../Models/Employee');
const Order = require('../Models/Order');
const Product = require('../Models/Product');
const Item = require('../Models/Items');
const Cloth = require('../Models/Cloth');

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizePhoneQuery = (value = '') => String(value).trim().replace(/[\s()-]/g, '');

const ALL_TYPES = ['customers', 'orders', 'employees', 'products', 'items', 'cloths'];

function parsePrefix(rawQuery) {
    const q = String(rawQuery || '').trim();
    if (!q) return { term: '', restrictTo: null, mode: 'empty' };

    const first = q[0];
    const rest = q.slice(1).trim();

    if (first === '@') return { term: rest, restrictTo: ['employees'], mode: 'employee' };
    if (first === '#') return { term: rest, restrictTo: ['customers', 'orders'], mode: 'orderNumber' };
    if (first === '+' || /^\d/.test(q)) {
        const phoneTerm = first === '+' ? rest : q;
        return { term: phoneTerm, restrictTo: ['customers', 'employees'], mode: 'phone' };
    }
    return { term: q, restrictTo: null, mode: 'general' };
}

async function searchCustomers(term, mode, limit) {
    const regex = new RegExp(escapeRegex(term), 'i');
    let filter;
    if (mode === 'orderNumber') {
        filter = { orderNumber: regex };
    } else if (mode === 'phone') {
        const phone = normalizePhoneQuery(term);
        filter = { phone: new RegExp(escapeRegex(phone), 'i') };
    } else {
        filter = {
            $or: [
                { orderNumber: regex },
                { name: regex },
                { phone: regex },
                { address: regex },
                { email: regex }
            ]
        };
    }

    return Customer.find(filter)
        .select('orderNumber name phone address email')
        .limit(limit)
        .lean();
}

async function searchEmployees(term, mode, limit) {
    const regex = new RegExp(escapeRegex(term), 'i');
    let filter;
    if (mode === 'phone') {
        const phone = normalizePhoneQuery(term);
        filter = { phone: new RegExp(escapeRegex(phone), 'i') };
    } else {
        filter = {
            $or: [
                { name: regex },
                { phone: regex },
                { cnic: regex },
                { role: regex }
            ]
        };
    }

    return Employee.find(filter)
        .select('name phone cnic role')
        .limit(limit)
        .lean();
}

async function searchOrders(term, mode, limit) {
    const mongoose = require('mongoose');
    const orFilters = [];

    if (mongoose.isValidObjectId(term)) {
        orFilters.push({ _id: term });
    }

    const regex = new RegExp(escapeRegex(term), 'i');
    orFilters.push({ status: regex });
    orFilters.push({ notes: regex });

    if (mode === 'orderNumber') {
        const matchingCustomers = await Customer.find({ orderNumber: regex })
            .select('_id')
            .limit(50)
            .lean();
        if (matchingCustomers.length) {
            orFilters.push({ customer: { $in: matchingCustomers.map((c) => c._id) } });
        }
    }

    return Order.find({ $or: orFilters })
        .populate('customer', 'name phone orderNumber')
        .select('status total paid date customer')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
}

async function searchProducts(term, limit) {
    const regex = new RegExp(escapeRegex(term), 'i');
    return Product.find({
        $or: [
            { type: regex },
            { status: regex },
            { instructions: regex }
        ]
    })
        .select('type status price date')
        .limit(limit)
        .lean();
}

async function searchItems(term, limit) {
    const regex = new RegExp(escapeRegex(term), 'i');
    return Item.find({ name: regex })
        .select('name price')
        .limit(limit)
        .lean();
}

async function searchCloths(term, limit) {
    const regex = new RegExp(escapeRegex(term), 'i');
    return Cloth.find({
        $or: [
            { name: regex },
            { code: regex },
            { type: regex },
            { color: regex },
            { productType: regex }
        ]
    })
        .select('name code type color price quantity productType')
        .limit(limit)
        .lean();
}

const globalSearch = async (req, res) => {
    try {
        const rawQuery = String(req.query.q || '').trim();
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 25);
        const requestedTypes = String(req.query.types || '')
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);

        if (!rawQuery) {
            return res.status(200).json({
                query: '',
                mode: 'empty',
                results: Object.fromEntries(ALL_TYPES.map((t) => [t, []]))
            });
        }

        const { term, restrictTo, mode } = parsePrefix(rawQuery);

        if (!term) {
            return res.status(200).json({
                query: rawQuery,
                mode,
                results: Object.fromEntries(ALL_TYPES.map((t) => [t, []]))
            });
        }

        let activeTypes = requestedTypes.length
            ? requestedTypes.filter((t) => ALL_TYPES.includes(t))
            : ALL_TYPES.slice();

        if (restrictTo) {
            activeTypes = activeTypes.filter((t) => restrictTo.includes(t));
        }

        const taskMap = {
            customers: () => searchCustomers(term, mode, limit),
            employees: () => searchEmployees(term, mode, limit),
            orders: () => searchOrders(term, mode, limit),
            products: () => searchProducts(term, limit),
            items: () => searchItems(term, limit),
            cloths: () => searchCloths(term, limit)
        };

        const entries = await Promise.all(
            activeTypes.map(async (type) => {
                try {
                    const data = await taskMap[type]();
                    return [type, data];
                } catch (err) {
                    console.error(`Global search failed for ${type}:`, err.message);
                    return [type, []];
                }
            })
        );

        const results = Object.fromEntries(ALL_TYPES.map((t) => [t, []]));
        for (const [type, data] of entries) results[type] = data;

        const totalCount = entries.reduce((sum, [, data]) => sum + data.length, 0);

        return res.status(200).json({
            query: rawQuery,
            term,
            mode,
            totalCount,
            results
        });
    } catch (error) {
        console.error('Global search error:', error);
        return res.status(500).json({ message: error.message });
    }
};

module.exports = { globalSearch };
