const crypto = require('crypto');

function generateGJP2(password = "", salt = "mI29fmAnxgTs") {
    const combined = password + salt;
    const hash = crypto.createHash('sha1').update(combined).digest('hex');
    return hash;
}

module.exports = { generateGJP2 };