const { modSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/suggestGJStars20.php',
    middleware: [modSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const levelID = parseInt(utils.number(req.body?.levelID), 10);
        const stars = parseInt(utils.number(req.body?.stars), 10);
        const feature = parseInt(utils.number(req.body?.feature), 10);

        // sanity checks
        if (!accountID || !gjp2 || !levelID || !stars) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (stars < 1 || stars > 10) return res.send('-1');
        if (feature < 0 || feature > 4) return res.send('-1');

        // db checks
        const check = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
        const account = check.get(accountID);
        const check2 = db.prepare('SELECT * FROM profiles WHERE accountID = ?');
        const profile = check2.get(accountID);
        const check3 = db.prepare('SELECT * FROM levels WHERE levelID = ?');
        const level = check3.get(levelID);

        if (!account || !profile || !level) return res.send('-1');
        if (gjp2 !== account.gjp2) return res.send('-1');
        if (profile.modLevel === 0) return res.send('-2'); // not a mod
        if (profile.modLevel === 3) return res.send('-1'); // lb mods cant send levels

        try {
            if (profile.modLevel === 1) {
                const action = db.prepare('INSERT INTO modsuggest (accountID, levelID, stars, feature) VALUES (?, ?, ?, ?)');
                const inf = action.run(accountID, levelID, stars, feature);                
                
                const action2 = db.prepare('UPDATE levels SET isSent = 1, lastSent = ? WHERE levelID = ?');
                const inf2 = action2.run(Math.floor(Date.now() / 1000), levelID);
                
                if (inf.changes > 0 && inf2.changes > 0) return res.send('1');
            } else {
                let updates = [];
                let params = [];
                
                updates.push('starStars = ?');
                params.push(stars);
                
                if (stars === 1) {
                    updates.push('starAuto = 1');
                    updates.push('starDifficulty = 1');
                    updates.push('starDemon = 0');
                } else if (stars === 2) {
                    updates.push('starAuto = 0');
                    updates.push('starDemon = 0');
                    updates.push('starDifficulty = 1');
                } else if (stars === 3) {
                    updates.push('starAuto = 0');
                    updates.push('starDemon = 0');
                    updates.push('starDifficulty = 2');
                } else if (stars >= 4 && stars <= 5) {
                    updates.push('starAuto = 0');
                    updates.push('starDemon = 0');
                    updates.push('starDifficulty = 3');
                } else if (stars >= 6 && stars <= 7) {
                    updates.push('starAuto = 0');
                    updates.push('starDemon = 0');
                    updates.push('starDifficulty = 4');
                } else if (stars >= 8 && stars <= 9) {
                    updates.push('starAuto = 0');
                    updates.push('starDemon = 0');
                    updates.push('starDifficulty = 5');
                } else if (stars === 10) {
                    updates.push('starAuto = 0');
                    updates.push('starDifficulty = 5');
                    updates.push('starDemon = 1');
                }
        
                if (feature === 1) {
                    updates.push('featured = 1');
                    updates.push('starEpic = 0');
                } else if (feature === 2) {
                    updates.push('featured = 1');
                    updates.push('starEpic = 1');
                } else if (feature === 3) {
                    updates.push('featured = 1');
                    updates.push('starEpic = 2');
                } else if (feature === 4) {
                    updates.push('featured = 1');
                    updates.push('starEpic = 3');
                }
                
                params.push(levelID); // for WHERE clause
                
                const query = `UPDATE levels SET ${updates.join(', ')} WHERE levelID = ?`;
                const action = db.prepare(query);
                const inf = action.run(...params);

                // clean up any old records sent by mods since the level is now rated and no longer pending a rating
                const action2 = db.prepare('UPDATE levels SET isSent = 0, lastSent = 0 WHERE levelID = ?');
                action2.run(levelID);
                const action3 = db.prepare('DELETE FROM modsuggest WHERE levelID = ?');
                action3.run(levelID);
                
                if (inf.changes > 0) return res.send('1');
            }
            return res.send('-1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to set level suggestion (mod):\x1b[0m', err);
            return res.send('-1');
        }
    }
};

// why did i decide that doing 4 endpoints in one day was a good idea...