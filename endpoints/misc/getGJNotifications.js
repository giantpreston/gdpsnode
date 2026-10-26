const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

module.exports = {
    method: 'post',
    path: '/getGJNotifications.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const rawMask = req.body?.mask;
        const rawPage = req.body?.page;
        const rawTotal = req.body?.total;
        const mask = rawMask == null || rawMask === '' ? 65535 : parseInt(utils.number(rawMask), 10);
        const page = rawPage == null || rawPage === '' ? 0 : parseInt(utils.number(rawPage), 10);
        const parsedTotal = rawTotal == null || rawTotal === '' ? 10 : parseInt(utils.number(rawTotal), 10);
        const total = parsedTotal === 0 ? 10 : parsedTotal;

        // sanity checks
        if (!accountID || !gjp2 || gjp2.length !== 40) return res.send('-1');
        if (![mask, page, total].every(Number.isSafeInteger) || mask < 0 || mask > 65535 || page < 0 || total < 0) return res.send('-1');
        const offset = page * total;
        if (!Number.isSafeInteger(offset)) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT gjp2 FROM accounts WHERE accountID = ?').get(accountID);
        if (!account || account.gjp2 !== gjp2) return res.send('-1');

        const where = `
            n.toAccountID = ?
            AND (n.notificationMask = 0 OR (n.notificationMask & ?) != 0)
            AND (
                COALESCE((SELECT l.accountID FROM levels l WHERE l.levelID = n.levelID), n.accountID) = ?
                OR NOT EXISTS (
                    SELECT 1 FROM mutes m
                    WHERE m.person1 = ?
                        AND (m.person2 = n.accountID OR m.person2 = (
                            SELECT l.accountID FROM levels l WHERE l.levelID = n.levelID
                        ))
                )
            )
        `;

        try {
            const count = db.prepare(`SELECT COUNT(*) AS count FROM notifications n WHERE ${where}`)
                .get(accountID, mask, accountID, accountID).count;
            const notifications = db.prepare(`
                SELECT n.*,
                    CASE
                        WHEN n.accountID = n.toAccountID OR EXISTS (
                            SELECT 1 FROM levels l
                            WHERE l.levelID = n.levelID AND l.accountID = n.toAccountID
                        ) THEN 0
                        ELSE n.accountID
                    END AS displayAccountID
                FROM notifications n
                WHERE ${where}
                ORDER BY n.notificationID DESC
                LIMIT ? OFFSET ?
            `).all(accountID, mask, accountID, accountID, total, offset);

            if (notifications.length > 0) {
                const notificationIDs = notifications.map(notification => notification.notificationID);
                db.prepare(`
                    UPDATE notifications
                    SET isNew = 0
                    WHERE toAccountID = ? AND isNew = 1
                        AND notificationID IN (${notificationIDs.map(() => '?').join(',')})
                `).run(accountID, ...notificationIDs);
                for (const notification of notifications) notification.isNew = 0;
            }

            const notificationString = notifications.map(notification => {
                const age = notification.createdAt > 0
                    ? utils.getRelative(notification.createdAt)
                    : notification.age;
                return `1:${notification.notificationID}:2:${notification.type}:3:${notification.emoteIcon}:4:${notification.title}:5:${notification.description}:6:${age}:7:${notification.isNew}:8:${notification.hasLevel}:9:${notification.levelID}:10:${notification.achievement}:11:0:12:0:13:${notification.hasChest}:14:${notification.chestType}:15:${notification.displayAccountID}:16:${notification.username}`;
            }).join('|');

            return res.send(`${notificationString}#${count}:${offset}:${total}`);
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to get notifications:\x1b[0m', err);
            return res.send('-1');
        }
    }
};