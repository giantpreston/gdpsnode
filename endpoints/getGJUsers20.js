const { commonSecret } = require('../middleware/secrets');
const utils = require('../utils');
const db = require('../database');

module.exports = {
    method: 'post',
    path: '/getGJUsers20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const str = utils.remove(req.body?.str || '');

        // sanity check
        if (!str) return res.send('-1'); // bro what u wanna search for!1!!

        // db lookup
        let account;
        if (isNaN(parseInt(str))) { account = db.prepare('SELECT * FROM profiles WHERE userName = ?').get(str); } else { account = db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(str - 1); }
        const dis = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(account.accountID);

        if (!account) return res.send('-1');
        if (dis.isDisabled === 1) return res.send('-1');
        
        const usrcount = db.prepare('SELECT COUNT(*) as count FROM profiles').get().count;

        // note that the GD client can handle and render more than one user profile at getGJUsers20, but i intentionally chose to mimic the original RobTop server configuration.
        // you can do that by separating each account with a pipe character (|) and sending the data for the second user, and in that order it'll show up.
        
        return res.send(`1:${account.userName}:2:${account.accountID + 1}:3:${account.stars}:13:${account.coins}:17:${account.userCoins}:9:${account.icon}:10:${account.color1}:11:${account.color2}:51:${account.color3}:14:${account.iconType}:15:${account.special}:16:${account.accountID}:8:${account.creatorPoints}:4:${account.demons}:46:${account.diamonds}:52:${account.moons}#${usrcount}:0:1`);
    }
};