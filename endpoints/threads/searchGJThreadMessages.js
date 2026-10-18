const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const threadUtils = require('../../threadUtils');

module.exports = {
    method: 'post',
    path: '/searchGJThreadMessages.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const auth = threadUtils.authenticate(req.body);
        const threadID = threadUtils.parseInteger(req.body?.threadID);
        const beforeID = threadUtils.parseInteger(req.body?.beforeID);
        const query = threadUtils.decode(req.body?.query);

        // sanity checks
        if (!auth || !threadID || query === null || !query.trim()) return res.send('-1');

        try {
            const access = threadUtils.getThreadAccess(threadID, auth.accountID);
            if (!access || access.hidden || (access.status === 0 && !access.isDM)) return res.send('-1');
            const records = db.prepare(`
                SELECT * FROM thread_messages
                WHERE threadID = ? AND (? = 0 OR messageID < ?)
                ORDER BY messageID DESC
            `).all(threadID, beforeID, beforeID);
            const matching = records.filter(message => {
                if (message.isSystem) return false;
                const content = Buffer.from(message.content, 'base64').toString('utf8');
                return content.toLocaleLowerCase().includes(query.toLocaleLowerCase());
            });
            const page = matching.slice(0, threadUtils.MESSAGE_PAGE_SIZE);
            const pagesLeft = Math.ceil(Math.max(0, matching.length - page.length) / threadUtils.MESSAGE_PAGE_SIZE);
            const messageString = page.length ? page.map(threadUtils.serializeMessage).join('|') : 'none';
            return res.send(`${messageString}#${pagesLeft}`);
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to search thread messages:\x1b[0m', err);
            return res.send('-1');
        }
    }
};