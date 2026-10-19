const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const threadUtils = require('../../threadUtils');

module.exports = {
    method: 'post',
    path: '/getGJThreadMessages.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const auth = threadUtils.authenticate(req.body);
        const threadID = threadUtils.parseInteger(req.body?.threadID);
        const beforeID = threadUtils.parseInteger(req.body?.beforeID);
        const afterID = threadUtils.parseInteger(req.body?.afterID);
        const aroundID = threadUtils.parseInteger(req.body?.aroundID);

        // sanity checks
        if (!auth || !threadID) return res.send('-1');

        try {
            let access = threadUtils.getThreadAccess(threadID, auth.accountID);
            if (!access || access.hidden || (access.status === 0 && !access.isDM)) return res.send('-1');
            if (access.isDM && access.status === 0 && access.ownerID !== auth.accountID) {
                db.transaction(() => {
                    db.prepare('UPDATE thread_members SET status = 1, joinedAt = ?, ignoredInvite = 0 WHERE threadID = ? AND accountID = ?')
                        .run(Math.floor(Date.now() / 1000), threadID, auth.accountID);
                    db.prepare('UPDATE thread_members SET status = 0, joinedAt = 0 WHERE threadID = ? AND accountID = ? AND status = 1')
                        .run(threadID, access.ownerID);
                })();
                access.status = 1;
            }

            const historyCursor = access.clearedBeforeID || 0;
            const lastVisibleMessageID = access.status === 2
                ? access.removedAtMessageID
                : Number.MAX_SAFE_INTEGER;
            let messages;
            if (aroundID) {
                messages = db.prepare(`
                    SELECT * FROM thread_messages
                    WHERE threadID = ? AND messageID > ? AND messageID <= ?
                    ORDER BY ABS(messageID - ?), messageID
                    LIMIT ?
                `).all(threadID, historyCursor, lastVisibleMessageID, aroundID, threadUtils.MESSAGE_PAGE_SIZE)
                    .sort((left, right) => left.messageID - right.messageID);
            } else if (afterID) {
                messages = db.prepare(`
                    SELECT * FROM thread_messages
                    WHERE threadID = ? AND messageID > ? AND messageID > ? AND messageID <= ?
                    ORDER BY messageID ASC LIMIT ?
                `).all(threadID, historyCursor, afterID, lastVisibleMessageID, threadUtils.MESSAGE_PAGE_SIZE);
                if (messages.length === 0 && access.status !== 2) return res.send('none');
            } else {
                const cursor = beforeID || Number.MAX_SAFE_INTEGER;
                messages = db.prepare(`
                    SELECT * FROM thread_messages
                    WHERE threadID = ? AND messageID > ? AND messageID < ? AND messageID <= ?
                    ORDER BY messageID DESC LIMIT ?
                `).all(threadID, historyCursor, cursor, lastVisibleMessageID, threadUtils.MESSAGE_PAGE_SIZE).reverse();
            }

            const members = db.prepare('SELECT accountID, joinedAt FROM thread_members WHERE threadID = ? AND status = 1 ORDER BY joinedAt, accountID').all(threadID);
            const formerMembers = db.prepare('SELECT accountID FROM thread_members WHERE threadID = ? AND status = 2 ORDER BY joinedAt, accountID').all(threadID);
            const invites = access.isDM
                ? []
                : db.prepare('SELECT accountID, invitedBy, invitedAt FROM thread_members WHERE threadID = ? AND status = 0 ORDER BY invitedAt, accountID').all(threadID);
            const memberString = members.map(member => threadUtils.serializeUser(threadUtils.getThreadProfile(member.accountID), member.joinedAt)).filter(Boolean).join('|');
            const formerString = formerMembers.map(member => threadUtils.serializeFormerUser(threadUtils.getThreadProfile(member.accountID))).filter(Boolean).join('|');
            const inviteString = invites.map(threadUtils.serializeInvite).filter(Boolean).join('|');
            const memberCount = members.length;
            const metadata = threadUtils.serializeMetadata(access, memberCount, auth.accountID);
            const messageString = messages.length ? messages.map(threadUtils.serializeMessage).join('|') : 'none';

            if ((access.status === 1 || access.isDM) && messages.length) {
                db.prepare('UPDATE thread_members SET lastReadMessageID = MAX(lastReadMessageID, ?) WHERE threadID = ? AND accountID = ?')
                    .run(messages[messages.length - 1].messageID, threadID, auth.accountID);
            }

            const removedAtMessageID = access.status === 2 ? access.removedAtMessageID : 0;
            return res.send(`${messageString}#${memberString || 'none'}#${formerString || 'none'}#${inviteString || 'none'}#${metadata}#${removedAtMessageID}#3,1,10,50`);
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to get thread messages:\x1b[0m', err);
            return res.send('-1');
        }
    }
};