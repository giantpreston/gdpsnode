const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');
const rewards = require('./getGJRewards.js')

function getCurrentDailyLevel(isWeekly = false, isEvent = false) {
    let rangeClause = 'dailyNumber > 0 AND dailyNumber <= 100000';
    if (isWeekly) rangeClause = 'dailyNumber > 100000 AND dailyNumber <= 200000';
    if (isEvent) rangeClause = 'dailyNumber > 200000';

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

            // db checks
            const level = getCurrentDailyLevel(type === 1, type === 2);

            if (!level) {
                return res.send('-1');
            }

            const now = Math.floor(Date.now() / 1000);
            const timeLeft = Math.max(0, Number(level.dailyTime || 0) - now);

            if (level.dailyTime > 0 && level.dailyTime <= now) return res.send('-1');

            if (type === 2) {
                // decode chk
                const chkBuffer = utils.xorCipher(Buffer.from(body.chk.slice(5), 'base64url'), '59182').toString('utf8');
                // Random string INSIDE the encrypted payload
                const rewardPrefix = utils.randomString(5);    // inside the encoded string
                const responsePrefix = utils.randomString(5);  // outside the encoded string
                const rewardsRaw = `${rewardPrefix}:${chk}:${level.dailyNumber}:3:${rewards.makeChestReward('chest1')}`;
                const rewardsEncoded = utils.xorCipher(Buffer.from(rewardsRaw, 'utf8'), '59182').toString('base64url');
                const rewardsChk = utils.generateGJP2(rewardsEncoded, 'pC26fpYaQCtg');

                return res.send(`${level.dailyNumber}|10|${responsePrefix}${rewardsEncoded}|${rewardsChk}`);
            }
        } catch (error) {
            console.error('\x1b[1;31m✗ [getGJDailyLevel] request failed:\x1b[0m', error);
            if (!res.headersSent) res.send('-1');
        }
    }
};
