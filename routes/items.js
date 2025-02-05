const express = require('express');
const router = express.Router();
const { addItem, getAllItems, deleteItem, editItem } = require('../Controllers/itemsController');

router.post('/additem', addItem);
router.get('/getallitems', getAllItems);
router.delete('/deleteitem/:itemId', deleteItem);
router.post('/edititem/:itemId', editItem);

module.exports = router;
