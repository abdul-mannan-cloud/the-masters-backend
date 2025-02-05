const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  cnic: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  role:{
    type: String,
    required:true,
  },
  password:{
    type: String,
  },
  payment: {
    type: Number,
    default: 0
  },
  products: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], default: [] },
  lastPaid: {
    type: Date,
    default: null
  }
});

const Employee = mongoose.model('Employee', employeeSchema);
module.exports = Employee;
