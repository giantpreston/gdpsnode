const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/getGJScores20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2 || '');
        let type = utils.remove(req.body?.type);
        let count = parseInt(utils.number(req.body?.count), 10);
        let stat = parseInt(utils.number(req.body?.stat), 10);

        // sanity checks
        if (!type) type = 'top';
        if (!count) count = type === 'relative' ? 50 : 100;
        if (!stat) stat = 0;
        if (!['top', 'relative', 'friends', 'creators'].includes(type)) return res.send('-1');
        if (count < 1) return res.send('-1');
        if (count > 100) count = 100;
        if (stat < 0 || stat > 3 || !Number.isInteger(stat)) return res.send('-1');

        const requiresAccount = type === 'relative' || type === 'friends';
        if (requiresAccount && (!accountID || !gjp2)) return res.send('-1');
        if (accountID && gjp2.length !== 40) return res.send('-1');

        // db stuff
        const statColumns = ['stars', 'moons', 'demons', 'userCoins'];
        const orderColumn = type === 'creators' ? 'creatorPoints' : statColumns[stat];
        const account = accountID ? db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID) : null;

        if (requiresAccount && (!account || account.gjp2 !== gjp2 || account.isDisabled === 1)) return res.send('-1');

        let where = 'a.isDisabled = 0';
        const parameters = [];

        if (type === 'creators') {
            where += ' AND a.creatorBanned = 0 AND p.creatorPoints > 0';
        } else if (type === 'top') {
            where += ` AND p.${orderColumn} > 0`;
        } else if (type === 'friends') {
            where += ' AND (p.accountID = ? OR p.accountID IN (SELECT CASE WHEN person1 = ? THEN person2 ELSE person1 END FROM friendships WHERE person1 = ? OR person2 = ?))';
            parameters.push(accountID, accountID, accountID, accountID);
        }

        let users;
        let relativeProfile;
        if (type === 'relative') {
            relativeProfile = db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(accountID);
            if (!relativeProfile) return res.send('-1');

            const halfCount = Math.floor(count / 2);
            const score = relativeProfile[orderColumn];
            users = db.prepare(`
                SELECT p.*, a.isDisabled, a.creatorBanned
                FROM profiles p JOIN accounts a ON a.accountID = p.accountID
                WHERE ${where} AND p.${orderColumn} <= ?
                ORDER BY p.${orderColumn} DESC, p.accountID ASC
                LIMIT ?
            `).all(...parameters, score, halfCount);

            const higherUsers = db.prepare(`
                SELECT p.*, a.isDisabled, a.creatorBanned
                FROM profiles p JOIN accounts a ON a.accountID = p.accountID
                WHERE ${where} AND p.${orderColumn} > ?
                ORDER BY p.${orderColumn} ASC, p.accountID DESC
                LIMIT ?
            `).all(...parameters, score, halfCount);

            users = [...higherUsers.reverse(), ...users];
        } else {
            users = db.prepare(`
                SELECT p.*, a.isDisabled, a.creatorBanned
                FROM profiles p JOIN accounts a ON a.accountID = p.accountID
                WHERE ${where}
                ORDER BY p.${orderColumn} DESC, p.accountID ASC
                LIMIT ?
            `).all(...parameters, count);
        }

        if (users.length === 0) return res.send('-1');

        let rank = 0;
        if (type === 'relative') {
            const higherUsers = db.prepare(`SELECT COUNT(*) AS count FROM profiles p JOIN accounts a ON a.accountID = p.accountID WHERE ${where} AND p.${orderColumn} > ?`).get(...parameters, relativeProfile[orderColumn]);
            rank = higherUsers.count;
        }

        const response = users.map((user, index) => {
            const userRank = type === 'relative' ? rank + index + 1 : index + 1;
            return `1:${user.userName}:2:${user.accountID + 1}:13:${user.coins}:17:${user.userCoins}:6:${userRank}:9:${user.icon}:10:${user.color1}:11:${user.color2}:51:${user.color3}:14:${user.iconType}:15:${user.special}:16:${user.accountID}:3:${user.stars}:8:${Math.round(user.creatorPoints)}:4:${user.demons}:7:${user.accountID}:46:${user.diamonds}:52:${user.moons}`;
        }).join('|');

        return res.send(response);
    }
};