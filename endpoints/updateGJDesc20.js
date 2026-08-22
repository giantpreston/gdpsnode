const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/updateGJDesc20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const levelID = parseInt(utils.number(req.body?.levelID), 10);
        const levelDesc = utils.remove(req.body?.levelDesc);

        // sanity checks
        if (!accountID || !gjp2 || !levelID || levelDesc === null || levelDesc === undefined) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (levelDesc !== "" && !utils.isURLBase64(levelDesc)) return res.send('-1');
        if (levelDesc.length > 240) return res.send('-1');

        // db checks
        const check = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
        const account = check.get(accountID);
        const check2 = db.prepare('SELECT * FROM levels WHERE levelID = ?');
        const level = check2.get(levelID);

        if (!account || !level) return res.send('-1');
        if (gjp2 !== account.gjp2) return res.send('-1');
        if (level.accountID !== accountID) return res.send('-1');

        // operation
        const upd = db.prepare('UPDATE levels SET levelDesc = ? WHERE levelID = ?');
        const oper = upd.run(levelDesc, levelID);
        if (oper.changes > 0) return res.send('1');
        return res.send('-1');
    }
};

// i would add a funny comment here but its so late and im so dead inside that i dont even feel like doing that tbh
// pretty easy endpoint though enjoyable experience 10/10 would('nt) rewrite again