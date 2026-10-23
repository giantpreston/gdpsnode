const { commonSecret } = require('../../middleware/secrets');
const utils = require('../../utils');
const db = require('../../database');
const crypto = require('crypto');

function chkgen(username, comment, levelId, percent, cType) {
    const chkString = username + comment + levelId.toString() + percent.toString() + cType.toString() + "xPT6iUrtws0J";
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

function legacyChkgen(username, comment, levelId, percent) {
    const chkString = username + comment + levelId.toString() + percent.toString() + "0xPT6iUrtws0J";
    const sha1Hex = crypto.createHash('sha1').update(chkString).digest('hex');

    const xorBuffer = Buffer.from(
        Array.from(sha1Hex, (ch, i) => ch.charCodeAt(0) ^ '29481'.charCodeAt(i % 5))
    );

    return xorBuffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
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
        const rawLevelID = String(req.body?.levelID ?? '').trim();
        const levelID = /^-?\d+$/.test(rawLevelID) ? parseInt(rawLevelID, 10) : NaN;
        const cType = req.body?.cType == null || req.body.cType === '' ? 0 : parseInt(utils.number(req.body.cType), 10);
        const chk = utils.remove(req.body?.chk);
        let percent = req.body?.percent == null ? 0 : parseInt(utils.number(req.body.percent), 10);

        // sanity checks
        if (!accountID || !gjp2 || userName == null || !comment || !levelID || !chk || !Number.isInteger(cType)) return res.send('-1');
        if (!utils.isURLBase64(comment)) return res.send('-1');
        if (!Number.isInteger(percent) || percent < 0 || percent > 100) return res.send('-1');
        if (comment.length > 140) return res.send('-1');
        
        // db checks
        const isEditorPackComment = cType === 6;
        const isModerationNote = cType === 8;
        let editorPack = null;
        let level = null;
        let list = null;
        let targetProfile = null;
        if (isEditorPackComment) {
            editorPack = db.prepare('SELECT * FROM editor_sounds WHERE soundID = ?').get(levelID);
        } else if (isModerationNote) {
            targetProfile = db.prepare('SELECT p.accountID FROM profiles p JOIN accounts a ON a.accountID = p.accountID WHERE p.accountID = ?').get(levelID);
        } else {
            level = db.prepare('SELECT * FROM levels WHERE levelID = ?').get(levelID);
            list = db.prepare('SELECT * FROM lists WHERE listID = ?').get(Math.abs(levelID));
        }
        const profile = db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(accountID);
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        
        if (isEditorPackComment && !editorPack) return res.send('-1');
        if (isModerationNote && (!targetProfile || profile?.modLevel < 1)) return res.send('-1');
        if (!isEditorPackComment && !isModerationNote && ((levelID < 0 && !list) || (levelID > 0 && !level))) return res.send('-1');
        if (!profile || !account) return res.send('-1');
        if (userName !== account.userName) return res.send('-1');
        const checksumMatches = chkgen(userName, comment, levelID, percent, cType) === chk;
        const legacyChecksumMatches = cType === 0 && legacyChkgen(userName, comment, levelID, percent) === chk;
        if (!checksumMatches && !legacyChecksumMatches) return res.send('-1');
        if (account.leaderboardBan === 1) percent = 0
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');
        if (account.permaCommentBan === 1) return res.send('-10');
        if (account.commentBan !== 0) {
            const timeLeft = account.commentBan - Math.floor(Date.now() / 1000);
            if (timeLeft > 0 && account.commentBanReason) return res.send(`temp_${timeLeft}_${account.commentBanReason}`);
            if (timeLeft > 0 && !account.commentBanReason) return res.send(`temp_${timeLeft}`);
            if (timeLeft <= 0) db.prepare("UPDATE accounts SET commentBan = 0, commentBanReason = '' WHERE accountID = ?").run(account.accountID);
        }

        try {
            const uploadDate = Math.floor(Date.now() / 1000);
            const inf = db.transaction(() => {
                let result;
                if (isEditorPackComment) {
                    result = db.prepare('INSERT INTO editorpackcomments (accountID, userName, comment, editorpackID, timestamp) VALUES (?, ?, ?, ?, ?)').run(accountID, userName, comment, levelID, uploadDate);
                } else if (isModerationNote) {
                    result = db.prepare('INSERT INTO moderation_notes (accountID, userName, comment, targetAccountID, timestamp) VALUES (?, ?, ?, ?, ?)').run(accountID, userName, comment, levelID, uploadDate);
                } else {
                    result = db.prepare('INSERT INTO comments (accountID, userName, comment, levelID, timestamp, percent) VALUES (?, ?, ?, ?, ?, ?)').run(accountID, userName, comment, levelID, uploadDate, percent);
                }
                if (!isEditorPackComment && !isModerationNote && levelID > 0 && percent !== 0) {
                    const existingScore = db.prepare('SELECT percent FROM levelscores WHERE accountID = ? AND levelID = ?').get(accountID, levelID);
                    if (!existingScore) {
                        db.prepare('INSERT INTO levelscores (accountID, levelID, percent, uploadDate, progresses) VALUES (?, ?, ?, ?, ?)').run(accountID, levelID, percent, uploadDate, '');
                    } else if (existingScore.percent < percent) {
                        db.prepare('UPDATE levelscores SET percent = ?, uploadDate = ? WHERE accountID = ? AND levelID = ?').run(percent, uploadDate, accountID, levelID);
                    }
                }
                return result;
            })();

            if (inf.changes > 0) return res.send(String(inf.lastInsertRowid));
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to save level comment:\x1b[0m', err);
        }
        return res.send('-1');
    }
};