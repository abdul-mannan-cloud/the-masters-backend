const express = require('express');
const router = express.Router();
const upload = require("../middlewares/multerMiddleware");
const { addCloth, deleteCloth, getAllCloths, getAllCustomers } = require("../Controllers/clothController");

router.post('/addcloth', upload.single('coverImage'), addCloth);
router.delete('/deletecloth/:id', deleteCloth);
router.get('/getallcloths', getAllCloths);
router.get('/getallcustomers', getAllCustomers);

module.exports = router;