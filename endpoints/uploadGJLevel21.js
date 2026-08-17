const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const path = require('path');
const fs = require('fs');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/uploadGJLevel21.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        // sanity checks
        const {
            gameVersion,
            accountID,
            gjp2,
            levelID,
            levelName,
            levelDesc,
            levelLength,
            audioTrack,
            auto,
            password,
            original,
            songIDs,
            sfxIDs,
            twoPlayer,
            songID,
            objects,
            coins,
            requestedStars,
            unlisted,
            ldm,
            levelString,
            seed2,
            extraString
        } = req.body || {};
        let levelVersion = req.body?.levelVersion;

        if (!gameVersion || !accountID || !gjp2 || !levelID || !levelName ||
            levelDesc === undefined || levelDesc === null || !levelVersion || !levelLength || !audioTrack ||
            !auto || !password || !unlisted || !ldm || !levelString || !original || !songID || !seed2) return res.send('-1 a');
        if (gameVersion > 22) return res.send('-1 b'); // bro does NOT have 2.3 sob
        if (isNaN(accountID)) return res.send('-1 c');
        if (gjp2.length !== 40) return res.send('-1 d');
        if (levelID === 0) levelVersion = 1;
        if (levelName.length > 20 || levelName.length < 0) return res.send('-1 e');
        if (levelDesc && !utils.isURLBase64(levelDesc)) return res.send('-1 f');
        if (levelLength > 5 || levelLength < 0) return res.send('-1 g'); // all valid: 0 = tiny; 1 = short; 2 = medium; 3 = large (most common); 4 = XL; 5 = platformer;
        if (auto > 1 || auto < 0) return res.send('-1 h');
        if (twoPlayer > 1 || twoPlayer < 0) return res.send('-1 i');
        if (objects < 0) return res.send('-1 j');
        if (coins > 3 || coins < 0) return res.send('-1 k');
        if (requestedStars > 10 || requestedStars < 1) return res.send('-1 l'); // 1: auto, 2: easy, 3: normal, 4-5: hard, 6-7 (haha 67): harder, 8-9: insane, 10: demon
        if (unlisted < 0 || unlisted > 2) return res.send('-1 m');
        if (ldm > 1 || ldm < 0) return res.send('-1 n');
        if (!utils.isURLBase64(levelString)) return res.send('-1 o');

        // db checks
        const checkacc = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
        const account = checkacc.get(accountID);

        if (!account) return res.send('-1 p');
        if (account.gjp2 !== gjp2) return res.send('-1 q');

        const columns = [
            'accountID', 'levelName', 'levelDesc', 'levelVersion', 'levelLength',
            'audioTrack', 'password', 'twoPlayer', 'songID', 'objects', 'coins',
            'requestedStars', 'uploadDate', 'updateDate', 'unlisted', 'originalReup',
            'isLDM', 'gameVersion'
        ];
        const values = [
            accountID, levelName, levelDesc, levelVersion, levelLength,
            audioTrack, password, twoPlayer, songID, objects, coins,
            requestedStars, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000),
            unlisted, original, ldm, gameVersion
        ];

        if (songIDs?.trim()) {
            columns.push('songIDs');
            values.push(songIDs);
        }
        if (sfxIDs?.trim()) {
            columns.push('sfxIDs');
            values.push(sfxIDs);
        }
        if (extraString?.trim()) {
            columns.push('extraString');
            values.push(extraString);
        }
        const placeholders = values.map(() => '?').join(', ');
        const insertQuery = `INSERT INTO levels (${columns.join(', ')}) VALUES (${placeholders})`;
        const addlvl = db.prepare(insertQuery);
        const info = addlvl.run(...values);

        const newLevelID = info.lastInsertRowid;
        try {
            let base64 = levelString.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) {
                base64 += '=';
            }
            const decoded = Buffer.from(base64, 'base64');
            const levelsDir = path.join(__dirname, '..', 'levels');
            if (!fs.existsSync(levelsDir)) {
                fs.mkdirSync(levelsDir, {
                    recursive: true
                });
            }

            const filePath = path.join(levelsDir, `${newLevelID}.gdcs`);
            fs.writeFileSync(filePath, decoded);
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to save level string:', err);
            return res.send('-1 r');
        }

        res.send(String(newLevelID));
    }
};