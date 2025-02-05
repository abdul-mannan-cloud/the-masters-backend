const jwt = require('jsonwebtoken');
const { default: mongoose } = require('mongoose');

const signIn = async (req, res) => {
    try {
        const userName = req.query.userName;
        const password = req.query.password;
        const admin_user = process.env.admin_username;
        const admin_password = process.env.admin_password;
        if (userName !== admin_user || password !== admin_password) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const token = jwt.sign({ user: { id: admin_user } }, process.env.secret_key, {
            expiresIn: '1h',
          });
        res.status(200).json({ 
          token,
         });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { signIn};