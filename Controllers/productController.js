const mongoose = require('mongoose');
const Product = require('../Models/Product')
const Measurements = require('../Models/Measurements')
const Employee = require('../Models/Employee')
const Cloth = require('../Models/Cloth')

const addProduct = async (req, res) => {
    try {
        const {selectedItem, product, measurements} = req.body;

        const cloth = await Cloth.findById(selectedItem._id);
        console.log(cloth);

        cloth.quantity = cloth.quantity - 5;

        if (cloth.quantity < 0) {
            return res.status(500).json({
                message: 'Insufficient cloth quantity available'
            });
        }

        const newMeasurements = new Measurements({
            chest: measurements.chest,
            shoulders: measurements.shoulders,
            neck: measurements.neck,
            sleeves: measurements.sleeves,
            waist: measurements.waist,
            topLength: measurements.topLenght,
            bottomLength: measurements.bottomLenght
        })

        const savedMeasurements = await newMeasurements.save();
        
        const totalPrice = selectedItem.price * 5;
        const newProduct = new Product ({
            type: product.type,
            measurements: savedMeasurements,
            cloth: selectedItem,
            collarType: product.collarType,
            press: product.press,
            price: totalPrice,
            instructions: product.instructions,
            bottoms: product.bottoms,  
        })

        await newProduct.save();
        await cloth.save();
        return res.status(201).json({
            message: 'Cloth Article Added Successfully',
            product: newProduct 
        });
      } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

const assignEmployees = async (req, res) => {
    try {
        const { employeeIds, productId } = req.body;

        // Validate inputs
        if (!employeeIds || !employeeIds.length || !productId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Find all employees
        const employees = await Promise.all(
            employeeIds.map(empId => Employee.findById(empId))
        );

        // Validate all employees exist
        if (employees.some(emp => !emp)) {
            return res.status(404).json({ error: 'One or more employees not found' });
        }

        // Find and update the product
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Update product
        product.assignedEmployees = employees;
        product.status = 'in progress';
        await product.save();

        // Update each employee
        await Promise.all(employees.map(async (emp) => {
            // Add product to employee's products array if not already there
            if (!emp.products.includes(productId)) {
                emp.products.push(product);
                emp.payment = emp.payment + 500; // Adding payment for each employee
                await emp.save();
            }
        }));

        // Fetch updated product with populated employee data
        const updatedProduct = await Product.findById(productId)
            .populate('assignedEmployees');

        res.status(200).json(updatedProduct);

    } catch (error) {
        console.error('Error in assignEmployees:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
};

  const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find();
        res.status(200).json(products)
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
  }

  module.exports = {addProduct, assignEmployees, getAllProducts};