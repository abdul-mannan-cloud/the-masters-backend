const express = require('express');
const router = express.Router();
const {getMeasurement,updateMeasurement} = require('../Controllers/measurementController');

router.get('/getmeasurement/:id', getMeasurement);
router.put('/updatemeasurement/:id', updateMeasurement)


module.exports = router;
