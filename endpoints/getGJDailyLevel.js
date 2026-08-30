const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const crypto = require('crypto');
const utils = require('../utils');

function getCurrentDailyLevel(isWeekly = false) {
    const rangeClause = isWeekly
        ? 'dailyNumber >= 100001'
        : 'dailyNumber > 0 AND dailyNumber <= 100000';

    return db.prepare(
        `SELECT levelID, levelName, dailyNumber, dailyTime, starStars, accountID, eventNumber
         FROM levels
         WHERE ${rangeClause}
         ORDER BY uploadDate DESC
         LIMIT 1`
    ).get() || null;
}

function getCurrentEventLevel() {
    return db.prepare(
        `SELECT levelID, levelName, dailyNumber, dailyTime, starStars, accountID, eventNumber
         FROM levels
         WHERE eventNumber != 0
         ORDER BY uploadDate DESC
         LIMIT 1`
    ).get() || null;
}

function getEventRewards(level) {
    if (!level) return '';

    return [
        level.levelID,
        level.starStars || 0,
        level.dailyNumber || 0,
        Number(level.accountID || 0) + 1
    ].join('|');
}

function resolveTargetType(body = {}) {
    if (body.weekly === '1' || body.weekly === 1 || body.weekly === true) {
        return 1;
    }

    const fallbackType = body.type !== undefined ? Number.parseInt(utils.number(body.type), 10) : NaN;
    if (Number.isInteger(fallbackType) && fallbackType >= 0 && fallbackType <= 2) {
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

            // sanity checks
            if (type === 2 && !body) return res.send('-1');

            // db checks
            const level = type === 2
                ? getCurrentEventLevel()
                : getCurrentDailyLevel(type === 1);

            if (!level) {
                return res.send('-1');
            }

            const now = Math.floor(Date.now() / 1000);
            const timeLeft = Math.max(0, Number(level.dailyTime || 0) - now);

            if (type === 2) {
                if (level.eventNumber == null || Number(level.eventNumber) === 0) {
                    return res.send('-1');
                }

                const rewardData = getEventRewards(level);
                const hash = crypto.createHash('sha1').update(`${rewardData}xI25fpAapCQg`).digest('hex');
                return res.send(`${level.eventNumber}|10|${rewardData}|${hash}`);
            }

            return res.send(`${level.dailyNumber}|${timeLeft}`);
        } catch (error) {
            console.error('[getGJDailyLevel] request failed:', error);
            if (!res.headersSent) res.send('-1');
        }
    }
};
