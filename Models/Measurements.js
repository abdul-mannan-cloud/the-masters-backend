const mongoose = require('mongoose')

const measurementsSchema = mongoose.Schema({
    chest: {
        type: Number,
        require: true
    },
    shoulders: {
        type: Number,
        require: true
    },
    neck: {
        type: Number,
        require: true
    },
    sleeves: {
        type: Number,
        require: true
    },
    waist: {
        type: Number,
        require: true
    },
    topLength: {
        type: Number,
        require: true
    },
    bottomLength: {
        type: Number,
        require: true
    }
})

const Measurements = mongoose.model('Measurements', measurementsSchema);
module.exports = Measurements;