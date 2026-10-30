const { accountSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');
const threadUtils = require('../../threadUtils');

module.exports = {
    method: 'post',
    path: '/accounts/registerGJAccount.php',
    middleware: [accountSecret],
    handler: (req, res) => {
        const username = utils.remove(req.body?.userName || '');
        const password = utils.remove(req.body?.password || '');
        const normalizedUsername = utils.normalizeUsername(username);
        
        // sanity checks
        if (!username || !password || !req.body?.rsession) return res.send('-1');
        if (password.length < 6) return res.send('-8');
        if (username.length < 3) return res.send('-9');
        if (password.length > 50) return res.send('-5');
        if (username.length > 20) return res.send('-4');

        // db checks
        const check = db.prepare('SELECT * FROM accounts WHERE LOWER(userName) = ?');
        const existingUser = check.get(normalizedUsername);

        if (existingUser) return res.send('-2');

        // account creation
        const gjp2 = utils.generateGJP2(password);
        const create = db.prepare('INSERT INTO accounts (userName, gjp2, isDisabled) VALUES (?, ?, ?)');
        const create2 = db.prepare('INSERT INTO profiles (accountID, userName) VALUES (?, ?)');
        try {
            const created = db.transaction(() => {
                const info = create.run(username, gjp2, 0);
                const accountID = info.lastInsertRowid;
                const profile = create2.run(accountID, username);

                if (accountID === 72) {
                    const timestamp = Math.floor(Date.now() / 1000);
                    const thread = db.prepare(`
                        INSERT INTO threads (isDM, ownerID, createdAt, updatedAt)
                        VALUES (1, ?, ?, ?)
                    `).run(threadUtils.SYSTEM_ACCOUNT_ID, timestamp, timestamp);
                    const threadID = Number(thread.lastInsertRowid);
                    db.prepare(`
                        INSERT INTO thread_members (threadID, accountID, status, joinedAt)
                        VALUES (?, ?, 1, ?), (?, ?, 1, ?)
                    `).run(threadID, accountID, timestamp, threadID, threadUtils.SYSTEM_ACCOUNT_ID, timestamp);
                    threadUtils.addMessage(threadID, threadUtils.SYSTEM_ACCOUNT_ID, threadUtils.encode('All set up! Your server is now ready to go.'));
                    threadUtils.addMessage(threadID, threadUtils.SYSTEM_ACCOUNT_ID, threadUtils.encode('Since you\'re the first account, you\'ve been granted Moderator permissions.'));
                    threadUtils.addMessage(threadID, threadUtils.SYSTEM_ACCOUNT_ID, threadUtils.encode('To activate your Moderator abilities, open Settings in the Main Menu, go to the Help section, and click on the REQ button!'));
                    threadUtils.addMessage(threadID, threadUtils.SYSTEM_ACCOUNT_ID, threadUtils.encode("Consider checking console for any warnings or errors and revise your environment variables to configure your server to your liking. Have fun with GDPSnode! <3"));
                    db.prepare('UPDATE profiles SET modLevel = ? WHERE accountID = ?').run(2, accountID);
                }

                if (info.changes === 0 || profile.changes === 0) throw new Error('Account was not fully created');
                return true;
            })();

            if (created) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to register account:\x1b[0m', err);
        }
        return res.send('-1');
    }
};