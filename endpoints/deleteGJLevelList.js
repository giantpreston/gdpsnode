const { levelSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/deleteGJLevelList.php',
    middleware: [levelSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const listID = parseInt(utils.number(req.body?.listID), 10);

        // sanity checks
        if (!accountID || !gjp2 || !listID || !req.body?.udid || !req.body?.uuid) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        const profile = db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(accountID);
        const list = db.prepare('SELECT * FROM lists WHERE listID = ?').get(listID);

        if (!account || !list) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');
        if (profile.modLevel !== 2 && list.accountID !== accountID) return res.send('-1'); // not list owner or elder

        try {
            const inf = db.prepare('DELETE FROM lists WHERE listID = ?').run(listID);
            if (inf.changes > 0) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to delete list:\x1b[0m', err);
        }
        return res.send('-1');
    }
};