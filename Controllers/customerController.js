const Customer = require('../Models/Customer');
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
        const newCustomer = new Customer({
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            email: customer.email,
            password: customer.password,
        });

        const savedCustomer = await newCustomer.save();
        res.status(200).json(savedCustomer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAllCustomers = async (req, res) => {
    try {
        const customers = await Customer.find()
            .sort({ createdAt: -1 }); // Most recent first
        res.status(200).json({ customer: customers });
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
    updateCustomer,
    deleteCustomer,
    uploadMeasurementFiles,
    removeMeasurementFile,
    upload
};