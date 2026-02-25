const Customer = require('../Models/Customer');
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizePhoneQuery = (value = '') => String(value).trim().replace(/[\s()-]/g, '');
const toSafeString = (value = '') => String(value ?? '').trim();

const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Configure multer for file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../uploads/measurements');

        // Create directory if it doesn't exist
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'measurement-' + uniqueSuffix + ext);
    }
});

// File filter to allow only images and PDFs
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPG, PNG and PDF are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

const addCustomer = async (req, res) => {
    try {
        const { customer } = req.body;
        const incomingOrderNumber = String(customer.orderNumber || '').trim();

        if (incomingOrderNumber) {
            const existingWithSameOrder = await Customer.findOne({ orderNumber: incomingOrderNumber }).lean();
            if (existingWithSameOrder) {
                return res.status(409).json({
                    message: `Order number ${incomingOrderNumber} already exists`
                });
            }
        }

        const newCustomer = new Customer({
            orderNumber: incomingOrderNumber || undefined,
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            email: customer.email,
            password: customer.password,
        });

        const savedCustomer = await newCustomer.save();
        res.status(200).json(savedCustomer);
    } catch (error) {
        if (error && error.code === 11000 && error.keyPattern && error.keyPattern.orderNumber) {
            return res.status(409).json({ message: 'Order number already exists' });
        }
        res.status(500).json({ message: error.message });
    }
};

const getAllCustomers = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
        const query = toSafeString(req.query.query);
        const name = toSafeString(req.query.name);
        const orderNumber = toSafeString(req.query.orderNumber);
        const phone = toSafeString(req.query.phone);
        const address = toSafeString(req.query.address);
        const email = toSafeString(req.query.email);
        const searchBy = toSafeString(req.query.searchBy).toLowerCase();
        const search = toSafeString(req.query.search);

        let filter = {};
        const reservedParams = new Set(['page', 'limit', 'query', 'searchBy', 'search']);
        const hasSpecificFieldInQuery = Object.keys(req.query || {}).some((key) => {
            if (reservedParams.has(key)) return false;
            return toSafeString(req.query[key]) !== '';
        });
        const hasSpecificFilters = hasSpecificFieldInQuery || name || orderNumber || phone || address || email || (searchBy && search);

        // Specific field search takes priority over generic query search.
        if (hasSpecificFilters) {
            const andFilters = [];

            if (searchBy && search) {
                if (searchBy === 'name') andFilters.push({ name: new RegExp(escapeRegex(search), 'i') });
                if (searchBy === 'ordernumber') andFilters.push({ orderNumber: search });
                if (searchBy === 'phone') andFilters.push({ phone: normalizePhoneQuery(search) });
                if (searchBy === 'address') andFilters.push({ address: new RegExp(escapeRegex(search), 'i') });
                if (searchBy === 'email') andFilters.push({ email: new RegExp(escapeRegex(search), 'i') });
            }

            if (name) andFilters.push({ name: new RegExp(escapeRegex(name), 'i') });
            if (orderNumber) andFilters.push({ orderNumber });
            if (phone) andFilters.push({ phone: normalizePhoneQuery(phone) });
            if (address) andFilters.push({ address: new RegExp(escapeRegex(address), 'i') });
            if (email) andFilters.push({ email: new RegExp(escapeRegex(email), 'i') });

            filter = andFilters.length > 1 ? { $and: andFilters } : andFilters[0] || {};
        } else if (query) {
            const searchRegex = new RegExp(escapeRegex(query), 'i');
            filter.$or = [
                { orderNumber: searchRegex },
                { name: searchRegex },
                { phone: searchRegex },
                { address: searchRegex },
                { email: searchRegex }
            ];
        }

        const skip = (page - 1) * limit;
        const totalPromise = Customer.countDocuments(filter);
        let customersPromise;

        if (query && !hasSpecificFilters) {
            customersPromise = Customer.aggregate([
                { $match: filter },
                {
                    $addFields: {
                        orderNumberMatchPriority: {
                            $cond: [{ $eq: ['$orderNumber', query] }, 0, 1]
                        }
                    }
                },
                { $sort: { orderNumberMatchPriority: 1, createdAt: -1 } },
                { $skip: skip },
                { $limit: limit },
                { $project: { orderNumberMatchPriority: 0 } }
            ]);
        } else {
            customersPromise = Customer.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
        }

        const [customers, total] = await Promise.all([customersPromise, totalPromise]);

        const totalPages = Math.ceil(total / limit) || 1;
        res.status(200).json({
            customer: customers,
            data: customers,
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
        res.status(500).json({ message: error.message });
    }
};

const getCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }
        res.status(200).json(customer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getNextOrderNumber = async (req, res) => {
    try {
        const latestOrder = await Customer.aggregate([
            {
                $match: {
                    orderNumber: { $type: 'string', $regex: '^[0-9]+$' }
                }
            },
            {
                $addFields: {
                    orderNumberNumeric: { $toLong: '$orderNumber' }
                }
            },
            { $sort: { orderNumberNumeric: -1 } },
            { $limit: 1 }
        ]);

        const largestOrderNumber = latestOrder.length > 0 ? latestOrder[0].orderNumberNumeric : 0;
        const nextOrderNumber = String(largestOrderNumber + 1);

        return res.status(200).json({
            largestOrderNumber: String(largestOrderNumber),
            nextOrderNumber
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body.measurements ?
            { measurements: req.body.measurements } :
            req.body;

        const customer = await Customer.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        res.status(200).json({
            message: "Customer updated successfully",
            customer
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

const deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await Customer.findByIdAndDelete(id);
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }
        res.status(200).json({
            message: "Customer deleted successfully",
            customer
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// New function to handle file uploads
const uploadMeasurementFiles = async (req, res) => {
    try {
        const customerId = req.body.customerId;

        if (!customerId) {
            return res.status(400).json({ success: false, message: 'Customer ID is required' });
        }

        const customer = await Customer.findById(customerId);

        if (!customer) {
            // Clean up uploaded files if customer doesn't exist
            req.files.forEach(file => {
                fs.unlinkSync(file.path);
            });

            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        // Process uploaded files
        const fileData = req.files.map(file => {
            const baseUrl = process.env.NODE_ENV === 'production'
                ? process.env.BACKEND_URL || ''
                : '';

            const fileUrl = `${baseUrl}/uploads/measurements/${file.filename}`;

            return {
                id: file.filename,
                name: file.originalname,
                path: file.path,
                url: fileUrl,
                mimeType: file.mimetype,
                size: file.size,
                uploadDate: new Date()
            };
        });

        // Save file information to customer document
        if (!customer.measurementFiles) {
            customer.measurementFiles = [];
        }

        customer.measurementFiles.push(...fileData);
        await customer.save();

        // Here you could add OCR processing for measurements extraction
        // const extractedMeasurements = await processOCR(fileData);

        return res.status(200).json({
            success: true,
            message: 'Files uploaded successfully',
            files: fileData
            // Include extracted measurements if you implement OCR
            // extractedMeasurements: extractedMeasurements
        });
    } catch (error) {
        console.error('File upload error:', error);
        return res.status(500).json({ success: false, message: 'Error uploading files' });
    }
};

// Function to remove measurement file
const removeMeasurementFile = async (req, res) => {
    try {
        const fileId = req.params.fileId;

        // Find customer with this file
        const customer = await Customer.findOne({ 'measurementFiles.id': fileId });

        if (!customer) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        // Get file info before removing from database
        const fileInfo = customer.measurementFiles.find(file => file.id === fileId);

        if (!fileInfo) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        // Remove from filesystem
        try {
            if (fs.existsSync(fileInfo.path)) {
                fs.unlinkSync(fileInfo.path);
            }
        } catch (err) {
            console.error('Error deleting file from filesystem:', err);
            // Continue execution even if file delete fails
        }

        // Remove from customer document
        customer.measurementFiles = customer.measurementFiles.filter(file => file.id !== fileId);
        await customer.save();

        return res.status(200).json({ success: true, message: 'File removed successfully' });
    } catch (error) {
        console.error('File removal error:', error);
        return res.status(500).json({ success: false, message: 'Error removing file' });
    }
};

module.exports = {
    addCustomer,
    getAllCustomers,
    getCustomer,
    getNextOrderNumber,
    updateCustomer,
    deleteCustomer,
    uploadMeasurementFiles,
    removeMeasurementFile,
    upload
};
