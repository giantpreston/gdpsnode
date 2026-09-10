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
            const accepted = db.transaction(() => {
                const request = db.prepare('SELECT accountID, toAccountID FROM friendreqs WHERE ID = ?').get(requestID);
                if (!request || request.toAccountID !== accountID || request.accountID === accountID) return false;

                const senderFriendCount = db.prepare('SELECT COUNT(*) as count FROM friendships WHERE person1 = ? OR person2 = ?').get(request.accountID, request.accountID).count;
                const recipientFriendCount = db.prepare('SELECT COUNT(*) as count FROM friendships WHERE person1 = ? OR person2 = ?').get(accountID, accountID).count;
                if (senderFriendCount >= MAX_FRIENDS || recipientFriendCount >= MAX_FRIENDS) return false;

                const existingFriendship = db.prepare('SELECT ID FROM friendships WHERE (person1 = ? AND person2 = ?) OR (person1 = ? AND person2 = ?)').get(request.accountID, accountID, accountID, request.accountID);
                if (!existingFriendship) db.prepare('INSERT INTO friendships (person1, person2, isNew1, isNew2) VALUES (?, ?, 1, 1)').run(request.accountID, accountID);
                const deleted = db.prepare('DELETE FROM friendreqs WHERE ID = ?').run(requestID);
                if (deleted.changes !== 1) throw new Error('Friend request was not consumed');
                return true;
            })();

            if (accepted) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to accept friend request:\x1b[0m', err);
        }
        return res.send('-1');
    }
};
