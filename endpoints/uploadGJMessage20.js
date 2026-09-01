const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/uploadGJMessage20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const toAccountID = parseInt(utils.number(req.body?.toAccountID), 10);
        const subject = utils.remove(req.body?.subject || '');
        const body = utils.remove(req.body?.body || '');

        // sanity checks
        if (!accountID || !gjp2 || !toAccountID || !subject || !body) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (accountID === toAccountID) return res.send('-1');
        if (!utils.isURLBase64(body) || !utils.isURLBase64(subject)) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        const senderProfile = db.prepare('SELECT userName FROM profiles WHERE accountID = ?').get(accountID);
        const recipientProfile = db.prepare('SELECT mS FROM profiles WHERE accountID = ?').get(toAccountID);
        const recipientAccount = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(toAccountID);

        if (!account || !senderProfile || !recipientAccount) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        try {
            const isBlocked = db.prepare('SELECT ID FROM blocks WHERE person1 = ? AND person2 = ?').get(toAccountID, accountID);
            if (isBlocked) return res.send('-1');

            if (recipientProfile && recipientProfile.mS === 2) {
                const areFriends = db.prepare('SELECT ID FROM friendships WHERE (person1 = ? AND person2 = ?) OR (person2 = ? AND person1 = ?)').get(accountID, toAccountID, accountID, toAccountID);
                if (!areFriends) return res.send('-1');
            } else if (recipientProfile && recipientProfile.mS > 0) {
                const areFriends = db.prepare('SELECT ID FROM friendships WHERE (person1 = ? AND person2 = ?) OR (person2 = ? AND person1 = ?)').get(accountID, toAccountID, accountID, toAccountID);
                if (!areFriends) return res.send('-1');
            }

            const uploadDate = Math.floor(Date.now() / 1000);
            const inf = db.prepare('INSERT INTO messages (subject, body, accID, userID, userName, toAccountID, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(subject, body, accountID, accountID + 1, senderProfile.userName, toAccountID, uploadDate);

            if (inf.changes > 0) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to upload message:\x1b[0m', err);
        }
        return res.send('-1');
    }
};
