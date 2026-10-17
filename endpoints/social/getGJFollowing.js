const { commonSecret } = require('../../middleware/secrets');
const utils = require('../../utils');
const db = require('../../database');

module.exports = {
    method: 'post',
    path: '/getGJFollowing.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);

        // sanity checks!
        if (!accountID || !gjp2) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);

        if (!account) return res.send('-1'); // no acc
        if (account.gjp2 !== gjp2) return res.send('-1'); // auth fail
        if (account.isDisabled === 1) return res.send('-1');

        // response
        const following = db.prepare('SELECT person2 FROM follows WHERE person1 = ?').all(accountID);
        if (following.length === 0) return res.send('0'); // follows nobody!

        const userString = following.map(follow => follow.person2).join(',');
        return res.send(userString);
    }
};