const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const crypto = require('crypto');

module.exports = {
    method: 'post',
    path: '/getGJGauntlets21.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        try {
            const gauntlets = db.prepare(`SELECT ID, level1, level2, level3, level4, level5
                FROM gauntlets WHERE level5 != 0 ORDER BY ID ASC`).all();
            let hashInput = '';
            const gauntletString = gauntlets.map(gauntlet => {
                const levels = [1, 2, 3, 4, 5].map(number => gauntlet[`level${number}`]).join(',');
                hashInput += `${gauntlet.ID}${levels}`;
                return `1:${gauntlet.ID}:3:${levels}`;
            }).join('|');
            const hash = crypto.createHash('sha1').update(`${hashInput}xI25fpAapCQg`).digest('hex');
            res.send(`${gauntletString}#${hash}`);
        } catch (error) {
            console.error('Error in getGJGauntlets21:', error);
            res.send('-1');
        }
    }
};