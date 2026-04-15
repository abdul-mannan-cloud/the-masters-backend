const express = require('express');
const router = express.Router();
const { globalSearch } = require('../Controllers/searchController');

router.get('/', globalSearch);

module.exports = router;
