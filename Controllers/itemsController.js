const Item = require('../Models/Items');

const addItem = async (req, res) => {
    try {
        const { name,price, options } = req.body;
        const item = new Item({ name,price, options });
        const savedItem = await item.save();
        res.status(200).json(savedItem);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const editItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { name,price, options } = req.body;
        const updatedItem = await Item.findByIdAndUpdate(
            itemId,
            { name,price, options },
            { new: true }
        );
        res.status(200).json(updatedItem);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAllItems = async (req, res) => {
    try {
        const items = await Item.find();
        res.status(200).json(items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        const deletedItem = await Item.findByIdAndRemove(itemId);
        res.status(200).json(deletedItem);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    addItem,
    editItem,
    getAllItems,
    deleteItem,
};
