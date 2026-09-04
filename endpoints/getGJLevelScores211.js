const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

function integer(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const sanitized = utils.number(value);
    if (sanitized === '') return null;
    return Number.parseInt(sanitized, 10);
}

function offsetInteger(value, offset) {
    if (value === undefined || value === '') return 0;
    const sanitized = utils.number(value);
    if (sanitized === '') return null;
    return Number.parseInt(sanitized, 10) - offset;
}

function decodeProgresses(value) {
    if (!value) return '';
    if (!utils.isURLBase64(String(value))) return null;

    try {
        const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
        return utils.xorCipher(Buffer.from(base64, 'base64'), '41274').toString('utf8');
    } catch {
        return '';
    }
}

module.exports = {
    method: 'post',
    path: '/getGJLevelScores211.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const body = req.body || {};
        const accountID = integer(body.accountID);
        const gjp2 = utils.remove(body.gjp2 || '');
        const levelID = integer(body.levelID);
        const percent = integer(body.percent);
        const dailyID = integer(body.s10);
        const type = body.type === undefined || body.type === '' ? 1 : integer(body.type, -1);
        const uploadDate = Math.floor(Date.now() / 1000);

        if (!accountID || !gjp2 || !levelID || percent === null || percent < 0 || percent > 100) return res.send('-1');
        if (dailyID === null || gjp2.length !== 40 || ![0, 1, 2].includes(type) || dailyID < 0) return res.send('-1');

        const account = db.prepare('SELECT isDisabled FROM accounts WHERE accountID = ? AND gjp2 = ?').get(accountID, gjp2);
        const level = db.prepare('SELECT levelID FROM levels WHERE levelID = ?').get(levelID);
        if (!account || account.isDisabled === 1 || !level) return res.send('-1');

        const attempts = offsetInteger(body.s1, 8354);
        const clicks = offsetInteger(body.s2, 3991);
        const time = offsetInteger(body.s3, 4085);
        const coins = offsetInteger(body.s9, 5819);
        const progresses = decodeProgresses(body.s6);
        if (attempts === null || clicks === null || time === null || coins === null || progresses === null) return res.send('-1');
        if (attempts < 0 || clicks < 0 || time < 0 || coins < 0 || coins > 3) return res.send('-1');
        const dailyCondition = dailyID > 0 ? '> 0' : '= 0';

        const existingScore = db.prepare(`SELECT percent FROM levelscores WHERE accountID = ? AND levelID = ? AND dailyID ${dailyCondition}`).get(accountID, levelID);
        if (!existingScore) {
            db.prepare(`
                INSERT INTO levelscores
                    (accountID, levelID, percent, uploadDate, coins, attempts, clicks, time, progresses, dailyID)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(accountID, levelID, percent, uploadDate, coins, attempts, clicks, time, progresses, dailyID);
        } else if (existingScore.percent <= percent) {
            db.prepare(`
                UPDATE levelscores
                SET percent = ?, uploadDate = ?, coins = ?, attempts = ?, clicks = ?, time = ?, progresses = ?, dailyID = ?
                WHERE accountID = ? AND levelID = ? AND dailyID ${dailyCondition}
            `).run(percent, uploadDate, coins, attempts, clicks, time, progresses, dailyID, accountID, levelID);
        }

        let scores;
        if (type === 0) {
            scores = db.prepare(`
                SELECT s.*, p.userName, p.icon, p.color1, p.color2, p.color3, p.iconType, p.special, a.isDisabled
                FROM levelscores s
                JOIN profiles p ON p.accountID = s.accountID
                JOIN accounts a ON a.accountID = s.accountID
                WHERE s.dailyID ${dailyCondition} AND s.levelID = ?
                  AND (s.accountID = ? OR s.accountID IN (
                      SELECT CASE WHEN person1 = ? THEN person2 ELSE person1 END
                      FROM friendships WHERE person1 = ? OR person2 = ?
                  ))
                ORDER BY s.percent DESC
            `).all(levelID, accountID, accountID, accountID, accountID);
        } else {
            let query = `
                SELECT s.*, p.userName, p.icon, p.color1, p.color2, p.color3, p.iconType, p.special, a.isDisabled
                FROM levelscores s
                JOIN profiles p ON p.accountID = s.accountID
                JOIN accounts a ON a.accountID = s.accountID
                WHERE s.dailyID ${dailyCondition} AND s.levelID = ?
            `;
            const parameters = [levelID];
            if (type === 2) {
                query += ' AND s.uploadDate > ?';
                parameters.push(uploadDate - 604800);
            }
            query += ' ORDER BY s.percent DESC';
            scores = db.prepare(query).all(...parameters);
        }

        const response = scores.filter(score => score.isDisabled === 0).map((score) => {
            const place = score.percent === 100 ? 1 : score.percent > 75 ? 2 : 3;
            const formattedDate = utils.getRelative(score.uploadDate);
            return `1:${score.userName}:2:${score.accountID + 1}:9:${score.icon}:10:${score.color1}:11:${score.color2}:51:${score.color3}:14:${score.iconType}:15:${score.special}:16:${score.accountID}:3:${score.percent}:6:${place}:13:${score.coins}:42:${formattedDate}|`;
        }).join('');

        return res.send(response);
    }
};