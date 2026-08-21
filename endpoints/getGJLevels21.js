const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const crypto = require('crypto');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/getGJLevels21.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        try {
            const body = req.body || {};
            const has = name => body[name] !== undefined && body[name] !== '';
            const int = (name, fallback = 0) => {
                const value = parseInt(body[name], 10);
                return Number.isNaN(value) ? fallback : value;
            };
            const accountID = int('accountID');
            const type = int('type');
            const strProvided = has('str');
            const isNumericStr = strProvided && /^\d+$/.test(String(body.str));
            let str;
            if (!strProvided) { str = ''; }
            else if (isNumericStr) { str = int('str'); }
            else { str = utils.remove(String(body.str)); }
            const diff = utils.numbercolon(body.diff || '');
            const len = has('len') ? utils.numbercolon(body.len) : '-';
            const page = int('page');
            const uncompleted = int('uncompleted');
            const onlyCompleted = int('onlyCompleted');
            const featured = int('featured');
            const original = int('original');
            const twoPlayer = int('twoPlayer');
            const coins = int('coins');
            const epic = int('epic');
            const mythic = int('legendary'); // the client sends this field name incorrectly
            const legendary = int('mythic'); // the client sends this field name incorrectly
            const songProvided = has('song');
            let song = Number(utils.number(body.song || ''));
            const customSong = int('customSong');
            const star = int('star');
            const noStar = int('noStar');
            const demonFilter = int('demonFilter');
        
        const {
            followed: rawFollowed,
            completedLevels: rawCompleted
        } = body;
        const gjp2 = utils.remove(body.gjp2 || '');
        const followed = utils.numbercolon(rawFollowed || '');
        const completedLevels = utils.numbercolon(rawCompleted || '');

        // holy fuck that was a lot of writing..
        // sanity checks
        if (accountID && !gjp2) return res.send('-1');
        if (type === 5 || type === 10 && !str) return res.send('-1');
        if (type === 12 && !followed) return res.send('-1');
        if (type === 10 && !str.includes(',')) return res.send('-1');
        if (uncompleted === 1 || onlyCompleted === 1 && !completedLevels) return res.send('-1');

        // db
        let sql = 'SELECT * FROM levels';
        let order;
        let conditions = [];
        let params = [];

        if (uncompleted === 1) {
            conditions.push('NOT levelID IN (?)');
            params.push(completedLevels);
        }
        if (onlyCompleted === 1) {
            conditions.push('levelID IN (?)');
            params.push(completedLevels);
        }
        if (customSong === 1 && songProvided) {
            song = song - 1;
            conditions.push("audioTrack = 0 AND songID = ?");
            params.push(song);
        } else if (songProvided) {
            conditions.push("audioTrack = ?");
            params.push(song);
        }
        if (twoPlayer === 1) conditions.push('twoPlayer = 1');
        if (star === 1) conditions.push('NOT starStars = 0');
        if (noStar === 1) conditions.push('starStars = 0');
        if (original === 1) conditions.push('originalReup = 0');
        if (coins === 1) conditions.push('starCoins = 1 AND NOT coins = 0');

        let epicParams = [];

        if (featured === 1) epicParams.push('starFeatured = 1');
        if (epic === 1) epicParams.push('starEpic = 1');
        if (legendary === 1) epicParams.push('starEpic = 2');
        if (mythic === 1) epicParams.push('starEpic = 3');

        let epicFilter = epicParams.join(" OR ");
        if (epicFilter) conditions.push(epicFilter);

        if (type === 0) {
            if (isNumericStr) {
                conditions.push('levelID = ?');
                params.push(str);
            } else {
                conditions.push('levelName LIKE ?');
                params.push(`%${str}%`);
            }
        }
        if (type === 1) order = 'downloads DESC';
        if (type === 2) order = 'likes DESC';
        if (type === 3) {
            conditions.push('uploadDate > ?');
            params.push(Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60));
            order = 'likes DESC';
        }   
        if (type === 4) order = 'uploadDate DESC';
        if (type === 5) {
            conditions.push('accountID = ?');
            params.push(str - 1); // userID in GDPSnode is accountID + 1, so accountID is userID - 1;
        }
        if (type === 6) {
            conditions.push('featured = 1');
            order = 'likes DESC';
        }
        if (type === 7) {
            conditions.push('objects > ?');
            params.push(9999); // nice job github.com/Cvolton/GMDprivateServer/blob/master/incl/levels/getGJLevels.php (line 205)
        }
        if (type === 27) conditions.push('isSent = 1');
        if (type === 10) {
            conditions.push(`levelID IN (${str})`);
        }
        if (type === 11) {
            conditions.push('NOT starStars = 0');
            order = 'uploadDate DESC';
        }
        if (type === 12) {
            conditions.push(`accountID IN (${followed})`);
        }
        // type 13 = friends, not implemented
        // type 21 = daily history; 22 = weekly history; 23 = event history; not yet implemented
        // type 25 = LISTS, not yet implemented
        if (diff === -1) {
            conditions.push('starDifficulty = 0');
        } else if (diff === -3) {
            conditions.push('starAuto = 1');
        } else if (diff === -2) {
            conditions.push('starDemon = 1');
            if (demonFilter === 1) conditions.push('starDemonDiff = 3');
            if (demonFilter === 2) conditions.push('starDemonDiff = 4');
            if (demonFilter === 3) conditions.push('starDemonDiff = 0');
            if (demonFilter === 4) conditions.push('starDemonDiff = 5');
            if (demonFilter === 5) conditions.push('starDemonDiff = 6');
        } else if (diff) {
            const diffValues = diff.split(',').map(Number);
            const placeholders = diffValues.map(() => '?').join(',');
            conditions.push(`starDifficulty IN (${placeholders}) AND starAuto = 0 AND starDemon = 0`);
            params.push(...diffValues);
        }
        if (len && len !== "-") {
            const lenValues = len.split(',').map(Number);
            const placeholders = lenValues.map(() => '?').join(',');
            conditions.push(`levelLength IN (${placeholders})`);
            params.push(...lenValues);
        }
        const searchedByID = (type === 0 && isNumericStr) || type === 10;
        if (!searchedByID) conditions.push('unlisted = 0'); // friends unlisted levels behave the same as normal ones. will implement friends soon, so i'll add that later!

        let whereClause = '';
        if (conditions.length > 0) {
            whereClause = ' WHERE ' + conditions.join(' AND ');
        }

        if (!order) order = 'likes DESC';

        const offset = page * 10;
        const limit = 10;

        const countSql = `SELECT COUNT(*) as total FROM levels${whereClause}`;
        const countStmt = db.prepare(countSql);
        const totalRow = countStmt.get(...params);
        const total = totalRow ? totalRow.total : 0;

        const mainSql = `SELECT * FROM levels${whereClause} ORDER BY ${order} LIMIT ? OFFSET ?`;
        const stmt = db.prepare(mainSql);
        const levels = stmt.all(...params, limit, offset);
        if (levels.length === 0) {
            const pageInfo = `0:${offset}:10`;
            const hash = crypto.createHash('sha1').update('xI25fpAapCQg').digest('hex');
            return res.send(`#${pageInfo}#${hash}`);
        }

        const accountIDs = new Set();
        const customSongIDs = new Set();
        levels.forEach(level => {
            accountIDs.add(level.accountID);
            if (level.customSongID > 0) customSongIDs.add(level.customSongID);
        });

        const userMap = new Map();
        if (accountIDs.size > 0) {
            const ids = Array.from(accountIDs);
            const placeholders = ids.map(() => '?').join(',');
            const userSql = `SELECT accountID, userName FROM accounts WHERE accountID IN (${placeholders})`;
            const userStmt = db.prepare(userSql);
            const users = userStmt.all(...ids);
            users.forEach(u => {
                userMap.set(u.accountID, u.userName);
            });
        }

        const songMap = new Map();
        if (customSongIDs.size > 0) {
            const ids = Array.from(customSongIDs);
            const placeholders = ids.map(() => '?').join(',');
            const songSql = `SELECT * FROM songs WHERE ID IN (${placeholders})`;
            const songStmt = db.prepare(songSql);
            const songs = songStmt.all(...ids);
            songs.forEach(s => {
                songMap.set(s.ID, s);
            });
        }
        const serializeKeyValues = (object, separator = ':') => Object.entries(object)
            .filter(([, value]) => value !== '' && value !== undefined && value !== null)
            .flatMap(([key, value]) => [key, value])
            .join(separator);

        const levelStrings = levels.map(level => {
            const levelObj = {
                1: level.levelID,
                2: level.levelName || '',
                3: level.levelDesc || '',
                5: level.levelVersion || 0,
                6: level.accountID + 1,
                8: level.starDifficulty > 0 ? 10 : 0,
                9: level.starDifficulty ? level.starDifficulty * 10 : 0,
                10: level.downloads || 0,
                12: level.audioTrack || 0,
                13: level.gameVersion || 0,
                14: level.likes || 0,
                15: level.levelLength || 0,
                16: level.dislikes || 0,
                17: level.starDemon ? 1 : 0,
                18: level.starStars || 0,
                19: level.featured ? 1 : 0,
                25: level.starAuto ? 1 : 0,
                30: level.originalReup || 0,
                31: level.twoPlayer ? 1 : 0,
                35: level.songID || 0,
                36: level.extraString || '',
                37: level.coins || 0,
                38: level.starCoins ? 1 : 0,
                39: level.requestedStars || 0,
                42: level.starEpic || 0,
                43: level.demonDifficulty || 0,
                45: level.objects || 0,
                54: 0,
                62: level.uploadDate || 0,
                63: level.updateDate || 0
            };
            const sortedLevel = Object.fromEntries(
                Object.entries(levelObj).sort(([a], [b]) => Number(a) - Number(b))
            );
            return serializeKeyValues(sortedLevel);
        });

        const creatorStrings = [];
        for (const [accountID, username] of userMap) {
            const playerID = accountID + 1;
            creatorStrings.push(`${playerID}:${username}:${accountID}`);
        }
        const songStrings = [];
        for (const [id, songData] of songMap) {
            const songObj = {
                1: songData.ID,
                2: songData.name || '',
                3: songData.artistID || 0,
                4: songData.artistName || '',
                5: 0,
                6: songData.videoID || '',
                7: songData.youtubeURL || '',
                8: songData.isVerified ? 1 : 0,
                9: songData.songPriority || 0,
                10: songData.link || '',
                11: songData.nongEnum || 0,
                12: songData.extraArtistIDs || '',
                13: songData.isNew ? 1 : 0,
                14: songData.newType || 0,
                15: songData.extraArtistNames || '',
                16: songData.downloadSoundtrackOverride || ''
            };
            const sortedSong = Object.fromEntries(
                Object.entries(songObj).sort(([a], [b]) => Number(a) - Number(b))
            );
            const songStr = serializeKeyValues(sortedSong, '~|~');
            songStrings.push(songStr);
        }

        const levelsStr = levelStrings.join('|');
        const creatorsStr = creatorStrings.join('|');
        const songsStr = songStrings.join(':');

        const pageInfo = `${total}:${offset}:10`;
        let hashInput = '';
        for (const level of levels) {
            const firstDigit = String(level.levelID)[0];
            const lastDigit = String(level.levelID).slice(-1);
            const stars = level.starStars || 0;
            const verifiedCoins = level.starCoins ? 1 : 0;
            hashInput += firstDigit + lastDigit + stars + verifiedCoins;
        }
        hashInput += 'xI25fpAapCQg';
        const hash = crypto.createHash('sha1').update(hashInput).digest('hex');
        const response = `${levelsStr}#${creatorsStr}#${songsStr}#${pageInfo}#${hash}`;
            res.send(response);
        } catch (error) {
            console.error('[getGJLevels21] request failed:', error);
            if (!res.headersSent) res.send('-1');
        }
    }
};

// SON 618 😭🙏