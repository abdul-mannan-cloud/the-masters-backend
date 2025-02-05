const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    type: {
      type: String,
      required: true
    },
    measurements: {
      type: mongoose.Schema.Types.ObjectId, ref: 'Measurements',
    },
    // cloth: {
    //   type: mongoose.Schema.Types.ObjectId, ref: 'Cloth',
    // },
    // cutter: {
    //   type: mongoose.Schema.Types.ObjectId, ref: 'Employee',
    //   default: null
    // },
    // tailor: {
    //   type: mongoose.Schema.Types.ObjectId, ref: 'Employee',
    //   default: null
    // },
    employees: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
      default: []
    },
    price: {
      type: Number,
      required: true
    },
    instructions: {
      type: String,
    },
    date: {
      type: Date,
      default: Date.now(),
    },
    status: {
        type: String,
        enum: ['pending', 'in progress', 'completed', 'shipped'],
        default: 'pending'
    },
    options: [
        {
            name: {
                type: String,
            },
            customization: {
                type:String,
            },
        },
    ],
    assignedEmployees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    }],

});

module.exports = mongoose.model('Product', ProductSchema);