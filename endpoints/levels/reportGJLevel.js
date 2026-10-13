const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

module.exports = {
    method: 'post',
    path: '/reportGJLevel.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const levelID = parseInt(utils.number(req.body?.levelID), 10);

        if (!levelID) return res.send('1'); // no idea why but yes, it does that

        const check = db.prepare('SELECT * FROM levels WHERE levelID = ?');
        const level = check.get(levelID);

        if (!level) return res.send('-1');
        const action = db.prepare('UPDATE levels SET levelReports = levelReports + 1 WHERE levelID = ?');
        const inf = action.run(levelID);
        if (inf.changes > 0) return res.send('1');
        return res.send('-1');
    }
};

// forgot to mention but there is no content increment handling here
// the client doesn't identify itself (accountID, gjp2, etc) when using this endpoint, so it is easily spoofable
// it's why this isn't a reliable measure to know if a level is rule-breaking or not.
// in 2.209, with the addition of reportGJContent in the future (to merge comment reporting and level reporting), hopefully the client will send its credentials then.
// until then, there isn't much to be done apart from IP checking/logging which is something i would rather not do.