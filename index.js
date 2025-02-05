const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express()
const multer = require("multer");
const cors = require("cors");
const path = require("path");
app.use("/assets", express.static(path.join(__dirname, "public/assets")));
app.use(cors());
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())
app.use(express.json())
app.use(express.urlencoded({extended: true}))
app.use(bodyParser.json())


const dotenv = require("dotenv");

dotenv.config();

const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`App Listening at Port ${port}`)
})

const userRoutes = require('./Routes/User');
app.use('/admin', userRoutes);

const clothRoutes = require('./Routes/Cloths')
app.use('/cloth', clothRoutes)

const customerRoutes = require('./Routes/Customer');
app.use('/customer', customerRoutes)

const productRoutes = require('./Routes/Product');
app.use('/product', productRoutes)

const orderRoutes = require('./Routes/Order');
app.use('/order', orderRoutes)

const employeeRoutes = require('./Routes/Employee');
app.use('/employee', employeeRoutes)

const measurementRoutes = require('./Routes/Measurements');
app.use('/measurement', measurementRoutes)

const itemRoutes = require('./Routes/Items');
app.use('/items', itemRoutes)

const DB = process.env.DATABASE_URL

mongoose.connect(DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("Database connected"))
    .catch((error) => console.log(error.message));








