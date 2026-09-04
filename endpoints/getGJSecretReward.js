const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

function decodeCheck(value) {
    const sanitized = utils.charclean(value || '');
    if (sanitized.length <= 5) return null;

    try {
        const encoded = sanitized.slice(5).replace(/-/g, '+').replace(/_/g, '/');
        const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4);
        return utils.xorCipher(Buffer.from(padded, 'base64'), '59182').toString('utf8');
    } catch {
        return null;
    }
}

module.exports = {
    method: 'post',
    path: '/getGJSecretReward.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const body = req.body || {};
        const accountID = Number.parseInt(utils.number(body.accountID), 10) || 0;
        const gjp2 = utils.remove(body.gjp2 || '');
        const rewardKey = utils.charclean(body.rewardKey || '');
        const decodedCheck = decodeCheck(body.chk);
        const now = Math.floor(Date.now() / 1000);

        if (!accountID || !gjp2 || gjp2.length !== 40 || !rewardKey || decodedCheck === null) return res.send('-1');

        const account = db.prepare('SELECT accountID, isDisabled FROM accounts WHERE accountID = ? AND gjp2 = ?').get(accountID, gjp2);
        if (!account || account.isDisabled === 1) return res.send('-1');

        const encodedKey = Buffer.from(rewardKey, 'utf8').toString('base64');
        const reward = db.prepare('SELECT * FROM secret_rewards WHERE code = ?').get(encodedKey);
        if (!reward || reward.uses === 0 || (reward.duration !== 0 && reward.createdAt + reward.duration <= now)) return res.send('-1');

        const redeemed = db.prepare(`SELECT 1 FROM content_increments
            WHERE accountID = ? AND contentID = ? AND contentType = ?`).get(accountID, reward.rewardID, 'secret_reward');
        if (redeemed) return res.send('-1');

        const transaction = db.transaction(() => {
            const redemption = db.prepare(`INSERT OR IGNORE INTO content_increments (accountID, contentID, contentType)
                VALUES (?, ?, ?)`).run(accountID, reward.rewardID, 'secret_reward');
            if (!redemption.changes) throw new Error('Reward already redeemed');

            if (reward.uses > 0) {
                const result = db.prepare('UPDATE secret_rewards SET uses = uses - 1 WHERE rewardID = ? AND uses > 0').run(reward.rewardID);
                if (!result.changes) throw new Error('Reward is exhausted');
            }
        });

        try {
            transaction();
        } catch {
            return res.send('-1');
        }

        const responseRewards = `${reward.rewards},8,0`;
        const rewardCount = responseRewards.split(',').length / 2;
        const chestType = rewardCount > 1 ? 2 : 1;
        const payload = `PrStn:${decodedCheck}:${reward.rewardID}:${chestType}:${responseRewards}`;
        const encoded = utils.xorCipher(Buffer.from(payload, 'utf8'), '59182').toString('base64url');
        return res.send(`PrStn${encoded}|${utils.genSolo4(encoded)}`);
    }
};