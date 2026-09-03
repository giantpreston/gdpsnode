const { commonSecret } = require('../middleware/secrets');
const utils = require('../utils');
const db = require('../database');

module.exports = {
    method: 'post',
    path: '/getGJCommentHistory.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        let accountID = parseInt(utils.number(req.body?.userID), 10);
        accountID = accountID - 1;
        const page = parseInt(utils.number(req.body?.mode), 10);
        const mode = parseInt(utils.number(req.body?.mode), 10);

        // sanity checks
        if (page < 0) return res.send('-1');
        if (mode < 0 || mode > 1) return res.send('-1');

        // db checks
        const lvcm = db.prepare('SELECT * FROM comments WHERE accountID = ?').get(accountID);

        if (!lvcm) return res.send('-1');

        const offset = page * 30;
        const orderBy = mode === 0 ? 'commentID' : 'likes';

        try {
            const query = `
                SELECT 
                    c.commentID,
                    c.levelID,
                    c.timestamp,
                    c.comment,
                    c.likes,
                    c.isSpam,
                    c.percent,
                    p.userName,
                    p.icon,
                    p.color1,
                    p.color2,
                    p.iconType,
                    p.special,
                    p.accountID,
                    p.modLevel
                FROM comments c
                LEFT JOIN profiles p ON p.accountID = c.accountID
                WHERE c.accountID = ?
                ORDER BY c.${orderBy} DESC
                LIMIT ? OFFSET ?
            `;

            const comments = db.prepare(query).all(accountID, 30, offset);
            const countQuery = db.prepare('SELECT COUNT(*) as total FROM comments WHERE accountID = ?');
            const totalCount = Number(countQuery.get(accountID).total || 0);

            let commentString = '';
            let userString = '';
            const users = [];

            for (const comment of comments) {
                const uploadDate = utils.getRelative(comment.timestamp);
                const accountID = comment.accountID || 0;
                commentString += `1~${comment.levelID}~2~${comment.comment}~3~${accountID + 1}~4~${comment.likes}~5~0~7~${comment.isSpam}~9~${uploadDate}~6~${comment.commentID}~10~${comment.percent}`;

                if (comment.userName) {
                    const modLevel = comment.modLevel || 0;
                    let colorString = '';

                    if (modLevel === 1) {
                        colorString = '~12~200,255,200';
                    } else if (modLevel === 2) {
                        colorString = '~12~75,255,75';
                    }

                    commentString += `~11~${modLevel}${colorString}:1~${comment.userName}~7~1~9~${comment.icon}~10~${comment.color1}~11~${comment.color2}~14~${comment.iconType}~15~${comment.special}~16~${accountID}`;
                } else if (!users.includes(comment.accountID + 1)) {
                    users.push(comment.accountID + 1);
                    userString += `${comment.accountID + 1}:${comment.userName}:${accountID}|`;
                }

                commentString += '|';
            }
            commentString = commentString.slice(0, -1);

            let response = commentString;

            userString = userString.slice(0, -1);
            response += `#${userString}`;

            response += `#${totalCount}:${offset}:${comments.length}`;

            return res.send(response);
        } catch (error) {
            console.error('\x1b[1;31m✗ Error fetching comments:\x1b[0m', error);
            return res.send('-1');
        }
    }
};