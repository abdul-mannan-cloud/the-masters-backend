const Employee = require('../Models/Employee');

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
        const employees = await Employee.find();
        res.status(200).json(employees);
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