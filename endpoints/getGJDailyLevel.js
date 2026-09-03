const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

function getCurrentDailyLevel(isWeekly = false) {
    const rangeClause = isWeekly
        ? 'dailyNumber >= 100001'
        : 'dailyNumber > 0 AND dailyNumber <= 100000';

    return db.prepare(
        `SELECT levelID, levelName, dailyNumber, dailyTime, starStars, accountID
         FROM levels
         WHERE ${rangeClause}
         ORDER BY uploadDate DESC
         LIMIT 1`
    ).get() || null;
}

function resolveTargetType(body = {}) {
    if (body.weekly === '1' || body.weekly === 1 || body.weekly === true) {
        return 1;
    }

    const fallbackType = body.type !== undefined ? Number.parseInt(utils.number(body.type), 10) : NaN;
    if (Number.isInteger(fallbackType) && fallbackType >= 0 && fallbackType <= 1) {
        return fallbackType;
    }

    return 0;
}

module.exports = {
    method: 'post',
    path: '/getGJDailyLevel.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        try {
            const body = req.body || {};
            const type = resolveTargetType(body);

            // db checks
            if (type === 2) return res.send('-1');
            const level = getCurrentDailyLevel(type === 1);

            if (!level) {
                return res.send('-1');
            }

            const now = Math.floor(Date.now() / 1000);
            const timeLeft = Math.max(0, Number(level.dailyTime || 0) - now);

            if (level.dailyTime > 0 && level.dailyTime <= now) return res.send('-1');

            return res.send(`${level.dailyNumber}|${timeLeft}`);
        } catch (error) {
            console.error('\x1b[1;31m✗ [getGJDailyLevel] request failed:\x1b[0m', error);
            if (!res.headersSent) res.send('-1');
        }
    }
};
