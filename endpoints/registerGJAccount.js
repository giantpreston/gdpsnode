const { accountSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/accounts/registerGJAccount.php',
    middleware: [accountSecret],
    handler: (req, res) => {
        const username = req.body?.userName
        const password = req.body?.password
        
        // sanity checks
        if (!username || !password) return res.send('-1');
        if (password.length < 6) return res.send('-8');
        if (username.length < 3) return res.send('-9');
        if (password.length > 50) return res.send('-5');
        if (username.length > 20) return res.send('-4');

        // db checks
        const check = db.prepare('SELECT * FROM accounts WHERE userName = ?');
        const existingUser = check.get(username);

        if (existingUser) return res.send('-2');

        // account creation
        const gjp2 = utils.generateGJP2(password);
        const create = db.prepare('INSERT INTO accounts (userName, gjp2, isDisabled) VALUES (?, ?, ?)');
        const create2 = db.prepare('INSERT INTO profiles (accountID, userName) VALUES (?, ?)');
        const info = create.run(username, gjp2, 0);
        const accountID = info.lastInsertRowid;
        const info2 = create2.run(accountID, username);

        if (info.changes > 0 && info2.changes > 0) return res.send('1');
        return res.send('-1');
    }
};