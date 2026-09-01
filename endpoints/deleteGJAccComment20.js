const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/deleteGJAccComment20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const targetAccountID = parseInt(utils.number(req.body?.targetAccountID), 10);
        const commentID = parseInt(utils.number(req.body?.commentID), 10);

        // sanity checks
        if (!accountID || !gjp2 || !targetAccountID || !commentID) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const profile = db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(accountID);
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        const comment = db.prepare('SELECT * FROM acccomments WHERE commentID = ?').get(commentID);

        if (!profile || !account || !comment) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');
        if (profile.modLevel !== 2 && targetAccountID !== accountID) return res.send('-1'); // elder mod acc comment deletion functionality
        if (profile.modLevel !== 2 && comment.accountID !== accountID) return res.send('-1');

        try {
            const inf = db.prepare('DELETE FROM acccomments WHERE commentID = ? AND accountID = ?').run(commentID, targetAccountID);
            if (inf.changes > 0) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to delete account comment:\x1b[0m', err);
        }
        return res.send('-1');
    }
};