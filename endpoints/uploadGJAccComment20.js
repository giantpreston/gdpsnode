const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/uploadGJAccComment20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const comment = utils.remove(req.body?.comment);

        // sanity checks
        if (!accountID || !gjp2 || !comment) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (comment.length > 190) return res.send('-1');
        if (!utils.isURLBase64(comment)) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);

        if (!account) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');
        if (account.permaCommentBan === 1) return res.send('-10');
        if (account.commentBan !== 0) {
            const timeLeft = account.commentBan - Math.floor(Date.now() / 1000);
            if (timeLeft > 0 && account.commentBanReason) return res.send(`temp_${timeLeft}_${account.commentBanReason}`);
            if (timeLeft > 0 && !account.commentBanReason) return res.send(`temp_${timeLeft}`);
        }

        try {
            const inf = db.prepare('INSERT INTO acccomments (accountID, userName, comment, timestamp) VALUES (?, ?, ?, ?)').run(accountID, account.userName, comment, Math.floor(Date.now() / 1000));
            if (inf.changes > 0) return res.send(String(inf.lastInsertRowid));
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to save account comment:\x1b[0m', err);
        }
        return res.send('-1');
    }
};