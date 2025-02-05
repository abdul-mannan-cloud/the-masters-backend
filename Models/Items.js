const mongoose = require('mongoose')

const itemsSchema = mongoose.Schema({
    name: {
        type: String,
        require: true,
    },
    price: {
        type: Number,
    },
    options: [
        {
            name: {
                type: String,
            },
            customizations: {
                type: [String],
            },
        },
    ],
})

const Item = mongoose.model('Items', itemsSchema);
module.exports = Item