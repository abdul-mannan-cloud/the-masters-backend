// models/Customer.js
const mongoose = require('mongoose');

const measurementFileSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    path: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    uploadDate: {
        type: Date,
        default: Date.now
    }
});

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
    email: {
        type: String
    },
    password: {
        type: String
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
    measurementFiles: {
        type: [measurementFileSchema],
        default: []
    },
    orders: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Orders'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Customer', customerSchema);