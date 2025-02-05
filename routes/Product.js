const express = require('express');
const router = express.Router();
const { addProduct, assignEmployees, getAllProducts } = require("../Controllers/productController");

router.post('/addproduct', addProduct);
router.post('/assignemployees', assignEmployees);
router.get('/getallproducts', getAllProducts);

module.exports = router;