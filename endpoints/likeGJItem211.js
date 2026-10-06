const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/likeGJItem211.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const itemID = parseInt(utils.number(req.body?.itemID), 10);
        const type = parseInt(utils.number(req.body?.type), 10);
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        let like = parseInt(utils.number(req.body?.like), 10);

        // sanity checks
        if (like === null || like === undefined) like = 1;
        if (!itemID || !type) return res.send('-1');
        if (!accountID || !gjp2) return res.send('1'); // unauthenticated users never really increment counters, but regardless get 1.
        if (itemID < 0 || type < 1 || type > 4 || like < 0 || like > 1) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);

        if (!account) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');

        let table;
        let content;
        let column;
        switch (type) {
            case 1:
                table = "levels";
                content = "likes_levels";
                column = "levelID";
                break;
            case 2:
                table = "comments";
                content = "likes_comments";
                column = "commentID";
                break;
            case 3:
                table = "acccomments";
                content = "likes_acccomments";
                column = "commentID";
                break;
            case 4:
                table = "lists";
                content = "likes_lists";
                column = "listID";
                break;
        }

        try {
            const result = db.transaction(() => {
                const existingIncrement = db.prepare('SELECT 1 FROM content_increments WHERE accountID = ? AND contentID = ? AND contentType = ?').get(accountID, itemID, content);
                if (existingIncrement) return true;

                const operation = like === 1 ? '+' : '-';
                const updated = db.prepare(`UPDATE ${table} SET likes = likes ${operation} 1 WHERE ${column} = ?`).run(itemID);
                if (updated.changes === 0) return false;
                db.prepare('INSERT INTO content_increments (accountID, contentID, contentType) VALUES (?, ?, ?)').run(accountID, itemID, content);
                return true;
            })();
            // isSpam bit write
            if (type === 2) db.prepare('UPDATE comments SET isSpam = CASE WHEN likes < -3 THEN 1 ELSE 0 END WHERE commentID = ? AND isSpam != (likes < -3)').run(itemID);

            if (result) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to change likes:\x1b[0m', err);
        }
        return res.send('-1');
    }
};