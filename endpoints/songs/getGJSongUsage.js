const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

module.exports = {
    method: 'post',
    path: '/getGJSongUsage.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const songID = parseInt(utils.number(req.body?.songID), 10);

        // sanity checks
        if (!songID) return res.send('-1');

        // db stuff!
        const song = db.prepare('SELECT * FROM songs WHERE ID = ?').get(songID);
        if (!song || !song.isAllowedForUse) return res.send('-1');

        const usage = db.prepare(`
            SELECT COUNT(*) AS total,
                SUM(CASE WHEN starStars > 0 THEN 1 ELSE 0 END) AS rated,
                SUM(CASE WHEN starStars > 0 THEN downloads ELSE 0 END) AS downloads
            FROM levels
            WHERE songID = ?
        `).get(songID);

        const groupings = db.prepare(`
            SELECT rating, difficulty, COUNT(*) AS amount
            FROM (
                SELECT
                    CASE
                        WHEN starEpic = 3 THEN 4
                        WHEN starEpic = 2 THEN 3
                        WHEN starEpic = 1 THEN 2
                        WHEN featured = 1 THEN 1
                        ELSE 0
                    END AS rating,
                    CASE
                        WHEN starAuto = 1 THEN 0
                        WHEN starDemon = 1 THEN 6
                        ELSE starDifficulty
                    END AS difficulty
                FROM levels
                WHERE songID = ? AND starStars > 0
            )
            GROUP BY rating, difficulty
            ORDER BY rating, difficulty
        `).all(songID);

        const groupingString = groupings
            .map(group => `${group.rating}:${group.difficulty}:${group.amount}`)
            .join('|');

        return res.send(`${usage.total},${usage.rated || 0},${usage.downloads || 0}#${groupingString}`);
    }
};