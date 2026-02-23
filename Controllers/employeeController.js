const Employee = require('../Models/Employee');
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addEmployee = async (req, res) => {
    try {
        const { name, cnic, phone, password, role} = req.body;
        const employee = new Employee({ name, cnic, phone, password, role:role });
        const savedEmployee = await employee.save();
        res.status(200).json(savedEmployee);
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: error.message });
    }
};

const editEmployee = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { name, cnic, phone, password,role } = req.body;
        const updatedEmployee = await Employee.findByIdAndUpdate(
            employeeId,
            { name, cnic, phone, password ,role},
            { new: true } 
        );
        res.status(200).json(updatedEmployee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAllEmployees = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
        const query = (req.query.query || '').trim();

        const filter = {};
        if (query) {
            const searchRegex = new RegExp(escapeRegex(query), 'i');
            filter.$or = [
                { name: searchRegex },
                { phone: searchRegex },
                { cnic: searchRegex },
                { role: searchRegex }
            ];
        }

        const skip = (page - 1) * limit;
        const [employees, total] = await Promise.all([
            Employee.find(filter)
                .sort({ _id: -1 })
                .skip(skip)
                .limit(limit),
            Employee.countDocuments(filter)
        ]);

        const totalPages = Math.ceil(total / limit) || 1;
        res.status(200).json({
            employees,
            data: employees,
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

const deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedEmployee = await Employee.findByIdAndRemove(id);
        res.status(200).json(deletedEmployee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getEmployee = async (req, res) => {
    try {
        console.log(req.params, 'hello emolplpre');
        const { employeeId } = req.params;
        const employee = await Employee.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        res.status(200).json(employee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const makePayment = async (req, res) => {
    try {
        console.log(req.params, 'hello emolplpre');
        const { employeeId } = req.params;
        const { payment } = req.body;
        const employee = await Employee.findById(employeeId);
        employee.payment = employee.payment - payment;
        const lastPaid = Date.now();
        employee.lastPaid = lastPaid;
        employee.save()
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        res.status(200).json(employee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {addEmployee, editEmployee, getAllEmployees, deleteEmployee, getEmployee, makePayment};
