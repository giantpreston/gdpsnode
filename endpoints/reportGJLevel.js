const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/reportGJLevel.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const levelID = parseInt(utils.number(req.body?.levelID), 10);

        if (!levelID) return res.send('1'); // no idea why but yes, it does that

        const check = db.prepare('SELECT * FROM levels WHERE levelID = ?');
        const level = check.get(levelID);

        if (!level) return res.send('-1');
        const action = db.prepare('UPDATE levels SET levelReports = levelReports + 1 WHERE levelID = ?');
        const inf = action.run(levelID);
        if (inf.changes > 0) return res.send('1');
        return res.send('-1');
    }
};