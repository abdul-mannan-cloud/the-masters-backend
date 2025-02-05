const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    products: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product'
        }],
        default: []
    },
    date: {
        type: Date,
        default: Date.now
    },
    total: {
        type: Number,
        required: true,
        default: 0
    },
    status: {
        type: String,
        enum: ['pending', 'in progress', 'completed', 'shipped'],
        default: 'pending'
    },
    paid: {
        type: Boolean,
        default: false
    },
    notes: {
        type: String
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Pre-save middleware to update lastUpdated
orderSchema.pre('save', function(next) {
    this.lastUpdated = new Date();
    next();
});

const Order = mongoose.model('Orders', orderSchema);
module.exports = Order;