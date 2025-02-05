const express = require('express');
const router = express.Router();
const {addCustomer, getCustomer,updateCustomer,getAllCustomers,deleteCustomer} = require('../Controllers/customerController');


router.post('/add', addCustomer);
router.get('/getallcustomers', getAllCustomers);
router.get('/:id', getCustomer);
router.put('/update/:id', updateCustomer);
router.delete('/delete/:id', deleteCustomer);

module.exports = router;


module.exports = router;
