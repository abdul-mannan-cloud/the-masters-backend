const express = require('express');
const router = express.Router();
const {addCustomer, getCustomer,updateCustomer,getAllCustomers,deleteCustomer, uploadMeasurementFiles,
    removeMeasurementFile
} = require('../Controllers/customerController');
const customerController = require('../Controllers/customerController');


router.post('/add', addCustomer);
router.get('/getallcustomers', getAllCustomers);
router.get('/get/:id', getCustomer);
router.put('/update/:id', updateCustomer);
router.delete('/delete/:id', deleteCustomer);

router.post(
    '/upload-measurement-files',
    customerController.upload.array('files', 5), // Limit to 5 files per upload
    uploadMeasurementFiles
);

router.delete(
    '/remove-measurement-file/:fileId',
    removeMeasurementFile
);

module.exports = router;
