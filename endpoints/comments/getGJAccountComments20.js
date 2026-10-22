const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

module.exports = {
    method: 'post',
    path: '/getGJAccountComments20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        let rawAccountID = req.body?.targetAccountID ?? req.body?.accountid ?? req.body?.accountID;
        const rawPage = req.body?.page ?? req.body?.p ?? req.body?.pageNumber;
        const rawRequestAccountID = req.body?.accountID;
        const gjp2 = utils.remove(req.body?.gjp2 || '');
        const hasSeparateTarget = req.body?.targetAccountID != null || req.body?.accountid != null;
        
        if (Array.isArray(rawAccountID)) {
            rawAccountID = rawAccountID[rawAccountID.length - 1];
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
                    c.isSpam,
                    c.userName,
                    c.accountID AS commentAccountID,
                    p.icon,
                    p.color1,
                    p.color2,
                    p.iconType,
                    p.special,
                    p.accountID
                FROM acccomments c
                LEFT JOIN profiles p ON p.accountID = c.accountID
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
                const commentAccountID = comment.commentAccountID || 0;
                commentString += `2~${comment.comment}~3~${commentAccountID + 1}~4~${comment.likes}~5~0~7~${comment.isSpam}~9~${uploadDate}~6~${comment.commentID}~15~${comment.timestamp}`;

                if (friendshipQuery) {
                    let areFriends = friendshipCache.get(commentAccountID);
                    if (areFriends === undefined) {
                        areFriends = commentAccountID !== parsedRequestAccountID && Boolean(friendshipQuery.get(
                            parsedRequestAccountID, commentAccountID, parsedRequestAccountID, commentAccountID
                        ));
                        friendshipCache.set(commentAccountID, areFriends);
                    }
                    commentString += `~13~${areFriends ? 1 : 0}`;
                }

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