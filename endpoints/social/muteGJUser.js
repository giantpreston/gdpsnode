const { commonSecret } = require('../../middleware/secrets');
const utils = require('../../utils');
const db = require('../../database');

module.exports = {
    method: 'post',
    path: '/muteGJUser.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const targetAccountID = parseInt(utils.number(req.body?.targetAccountID), 10);
        const mute = req.body?.mute == null ? 1 : parseInt(utils.number(req.body.mute), 10);

        // sanity checks
        if (!accountID || !gjp2 || !targetAccountID) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (mute !== 0 && mute !== 1) return res.send('-1');
        if (targetAccountID === accountID) return res.send('-1'); // bro wants to tape his own mouth shut lmaoooo
        
        // db checks
        const check = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        const check2 = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(targetAccountID);

        if (!check || !check2) return res.send('-1'); // no account 1 or 2
        if (check.isDisabled === 1 || check2.isDisabled === 1) return res.send('-1'); // one of two accounts is disabled
        if (check.gjp2 !== gjp2) return res.send('-1'); // auth fail!

        // action
        let inf;
        if (mute === 1) {
            inf = db.prepare('INSERT OR IGNORE INTO mutes (person1, person2, timestamp) VALUES (?, ?, ?)').run(accountID, targetAccountID, Math.floor(Date.now() / 1000));
        } else if (mute === 0) {
            inf = db.prepare('DELETE FROM mutes WHERE person1 = ? AND person2 = ?').run(accountID, targetAccountID);
        }

        if (inf.changes > 0) return res.send('1');
        return res.send('-1');
    }
};