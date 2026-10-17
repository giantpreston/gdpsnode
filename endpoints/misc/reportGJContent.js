const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

const allowedReasons = {
    0: [0, 1, 2, 3, 4, 5, 7],
    1: [0, 1, 2, 3, 6, 7],
    2: [0, 1, 2, 3, 6, 7],
    3: [0, 1, 2, 3, 7],
    4: [0, 1, 2, 3, 7],
    5: [0, 1, 2, 3, 7],
    6: [0, 1, 2, 3, 7],
    7: [0, 1, 2, 3, 7],
    8: [0, 1, 2, 3, 7],
    9: [0, 1, 2, 6]
};

const toInteger = value => {
    if (typeof value !== 'string' && typeof value !== 'number') return NaN;
    const stringValue = String(value).trim();
    if (!/^-?\d+$/.test(stringValue)) return NaN;
    const numberValue = Number(stringValue);
    return Number.isSafeInteger(numberValue) ? numberValue : NaN;
};

const targetExists = (type, targetID, special) => {
    switch (type) {
        case 0:
            return db.prepare('SELECT 1 FROM accounts WHERE accountID = ?').get(targetID);
        case 1:
            return db.prepare('SELECT 1 FROM levels WHERE levelID = ?').get(targetID);
        case 2:
            return db.prepare('SELECT 1 FROM lists WHERE listID = ?').get(targetID);
        case 3:
            return db.prepare('SELECT 1 FROM comments WHERE commentID = ? AND levelID = ?').get(targetID, special);
        case 4:
            return db.prepare('SELECT 1 FROM acccomments WHERE commentID = ? AND accountID = ?').get(targetID, special);
        case 5:
            return db.prepare('SELECT 1 FROM messages WHERE ID = ?').get(targetID);
        case 6:
            return db.prepare('SELECT 1 FROM friendreqs WHERE ID = ?').get(targetID);
        case 7:
            return db.prepare('SELECT 1 FROM editorpackcomments WHERE commentID = ? AND editorpackID = ?').get(targetID, special);
        case 8:
            return false; // Threads!! Will be added soon.
        case 9:
            return db.prepare('SELECT 1 FROM editor_sounds WHERE soundID = ?').get(targetID);
        default:
            return false;
    }
};

module.exports = {
    method: 'post',
    path: '/reportGJContent.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const body = req.body || {};
        if (body.accountID == null || body.accountID === '' || body.gjp2 == null || body.gjp2 === '') {
            return res.send('1');
        }

        const accountID = toInteger(body.accountID);
        const gjp2 = utils.remove(body.gjp2 || '');
        const targetID = toInteger(body.targetID);
        const type = toInteger(body.type);
        const hasSpecial = body.special != null && body.special !== '';
        const special = hasSpecial ? toInteger(body.special) : null;
        const hasMessageID = body.messageID != null && body.messageID !== '';
        const messageID = hasMessageID ? toInteger(body.messageID) : null;

        // sanity checks
        if (!accountID || !gjp2) return res.send('-1');
        if (accountID < 0 || gjp2.length !== 40) return res.send('-1');
        if (!Number.isSafeInteger(targetID) || targetID <= 0) return res.send('-1');
        if (!Object.hasOwn(allowedReasons, type)) return res.send('-1');
        if ([3, 4, 7].includes(type) && (!Number.isSafeInteger(special) || special === 0)) return res.send('-1');
        if ([4, 7].includes(type) && special < 0) return res.send('-1');
        if (hasMessageID && (type !== 8 || !Number.isSafeInteger(messageID) || messageID <= 0)) return res.send('-1');
        if (type === 8) return res.send('-1'); // threads are not stored by this server
        if (![3, 4, 7].includes(type) && hasSpecial) return res.send('-1');

        const rawReasons = typeof body.reasons === 'string' ? body.reasons.split(',') : [];
        if (rawReasons.length === 0 || rawReasons.some(reason => !/^\d+$/.test(reason))) return res.send('-1');
        const reasons = rawReasons.map(Number);
        if (reasons.some(reason => !allowedReasons[type].includes(reason))) return res.send('-1');

        // db checks
        try {
            const report = db.transaction(() => {
                const account = db.prepare('SELECT gjp2, isDisabled FROM accounts WHERE accountID = ?').get(accountID);
                if (!account || account.gjp2 !== gjp2 || account.isDisabled === 1) return false;
                if (!targetExists(type, targetID, special)) return false;

                const inserted = db.prepare(`
                    INSERT INTO reports (accountID, targetID, type, reasons, messageID, special, reportedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(accountID, targetID, type, [...new Set(reasons)].join(','), messageID, special, Math.floor(Date.now() / 1000));
                return inserted.changes === 1;
            })();

            if (report) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to report content:\x1b[0m', err);
        }
        return res.send('-1');
    }
};

// told y'all :P