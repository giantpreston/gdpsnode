const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const crypto = require('crypto');

function isValidMapPack(pack) {
    const levels = typeof pack.levels === 'string' && /^\d+(,\d+)*$/.test(pack.levels);
    const color = value => typeof value === 'string' && /^\d+,\d+,\d+$/.test(value) && value.split(',').every(channel => Number(channel) >= 0 && Number(channel) <= 255);
    return levels && color(pack.barColor) && color(pack.textColor);
}

module.exports = {
    method: 'post',
    path: '/getGJMapPacks21.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        try {
            const page = Math.max(parseInt(req.body?.page || 0, 10) || 0, 0);
            const pageSize = 10;
            const offset = page * pageSize;

            const packs = db.prepare('SELECT * FROM mapPacks ORDER BY packID').all().filter(isValidMapPack).slice(offset, offset + pageSize);
            const total = db.prepare('SELECT * FROM mapPacks').all().filter(isValidMapPack).length;
            let hashSegments = '';
            const packStrings = packs.map(pack => {
                const packID = String(pack.packID);
                const firstDigit = packID[0];
                const lastDigit = packID[packID.length - 1];
                
                hashSegments += `${firstDigit}${lastDigit}${pack.stars}${pack.coins}`;
                return `1:${pack.packID}:2:${pack.packName}:3:${pack.levels}:4:${pack.stars}:5:${pack.coins}:6:${pack.difficulty}:7:${pack.barColor}:8:${pack.textColor}`;
            });

            const packsString = packStrings.join('|');
            const pageInfo = `${total}:${offset}:${pageSize}`;
            
            const responseHash = crypto.createHash('sha1').update(hashSegments + 'xI25fpAapCQg').digest('hex');
            const response = `${packsString}#${pageInfo}#${responseHash}`;
            res.send(response);
        } catch (error) {
            console.error('\x1b[1;31m✗ Error in getGJMapPacks21:\x1b[0m', error);
            res.send('-1');
        }
    }
};