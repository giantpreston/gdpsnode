const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

// unfortunately, it seems GMDPrivateServer doesn't implement this at all!
// all the code does is return a placebo "1" response, with absolutely no storage or handling of user rates
// unless you're a mod, to which it just rates the level. but this is a user rate endpoint, so.. yeah!
// making this superior to GMDPrivateServer was not expected, but i guess here it is:

module.exports = {
    method: 'post',
    path: '/rateGJStars211.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const levelID = parseInt(utils.number(req.body?.levelID), 10);
        const stars = parseInt(utils.number(req.body?.stars), 10);
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);

        // sanity checks
        if (!levelID || !stars || !accountID || !gjp2) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (stars < 1 || stars > 10) return res.send('-1');

        // db checks
        const check = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
        const check2 = db.prepare('SELECT * FROM levels WHERE levelID = ?');
        const account = check.get(accountID);
        const level = check2.get(levelID);

        if (!level || !account) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        db.prepare(`
            INSERT INTO level_ratings (levelID, accountID, stars)
            VALUES (?, ?, ?)
            ON CONFLICT(levelID, accountID) DO UPDATE SET stars = excluded.stars
        `).run(levelID, accountID, stars);

        const allRatings = db.prepare('SELECT stars FROM level_ratings WHERE levelID = ?').all(levelID).map(r => r.stars);
        const userRates = allRatings.length;

        const totalSum = allRatings.reduce((acc, curr) => acc + curr, 0);
        const avgUserRate = Math.round(totalSum / userRates);

        const filtered = allRatings.filter(s => s > 1 && s < 10);

        let noMinMaxAvgUserRate = 0;
        let noMinMaxMinUserRate = 0;
        let noMinMaxMaxUserRate = 0;

        if (filtered.length > 0) {
            const filteredSum = filtered.reduce((acc, curr) => acc + curr, 0);
            noMinMaxAvgUserRate = Math.round(filteredSum / filtered.length);
            noMinMaxMinUserRate = Math.min(...filtered);
            noMinMaxMaxUserRate = Math.max(...filtered);
        }

        db.prepare(`
            UPDATE levels SET
                userRates = ?,
                avgUserRate = ?,
                noMinMaxAvgUserRate = ?,
                noMinMaxMinUserRate = ?,
                noMinMaxMaxUserRate = ?
            WHERE levelID = ?
        `).run(
            userRates,
            avgUserRate,
            noMinMaxAvgUserRate,
            noMinMaxMinUserRate,
            noMinMaxMaxUserRate,
            levelID
        );

        return res.send('1');
    }
};

// pov: when you escape math to go to cs and have to do this bullshit 😭😭😭 son