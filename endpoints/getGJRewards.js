const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

const chestConfig = {
    chest1wait: Number(process.env.CHEST1_WAIT || 14400),
    chest2wait: Number(process.env.CHEST2_WAIT || 86400),
    chest1minOrbs: Number(process.env.CHEST1_MIN_ORBS || 20),
    chest1maxOrbs: Number(process.env.CHEST1_MAX_ORBS || 100),
    chest1minDiamonds: Number(process.env.CHEST1_MIN_DIAMONDS || 1),
    chest1maxDiamonds: Number(process.env.CHEST1_MAX_DIAMONDS || 3),
    chest1minKeys: Number(process.env.CHEST1_MIN_KEYS || 1),
    chest1maxKeys: Number(process.env.CHEST1_MAX_KEYS || 3),
    chest2minOrbs: Number(process.env.CHEST2_MIN_ORBS || 100),
    chest2maxOrbs: Number(process.env.CHEST2_MAX_ORBS || 200),
    chest2minDiamonds: Number(process.env.CHEST2_MIN_DIAMONDS || 5),
    chest2maxDiamonds: Number(process.env.CHEST2_MAX_DIAMONDS || 10),
    chest2minKeys: Number(process.env.CHEST2_MIN_KEYS || 1),
    chest2maxKeys: Number(process.env.CHEST2_MAX_KEYS || 3)
};

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeChestReward(prefix) {
    const items = [1, 2, 3, 4, 5, 6];
    return [
        randomBetween(chestConfig[`${prefix}minOrbs`], chestConfig[`${prefix}maxOrbs`]),
        randomBetween(chestConfig[`${prefix}minDiamonds`], chestConfig[`${prefix}maxDiamonds`]),
        items[Math.floor(Math.random() * items.length)],
        randomBetween(chestConfig[`${prefix}minKeys`], chestConfig[`${prefix}maxKeys`])
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
        const accountID = parseInt(utils.number(req.body?.accountID || ''), 10) || 0;
        const uuid = parseInt(utils.number(req.body?.uuid || ''), 10) || 0;
        const rewardType = parseInt(utils.number(req.body?.rewardType || '0'), 10) || 0;
        const udid = utils.remove(req.body?.udid || '');
        const gjp2 = utils.remove(req.body?.gjp2 || '');

        if (/^\d+$/.test(udid) || (!accountID && !uuid && !udid)) return res.send('-1');
        if (accountID) {
            const account = db.prepare('SELECT accountID, gjp2, isDisabled FROM accounts WHERE accountID = ?').get(accountID);
            if (!account || account.isDisabled === 1 || (gjp2 && account.gjp2 !== gjp2)) return res.send('-1');
        }

        const profileID = accountID || (uuid > 1 ? uuid - 1 : 0);
        const profile = profileID ? db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(profileID) : null;
        if (accountID && !profile) return res.send('-1');

        const currentTime = Math.floor(Date.now() / 1000) + 100;
        let chest1time = profile?.chest1time || 0;
        let chest1count = profile?.chest1count || 0;
        let chest2time = profile?.chest2time || 0;
        let chest2count = profile?.chest2count || 0;
        let chest1left = Math.max(0, chestConfig.chest1wait - (currentTime - chest1time));
        let chest2left = Math.max(0, chestConfig.chest2wait - (currentTime - chest2time));

        if (rewardType === 1 || rewardType === 2) {
            if (!profile || (rewardType === 1 ? chest1left : chest2left) !== 0) return res.send('-1');
            if (rewardType === 1) {
                chest1count++;
                chest1time = currentTime;
                chest1left = chestConfig.chest1wait;
                db.prepare('UPDATE profiles SET chest1count = ?, chest1time = ? WHERE accountID = ?').run(chest1count, chest1time, profileID);
            } else {
                chest2count++;
                chest2time = currentTime;
                chest2left = chestConfig.chest2wait;
                db.prepare('UPDATE profiles SET chest2count = ?, chest2time = ? WHERE accountID = ?').run(chest2count, chest2time, profileID);
            }
        }

        const decodedChk = decodeCheck(req.body?.chk || '');
        const responsePrefix = 'PrStn';
        const response = `${responsePrefix}:${profileID}:${decodedChk}:${udid}:${accountID}:${chest1left}:${makeChestReward('chest1')}:${chest1count}:${chest2left}:${makeChestReward('chest2')}:${chest2count}:${rewardType}`;
        const encoded = utils.xorCipher(Buffer.from(response, 'utf8'), '59182').toString('base64')
            .replace(/\//g, '_').replace(/\+/g, '-');
        res.send(`${responsePrefix}${encoded}|${utils.genSolo4(encoded)}`);
    }
};

module.exports.makeChestReward = makeChestReward;
