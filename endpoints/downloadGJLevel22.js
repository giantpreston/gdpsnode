const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');

function xorAndEncode(value, key) {
    const xorResult = Buffer.alloc(value.length);
    for (let i = 0; i < value.length; i++) {
        xorResult[i] = value.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    }
    return Buffer.from(xorResult).toString('base64');
}
function generateDownloadHash(levelString) {
    if (levelString.length < 41) {
        return crypto.createHash('sha1').update(levelString + "xI25fpAapCQg").digest('hex');
    }
    
    // For normal strings
    let hash = "????????????????????????????????????????xI25fpAapCQg";
    let m = Math.floor(levelString.length / 40);
    let i = 40;
    while (i) {
        hash = hash.slice(0, --i) + levelString[i * m] + hash.slice(i + 1);
    }
    return crypto.createHash('sha1').update(hash).digest('hex');
}

module.exports = {
    method: 'post',
    path: '/downloadGJLevel22.php',
    middleware: [commonSecret],
    handler: async (req, res) => {
        const levelID = parseInt(utils.remove(req.body.levelID), 10);
        const accountID = parseInt(utils.number(req.body.accountID), 10);
        const gjp2 = utils.remove(req.body.gjp2);
        const inc = parseInt(utils.number(req.body.inc), 10);

        // sanity checks
        if (!levelID) return res.send('-1');
        if (isNaN(levelID)) return res.send('-1');
        if (accountID && !gjp2) return res.send('-1');
        if (gjp2 && gjp2.length !== 40) return res.send('-1');

        // db checks
        const check = db.prepare("SELECT * FROM accounts WHERE accountID = ?");
        const account = check.get(accountID);

        if (accountID && gjp2 && !account) return res.send('-1');
        if (gjp2 && accountID && gjp2 !== account.gjp2) return res.send('-1');
        let level;

        if (levelID === -1) {
            level = db.prepare('SELECT * FROM levels WHERE dailyNumber != 0 AND dailyNumber < 100001 ORDER BY uploadDate DESC LIMIT 1').get();
            if (!level) return res.send('-1');
        } else if (levelID === -2) {
            level = db.prepare('SELECT * FROM levels WHERE dailyNumber != 0 AND dailyNumber > 100000 ORDER BY uploadDate DESC LIMIT 1').get();
            if (!level) return res.send('-1');
        } else {
            const lvcheck = db.prepare('SELECT * FROM levels WHERE levelID = ?');
            level = lvcheck.get(levelID);
            if (!level) return res.send('-1');
        }

        if (level.unlisted === 1) {
            if (!accountID) {
                return res.send('-1');
            }
            const areFriends = db.prepare('SELECT ID FROM friendships WHERE (person1 = ? AND person2 = ?) OR (person2 = ? AND person1 = ?)').get(accountID, level.accountID, accountID, level.accountID);
            if (!areFriends && accountID !== level.accountID) {
                return res.send('-1');
            }
        }
        const levelsdir = path.join(__dirname, '..', 'levels');
        try {
            await fs.access(levelsdir);
        } catch {
            await fs.mkdir(levelsdir, { recursive: true });
        }

        const filePath = path.join(levelsdir, `${level.levelID}.gdcs`);
        try {
            await fs.access(filePath);
        } catch {
            return res.send('-1');
        }
        
        // read the raw bytes
        const rawData = await fs.readFile(filePath);
        const levelString = rawData.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');

        let incremented = false;
        if (gjp2 && accountID && gjp2 === account.gjp2 && inc === 1) {
            const existingIncrement = db.prepare('SELECT * FROM content_increments WHERE accountID = ? AND contentID = ? AND contentType = ?').get(accountID, level.levelID, 'level');
            
            if (!existingIncrement) {
                const inf = db.prepare('UPDATE levels SET downloads = downloads + 1 WHERE levelID = ?').run(level.levelID);
                incremented = inf.changes > 0;
                
                if (incremented) {
                    db.prepare('INSERT OR IGNORE INTO content_increments (accountID, contentID, contentType) VALUES (?, ?, ?)').run(accountID, level.levelID, 'level');
                }
            }
        }

        const hash = generateDownloadHash(levelString);
        const feaID = level.dailyNumber || 0;
        const storedPassword = level.password != null ? String(level.password) : '';
        const owner = db.prepare('SELECT * FROM profiles WHERE accountID = ?').get(level.accountID);
        const password = storedPassword === '' || storedPassword === '1' ? '1' : storedPassword;
        const hash2String = `${level.accountID + 1},${level.starStars},${level.starDemon},${level.levelID},${level.starCoins},${level.featured},${password},${feaID}`;
        const hash2 = crypto.createHash('sha1').update(hash2String + "xI25fpAapCQg").digest('hex');

        const passwordXor = storedPassword === '' || storedPassword === '1' ? 'Aw==' : xorAndEncode(storedPassword, '26364');
        const response = [
            `1:${level.levelID}`,
            `2:${level.levelName}`,
            `3:${level.levelDesc}`,
            `4:${levelString}`,
            `5:${level.levelVersion}`,
            `6:${level.accountID + 1}`,
            `8:10`,
            `9:${level.starDifficulty ? level.starDifficulty * 10 : 0}`,
            `10:${incremented ? level.downloads + 1 : level.downloads}`,
            `12:${level.audioTrack || 0}`,
            `13:${level.gameVersion || 22}`,
            `14:${level.likes || 0}`,
            `15:${level.levelLength || 0}`,
            `16:${level.dislikes || 0}`,
            `17:${level.starDemon || 0}`,
            `18:${level.starStars || 0}`,
            `19:${level.featured || 0}`,
            `25:${level.starAuto || 0}`,
            `27:${passwordXor}`,
            `28:${utils.getRelative(level.uploadDate)}`,
            `29:${utils.getRelative(level.updateDate)}`,
            `30:${level.originalReup || 0}`,
            `31:${level.twoPlayer || 0}`,
            `35:${level.songID || 0}`,
            `36:${level.extraString || ''}`,
            `37:${level.coins || 0}`,
            `38:${level.starCoins || 0}`,
            `39:${level.requestedStars || 0}`,
            `40:${level.isLDM || 0}`,
            `41:${level.dailyNumber || ''}`,
            `42:${level.starEpic || 0}`,
            `43:${level.starDemonDiff || 0}`,
            `44:${level.inGauntlet || 0}`,
            `45:${level.objects || 0}`,
            `46:0`,
            `47:0`,
            `48:`,
            `52:${level.songIDs || ''}`,
            `53:${level.sfxIDs || ''}`,
            `54:0`,
            `57:0`,
            `62:${level.uploadDate}`,
            `63:${level.updateDate}`
        ].join(':');

        if (levelID === -1 || levelID === -2 || levelID === -3) {
            res.send(`${response}#${hash}#${hash2}#${owner.accountID + 1}:${owner.userName}:${owner.accountID}`);
        } else {
            res.send(`${response}#${hash}#${hash2}`);
        }
    }
};

// i am so tired of wrestling with this endpoint. by far the hardest implementation. the client is SUPER strict about hashes and levelstring encoding, etc..
// not to mention i accidentally deleted the entire file and almost lost all my progress so far.
// real big shitshow.
// i really hope i don't have to come back here to do any changes besides add the unlisted handling.
// robtop i really love your game and all but this is too far, man. too far.