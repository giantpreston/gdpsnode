const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const threadUtils = require('../../threadUtils');

const MEMBER_ERROR = '##P##t=R3JvdXAgQ2hhdA==:b=WW91IGFyZSBubyBsb25nZXIgaW4gdGhpcyBncm91cCBjaGF0Lg==##P##-5';
const EMPTY_GROUP_ERROR = '##P##t=RW1wdHkgR3JvdXAgQ2hhdA==:b=Tm9ib2R5IGVsc2UgaXMgaGVyZSB5ZXQuCllvdSBjYW4gY2hhdCBvbmNlIHNvbWVvbmUgPGNnPmpvaW5zPC9jPi4=##P##-1';

function getThreadIDForDM(accountID, targetAccountID) {
    const existing = db.prepare(`
        SELECT t.threadID
        FROM threads t
        JOIN thread_members sender ON sender.threadID = t.threadID AND sender.accountID = ? AND sender.status = 1
        JOIN thread_members recipient ON recipient.threadID = t.threadID AND recipient.accountID = ? AND recipient.status = 1
        WHERE t.isDM = 1
    `).get(accountID, targetAccountID);
    return existing?.threadID || 0;
}

module.exports = {
    method: 'post',
    path: '/sendGJThreadMessage.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const auth = threadUtils.authenticate(req.body);
        const threadID = threadUtils.parseInteger(req.body?.threadID);
        const isDM = threadUtils.parseInteger(req.body?.isDM) === 1;
        const body = threadUtils.decode(req.body?.body, true);

        // sanity checks
        if (!auth || body === null || (!body.trim() && (threadID || isDM)) || Buffer.byteLength(body, 'utf8') > 4000) return res.send('-1');

        try {
            const outcome = db.transaction(() => {
                let currentThreadID = threadID;
                let invitedCount = 0;
                let messageID = 0;
                let newThread = false;

                if (!currentThreadID) {
                    if (isDM) {
                        const targetAccountID = threadUtils.parseInteger(req.body?.toAccountID);
                        if (!targetAccountID || targetAccountID === auth.accountID) return null;
                        currentThreadID = getThreadIDForDM(auth.accountID, targetAccountID);
                        if (!currentThreadID && !threadUtils.canStartDM(auth.accountID, targetAccountID)) return null;
                        if (!currentThreadID) {
                            const timestamp = Math.floor(Date.now() / 1000);
                            const recipientProfile = threadUtils.getProfile(targetAccountID);
                            const messageRequest = recipientProfile.mS === 0 && !threadUtils.isFriend(auth.accountID, targetAccountID);
                            const created = db.prepare(`
                                INSERT INTO threads (isDM, ownerID, createdAt, updatedAt)
                                VALUES (1, ?, ?, ?)
                            `).run(auth.accountID, timestamp, timestamp);
                            currentThreadID = Number(created.lastInsertRowid);
                            db.prepare(`
                                INSERT INTO thread_members (threadID, accountID, status, invitedBy, invitedAt, joinedAt)
                                VALUES (?, ?, 1, 0, 0, ?), (?, ?, ?, ?, ?, ?)
                            `).run(currentThreadID, auth.accountID, timestamp, currentThreadID, targetAccountID, messageRequest ? 0 : 1, messageRequest ? auth.accountID : 0, messageRequest ? timestamp : 0, messageRequest ? 0 : timestamp);
                            newThread = true;
                        }
                    } else {
                        const title = threadUtils.decode(req.body?.subject || '', true);
                        const description = threadUtils.decode(req.body?.description || '', true);
                        const emote = threadUtils.decode(req.body?.emote || '', true);
                        const targetsValue = threadUtils.decode(req.body?.targets || '', true);
                        if (title === null || description === null || emote === null || targetsValue === null || !title.trim() || title.length > 64 || description.length > 500) return null;
                        const targets = [...new Set(targetsValue.split(',').map(value => threadUtils.parseInteger(value)).filter(Boolean))]
                            .filter(targetAccountID => targetAccountID !== auth.accountID);
                        if (!targets.length || targets.length > 50 || targets.some(targetAccountID => !threadUtils.canInvite(auth.accountID, targetAccountID))) return null;

                        const timestamp = Math.floor(Date.now() / 1000);
                        const created = db.prepare(`
                            INSERT INTO threads (title, description, emote, ownerID, createdAt, updatedAt)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `).run(title, description, emote, auth.accountID, timestamp, timestamp);
                        currentThreadID = Number(created.lastInsertRowid);
                        db.prepare(`
                            INSERT INTO thread_members (threadID, accountID, status, joinedAt)
                            VALUES (?, ?, 1, ?)
                        `).run(currentThreadID, auth.accountID, timestamp);
                        for (const targetAccountID of targets) {
                            db.prepare(`
                                INSERT INTO thread_members (threadID, accountID, status, invitedBy, invitedAt)
                                VALUES (?, ?, 0, ?, ?)
                            `).run(currentThreadID, targetAccountID, auth.accountID, timestamp);
                            messageID = threadUtils.addSystemMessage(currentThreadID, 6, auth.accountID, targetAccountID).messageID;
                        }
                        invitedCount = targets.length;
                        newThread = true;
                    }
                } else {
                    const access = threadUtils.getThreadAccess(currentThreadID, auth.accountID);
                    if (!access || access.hidden) return { removed: true };
                    if (access.status !== 1) {
                        if (!access.isDM || access.status !== 0 || !body.trim()) return null;
                        db.prepare('UPDATE thread_members SET status = 1, joinedAt = ? WHERE threadID = ? AND accountID = ?')
                            .run(Math.floor(Date.now() / 1000), currentThreadID, auth.accountID);
                    }
                    if (access.locked && auth.accountID !== access.ownerID && auth.account.modLevel < 1) return null;
                    if (access.isDM && access.status === 1) {
                        const recipient = db.prepare(`
                            SELECT accountID FROM thread_members
                            WHERE threadID = ? AND status IN (0, 1) AND accountID != ?
                        `).get(currentThreadID, auth.accountID);
                        if (!recipient) return null;
                        const recipientMember = db.prepare('SELECT status FROM thread_members WHERE threadID = ? AND accountID = ?').get(currentThreadID, recipient.accountID);
                        if (recipientMember.status === 1 && !threadUtils.canStartDM(auth.accountID, recipient.accountID)) return null;
                    }
                }

                if (body.trim()) {
                    const thread = db.prepare('SELECT isDM FROM threads WHERE threadID = ?').get(currentThreadID);
                    if (thread && !thread.isDM) {
                        const memberCount = db.prepare('SELECT COUNT(*) AS count FROM thread_members WHERE threadID = ? AND status = 1').get(currentThreadID).count;
                        if (memberCount <= 1) return { emptyGroup: true };
                    }

                    const sentRecently = db.prepare(`
                        SELECT COUNT(*) AS count FROM thread_messages
                        WHERE accountID = ? AND timestamp > ?
                    `).get(auth.accountID, Math.floor(Date.now() / 1000) - 60).count;
                    if (sentRecently >= 20) return null;

                    messageID = threadUtils.addMessage(currentThreadID, auth.accountID, req.body.body).messageID;
                }
                return { threadID: currentThreadID, messageID, invitedCount, isDM, newThread };
            })();

            if (outcome?.removed) return res.send(MEMBER_ERROR);
            if (outcome?.emptyGroup) return res.send(EMPTY_GROUP_ERROR);
            if (!outcome) return res.send('-1');
            if (outcome.newThread && outcome.isDM) return res.send(`${outcome.threadID}:${outcome.messageID}:0`);
            if (outcome.newThread) return res.send(`${outcome.threadID}:${outcome.messageID}:${outcome.invitedCount}:0`);
            return res.send(`${outcome.threadID}:${outcome.messageID}`);
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to send thread message:\x1b[0m', err);
            return res.send('-1');
        }
    }
};