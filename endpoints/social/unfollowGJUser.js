const { commonSecret } = require('../../middleware/secrets');
const utils = require('../../utils');
const db = require('../../database');

module.exports = {
    method: 'post',
    path: '/unfollowGJUser.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const targetAccountID = parseInt(utils.number(req.body?.targetAccountID), 10);
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);

        // sanity checks
        if (!targetAccountID || !accountID || !gjp2) return res.send('-1');
        if (targetAccountID === accountID) return res.send('-1'); // thats.. not how it works buddy..
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const check = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        const check2 = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(targetAccountID);

        if (!check || !check2) return res.send('-1'); // one of the two accounts don't exist
        if (check.gjp2 !== gjp2) return res.send('-1'); // auth failure
        if (check.isDisabled === 1 || check2.isDisabled === 1) return res.send('-1'); // disabled!

        // set logic!!!
        const inf = db.prepare('DELETE FROM follows WHERE person1 = ? AND person2 = ?').run(accountID, targetAccountID);
        if (inf.changes > 0) return res.send('1');

        return res.send('-1'); // fallback value if for whatever reason we reach this line
    }
};