const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

module.exports = {
    method: 'post',
    path: '/getGJAccountComments20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const rawAccountIDs = req.body?.accountID;
        let rawAccountID = req.body?.targetAccountID ?? req.body?.accountid ?? rawAccountIDs;
        const rawPage = req.body?.page ?? req.body?.p ?? req.body?.pageNumber;
        let rawRequestAccountID = rawAccountIDs;
        const gjp2 = utils.remove(req.body?.gjp2 || '');
        const hasSeparateTarget = req.body?.targetAccountID != null || req.body?.accountid != null;
        
        if (Array.isArray(rawAccountID)) {
            rawAccountID = rawAccountID[rawAccountID.length - 1];
        }
        if (Array.isArray(rawRequestAccountID)) {
            rawRequestAccountID = rawRequestAccountID[0];
        }
        
        const parsedAccountID = Number(String(rawAccountID ?? '').replace(/[^0-9-]/g, ''));
        const parsedRequestAccountID = (!hasSeparateTarget && !gjp2) || rawRequestAccountID == null || rawRequestAccountID === ''
            ? 0
            : parseInt(utils.number(rawRequestAccountID), 10);
        const sanitizedPage = String(rawPage ?? '').replace(/[^0-9-]/g, '');
        const parsedPage = rawPage == null || rawPage === '' ? 0 : sanitizedPage === '' ? NaN : Number(sanitizedPage);

        const accountID = Number.isInteger(parsedAccountID) && parsedAccountID > 0 ? parsedAccountID : NaN;
        if (!Number.isInteger(parsedPage)) return res.send('-1');
        if (!Number.isInteger(parsedRequestAccountID) || parsedRequestAccountID < 0) return res.send('-1');
        const page = parsedPage >= 0 ? parsedPage : 0;

        if (!Number.isInteger(accountID) || !Number.isFinite(accountID) || accountID < 1) {
            return res.send('-1');
        }

        // db checks
        const account = db.prepare('SELECT accountID FROM accounts WHERE accountID = ?').get(accountID);
        const acccomments = db.prepare('SELECT * FROM acccomments WHERE accountID = ?').get(accountID);

        if (!account) return res.send('-1');
        if (parsedRequestAccountID) {
            const requestAccount = db.prepare('SELECT gjp2, isDisabled FROM accounts WHERE accountID = ?').get(parsedRequestAccountID);
            if (!requestAccount || requestAccount.gjp2 !== gjp2 || requestAccount.isDisabled === 1) return res.send('-1');
        }
        if (!acccomments) return res.send('#0:0:10');
        
        const offset = page * 10;

        try {
            const query = `
                SELECT
                    c.commentID,
                    c.timestamp,
                    c.comment,
                    c.likes,
                    c.accountID AS commentAccountID
                FROM acccomments c
                WHERE c.accountID = ?
                ORDER BY c.timestamp DESC
                LIMIT ? OFFSET ?
            `;

            const comments = db.prepare(query).all(accountID, 10, offset);
            const countQuery = db.prepare('SELECT COUNT(*) as total FROM acccomments WHERE accountID = ?');
            const totalCount = Number(countQuery.get(accountID).total || 0);
            const friendshipQuery = parsedRequestAccountID
                ? db.prepare('SELECT 1 FROM friendships WHERE (person1 = ? AND person2 = ?) OR (person2 = ? AND person1 = ?)')
                : null;
            const friendshipCache = new Map();

            let commentString = '';

            for (const comment of comments) {
                const uploadDate = utils.getRelative(comment.timestamp);
                commentString += `2~${comment.comment}~4~${comment.likes}~5~0~9~${uploadDate}~6~${comment.commentID}`;

                commentString += `~15~${comment.timestamp}`;
                commentString += '|';
            }

            commentString.slice(0, -1);
            let response = commentString;

            response += `#${totalCount}:${offset}:${comments.length}`;

            return res.send(response);
        } catch (err) {
            console.error('\x1b[1;31m✗ Error fetching account comments:\x1b[0m', err);
        }
        return res.send('-1');
    }
};