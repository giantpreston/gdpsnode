const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

module.exports = {
    method: 'post',
    path: '/updateGJSoundDesc.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const soundID = parseInt(utils.number(req.body?.soundID), 10);
        const emote = utils.remove(req.body?.emote);
        const soundDesc = utils.remove(req.body?.soundDesc);

        // sanity checks
        if (!accountID || !gjp2 || !soundID || soundDesc === null || soundDesc === undefined || emote === null || emote === undefined) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (soundDesc !== "" && !utils.isURLBase64(soundDesc)) return res.send('-1');
        if (soundDesc.length > 240 || emote.length > 20) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        const sound = db.prepare('SELECT * FROM editor_sounds WHERE soundID = ?').get(soundID);

        if (!account || !sound) return res.send('-1');
        if (gjp2 !== account.gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');
        if (sound.accountID !== accountID) return res.send('-1');

        // operation
        const inf = db.prepare('UPDATE editor_sounds SET soundDesc = ?, emote = ? WHERE soundID = ?').run(soundDesc, emote, soundID);
        if (inf.changes > 0) return res.send('1');

        return res.send('-1'); // fallback!
    }
};