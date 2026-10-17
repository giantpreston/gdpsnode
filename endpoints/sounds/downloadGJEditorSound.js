const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

const responseHash = 'f5da5823d94bbe7208dd83a30ff427c7d88fdb99';

module.exports = {
    method: 'post',
    path: '/downloadGJEditorSound.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const body = req.body || {};
        const soundID = parseInt(utils.number(body.soundID), 10);
        const accountID = body.accountID == null || body.accountID === '' ? 0 : parseInt(utils.number(body.accountID), 10);

        // sanity checks
        if (!soundID || !Number.isInteger(accountID) || accountID < 0) return res.send('-1');

        // db checks
        let viewerID = 0;
        if (accountID > 0) {
            const gjp2 = utils.remove(body.gjp2 || '');
            const account = db.prepare('SELECT accountID, gjp2, isDisabled FROM accounts WHERE accountID = ?').get(accountID);
            if (!account || !gjp2 || account.gjp2 !== gjp2 || account.isDisabled === 1) return res.send('-1');
            viewerID = accountID;
        }

        const pack = db.prepare(`
            SELECT s.*, a.userName
            FROM editor_sounds s
            JOIN accounts a ON a.accountID = s.accountID
            WHERE s.soundID = ?
        `).get(soundID);
        if (!pack) return res.send('-1');

        if (pack.unlisted === 3 && pack.accountID !== viewerID) {
            const friendship = viewerID && db.prepare('SELECT 1 FROM friendships WHERE (person1 = ? AND person2 = ?) OR (person1 = ? AND person2 = ?)').get(viewerID, pack.accountID, pack.accountID, viewerID);
            if (!friendship) return res.send('-1');
        }

        try {
            db.prepare('UPDATE editor_sounds SET downloads = downloads + 1 WHERE soundID = ?').run(soundID);
            return res.send(`1:${pack.soundID}:2:${pack.soundName}:3:${pack.soundDesc}:5:${pack.version}:49:${pack.accountID}:50:${pack.userName}:10:${pack.downloads + 1}:14:${pack.likes}:19::51:${pack.soundData}:28:${pack.uploadDate}:29:${pack.updateDate}:59:${pack.actionCount}:60:${pack.soundCount}:61:${pack.unlisted}:64:${pack.emote}#${responseHash}`);
        } catch (error) {
            console.error('\x1b[1;31m✗ Failed to download editor sound pack:\x1b[0m', error);
            return res.send('-1');
        }
    }
};