const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/getGJUserInfo20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const targetAccountID = parseInt(utils.number(req.body?.targetAccountID), 10);
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2 || '');

        // sanity checks
        if (!targetAccountID) return res.send('-1');

        // db checks
        const targetProfile = db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(targetAccountID);
        const targetAccount = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(targetAccountID);

        if (!targetProfile || !targetAccount) return res.send('-1');
        if (targetAccount.isDisabled === 1) return res.send('-1');

        // check block status
        if (accountID) {
            const isBlocked = db.prepare('SELECT ID FROM blocks WHERE (person1 = ? AND person2 = ?) OR (person2 = ? AND person1 = ?)').get(targetAccountID, accountID, targetAccountID, accountID);
            if (isBlocked) return res.send('-1');

            const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
            if (!account || account.gjp2 !== gjp2) return res.send('-1');
        }
        const accSettings = db.prepare('SELECT youtubeurl, twitter, twitch, discord, instagram, tiktok, custom, frS, mS, cS FROM profiles WHERE accountID = ?').get(targetAccountID);

        const higherStarCount = db.prepare('SELECT COUNT(*) as count FROM profiles WHERE stars > ? AND accountID IN (SELECT accountID FROM accounts WHERE isDisabled = 0)').get(targetProfile.stars);
        let rank = targetAccount.isDisabled === 1 ? 0 : (higherStarCount.count + 1);

        let appendix = '';
        let friendstate = 0;

        if (accountID && accountID === targetAccountID) {
            const friendRequestCount = db.prepare('SELECT COUNT(*) as count FROM friendreqs WHERE toAccountID = ?').get(targetAccountID);
            const newMessageCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE toAccountID = ? AND isNew = 1').get(targetAccountID);
            const newFriendshipCount = db.prepare('SELECT COUNT(*) as count FROM friendships WHERE (person1 = ? AND isNew2 = 1) OR (person2 = ? AND isNew1 = 1)').get(targetAccountID, targetAccountID);

            appendix = `:38:${newMessageCount.count}:39:${friendRequestCount.count}:40:${newFriendshipCount.count}`;
        } else if (accountID) {
            const incomingRequest = db.prepare('SELECT ID, comment, uploadDate FROM friendreqs WHERE accountID = ? AND toAccountID = ?').get(targetAccountID, accountID);
            if (incomingRequest) {
                friendstate = 3;
                appendix = `:32:${incomingRequest.ID}:35:${incomingRequest.comment}:37:${utils.getRelative(incomingRequest.uploadDate)}`;
            } else {
                const outgoingRequest = db.prepare('SELECT COUNT(*) as count FROM friendreqs WHERE toAccountID = ? AND accountID = ?').get(targetAccountID, accountID);
                if (outgoingRequest.count > 0) {
                    friendstate = 4;
                } else {
                    const areFriends = db.prepare('SELECT COUNT(*) as count FROM friendships WHERE (person1 = ? AND person2 = ?) OR (person2 = ? AND person1 = ?)').get(accountID, targetAccountID, accountID, targetAccountID);
                    if (areFriends.count > 0) {
                        friendstate = 1;
                    }
                }
            }
        }
        const response = `1:${targetProfile.userName}:2:${targetAccountID + 1}:13:${targetProfile.coins}:17:${targetProfile.userCoins}:10:${targetProfile.color1}:11:${targetProfile.color2}:51:${targetProfile.color3}:3:${targetProfile.stars}:46:${targetProfile.diamonds}:52:${targetProfile.moons}:4:${targetProfile.demons}:8:${Math.round(targetProfile.creatorPoints)}:18:${accSettings.mS}:19:${accSettings.frS}:50:${accSettings.cS}:20:${accSettings.youtubeurl}:21:${targetProfile.accIcon}:22:${targetProfile.accShip}:23:${targetProfile.accBall}:24:${targetProfile.accBird}:25:${targetProfile.accDart}:26:${targetProfile.accRobot}:28:${targetProfile.accGlow}:43:${targetProfile.accSpider}:48:${targetProfile.accExplosion}:53:${targetProfile.accSwing}:54:${targetProfile.accJetpack}:30:${rank}:16:${targetAccountID}:31:${friendstate}:44:${accSettings.twitter}:45:${accSettings.twitch}:49:${targetProfile.modLevel}:55:${targetProfile.dinfo}:56:${targetProfile.sinfo}:57:${targetProfile.pinfo}:58:${accSettings.discord}:59:${accSettings.instagram}:60:${accSettings.tiktok}:61:${accSettings.custom}${appendix}:29:1`;

        return res.send(response);
    }
};

// woo!!