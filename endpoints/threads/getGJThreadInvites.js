const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');
const threadUtils = require('../../threadUtils');

module.exports = {
    method: 'post',
    path: '/getGJThreadInvites.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const auth = threadUtils.authenticate(req.body);

        // sanity checks
        if (!auth) return res.send('-1');

        try {
            const invites = db.prepare(`
                SELECT t.*, m.invitedBy, m.invitedAt, m.ignoredInvite, m.muted
                FROM thread_members m
                JOIN threads t ON t.threadID = m.threadID
                WHERE m.accountID = ? AND m.status = 0 AND t.isDM = 0
                ORDER BY m.invitedAt DESC, t.threadID DESC
            `).all(auth.accountID);
            const inviteObjects = invites.map(invite => {
                const inviter = db.prepare('SELECT userName FROM accounts WHERE accountID = ?').get(invite.invitedBy);
                if (!inviter) return '';
                const lastMessage = threadUtils.getLatestMessage(invite.threadID);
                const inviterProfile = threadUtils.getProfile(invite.invitedBy);
                return [
                    invite.threadID,
                    invite.invitedBy,
                    threadUtils.encode(inviter.userName),
                    threadUtils.encode(invite.title),
                    16,
                    utils.getRelative(invite.invitedAt),
                    utils.getRelative(lastMessage?.timestamp || invite.createdAt),
                    '',
                    threadUtils.encode(invite.description),
                    0,
                    invite.muted,
                    0,
                    invite.ignoredInvite,
                    inviterProfile?.icon || 0,
                    inviterProfile?.color1 || 0,
                    inviterProfile?.color2 || 0,
                    inviterProfile?.color3 || 0,
                    inviterProfile?.iconType || 0,
                    inviterProfile?.special || 0,
                    invite.emote,
                    invite.invitedAt,
                    ...threadUtils.getIconLoadout(inviterProfile)
                ].join(':');
            }).filter(Boolean);

            return res.send(inviteObjects.length ? inviteObjects.join('|') : 'none');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to get thread invites:\x1b[0m', err);
            return res.send('-1');
        }
    }
};