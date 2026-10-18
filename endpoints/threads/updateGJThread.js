const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const threadUtils = require('../../threadUtils');

module.exports = {
    method: 'post',
    path: '/updateGJThread.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const auth = threadUtils.authenticate(req.body);
        const threadID = threadUtils.parseInteger(req.body?.threadID);
        const mode = threadUtils.parseInteger(req.body?.mode, -1);
        const value = threadUtils.decode(req.body?.value || '', true);

        // sanity checks
        if (!auth || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18].includes(mode)) return res.send('-1');
        if (mode !== 3 && !threadID) return res.send('-1');
        if (value === null) return res.send('-1');

        try {
            const success = db.transaction(() => {
                if (mode === 3) {
                    const ids = value.split(',').map(item => threadUtils.parseInteger(item)).filter(Boolean);
                    for (const currentThreadID of ids) {
                        const access = threadUtils.getThreadAccess(currentThreadID, auth.accountID);
                        if (!access || access.status !== 1) continue;
                        const lastMessage = threadUtils.getLatestMessage(currentThreadID);
                        db.prepare('UPDATE thread_members SET lastReadMessageID = ? WHERE threadID = ? AND accountID = ?')
                            .run(lastMessage?.messageID || 0, currentThreadID, auth.accountID);
                    }
                    return ids.length > 0;
                }

                const access = threadUtils.getThreadAccess(threadID, auth.accountID);
                if (!access || access.hidden) return false;
                const owner = access.ownerID === auth.accountID;
                const moderator = auth.account.modLevel > 0;
                const latestMessage = threadUtils.getLatestMessage(threadID);

                if (mode === 1) {
                    db.prepare('UPDATE thread_members SET clearedBeforeID = ?, lastReadMessageID = ? WHERE threadID = ? AND accountID = ?')
                        .run(latestMessage?.messageID || 0, latestMessage?.messageID || 0, threadID, auth.accountID);
                    return true;
                }

                if (mode === 2) {
                    const title = value.trim();
                    if (access.isDM || !owner || !title || title.length > 64) return false;
                    db.prepare('UPDATE threads SET title = ? WHERE threadID = ?').run(title, threadID);
                    threadUtils.addSystemMessage(threadID, 8, auth.accountID);
                    return true;
                }

                if (mode === 4) {
                    if (access.isDM || access.status !== 1 || access.locked || (access.invitePermission === 1 && !owner && !moderator)) return false;
                    const rawTargets = value.split(',');
                    if (!value || rawTargets.some(target => !/^\d+$/.test(target))) return false;
                    const targets = [...new Set(rawTargets.map(Number))].filter(targetAccountID => targetAccountID !== auth.accountID);
                    if (!targets.length || targets.some(targetAccountID => !Number.isSafeInteger(targetAccountID) || targetAccountID <= 0 || !threadUtils.canInvite(auth.accountID, targetAccountID))) return false;

                    const timestamp = Math.floor(Date.now() / 1000);
                    const invitedAccountIDs = [];
                    for (const targetAccountID of targets) {
                        const existing = db.prepare('SELECT status FROM thread_members WHERE threadID = ? AND accountID = ?').get(threadID, targetAccountID);
                        if (existing && existing.status !== 2) continue;
                        db.prepare(`
                            INSERT INTO thread_members (threadID, accountID, status, invitedBy, invitedAt, joinedAt, lastReadMessageID, clearedBeforeID, removedAtMessageID, ignoredInvite, muted, pinned, hidden)
                            VALUES (?, ?, 0, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0)
                            ON CONFLICT(threadID, accountID) DO UPDATE SET
                                status = 0, invitedBy = excluded.invitedBy, invitedAt = excluded.invitedAt,
                                removedAtMessageID = 0, ignoredInvite = 0, hidden = 0
                        `).run(threadID, targetAccountID, auth.accountID, timestamp);
                        threadUtils.addSystemMessage(threadID, 6, auth.accountID, targetAccountID);
                        invitedAccountIDs.push(targetAccountID);
                    }
                    return invitedAccountIDs.length ? `:${invitedAccountIDs.join(':')}:` : false;
                }

                if (mode === 5) {
                    if (access.status !== 1) return false;
                    const timestamp = Math.floor(Date.now() / 1000);
                    db.prepare('UPDATE thread_members SET status = 2, removedAtMessageID = ?, hidden = 0 WHERE threadID = ? AND accountID = ?')
                        .run(latestMessage?.messageID || 0, threadID, auth.accountID);
                    const remainingMembers = db.prepare('SELECT COUNT(*) AS count FROM thread_members WHERE threadID = ? AND status = 1').get(threadID).count;
                    if (!access.isDM && remainingMembers === 0) {
                        db.prepare('DELETE FROM thread_messages WHERE threadID = ?').run(threadID);
                        db.prepare('DELETE FROM thread_members WHERE threadID = ?').run(threadID);
                        db.prepare('DELETE FROM threads WHERE threadID = ?').run(threadID);
                        return true;
                    }
                    threadUtils.addSystemMessage(threadID, 3, auth.accountID);
                    if (owner) {
                        const nextOwner = db.prepare(`
                            SELECT accountID FROM thread_members
                            WHERE threadID = ? AND status = 1
                            ORDER BY joinedAt, accountID LIMIT 1
                        `).get(threadID);
                        if (nextOwner) {
                            db.prepare('UPDATE threads SET ownerID = ?, updatedAt = ? WHERE threadID = ?').run(nextOwner.accountID, timestamp, threadID);
                            threadUtils.addSystemMessage(threadID, 5, 0, nextOwner.accountID);
                        } else {
                            db.prepare('UPDATE threads SET ownerID = ?, locked = 1 WHERE threadID = ?').run(0, threadID);
                        }
                    }
                    return true;
                }

                if (mode === 6) {
                    const targetAccountID = threadUtils.parseInteger(value);
                    const target = db.prepare('SELECT status FROM thread_members WHERE threadID = ? AND accountID = ?').get(threadID, targetAccountID);
                    if (access.isDM || access.status !== 1 || !target || target.status !== 1 || targetAccountID === auth.accountID || (!owner && !moderator)) return false;
                    db.prepare('UPDATE thread_members SET status = 2, removedAtMessageID = ?, hidden = 0 WHERE threadID = ? AND accountID = ?')
                        .run(latestMessage?.messageID || 0, threadID, targetAccountID);
                    threadUtils.addSystemMessage(threadID, 4, auth.accountID, targetAccountID);
                    return true;
                }

                if (mode === 7) {
                    const targetAccountID = threadUtils.parseInteger(value);
                    const target = db.prepare('SELECT status FROM thread_members WHERE threadID = ? AND accountID = ?').get(threadID, targetAccountID);
                    if (access.isDM || !owner || !target || target.status !== 1 || targetAccountID === auth.accountID) return false;
                    db.prepare('UPDATE threads SET ownerID = ? WHERE threadID = ?').run(targetAccountID, threadID);
                    threadUtils.addSystemMessage(threadID, 5, auth.accountID, targetAccountID);
                    return true;
                }

                if (mode === 8) {
                    if (access.status !== 0) return false;
                    const timestamp = Math.floor(Date.now() / 1000);
                    db.prepare('UPDATE thread_members SET status = 1, joinedAt = ?, ignoredInvite = 0, hidden = 0 WHERE threadID = ? AND accountID = ?')
                        .run(timestamp, threadID, auth.accountID);
                    if (access.isDM) return true;
                    threadUtils.addSystemMessage(threadID, 2, access.invitedBy, auth.accountID);
                    return true;
                }

                if (mode === 9) {
                    if (access.status !== 0) return false;
                    db.prepare('UPDATE thread_members SET ignoredInvite = 1, hidden = ? WHERE threadID = ? AND accountID = ?')
                        .run(access.isDM ? 1 : 0, threadID, auth.accountID);
                    return true;
                }

                if (mode === 10) {
                    if (access.status !== 1 || !['0', '1'].includes(value)) return false;
                    db.prepare('UPDATE thread_members SET muted = ? WHERE threadID = ? AND accountID = ?').run(Number(value), threadID, auth.accountID);
                    return true;
                }

                if (mode === 11) {
                    const targetAccountID = threadUtils.parseInteger(value);
                    const target = db.prepare('SELECT status, invitedBy FROM thread_members WHERE threadID = ? AND accountID = ?').get(threadID, targetAccountID);
                    if (access.isDM || !target || target.status !== 0 || (!owner && target.invitedBy !== auth.accountID && !moderator)) return false;
                    db.prepare('DELETE FROM thread_members WHERE threadID = ? AND accountID = ?').run(threadID, targetAccountID);
                    db.prepare('UPDATE threads SET updatedAt = ?, mv = mv + 1 WHERE threadID = ?').run(Math.floor(Date.now() / 1000), threadID);
                    return true;
                }

                if (mode === 12) {
                    const messageID = threadUtils.parseInteger(value);
                    const message = db.prepare('SELECT accountID FROM thread_messages WHERE messageID = ? AND threadID = ?').get(messageID, threadID);
                    if (!message || (!owner && !moderator && message.accountID !== auth.accountID)) return false;
                    const deleted = db.prepare('DELETE FROM thread_messages WHERE messageID = ? AND threadID = ?').run(messageID, threadID);
                    if (deleted.changes !== 1) return false;
                    db.prepare('UPDATE threads SET updatedAt = ?, mv = mv + 1 WHERE threadID = ?').run(Math.floor(Date.now() / 1000), threadID);
                    return true;
                }

                if (mode === 13) {
                    if (access.isDM || !owner || !['0', '1'].includes(value)) return false;
                    db.prepare('UPDATE threads SET invitePermission = ?, updatedAt = ?, mv = mv + 1 WHERE threadID = ?')
                        .run(Number(value), Math.floor(Date.now() / 1000), threadID);
                    return true;
                }

                if (mode === 14) {
                    if (access.isDM || !owner || value.length > 500) return false;
                    db.prepare('UPDATE threads SET description = ? WHERE threadID = ?').run(value, threadID);
                    threadUtils.addSystemMessage(threadID, 7, auth.accountID);
                    return true;
                }

                if (mode === 15) {
                    if (access.status !== 1 || !['0', '1'].includes(value)) return false;
                    db.prepare('UPDATE thread_members SET pinned = ? WHERE threadID = ? AND accountID = ?').run(Number(value), threadID, auth.accountID);
                    return true;
                }

                if (mode === 16) {
                    if (access.isDM || !owner || value.length > 64) return false;
                    db.prepare('UPDATE threads SET emote = ?, updatedAt = ?, mv = mv + 1 WHERE threadID = ?')
                        .run(value, Math.floor(Date.now() / 1000), threadID);
                    return true;
                }

                if (mode === 18) {
                    if (access.status !== 2) return false;
                    db.prepare('UPDATE thread_members SET hidden = 1 WHERE threadID = ? AND accountID = ?').run(threadID, auth.accountID);
                    return true;
                }

                return false;
            })();

            if (mode === 4) return res.send(typeof success === 'string' ? success : '-1');
            return res.send(success ? '1' : '-1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to update thread:\x1b[0m', err);
            return res.send('-1');
        }
    }
};