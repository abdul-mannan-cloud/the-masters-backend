const express = require('express');
const router = express.Router();
const {signIn} = require('../Controllers/userController');

router.get('/login', signIn);



module.exports = router;
