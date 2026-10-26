const { commonSecret } = require('../../middleware/secrets');
const utils = require('../../utils');
const db = require('../../database');

const FOLLOWER_MILESTONES = [1, 10, 100, 1000];

module.exports = {
    method: 'post',
    path: '/followGJUser.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const targetAccountID = parseInt(utils.number(req.body?.targetAccountID), 10);
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);

        // sanity checks
        if (!targetAccountID || !accountID || !gjp2) return res.send('-1');
        if (targetAccountID === accountID) return res.send('-1'); // thats.. not how it works buddy..
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const check = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        const check2 = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(targetAccountID);

        if (!check || !check2) return res.send('-1'); // one of the two accounts don't exist
        if (check.gjp2 !== gjp2) return res.send('-1'); // auth failure
        if (check.isDisabled === 1 || check2.isDisabled === 1) return res.send('-1'); // disabled!

        // set logic!!!
        const inf = db.prepare('INSERT OR IGNORE INTO follows (person1, person2, timestamp) VALUES (?, ?, ?)').run(accountID, targetAccountID, Math.floor(Date.now() / 1000));
        if (inf.changes > 0) {
            const followerCount = db.prepare('SELECT COUNT(*) AS count FROM follows WHERE person2 = ?').get(targetAccountID).count;
            if (FOLLOWER_MILESTONES.includes(followerCount)) {
                utils.notifAdd({
                    toAccountID: targetAccountID,
                    notificationMask: 16,
                    type: 13,
                    emoteIcon: 'party',
                    title: followerCount === 1 ? 'First Follower!' : `${followerCount.toLocaleString()} Followers!`,
                    description: followerCount === 1
                        ? 'Someone is now <cy>following</c> you!'
                        : `Your profile has reached <cy>${followerCount.toLocaleString()}</c> followers!`,
                    achievement: followerCount === 1 ? 'geometry.ach.follower01' : ''
                });
            }
            return res.send('1');
        }

        return res.send('-1'); // fallback value if for whatever reason we reach this line
    }
};