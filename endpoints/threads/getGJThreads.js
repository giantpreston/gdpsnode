const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const threadUtils = require('../../threadUtils');

module.exports = {
    method: 'post',
    path: '/getGJThreads.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const auth = threadUtils.authenticate(req.body);
        const page = threadUtils.parseInteger(req.body?.page);
        const filter = threadUtils.parseInteger(req.body?.filter);
        const offset = page * threadUtils.PAGE_SIZE;

        // sanity checks
        if (!auth || page < 0 || ![0, 1, 2].includes(filter)) return res.send('-1');
        if (!Number.isSafeInteger(offset)) return res.send('-1');

        try {
            const members = db.prepare(`
                SELECT t.*, m.status, m.lastReadMessageID, m.clearedBeforeID, m.removedAtMessageID, m.muted, m.pinned
                FROM threads t
                JOIN thread_members m ON m.threadID = t.threadID
                WHERE m.accountID = ?
                    AND (m.status = 1 OR (t.isDM = 1 AND m.status = 0) OR (t.isDM = 0 AND m.status = 2))
                    AND m.hidden = 0
                    AND (? = 0 OR (? = 1 AND t.isDM = 1) OR (? = 2 AND t.isDM = 0))
                ORDER BY t.updatedAt DESC, t.threadID DESC
            `).all(auth.accountID, filter, filter, filter);
            const userIDs = typeof req.body?.user === 'string'
                ? req.body.user.split(',').map(value => threadUtils.parseInteger(value)).filter(Boolean)
                : [];
            const filtered = members.filter(thread => {
                if (!userIDs.length) return true;
                const activeMembers = db.prepare('SELECT accountID FROM thread_members WHERE threadID = ? AND status = 1').all(thread.threadID).map(member => member.accountID);
                return userIDs.every(accountID => activeMembers.includes(accountID));
            });
            const total = filtered.length;
            const invites = db.prepare('SELECT COUNT(*) AS count FROM thread_members WHERE accountID = ? AND status = 0 AND ignoredInvite = 0').get(auth.accountID).count;
            const threads = filtered.slice(offset, offset + threadUtils.PAGE_SIZE)
                .map(thread => threadUtils.serializeThread(thread, auth.accountID));

            return res.send(`${threads.length ? threads.join('|') : 'none'}#${total}:${offset}:${threadUtils.PAGE_SIZE}:${invites}:60`);
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to get threads:\x1b[0m', err);
            return res.send('-1');
        }
    }
};