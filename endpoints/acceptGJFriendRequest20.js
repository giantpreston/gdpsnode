const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

const MAX_FRIENDS = 400;

module.exports = {
    method: 'post',
    path: '/acceptGJFriendRequest20.php',
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
            const request = db.prepare('SELECT accountID, toAccountID FROM friendreqs WHERE ID = ?').get(requestID);
            if (!request) return res.send('-1');

            const reqAccountID = request.accountID;
            const toAccountID = request.toAccountID;

            if (toAccountID !== accountID || reqAccountID === accountID) return res.send('-1');

            const senderFriendCount = db.prepare('SELECT COUNT(*) as count FROM friendships WHERE person1 = ? OR person2 = ?').get(reqAccountID, reqAccountID).count;
            const recipientFriendCount = db.prepare('SELECT COUNT(*) as count FROM friendships WHERE person1 = ? OR person2 = ?').get(toAccountID, toAccountID).count;
            if (senderFriendCount >= MAX_FRIENDS || recipientFriendCount >= MAX_FRIENDS) return res.send('-1');

            const inf1 = db.prepare('INSERT INTO friendships (person1, person2, isNew1, isNew2) VALUES (?, ?, 1, 1)').run(reqAccountID, toAccountID);
            const inf2 = db.prepare('DELETE FROM friendreqs WHERE ID = ? LIMIT 1').run(requestID);

            if (inf1.changes > 0 && inf2.changes > 0) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to accept friend request:\x1b[0m', err);
        }
        return res.send('-1');
    }
};
