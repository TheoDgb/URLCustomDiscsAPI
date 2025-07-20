const { v4: uuidv4 } = require('uuid');

module.exports = function generateToken() {
    return uuidv4();
};