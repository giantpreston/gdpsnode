const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/unblockGJUser20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const targetAccountID = parseInt(utils.number(req.body?.targetAccountID), 10);

        // sanity checks
        if (!accountID || !gjp2 || !targetAccountID) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        const targetAccount = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(targetAccountID);

        if (!account || !targetAccount) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        try {
            db.prepare('DELETE FROM blocks WHERE person1 = ? AND person2 = ?').run(accountID, targetAccountID);
            return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to unblock user:\x1b[0m', err);
            return res.send('-1');
        }
    }
};
