const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');
const config = require('../../config');

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeChestReward(chest) {
    const items = [1, 2, 3, 4, 5, 6];
    return [
        randomBetween(chest.minOrbs, chest.maxOrbs),
        randomBetween(chest.minDiamonds, chest.maxDiamonds),
        items[Math.floor(Math.random() * items.length)],
        randomBetween(chest.minKeys, chest.maxKeys)
    ].join(',');
}

function decodeCheck(value) {
    if (!value || value.length <= 5) return '';

    const encoded = value.slice(5).replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4);
    return utils.xorCipher(Buffer.from(padded, 'base64'), '59182').toString('utf8');
}

module.exports = {
    method: 'post',
    path: '/getGJRewards.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const parseDefaultZero = value => value == null || value === '' ? 0 : parseInt(utils.number(value), 10);
        const accountID = parseDefaultZero(req.body?.accountID);
        const uuid = parseDefaultZero(req.body?.uuid);
        const rewardType = parseDefaultZero(req.body?.rewardType);
        const udid = utils.remove(req.body?.udid || '');
        const gjp2 = utils.remove(req.body?.gjp2 || '');

        if (![accountID, uuid, rewardType].every(Number.isInteger)) return res.send('-1');
        if (/^\d+$/.test(udid) || (!accountID && !uuid && !udid)) return res.send('-1');
        if (accountID) {
            const account = db.prepare('SELECT accountID, gjp2, isDisabled FROM accounts WHERE accountID = ?').get(accountID);
            if (!account || account.isDisabled === 1 || !gjp2 || account.gjp2 !== gjp2) return res.send('-1');
        }

        const profileID = accountID || (uuid > 1 ? uuid - 1 : 0);
        const profile = accountID ? db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(accountID) : null;
        if (accountID && !profile) return res.send('-1');

        const currentTime = Math.floor(Date.now() / 1000) + 100;
        let chest1time = profile?.chest1time || 0;
        let chest1count = profile?.chest1count || 0;
        let chest2time = profile?.chest2time || 0;
        let chest2count = profile?.chest2count || 0;
        let chest1left = Math.max(0, config.rewards.chest1.wait - (currentTime - chest1time));
        let chest2left = Math.max(0, config.rewards.chest2.wait - (currentTime - chest2time));

        if (rewardType === 1 || rewardType === 2) {
            if (profile && (rewardType === 1 ? chest1left : chest2left) !== 0) return res.send('-1');
            if (rewardType === 1) {
                chest1count++;
                chest1time = currentTime;
                chest1left = config.rewards.chest1.wait;
                if (profile) db.prepare('UPDATE profiles SET chest1count = ?, chest1time = ? WHERE accountID = ?').run(chest1count, chest1time, accountID);
            } else {
                chest2count++;
                chest2time = currentTime;
                chest2left = config.rewards.chest2.wait;
                if (profile) db.prepare('UPDATE profiles SET chest2count = ?, chest2time = ? WHERE accountID = ?').run(chest2count, chest2time, accountID);
            }
        }

        const decodedChk = decodeCheck(req.body?.chk || '');
        const responsePrefix = 'PrStn';
        const response = `${responsePrefix}:${profileID}:${decodedChk}:${udid}:${accountID}:${chest1left}:${makeChestReward(config.rewards.chest1)}:${chest1count}:${chest2left}:${makeChestReward(config.rewards.chest2)}:${chest2count}:${rewardType}`;
        const encoded = utils.xorCipher(Buffer.from(response, 'utf8'), '59182').toString('base64')
            .replace(/\//g, '_').replace(/\+/g, '-');
        res.send(`${responsePrefix}${encoded}|${utils.genSolo4(encoded)}`);
    }
};

module.exports.makeChestReward = makeChestReward;
