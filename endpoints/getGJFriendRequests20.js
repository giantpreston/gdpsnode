const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/getGJFriendRequests20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const page = parseInt(utils.number(req.body?.page), 10);
        let getSent = parseInt(utils.number(req.body?.getSent), 10);

        // sanity checks
        if (!getSent) getSent = 0;

        if (!accountID || !gjp2 || isNaN(page)) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (getSent !== 0 && getSent !== 1) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);

        if (!account) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');

        const offset = page * 10;
        let requests;
        let countResult;

        try {
            if (getSent === 0) {
                requests = db.prepare('SELECT accountID, toAccountID, uploadDate, ID, comment, isNew FROM friendreqs WHERE toAccountID = ? LIMIT 10 OFFSET ?').all(accountID, offset);
                countResult = db.prepare('SELECT COUNT(*) as count FROM friendreqs WHERE toAccountID = ?').get(accountID);
            } else if (getSent === 1) {
                requests = db.prepare('SELECT accountID, toAccountID, uploadDate, ID, comment, isNew FROM friendreqs WHERE accountID = ? LIMIT 10 OFFSET ?').all(accountID, offset);
                countResult = db.prepare('SELECT COUNT(*) as count FROM friendreqs WHERE accountID = ?').get(accountID);
            }

            if (countResult.count === 0) return res.send('-2');

            let reqstring = '';
            for (const request of requests) {
                const requesterID = getSent === 0 ? request.accountID : request.toAccountID;
                const profile = db.prepare('SELECT userName, accountID, icon, color1, color2, iconType, special FROM profiles WHERE accountID = ?').get(requesterID);

                if (profile) {
                    reqstring += `1:${profile.userName}:2:${profile.accountID + 1}:9:${profile.icon}:10:${profile.color1}:11:${profile.color2}:14:${profile.iconType}:15:${profile.special}:16:${profile.accountID}:32:${request.ID}:35:${request.comment}:41:${request.isNew}:37:${utils.getRelative(request.uploadDate)}|`;
                }
            }

            if (reqstring === '') return res.send('-1');

            reqstring = reqstring.slice(0, -1);
            return res.send(`${reqstring}#${countResult.count}:${offset}:10`);
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to get friend requests:\x1b[0m', err);
            return res.send('-1');
        }
    }
};
