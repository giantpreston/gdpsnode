const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/deleteGJComment20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const commentID = parseInt(utils.number(req.body?.commentID), 10);
        const levelID = parseInt(utils.number(req.body?.levelID), 10);

        // sanity checks
        if (!accountID || !gjp2 || !commentID || !levelID) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (commentID < 0) return res.send('-1'); // no negative levelID check since lists are negative levelIDs

        // db checks
        const level = db.prepare('SELECT * FROM levels WHERE levelID = ?').get(levelID);
        const list = db.prepare('SELECT * FROM lists WHERE listID = ?').get(levelID * -1);
        const comment = db.prepare('SELECT * FROM comments WHERE commentID = ? AND levelID = ?').get(commentID, levelID);
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        const profile = db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(accountID);

        if (((levelID < 0 && !list) || (levelID > 0 && !level)) || !profile || !account || !comment) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (profile.modLevel !== 2 && accountID !== level.accountID && comment.accountID !== accountID) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        try {
            const inf = db.prepare('DELETE FROM comments WHERE commentID = ? AND levelID = ?').run(commentID, levelID);
            if (inf.changes > 0) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to delete comment:\x1b[0m', err);
        }
        return res.send('-1');
    }
};