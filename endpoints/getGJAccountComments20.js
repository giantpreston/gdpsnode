const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/getGJAccountComments20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        let rawAccountID = req.body?.accountID ?? req.body?.targetAccountID ?? req.body?.accountid;
        const rawPage = req.body?.page ?? req.body?.p ?? req.body?.pageNumber;
        
        if (Array.isArray(rawAccountID)) {
            rawAccountID = rawAccountID[rawAccountID.length - 1];
        }
        
        const parsedAccountID = Number(String(rawAccountID ?? '').replace(/[^0-9-]/g, ''));
        const parsedPage = Number(String(rawPage ?? '').replace(/[^0-9-]/g, ''));

        const accountID = Number.isInteger(parsedAccountID) && parsedAccountID > 0 ? parsedAccountID : NaN;
        const page = Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;

        if (!Number.isInteger(accountID) || !Number.isFinite(accountID) || accountID < 1) {
            return res.send('-1');
        }

        // db checks
        const account = db.prepare('SELECT accountID FROM accounts WHERE accountID = ?').get(accountID);
        const acccomments = db.prepare('SELECT * FROM acccomments WHERE accountID = ?').get(accountID);

        if (!account) return res.send('-1');
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

            let commentString = '';

            for (const comment of comments) {
                const uploadDate = utils.getRelative(comment.timestamp);
                commentString += `2~${comment.comment}~3~${comment.accountID + 1}~4~${comment.likes}~5~0~7~${comment.isSpam}~9~${uploadDate}~6~${comment.commentID}`;

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