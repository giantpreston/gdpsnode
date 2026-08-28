const { commonSecret } = require('../middleware/secrets');
const crypto = require('crypto');
const db = require('../database');
const path = require('path');
const fs = require('fs/promises');
const zlib = require('zlib');
const utils = require('../utils');

function generateUploadSeed(levelString) {
    const chars = 50;
    const dataLen = levelString.length;
    
    if (dataLen < chars) {
        return levelString;
    }
    
    const step = Math.floor(dataLen / chars);
    let selected = '';
    for (let i = 0; i < chars; i++) {
        selected += levelString[step * i];
    }
    
    selected += 'xI25fpAapCQg';

    const sha1Hex = crypto.createHash('sha1').update(selected).digest('hex');
    
    const key = '41274';
    const xorResult = Buffer.alloc(sha1Hex.length);
    for (let i = 0; i < sha1Hex.length; i++) {
        xorResult[i] = sha1Hex.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    }
    
    return xorResult.toString('base64');
}

function validateGzip(buffer) {
    return new Promise((resolve, reject) => {
        const gunzip = zlib.createGunzip();
        gunzip.once('error', reject);
        gunzip.once('end', resolve);
        gunzip.resume();
        gunzip.end(buffer);
    });
}

module.exports = {
    method: 'post',
    path: '/uploadGJLevel21.php',
    middleware: [commonSecret],
    handler: async (req, res) => {
        const body = req.body || {};
        const gameVersion = parseInt(body.gameVersion, 10);
        const accountID = parseInt(body.accountID, 10);
        const levelID = parseInt(body.levelID, 10);
        const levelVersion = parseInt(body.levelVersion, 10);
        const levelLength = parseInt(body.levelLength, 10);
        const audioTrack = parseInt(body.audioTrack, 10);
        const auto = parseInt(body.auto, 10);
        const password = parseInt(body.password, 10);
        const original = parseInt(body.original, 10);
        const twoPlayer = parseInt(body.twoPlayer, 10);
        const songID = parseInt(body.songID, 10);
        const objects = parseInt(body.objects, 10);
        const coins = parseInt(body.coins, 10);
        const requestedStars = parseInt(body.requestedStars, 10);
        const unlisted = parseInt(body.unlisted, 10);
        const ldm = parseInt(body.ldm, 10);
        const {
            gjp2: rawGjp2,
            levelName: rawLevelName,
            levelDesc: rawLevelDesc,
            levelString: rawLevelString,
            seed2: rawSeed2
        } = body;

        const gjp2 = utils.remove(rawGjp2 || '');
        const levelName = utils.charclean(rawLevelName || '');
        const levelDesc = (rawLevelDesc || '').trim();
        const levelString = (rawLevelString || '').trim();
        const seed2 = (rawSeed2 || '').trim();

        const songIDs = utils.numbercolon(body.songIDs?.trim() || '');
        const sfxIDs = utils.numbercolon(body.sfxIDs?.trim() || '');
        const extraString = utils.remove(body.extraString?.trim() || '');

        if (
            isNaN(gameVersion) || isNaN(accountID) || isNaN(levelID) || isNaN(levelVersion) ||
            isNaN(levelLength) || isNaN(audioTrack) || isNaN(auto) || isNaN(password) ||
            isNaN(original) || isNaN(twoPlayer) || isNaN(songID) || isNaN(objects) ||
            isNaN(coins) || isNaN(requestedStars) || isNaN(unlisted) || isNaN(ldm) ||
            !gjp2 || !levelName || levelDesc === undefined || levelDesc === null ||
            !levelString || !seed2
        ) return res.send('-1');


        // sanity checks
        if (gameVersion > 22) return res.send('-1'); // bro does NOT have 2.3 sob
        if (gjp2.length !== 40) return res.send('-1');
        if (levelName.length > 20 || levelName.length < 0) return res.send('-1');
        if (levelDesc && !utils.isURLBase64(levelDesc)) return res.send('-1');
        if (levelLength > 5 || levelLength < 0) return res.send('-1'); // 0=tiny, 1=short, 2=medium, 3=large, 4=XL, 5=platformer
        if (auto > 1 || auto < 0) return res.send('-1');
        if (twoPlayer > 1 || twoPlayer < 0) return res.send('-1');
        if (objects < 0) return res.send('-1');
        if (coins > 3 || coins < 0) return res.send('-1');
        if (requestedStars > 10 || requestedStars < 0) return res.send('-1');
        if (unlisted < 0 || unlisted > 2) return res.send('-1');
        if (ldm > 1 || ldm < 0) return res.send('-1');
        if (!utils.isURLBase64(levelString)) return res.send('-1');

        const expectedSeed = generateUploadSeed(levelString);
        if (seed2 !== expectedSeed) return res.send('-1'); // seed2 implementation

        let decoded;
        try {
            let base64 = levelString.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) {
                base64 += '=';
            }
            decoded = Buffer.from(base64, 'base64');
            await validateGzip(decoded);
        } catch (err) {
            console.error('\x1b[1;31m✗ User sent an invalid level string. This might be a possible attempted attack at your server.');
            return res.send('-1');
        }

        // db checks
        const checkacc = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
        const account = checkacc.get(accountID);

        if (!account) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        const isUpdate = levelID > 0;

        if (isUpdate) {
            const checkLevel = db.prepare('SELECT * FROM levels WHERE levelID = ?');
            const existingLevel = checkLevel.get(levelID);

            if (!existingLevel) return res.send('-1');
            if (existingLevel.accountID !== accountID) return res.send('-1');
            
            const updateQuery = `
                UPDATE levels SET
                    levelName = ?,
                    levelDesc = ?,
                    levelVersion = ?,
                    levelLength = ?,
                    audioTrack = ?,
                    password = ?,
                    twoPlayer = ?,
                    songID = ?,
                    objects = ?,
                    coins = ?,
                    requestedStars = ?,
                    updateDate = ?,
                    unlisted = ?,
                    originalReup = ?,
                    isLDM = ?,
                    gameVersion = ?,
                    songIDs = ?,
                    sfxIDs = ?,
                    extraString = ?
                WHERE levelID = ?
            `;
            const updateValues = [
                levelName, levelDesc, existingLevel.levelVersion + 1, levelLength,
                audioTrack, password, twoPlayer, songID, objects, coins,
                requestedStars, Math.floor(Date.now() / 1000),
                unlisted, original, ldm, gameVersion,
                songIDs,
                sfxIDs,
                extraString,
                levelID
            ];
            const updateLvl = db.prepare(updateQuery);
            updateLvl.run(...updateValues);

            try {
                const levelsDir = path.join(__dirname, '..', 'levels');
                await fs.access(levelsDir).catch(() => fs.mkdir(levelsDir, { recursive: true }));

                const filePath = path.join(levelsDir, `${levelID}.gdcs`);
                await fs.writeFile(filePath, decoded);
            } catch (err) {
                console.error('\x1b[1;31m✗ Failed to save level string:', err);
                return res.send('-1');
            }

            res.send(String(levelID));
        } else {
            const columns = [
                'accountID', 'levelName', 'levelDesc', 'levelVersion', 'levelLength',
                'audioTrack', 'password', 'twoPlayer', 'songID', 'objects', 'coins',
                'requestedStars', 'uploadDate', 'updateDate', 'unlisted', 'originalReup',
                'isLDM', 'gameVersion', 'songIDs', 'sfxIDs', 'extraString'
            ];
            const values = [
                accountID, levelName, levelDesc, 1, levelLength,
                audioTrack, password, twoPlayer, songID, objects, coins,
                requestedStars, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000),
                unlisted, original, ldm, gameVersion, songIDs, sfxIDs, extraString
            ];

            const placeholders = values.map(() => '?').join(', ');
            const insertQuery = `INSERT INTO levels (${columns.join(', ')}) VALUES (${placeholders})`;
            const addlvl = db.prepare(insertQuery);
            const info = addlvl.run(...values);

            const newLevelID = info.lastInsertRowid;
            try {
                const levelsDir = path.join(__dirname, '..', 'levels');
                await fs.access(levelsDir).catch(() => fs.mkdir(levelsDir, { recursive: true }));

                const filePath = path.join(levelsDir, `${newLevelID}.gdcs`);
                await fs.writeFile(filePath, decoded);
            } catch (err) {
                console.error('\x1b[1;31m✗ Failed to save level string:', err);
                return res.send('-1');
            }

            res.send(String(newLevelID));
        }
    }
};