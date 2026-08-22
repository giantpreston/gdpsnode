const { modSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/rateGJDemon21.php',
    middleware: [modSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        let rating = parseInt(utils.number(req.body?.rating), 10);
        const levelID = parseInt(utils.number(req.body?.levelID), 10);

        // sanity checks
        if (!accountID || !gjp2 || !rating || !levelID) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (rating < 1 || rating > 5) return res.send('-1'); // 1 easy demon; 2 medium demon; 3 hard demon; 4 insane demon; 5 extreme demon;

        // db checks
        // grab: accounts, profiles, levels tables
        // modify: levels table

        const check1 = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
        const check2 = db.prepare('SELECT * FROM profiles WHERE accountID = ?');
        const check3 = db.prepare('SELECT * FROM levels WHERE levelID = ?');
        const account = check1.get(accountID);
        const profile = check2.get(accountID);
        const level = check3.get(levelID);

        if (!account || !profile || !level) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (profile.modLevel === 0) return res.send('-2'); // not a mod
        if (profile.modLevel === 3) return res.send('-1'); // is a mod, but cant change ratings
        if (level.starDemon !== 1) return res.send('-1'); // level isn't demon

        const ratingMap = {
            1: 3,
            2: 4,
            3: 0,
            4: 5,
            5: 6
        };
        rating = ratingMap[rating];

        if (profile.modLevel === 1) {
            try {
                const action = db.prepare(
                    'INSERT INTO modSuggest (accountID, levelID, stars, demonDiff, feature) VALUES (?, ?, ?, ?, ?)'
                );
                const inf = action.run(accountID, levelID, 10, rating, 0);

                const action2 = db.prepare('UPDATE levels SET isSent = 1, lastSent = ? WHERE levelID = ?');
                const inf2 = action2.run(Math.floor(Date.now() / 1000), levelID);

                if (inf.changes > 0 && inf2.changes > 0) return res.send('1');
            } catch (err) {
                console.error('\x1b[1;31m✗ Failed to set demon rating (mod):', err);
                return res.send('-1');
            }

            return res.send('-1');
        }

        try {
            const action = db.prepare('UPDATE levels SET starDemonDiff = ? WHERE levelID = ?');
            const inf = action.run(rating, levelID);
            if (inf.changes > 0) return res.send(levelID);
            return res.send('-1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to set demon rating (mod):', err);
            return res.send('-1');
        }
    }
};

// i'm something of a programmer myself