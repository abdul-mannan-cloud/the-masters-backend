const Customer = require('../Models/Customer');

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
        res.status(200).json({ customers });
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

module.exports = {
    addCustomer,
    getAllCustomers,
    getCustomer,
    updateCustomer,
    deleteCustomer
};