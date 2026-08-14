const { commonSecret } = require('../middleware/secrets');
const db = require('../database');

module.exports = {
    method: 'post',
    path: '/getGJUsers20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const str = req.body?.str;

        // sanity check
        if (!str) return res.send('-1'); // bro what u wanna search for!1!!

        // db lookup
        let prepare;
        if (isNaN(str)) { prepare = db.prepare('SELECT * FROM profiles WHERE userName = ?'); } else { prepare = db.prepare('SELECT * FROM profiles WHERE accountID = ?'); }
        const account = prepare.get(str);

        if (!account) return res.send('-1');
        
        const usrcount = db.prepare('SELECT COUNT(*) as count FROM profiles').get().count;
        return res.send(`1:${account.userName}:2:${account.accountID + 1}:3:${account.stars}:13:${account.coins}:17:${account.userCoins}:9:${account.icon}:10:${account.color1}:11:${account.color2}:51:${account.color3}:14:${account.iconType}:15:${account.special}:16:${account.accountID}:3:${account.stars}:8:${account.creatorPoints}:4:${account.demons}:46:${account.diamonds}:52:${account.moons}#${usrcount}:0:1`);
    }
};