const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');
const zlib = require('zlib');

function decodeSoundData(value) {
    if (typeof value !== 'string' || !utils.isURLBase64(value) || value.length > 14_000_000) return null;
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const buffer = Buffer.from(padded, 'base64');
    try {
        zlib.gunzipSync(buffer, { maxOutputLength: 20 * 1024 * 1024 });
        return true;
    } catch {
        return null;
    }
}

module.exports = {
    method: 'post',
    path: '/uploadGJEditorSound.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const body = req.body || {};
        const accountID = parseInt(utils.number(body.accountID), 10);
        const soundID = body.soundID == null || body.soundID === '' ? 0 : parseInt(utils.number(body.soundID), 10);
        const actionCount = parseInt(utils.number(body.actionCount), 10);
        const soundCount = parseInt(utils.number(body.soundCount), 10);
        const unlisted = parseInt(utils.number(body.unlisted), 10);
        const gjp2 = utils.remove(body.gjp2 || '');
        const soundName = utils.remove(body.soundName || '');
        const soundDesc = body.soundDesc == null ? '' : String(body.soundDesc).trim();
        const soundData = typeof body.soundData === 'string' ? body.soundData.trim() : '';
        const emote = utils.remove(body.emote || '');

        // sanity checks
        if (!accountID || !Number.isInteger(soundID) || soundID < 0) return res.send('-1');
        if (!Number.isInteger(actionCount) || actionCount < 0 || !Number.isInteger(soundCount) || soundCount < 0) return res.send('-1');
        if (![0, 3, 4].includes(unlisted) || !gjp2 || gjp2.length !== 40) return res.send('-1');
        if (!soundName || soundName.length > 30 || soundDesc.length > 4096 || (soundDesc && !utils.isURLBase64(soundDesc))) return res.send('-1');
        if (emote.length > 32) return res.send('-1');
        if (!decodeSoundData(soundData)) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT accountID, gjp2, isDisabled, creatorBanned FROM accounts WHERE accountID = ?').get(accountID);
        if (!account || account.gjp2 !== gjp2 || account.isDisabled === 1 || account.creatorBanned === 1) return res.send('-1');

        // upload sound pack
        const timestamp = Math.floor(Date.now() / 1000);
        try {
            const result = db.transaction(() => {
                if (soundID > 0) {
                    const existing = db.prepare('SELECT soundID, accountID, version FROM editor_sounds WHERE soundID = ?').get(soundID);
                    if (!existing || existing.accountID !== accountID) return null;
                    db.prepare(`
                        UPDATE editor_sounds
                        SET soundName = ?, soundDesc = ?, soundData = ?, version = ?,
                            actionCount = ?, soundCount = ?, unlisted = ?, emote = ?, updateDate = ?
                        WHERE soundID = ?
                    `).run(soundName, soundDesc, soundData, existing.version + 1, actionCount, soundCount, unlisted, emote, timestamp, soundID);
                    return soundID;
                }

                const inserted = db.prepare(`
                    INSERT INTO editor_sounds (
                        accountID, soundName, soundDesc, soundData, actionCount, soundCount,
                        unlisted, emote, uploadDate, updateDate
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(accountID, soundName, soundDesc, soundData, actionCount, soundCount, unlisted, emote, timestamp, timestamp);
                return Number(inserted.lastInsertRowid);
            })();
            if (result) return res.send(String(result));
        } catch (error) {
            console.error('\x1b[1;31m✗ Failed to save editor sound pack:\x1b[0m', error);
        }
        return res.send('-1');
    }
};