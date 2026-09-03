const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

const welcomeMessageSender = {
    accountID: 71,
    userName: 'GDPSnode Notifications',
    subject: 'V2VsY29tZSB0byBHRFBTbm9kZSE='
};

function getMessageProfile(message, accountID) {
    const profile = db.prepare('SELECT userName, accountID FROM profiles WHERE accountID = ?').get(accountID);
    if (profile) return profile;

    if (message.accID === welcomeMessageSender.accountID &&
        message.userName === welcomeMessageSender.userName &&
        message.subject === welcomeMessageSender.subject) {
        return welcomeMessageSender;
    }

    return null;
}

module.exports = {
    method: 'post',
    path: '/getGJMessages20.php',
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
        let messages;
        let countResult;

        try {
            if (getSent === 0) {
                // received messages
                messages = db.prepare('SELECT * FROM messages WHERE toAccountID = ? ORDER BY ID DESC LIMIT 10 OFFSET ?').all(accountID, offset);
                countResult = db.prepare('SELECT COUNT(*) as count FROM messages WHERE toAccountID = ?').get(accountID);
            } else if (getSent === 1) {
                // sent messages
                messages = db.prepare('SELECT * FROM messages WHERE accID = ? ORDER BY ID DESC LIMIT 10 OFFSET ?').all(accountID, offset);
                countResult = db.prepare('SELECT COUNT(*) as count FROM messages WHERE accID = ?').get(accountID);
            }

            if (countResult.count === 0) return res.send('-2');

            let msgstring = '';
            for (const message of messages) {
                if (message.ID) {
                    const senderID = getSent === 0 ? message.accID : message.toAccountID;
                    const profile = getMessageProfile(message, senderID);

                    if (profile) {
                        msgstring += `6:${profile.userName}:3:${profile.accountID + 1}:2:${profile.accountID}:1:${message.ID}:4:${message.subject}:8:${message.isNew}:9:${getSent}:7:${utils.getRelative(message.timestamp)}|`;
                    }
                }
            }

            if (msgstring === '') return res.send('-1');

            msgstring = msgstring.slice(0, -1);
            return res.send(`${msgstring}#${countResult.count}:${offset}:10`);
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to get messages:\x1b[0m', err);
            return res.send('-1');
        }
    }
};
