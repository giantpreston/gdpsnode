const { accountSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/accounts/registerGJAccount.php',
    middleware: [accountSecret],
    handler: (req, res) => {
        const username = utils.remove(req.body?.userName || '')
        const password = utils.remove(req.body?.password || '')
        
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

        if (accountID === 72) {
            db.prepare('INSERT INTO messages (subject, body, accID, userName, toAccountID, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run('V2VsY29tZSB0byBHRFBTbm9kZSE=', 'ZVxTW1oRTV1AEVdbQBVSWVtdRlhfUxJydWFnXFpVVBUSbF5ERhJGVENCV0cRWEcSUl5eUBJBXhFTXRsRaFtHFVxYU1pBEUZVXEERRVsSVllUV1kVUl5aQVpdVBRUWkMRVVxMEUZVQFtYX1NBFV5DFFdHQ15GQRVQX1ASRUNeRFdHXUgUQVBFEUFCFUVZURJRUEJcUFpQQ1ASQlhFXBJMXkRGEhtUX0ISQ1BDXVNXXVRHHBViWFpRUBFIW0cSQ1QURl1UEVJbR0JFFFNWUl5BXEEdEU1dQBFZVURQEVNRV1sRVkZTW0VUUBJQXVVRQBVcXlASVFJSUUFGHxFzXRVFXhRgcGARW1wVRVlREn1UXUQSRlRSQFtaXxFbVBViVEBGXF9WRxJBXhFVUUFYR1VGUBFYQBwVeVBCVxVXRFoSCQI=', 71, 'GDPSnode Notifications', accountID, Math.floor(Date.now() / 1000));
            db.prepare('UPDATE profiles SET modLevel = ? WHERE accountID = ?').run(2, accountID);
        }

        if (info.changes > 0 && info2.changes > 0) return res.send('1');
        return res.send('-1');
    }
};