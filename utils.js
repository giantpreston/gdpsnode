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

function remove(str) {
    if (typeof str !== 'string') return '';
    // basic htmlspecialchars equivalent
    let esc = str.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .trim();

    // replace blocked delimiter characters with a space, but keep surrounding content
    // blocked: :, |, ~, #, null, )
    esc = esc.replace(/\0/g, '');
    esc = esc.replace(/[:|~#)]+/g, ' ');

    // collapse multiple spaces and trim
    esc = esc.replace(/\s+/g, ' ').trim();
    return esc;
}

function charclean(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^A-Za-z0-9 ]/g, '');
}

function numbercolon(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^0-9,\-]/g, '');
}

function number(str) {
    if (typeof str !== 'string' && typeof str !== 'number') return '';
    return String(str).replace(/[^0-9]/g, '');
}

module.exports = { generateGJP2, isURLBase64, remove, charclean, numbercolon, number };