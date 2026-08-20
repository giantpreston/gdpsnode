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
    return xorResult.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
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

        const lvcheck = db.prepare('SELECT * FROM levels WHERE levelID = ?');
        const level = lvcheck.get(levelID);
        if (!level) return res.send('-1');

        // get level string steps:
        const levelsdir = path.join(__dirname, '..', 'levels');
        try {
            await fs.access(levelsdir);
        } catch {
            await fs.mkdir(levelsdir, { recursive: true });
        }

        const filePath = path.join(levelsdir, `${levelID}.gdcs`);
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

        if (gjp2 && accountID && gjp2 === account.gjp2 && inc === 1) {
            const create = db.prepare('UPDATE levels SET downloads = downloads + 1 WHERE levelID = ?');
            create.run(levelID);
        }

        const hash = generateDownloadHash(levelString);
        const feaID = level.dailyNumber || 0;
        const password = level.password || '1';
        const hash2String = `${level.accountID + 1},${level.starStars},${level.starDemon},${level.levelID},${level.starCoins},${level.featured},${password},${feaID}`;
        const hash2 = crypto.createHash('sha1').update(hash2String + "xI25fpAapCQg").digest('hex');

        const passwordXor = level.password ? xorAndEncode(level.password, '26364') : 'Aw==';
        const response = [
            `1:${level.levelID}`,
            `2:${level.levelName}`,
            `3:${level.levelDesc}`,
            `4:${levelString}`,
            `5:${level.levelVersion}`,
            `6:${level.accountID + 1}`,
            `8:10`,
            `9:${level.starDifficulty ? level.starDifficulty * 10 : 0}`,
            `10:${level.downloads}`,
            `12:${level.songID || 0}`,
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
            `35:${level.audioTrack || 0}`,
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

        res.send(`${response}#${hash}#${hash2}`);
    }
};

// i am so tired of wrestling with this endpoint. by far the hardest implementation. the client is SUPER strict about hashes and levelstring encoding, etc..
// not to mention i accidentally deleted the entire file and almost lost all my progress so far.
// real big shitshow.
// i really hope i don't have to come back here to do any changes besides add the unlisted handling.
// robtop i really love your game and all but this is too far, man. too far.