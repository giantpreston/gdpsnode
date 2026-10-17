const { levelSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

module.exports = {
    method: 'post',
    path: '/deleteGJEditorSound.php',
    middleware: [levelSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID || ''), 10);
        const soundID = parseInt(utils.number(req.body?.soundID || ''), 10);
        const gjp2 = utils.remove(req.body?.gjp2);

        // sanity checks
        if (!accountID || !soundID || !gjp2 || gjp2.length !== 40) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT gjp2, isDisabled FROM accounts WHERE accountID = ?').get(accountID);
        if (!account || account.gjp2 !== gjp2 || account.isDisabled === 1) return res.send('-1');

        try {
            const deleted = db.transaction(() => {
                const sound = db.prepare('SELECT accountID FROM editor_sounds WHERE soundID = ?').get(soundID);
                if (!sound || sound.accountID !== accountID) return false;

                db.prepare('DELETE FROM editorpackcomments WHERE editorpackID = ?').run(soundID);
                return db.prepare('DELETE FROM editor_sounds WHERE soundID = ? AND accountID = ?').run(soundID, accountID).changes > 0;
            })();

            if (deleted) return res.send('1');
        } catch (error) {
            console.error('\x1b[1;31m✗ Failed to delete editor sound pack:\x1b[0m', error);
        }
        return res.send('-1');
    }
};