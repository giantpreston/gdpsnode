const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const threadUtils = require('../../threadUtils');

module.exports = {
    method: 'post',
    path: '/getGJThreadMembers.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const auth = threadUtils.authenticate(req.body);
        const threadID = threadUtils.parseInteger(req.body?.threadID);

        // sanity checks
        if (!auth || !threadID) return res.send('-1');

        try {
            const access = threadUtils.getThreadAccess(threadID, auth.accountID);
            if (!access || access.hidden) return res.send('-1');

            const members = db.prepare('SELECT accountID, joinedAt FROM thread_members WHERE threadID = ? AND status = 1 ORDER BY joinedAt, accountID').all(threadID);
            const formerMembers = db.prepare('SELECT accountID FROM thread_members WHERE threadID = ? AND status = 2 ORDER BY joinedAt, accountID').all(threadID);
            const invites = db.prepare('SELECT accountID, invitedBy, invitedAt FROM thread_members WHERE threadID = ? AND status = 0 ORDER BY invitedAt, accountID').all(threadID);
            const serialize = (items, formatter) => items.map(item => formatter(item)).filter(Boolean).join('|');
            const memberString = serialize(members, member => threadUtils.serializeUser(threadUtils.getProfile(member.accountID), member.joinedAt));
            const formerString = serialize(formerMembers, member => threadUtils.serializeFormerUser(threadUtils.getProfile(member.accountID)));
            const inviteString = serialize(invites, threadUtils.serializeInvite);

            return res.send(`${memberString || 'none'}#${formerString || 'none'}#${inviteString || 'none'}`);
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to get thread members:\x1b[0m', err);
            return res.send('-1');
        }
    }
};