const express = require("express");
const router = express.Router();
const { globalSearch } = require("../Controllersprev/searchController");

router.get("/", globalSearch);

module.exports = router;
