const { accountSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/updateGJAccSettings20.php',
    middleware: [accountSecret],
    handler: (req, res) => {
        const body = req.body || {};
        const accountID = parseInt(utils.number(body.accountID), 10);
        const gjp2 = utils.remove(body.gjp2);

        if (!accountID || !gjp2) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');

        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        if (!account) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        const clamp = (value, min, max) => {
            const parsed = parseInt(utils.number(value), 10);
            if (Number.isNaN(parsed)) return min;
            return Math.min(Math.max(parsed, min), max);
        };

        const fieldMap = {
            mS: value => clamp(value, 0, 2),
            frS: value => clamp(value, 0, 1),
            cS: value => clamp(value, 0, 2),
            youtubeurl: value => utils.remove(value),
            twitter: value => utils.remove(value),
            twitch: value => utils.remove(value),
            instagram: value => utils.remove(value),
            tiktok: value => utils.remove(value),
            discord: value => utils.remove(value),
            custom: value => utils.remove(value)
        };

        const updates = [];
        const values = [];

        for (const [key, parser] of Object.entries(fieldMap)) {
            const rawValue = body[key];
            if (rawValue === undefined || rawValue === null || rawValue === '') continue;

            updates.push(`${key} = ?`);
            values.push(parser(rawValue));
        }

        if (updates.length === 0) return res.send('1');

        values.push(accountID);

        const result = db.prepare(`
            UPDATE profiles
            SET ${updates.join(', ')}
            WHERE accountID = ?
        `).run(...values);

        return result.changes > 0 ? res.send('1') : res.send('-1');
    }
};