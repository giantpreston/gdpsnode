const { commonSecret } = require('../../middleware/secrets');
const utils = require('../../utils');
const db = require('../../database');

function optionalInteger(value, fallback) {
    if (value == null || value === '') return fallback;
    const sanitized = utils.number(value);
    return sanitized === '' ? NaN : Number(sanitized);
}

module.exports = {
    method: 'post',
    path: '/getGJComments21.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const rawLevelID = String(req.body?.levelID ?? '').trim();
        const cType = req.body?.cType == null || req.body.cType === ''
            ? 0
            : parseInt(utils.number(req.body.cType), 10);
        const rawPage = optionalInteger(req.body?.page, 0);
        const rawMode = optionalInteger(req.body?.mode, 0);
        const rawCount = optionalInteger(req.body?.count, 10);

        const levelID = /^-?\d+$/.test(rawLevelID) ? parseInt(rawLevelID, 10) : NaN;
        if (![rawPage, rawMode, rawCount, cType].every(Number.isInteger)) return res.send('-1');
        const page = rawPage >= 0 ? rawPage : 0;
        const mode = rawMode >= 0 && rawMode <= 1 ? rawMode : 0;
        const count = rawCount > 0 ? rawCount : 10;

        // sanity checks
        const isEditorPackComment = cType === 6;
        if (!Number.isInteger(levelID) || !Number.isFinite(levelID) || levelID === 0 || (isEditorPackComment && levelID < 0)) return res.send('-1');
        if (count > 30) return res.send('-1');

        // db checks
        let target;
        let lvcm;
        if (isEditorPackComment) {
            target = db.prepare('SELECT 1 FROM editor_sounds WHERE soundID = ?').get(levelID);
            lvcm = db.prepare('SELECT 1 FROM editorpackcomments WHERE editorpackID = ?').get(levelID);
        } else {
            const level = db.prepare('SELECT 1 FROM levels WHERE levelID = ?').get(levelID);
            const list = db.prepare('SELECT 1 FROM lists WHERE listID = ?').get(Math.abs(levelID));
            target = levelID > 0 ? level : list;
            lvcm = db.prepare('SELECT 1 FROM comments WHERE levelID = ?').get(levelID);
        }

        if (!target) return res.send('-1');
        if (!lvcm) return res.send('-2');

        const offset = page * count;
        const orderBy = mode === 0 ? 'commentID' : 'likes';

        try {
            const commentTable = isEditorPackComment ? 'editorpackcomments' : 'comments';
            const targetColumn = isEditorPackComment ? 'editorpackID' : 'levelID';
            const percentColumn = isEditorPackComment ? '0 AS percent' : 'c.percent';
            const query = `
                SELECT 
                    c.commentID,
                    c.accountID AS commentAccountID,
                    c.timestamp,
                    c.comment,
                    c.likes,
                    c.isSpam,
                    ${percentColumn},
                    p.userName,
                    p.icon,
                    p.color1,
                    p.color2,
                    p.iconType,
                    p.special,
                    p.accountID AS profileAccountID,
                    p.modLevel
                FROM ${commentTable} c
                LEFT JOIN profiles p ON p.accountID = c.accountID
                WHERE c.${targetColumn} = ?
                ORDER BY c.${orderBy} DESC
                LIMIT ? OFFSET ?
            `;

            const comments = db.prepare(query).all(levelID, count, offset);
            const countQuery = db.prepare(`SELECT COUNT(*) as total FROM ${commentTable} WHERE ${targetColumn} = ?`);
            const totalCount = Number(countQuery.get(levelID).total || 0);

            let commentString = '';
            let userString = '';
            const users = [];

            for (const comment of comments) {
                const uploadDate = utils.getRelative(comment.timestamp);
                const accountID = comment.commentAccountID || 0;
                commentString += `2~${comment.comment}~3~${accountID + 1}~4~${comment.likes}~5~0~7~${comment.isSpam}~9~${uploadDate}~6~${comment.commentID}~10~${comment.percent}~15~${comment.timestamp}`;

                if (comment.userName) {
                    const modLevel = comment.modLevel || 0;
                    let colorString = '';

                    if (modLevel === 1) {
                        colorString = '~12~200,255,200';
                    } else if (modLevel === 2) {
                        colorString = '~12~75,255,75';
                    }

                    commentString += `~11~${modLevel}${colorString}:1~${comment.userName}~7~1~9~${comment.icon}~10~${comment.color1}~11~${comment.color2}~14~${comment.iconType}~15~${comment.special}~16~${accountID}`;
                } else if (!users.includes(accountID + 1)) {
                    users.push(accountID + 1);
                    userString += `${accountID + 1}:${comment.userName}:${accountID}|`;
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

// this has to have been my most confusing yet somehow easy endpoint so far.
// but hey, if it works..