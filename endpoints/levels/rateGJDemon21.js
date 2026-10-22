const { modSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

module.exports = {
    method: 'post',
    path: '/rateGJDemon21.php',
    middleware: [modSecret],
    handler: (req, res) => {
        // THIS IS NOW A USER ENDPOINT!!

        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const rating = parseInt(utils.number(req.body?.rating), 10);
        const mode = req.body?.mode === undefined ? 0 : parseInt(utils.number(req.body.mode), 10);
        const levelID = parseInt(utils.number(req.body?.levelID), 10);

        // sanity checks
        if (!accountID || !gjp2 || !levelID || Number.isNaN(rating) || Number.isNaN(mode)) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (rating < 1 || rating > 5 || ![0, 1].includes(mode)) return res.send('-1');

        const account = db.prepare('SELECT gjp2, isDisabled FROM accounts WHERE accountID = ?').get(accountID);
        const level = db.prepare('SELECT starDemon FROM levels WHERE levelID = ?').get(levelID);

        if (!account || !level) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');
        if (level.starDemon !== 1) return res.send('-1'); // level isn't demon

        const ratingMap = {
            1: 3,
            2: 4,
            3: 0,
            4: 5,
            5: 6
        };

        try {
            const accepted = db.transaction(() => {
                const existingIncrement = db.prepare(`SELECT 1 FROM content_increments
                    WHERE accountID = ? AND contentID = ? AND contentType = ?`)
                    .get(accountID, levelID, 'demon_rating');
                if (existingIncrement) return true;

                const existingVote = db.prepare(`SELECT 1 FROM level_demon_ratings
                    WHERE levelID = ? AND accountID = ?`).get(levelID, accountID);
                if (existingVote) {
                    db.prepare(`INSERT OR IGNORE INTO content_increments (accountID, contentID, contentType)
                        VALUES (?, ?, ?)`).run(accountID, levelID, 'demon_rating');
                    return true;
                }

                const vote = db.prepare(`INSERT INTO level_demon_ratings (levelID, accountID, demonDiff, mode)
                    VALUES (?, ?, ?, ?) ON CONFLICT(levelID, accountID) DO NOTHING`)
                    .run(levelID, accountID, ratingMap[rating], mode);
                if (vote.changes === 0) return false;
                db.prepare(`INSERT INTO content_increments (accountID, contentID, contentType)
                    VALUES (?, ?, ?)`).run(accountID, levelID, 'demon_rating');
                return true;
            })();
            return res.send(accepted ? '1' : '-1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to save demon vote:\x1b[0m', err);
            return res.send('-1');
        }
    }
};

// i'm something of a programmer myself