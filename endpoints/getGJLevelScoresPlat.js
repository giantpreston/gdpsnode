const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

function integer(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const sanitized = utils.number(value);
    if (sanitized === '') return null;
    return Number.parseInt(sanitized, 10);
}

function scoreValue(value) {
    if (value === undefined || value === null || value === '') return 0;
    const parsed = integer(value);
    return parsed === null || parsed < 0 ? null : parsed;
}

module.exports = {
    method: 'post',
    path: '/getGJLevelScoresPlat.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const body = req.body || {};
        const accountID = integer(body.accountID);
        const levelID = integer(body.levelID);
        const gjp2 = utils.remove(body.gjp2 || '');
        const time = scoreValue(body.time);
        const points = scoreValue(body.points);
        const mode = body.mode === undefined || body.mode === '' ? 0 : integer(body.mode, -1);
        const type = body.type === undefined || body.type === '' ? 1 : integer(body.type, -1);
        const timestamp = Math.floor(Date.now() / 1000);

        if (!accountID || !levelID || !gjp2 || gjp2.length !== 40) return res.send('-1');
        if (time === null || points === null || mode === null || type === null) return res.send('-1');
        if (![0, 1].includes(mode) || ![0, 1, 2].includes(type)) return res.send('-1');

        const account = db.prepare('SELECT isDisabled FROM accounts WHERE accountID = ? AND gjp2 = ?').get(accountID, gjp2);
        const level = db.prepare('SELECT levelID FROM levels WHERE levelID = ? AND levelLength = 5').get(levelID);
        if (!account || account.isDisabled === 1 || !level) return res.send('-1');

        const scoreColumn = mode === 1 ? 'points' : 'time';
        const scoreOrder = mode === 1 ? 'DESC' : 'ASC';
        const existingScore = db.prepare('SELECT time, points FROM platscores WHERE accountID = ? AND levelID = ?').get(accountID, levelID);

        if (!existingScore) {
            if (time > 0) {
                db.prepare('INSERT INTO platscores (accountID, levelID, time, points, timestamp) VALUES (?, ?, ?, ?, ?)').run(accountID, levelID, time, points, timestamp);
            }
        } else {
            const improvesScore = mode === 1 ? existingScore.points < points : existingScore.time > time;
            if (improvesScore && time > 0) {
                db.prepare(`UPDATE platscores SET ${scoreColumn} = ?, timestamp = ? WHERE accountID = ? AND levelID = ?`).run(mode === 1 ? points : time, timestamp, accountID, levelID);
            }
        }

        let query = `
            SELECT s.*, p.userName, p.icon, p.color1, p.color2, p.color3, p.iconType, p.special, a.isDisabled
            FROM platscores s
            JOIN profiles p ON p.accountID = s.accountID
            JOIN accounts a ON a.accountID = s.accountID
            WHERE s.levelID = ? AND s.time > 0
        `;
        const parameters = [levelID];

        if (type === 0) {
            query += ` AND (s.accountID = ? OR s.accountID IN (
                SELECT CASE WHEN person1 = ? THEN person2 ELSE person1 END
                FROM friendships WHERE person1 = ? OR person2 = ?
            ))`;
            parameters.push(accountID, accountID, accountID, accountID);
        } else if (type === 2) {
            query += ' AND s.timestamp > ?';
            parameters.push(timestamp - 604800);
        }

        query += ` ORDER BY s.${scoreColumn} ${scoreOrder}`;
        const scores = db.prepare(query).all(...parameters);
        if (scores.length === 0) return res.send('-1');

        let rank = 0;
        const response = scores.filter(score => score.isDisabled === 0).map((score) => {
            rank += 1;
            const formattedDate = utils.getRelative(score.timestamp);
            return `1:${score.userName}:2:${score.accountID + 1}:9:${score.icon}:10:${score.color1}:11:${score.color2}:14:${score.iconType}:15:${score.special}:16:${score.accountID}:3:${score[scoreColumn]}:6:${rank}:42:${formattedDate}|`;
        }).join('');

        return res.send(response ? response.slice(0, -1) : '-1');
    }
};