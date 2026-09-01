const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/deleteGJFriendRequests20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const targetAccountID = parseInt(utils.number(req.body?.targetAccountID), 10);
        const isSender = parseInt(utils.number(req.body?.isSender), 10);

        // sanity checks
        if (!accountID || !gjp2 || !targetAccountID) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);

        if (!account) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        try {
            let inf;
            if (isSender === 1) { inf = db.prepare('DELETE FROM friendreqs WHERE accountID = ? AND toAccountID = ? LIMIT 1').run(accountID, targetAccountID); } else { inf = db.prepare('DELETE FROM friendreqs WHERE toAccountID = ? AND accountID = ? LIMIT 1').run(accountID, targetAccountID); }
            if (inf.changes > 0) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to delete friend request:\x1b[0m', err);
        }
        return res.send('-1');
    }
};
