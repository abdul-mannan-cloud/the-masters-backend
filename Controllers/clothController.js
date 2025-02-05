const mongoose = require('mongoose');
const Cloth = require('../Models/Cloth')
const cloudinary = require('cloudinary').v2;
const Customer = require('../Models/Customer')

const addCloth = async (req, res) => {
    try {
        const {coverImage, name, type, code, color, price, description, quantity, productType} = req.body;
        console.log("adding cloth", name, type, code, color, price, description, productType);
        if (!name || !type || !code || !color || !price || !description || !quantity || !productType) {
            return res.status(400).json({ error: 'Complete Information is required!' });
        }
        const result = await cloudinary.uploader.upload(req.file.path);
        const cloth = new Cloth({
            name: name,
            type: type,
            code: code,
            quantity: quantity,
            color: color,
            price: price,
            description: description,
            coverImage: result.secure_url,
            productType: productType,
        });

        console.log(cloth);
        await cloth.save();
        return res.status(201).json({
            message: 'Cloth Article Added Successfully',
            cloth: cloth,
        });
      } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  const deleteCloth = async (req, res) => {
    const id = req.params.id;
    try {
        const deletedCloth = await Cloth.findByIdAndDelete(id);
        if (!deletedCloth) {
            return res.status(404).json({ message: 'Cloth not found' });
        }
        res.status(200).json({
            message: 'Article deleted successfully',
            deletedCloth,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
  };
  
  const getAllCloths = async (req, res) => {
    try {
      const cloths = await Cloth.find(); 
      res.status(200).json({
        message: "Cloths retrieved successfully",
        cloths: cloths,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  const getAllCustomers = async (req, res) => {
    try {
      const customers = await Customer.find(); 
      res.status(200).json({
        message: "Cloths retrieved successfully",
        customer: customers,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  module.exports = {addCloth, deleteCloth, getAllCloths, getAllCustomers};