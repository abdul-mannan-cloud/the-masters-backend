const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    address: {
        type: String,
        required: true
    },
    measurements: {
        chest: Number,
        neck: Number,
        shoulders: Number,
        sleeves: Number,
        topLenght: Number,
        bottomLenght: Number,
        waist: Number
    },
    orders: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Customer', customerSchema);