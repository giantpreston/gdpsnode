const { accountSecret } = require('../middleware/secrets');
const db = require('../database');
const zlib = require('zlib');

module.exports = {
    method: 'post',
    path: '/database/accounts/syncGJAccountNew.php',
    middleware: [accountSecret],
    handler: (req, res) => {
        const accountId = req.body?.accountID;
        const gjp2 = req.body?.gjp2;
        const userName = req.body?.userName;

        // sanity checks
        if (!gjp2) return res.send('-2');
        if (gjp2.length !== 40) return res.send('-11');

        // get account
        let account;
        if (accountId) {
            const check = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
            account = check.get(accountId);
        } else {
            return res.send('-2');
        }

        if (!account) return res.send('-2');

        // verify password
        if (account.gjp2 !== gjp2) return res.send('-2');
        if (account.isDisabled === 1) return res.send('-1');

        // get save data from database
        let saveData = account.saveData;

        if (!saveData) {
            // no save data exists, return empty/default
            return res.send(';21;30;a;a');
        }

        return res.send(saveData + ';22;47;a;a');
    }
};