const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

const MAX_FRIENDS = 400;

module.exports = {
    method: 'post',
    path: '/uploadFriendRequest20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const toAccountID = parseInt(utils.number(req.body?.toAccountID), 10);
        const comment = utils.remove(req.body?.comment || '');

        // sanity checks
        if (!accountID || !gjp2 || !toAccountID) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (accountID === toAccountID) return res.send('-1');
        if (!utils.isURLBase64(comment)) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        const toAccount = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(toAccountID);
        const profile = db.prepare('SELECT frS FROM profiles WHERE accountID = ?').get(toAccountID);

        if (!account || !toAccount) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        // check if blocked
        const isBlocked = db.prepare('SELECT ID FROM blocks WHERE person1 = ? AND person2 = ?').get(toAccountID, accountID);
        if (isBlocked) return res.send('-1');

        // check if friend requests only
        if (profile && profile.frS === 1) return res.send('-1');

        // check if request already exists
        const existingRequest = db.prepare('SELECT COUNT(*) as count FROM friendreqs WHERE (accountID = ? AND toAccountID = ?) OR (toAccountID = ? AND accountID = ?)').get(accountID, toAccountID, accountID, toAccountID);
        if (existingRequest.count > 0) return res.send('-1');

        // enforce max friend cap before creating a request
        const senderFriendCount = db.prepare('SELECT COUNT(*) as count FROM friendships WHERE person1 = ? OR person2 = ?').get(accountID, accountID).count;
        const targetFriendCount = db.prepare('SELECT COUNT(*) as count FROM friendships WHERE person1 = ? OR person2 = ?').get(toAccountID, toAccountID).count;
        if (senderFriendCount >= MAX_FRIENDS || targetFriendCount >= MAX_FRIENDS) return res.send('-1');

        try {
            const uploadDate = Math.floor(Date.now() / 1000);
            db.prepare('INSERT INTO friendreqs (accountID, toAccountID, comment, uploadDate) VALUES (?, ?, ?, ?)').run(accountID, toAccountID, comment, uploadDate);
            return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to upload friend request:\x1b[0m', err);
            return res.send('-1');
        }
    }
};
