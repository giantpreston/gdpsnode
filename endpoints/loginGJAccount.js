const { accountSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/accounts/loginGJAccount.php',
    middleware: [accountSecret],
    handler: (req, res) => {
        const username = req.body?.userName;
        const gjp2 = req.body?.gjp2;

        // sanity checks
        if (!username || !gjp2) return res.send('-1'); // generic error
        if (username.length < 3) return res.send('-9'); // uname too short
        if (gjp2.length !== 40) return res.send('-8'); // pwd too short (here in case the gjp2 isnt a valid gjp2)

        // db checks
        const check = db.prepare('SELECT * FROM accounts WHERE userName = ?');
        const account = check.get(username);

        if (!account) return res.send('-11'); // Login Failed
        if (account.gjp2 === gjp2) {
            if (account.isDisabled === 1) return res.send('-12'); // Account has been disabled
            return res.send(`${account.accountID},${account.accountID + 1}`); // Linked account successfully
        } else {
            return res.send('-11'); // Login Failed
        }
        
        return res.send('-1');
    }
};