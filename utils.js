const crypto = require('crypto');

function generateGJP2(password = "", salt = "mI29fmAnxgTs") {
    const combined = password + salt;
    const hash = crypto.createHash('sha1').update(combined).digest('hex');
    return hash;
}
function isURLBase64(str) {
    if (typeof str !== 'string') return false;
    if (str === '') return false;

    let converted = str.replace(/-/g, '+').replace(/_/g, '/');
    while (converted.length % 4) {
        converted += '=';
    }

    try {
        const decoded = Buffer.from(converted, 'base64');
        return Buffer.from(decoded).toString('base64') === converted;
    } catch {
        return false;
    }
}

module.exports = { generateGJP2, isURLBase64 };