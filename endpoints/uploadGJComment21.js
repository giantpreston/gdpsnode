const { commonSecret } = require('../middleware/secrets');
const utils = require('../utils');
const db = require('../database');
const crypto = require('crypto');

function chkgen(username, comment, levelId, percent) {
    const chkString = username + comment + levelId.toString() + percent.toString() + "0xPT6iUrtws0J";
    const sha1Hex = crypto.createHash('sha1').update(chkString).digest('hex');
    
    const key = '29481';
    let result = '';
    for (let i = 0; i < sha1Hex.length; i++) {
        result += String.fromCharCode(sha1Hex.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    
    return Buffer.from(result, 'binary')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
}

module.exports = {
    method: 'post',
    path: '/uploadGJComment21.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const userName = utils.remove(req.body?.userName);
        const comment = utils.remove(req.body?.comment);
        const levelID = parseInt(utils.number(req.body?.levelID), 10);
        const chk = utils.remove(req.body?.chk);
        let percent = parseInt(utils.number(req.body?.percent), 10);

        // sanity checks
        if (!accountID || !gjp2 || userName == null || !comment || !levelID || !chk) return res.send('-1');
        if (!percent) percent = 0;
        if (!utils.isURLBase64(comment)) return res.send('-1');
        if (percent < 0 || percent > 100) return res.send('-1');
        if (comment.length > 140) return res.send('-1');
        
        // db checks
        const level = db.prepare('SELECT * FROM levels WHERE levelID = ?').get(levelID);
        const list = db.prepare('SELECT * FROM lists WHERE listID = ?').get(levelID * -1); // oops
        const profile = db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(accountID);
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        
        if (((levelID < 0 && !list) || (levelID > 0 && !level)) || !profile || !account) return res.send('-1');
        if (userName !== account.userName) return res.send('-1');
        if (chkgen(userName, comment, levelID, percent) !== chk) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');
        if (account.permaCommentBan === 1) return res.send('-10');
        if (account.commentBan !== 0) {
            const timeLeft = account.commentBan - Math.floor(Date.now() / 1000);
            if (timeLeft > 0 && account.commentBanReason) return res.send(`temp_${timeLeft}_${account.commentBanReason}`);
            if (timeLeft > 0 && !account.commentBanReason) return res.send(`temp_${timeLeft}`);
        }

        try {
            const inf = db.prepare('INSERT INTO comments (accountID, userName, comment, levelID, timestamp, percent) VALUES (?, ?, ?, ?, ?, ?)').run(accountID, userName, comment, levelID, Math.floor(Date.now() / 1000), percent);
            if (inf.changes > 0) return res.send(inf.lastInsertRowid);
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to save level comment:\x1b[0m', err);
        }
        return res.send('-1');
    }
};