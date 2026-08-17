const { commonSecret } = require('../middleware/secrets');
const db = require('../database');

module.exports = {
    method: 'post',
    path: '/requestUserAccess.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountId = parseInt(req.body?.accountID);
        const gjp2 = req.body?.gjp2;

        // sanity checks
        if (!accountId || !gjp2) return res.send('-1'); // not getting in buddy nuh uh
        if (isNaN(accountId)) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const check = db.prepare('SELECT * FROM profiles WHERE accountID = ?');
        const account = check.get(accountId);
        const check2 = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
        const account2 = check2.get(accountId);

        if (!account) return res.send('-1');
        if (account2.gjp2 === gjp2) {
            if (account2.isDisabled === 1) return res.send('-1');

            if (account.modLevel === 0) return res.send('-1'); // -1 = no mod
            if (account.modLevel === 1) return res.send('1'); // 1 = mod
            if (account.modLevel === 2) return res.send('2'); // 2 = elder mod
            if (account.modLevel === 3) return res.send('99'); // 99 = leaderboard mod
        }

        return res.send('-1');
    }
};