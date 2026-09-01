const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/readGJFriendRequest20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const requestID = parseInt(utils.number(req.body?.requestID), 10);

        // sanity checks
        if (!accountID || !gjp2 || !requestID) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);

        if (!account) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        try {
            db.prepare('UPDATE friendreqs SET isNew = 0 WHERE ID = ? AND toAccountID = ?').run(requestID, accountID);
            return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to mark friend request as read:\x1b[0m', err);
            return res.send('-1');
        }
    }
};
