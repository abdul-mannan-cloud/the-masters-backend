const mongoose = require('mongoose')

const clothSchema = mongoose.Schema({
    name: {
        type: String,
        require: true,
    },
    type: {
        type: String,
        require: true,
    },
    code: {
        type: String,
        require: true,
    },
    quantity: {
        type: Number,
        require: true
    },
    color: {
        type: String,
        require: true,
    },
    price: {
        type: Number,
        require: true,
    },
    description: {
        type: String,
        require: true
    },
    coverImage: {
        type: String,
        require: true
    },
    date: {
        type: Date,
        default: Date.now()
    },
    productType: {
        type: String,
        require: true
    }
})

const Cloth = mongoose.model('Cloths', clothSchema);
module.exports = Cloth