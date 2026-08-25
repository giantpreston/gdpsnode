const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const crypto = require('crypto');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/getGJMapPacks21.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        try {
            const page = parseInt(req.body?.page || 0, 10); // optional, so a or 0 here works;
            const pageSize = 10;
            const offset = page * pageSize;

            const countResult = db.prepare('SELECT COUNT(*) as total FROM mapPacks').get();
            const total = countResult.total;

            const packs = db.prepare('SELECT * FROM mapPacks LIMIT ? OFFSET ?').all(pageSize, offset);
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
            console.error('Error in getGJMapPacks21:', error);
            res.send('-1');
        }
    }
};