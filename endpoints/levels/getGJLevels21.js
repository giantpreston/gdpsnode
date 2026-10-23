const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const crypto = require('crypto');
const utils = require('../../utils');

module.exports = {
    method: 'post',
    path: '/getGJLevels21.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        try {
            const body = req.body || {};
            const has = name => body[name] != null && body[name] !== '';
            const int = (name, fallback = 0) => {
                if (!has(name)) return fallback;
                const value = parseInt(body[name], 10);
                return Number.isNaN(value) ? null : value;
            };
            const numericList = (name, fallback = '') => {
                const rawValue = body[name];
                const value = Array.isArray(rawValue) ? rawValue.at(-1) : rawValue;
                if (value === undefined || value === null || value === '') return fallback;
                return utils.numbercolon(String(value));
            };
            const accountID = int('accountID');
            const type = int('type');
            let local = int('local');
            if (local === null || local === undefined) local = 0;
            const strProvided = has('str');
            const isNumericStr = strProvided && /^\d+$/.test(String(body.str));
            let str;
            if (!strProvided) { str = ''; }
            else if (isNumericStr) { str = int('str'); }
            else { str = utils.remove(String(body.str)); }
            const diff = numericList('diff');
            const len = has('len') ? numericList('len') : '-';
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
            const songValue = utils.number(body.song || '');
            let song = songValue === '' ? NaN : Number(songValue);
            const customSong = int('customSong');
            const star = int('star');
            const noStar = int('noStar');
            const demonFilter = int('demonFilter');
            if ([accountID, type, page, uncompleted, onlyCompleted, featured, original, twoPlayer, coins, epic, mythic, legendary, customSong, star, noStar, demonFilter].includes(null)) return res.send('-1');
            if (![0, 1].includes(local)) return res.send('-1');
            if (songProvided && !Number.isInteger(song)) return res.send('-1');
        
        const {
            followed: rawFollowed,
            completedLevels: rawCompleted
        } = body;
        const gjp2 = utils.remove(body.gjp2 || '');
        const followed = rawFollowed === undefined ? '' : numericList('followed');
        const completedLevels = rawCompleted === undefined ? '' : numericList('completedLevels');

        // holy fuck that was a lot of writing..
        // sanity checks
        if (accountID && !gjp2) return res.send('-1');
        if (type === 12 && !followed) return res.send('-1');
        if (type === 10 && !str.includes(',')) return res.send('-1');
        if ((uncompleted === 1 || onlyCompleted === 1) && !completedLevels) return res.send('-1');

        // db
        if (accountID > 0) {
            const account = db.prepare('SELECT gjp2, isDisabled FROM accounts WHERE accountID = ?').get(accountID);
            if (!account) return res.send('-1');
            if (account.gjp2 !== gjp2) return res.send('-1');
            if (account.isDisabled === 1) return res.send('-1');
        }
        if (local === 1 && (type !== 5 || accountID <= 0 || Number(str) - 1 !== accountID)) return res.send('-1');
        let order;
        let conditions = [];
        let params = [];
        let type25LevelOrder = [];

        const completedLevelIDs = completedLevels.split(',').filter(value => value !== '').map(Number);
        const completedLevelColumn = [32, 33, 34].includes(type) ? 'dailyNumber' : 'levelID';
        if (uncompleted === 1) {
            const placeholders = completedLevelIDs.map(() => '?').join(',');
            conditions.push(`${completedLevelColumn} NOT IN (${placeholders})`);
            params.push(...completedLevelIDs);
        }
        if (onlyCompleted === 1) {
            const placeholders = completedLevelIDs.map(() => '?').join(',');
            conditions.push(`${completedLevelColumn} IN (${placeholders})`);
            params.push(...completedLevelIDs);
        }
        if (customSong === 1 && songProvided) {
            const legacySongID = song - 1;
            conditions.push("audioTrack = 0 AND (songID = ? OR songID = ? OR instr(',' || songIDs || ',', ',' || CAST(? AS INTEGER) || ',') > 0)");
            params.push(legacySongID, song, song);
        } else if (songProvided) {
            const legacyAudioTrack = song - 1;
            conditions.push("(audioTrack = ? OR songID = ? OR songID = ? OR instr(',' || songIDs || ',', ',' || CAST(? AS INTEGER) || ',') > 0)");
            params.push(legacyAudioTrack, song, legacyAudioTrack, song);
        }
        if (twoPlayer === 1) conditions.push('twoPlayer = 1');
        if (star === 1) conditions.push('NOT starStars = 0');
        if (noStar === 1) conditions.push('starStars = 0');
        if (original === 1) conditions.push('originalReup = 0');
        if (coins === 1) conditions.push('starCoins = 1 AND NOT coins = 0');

        let epicParams = [];

        if (featured === 1) epicParams.push('featured = 1');
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
            order = 'uploadDate DESC';
            conditions.push('accountID = ?');
            params.push(str - 1); // userID in GDPSnode is accountID + 1, so accountID is userID - 1;
        }
        if (type === 6) {
            conditions.push('featured = 1');
            order = 'likes DESC';
        }
        if (type === 7) {
            order = 'uploadDate DESC';
            conditions.push('objects > 9999'); // nice job github.com/Cvolton/GMDprivateServer/blob/master/incl/levels/getGJLevels.php (line 205)
            conditions.push('starStars = 0'); // typically only unrated lvls on magic
        }
        if (type === 10) {
            const levelIDs = String(str).split(',').map(Number).filter(n => !Number.isNaN(n));
            if (levelIDs.length > 0) {
                const placeholders = levelIDs.map(() => '?').join(',');
                conditions.push(`levelID IN (${placeholders})`);
                params.push(...levelIDs);
            }
        }
        if (type === 11) {
            conditions.push('NOT starStars = 0');
            order = 'uploadDate DESC';
        }
        if (type === 12) {
            const accountIDs = followed.split(',').map(Number).filter(n => !Number.isNaN(n));
            if (accountIDs.length > 0) {
                const placeholders = accountIDs.map(() => '?').join(',');
                conditions.push(`accountID IN (${placeholders})`);
                params.push(...accountIDs);
            }
        }
        if (type === 13) {
            if (!accountID) return res.send('-1');
            const friendships = db.prepare('SELECT person1, person2 FROM friendships WHERE person1 = ? OR person2 = ?').all(accountID, accountID);
            const friendIDs = new Set();
            for (const friendship of friendships) {
                if (friendship.person1 === accountID) {
                    friendIDs.add(friendship.person2);
                } else {
                    friendIDs.add(friendship.person1);
                }
            }
            if (friendIDs.size > 0) {
                const friendArray = Array.from(friendIDs);
                const placeholders = friendArray.map(() => '?').join(',');
                conditions.push(`accountID IN (${placeholders})`);
                params.push(...friendArray);
            } else {
                conditions.push('1 = 0');
            }
            order = 'uploadDate DESC';
        }
        if (type === 21) {
            conditions.push('NOT dailyNumber = 0');
            conditions.push('dailyNumber < 100001'); // exclude weekly
            order = 'uploadDate DESC';
        }
        if (type === 22) {
            conditions.push('dailyNumber > 100000'); // exclude daily
            conditions.push('dailyNumber < 200001')
            order = 'uploadDate DESC';
        }
        if (type === 23) {
            conditions.push('dailyNumber > 200000');
            order = 'uploadDate DESC';
        }
        if (type === 32) {
            conditions.push('NOT dailyNumber = 0');
            conditions.push('dailyNumber < 100001'); // exclude weekly
            conditions.push(`levelID != COALESCE((SELECT levelID FROM levels
                WHERE dailyNumber != 0 AND dailyNumber < 100001
                AND (dailyTime = 0 OR dailyTime > strftime('%s', 'now'))
                ORDER BY dailyNumber DESC LIMIT 1), -1)`);
            order = 'uploadDate DESC';
        }
        if (type === 33) {
            conditions.push('dailyNumber > 100000'); // exclude daily
            conditions.push('dailyNumber < 200001')
            conditions.push(`levelID != COALESCE((SELECT levelID FROM levels
                WHERE dailyNumber > 100000 AND dailyNumber < 200001
                AND (dailyTime = 0 OR dailyTime > strftime('%s', 'now'))
                ORDER BY dailyNumber DESC LIMIT 1), -1)`);
            order = 'uploadDate DESC';
        }
        if (type === 34) {
            conditions.push('dailyNumber > 200000');
            conditions.push(`levelID != COALESCE((SELECT levelID FROM levels
                WHERE dailyNumber > 200000
                AND (dailyTime = 0 OR dailyTime > strftime('%s', 'now'))
                ORDER BY dailyNumber DESC LIMIT 1), -1)`);
            order = 'uploadDate DESC';
        }
        if (type === 25) {
            const listID = Number(str);
            if (!/^\d+$/.test(String(str)) || !Number.isSafeInteger(listID) || listID < 1) return res.send('-1');
            const list = db.prepare(`SELECT listID, accountID, listLevels, unlisted, featured FROM lists
                WHERE listID = ? AND accountID IN (SELECT accountID FROM accounts WHERE isDisabled = 0)`).get(listID);
            if (!list) return res.send('-1');

            if (!list.featured && list.unlisted === 1 && accountID !== list.accountID) {
                const friendship = accountID
                    ? db.prepare('SELECT 1 FROM friendships WHERE (person1 = ? AND person2 = ?) OR (person1 = ? AND person2 = ?)').get(
                        accountID, list.accountID, list.accountID, accountID
                    )
                    : null;
                if (!friendship) return res.send('-1');
            } else if (list.unlisted !== 0 && list.unlisted !== 1 && list.unlisted !== 2) {
                return res.send('-1');
            }

            if (typeof list.listLevels !== 'string' || !/^\d+(,\d+)*$/.test(list.listLevels)) return res.send('-1');
            type25LevelOrder = list.listLevels.split(',').map(Number);
            if (type25LevelOrder.some(levelID => !Number.isSafeInteger(levelID) || levelID < 1)) return res.send('-1');
            conditions.push('unlisted = 0');
            const placeholders = type25LevelOrder.map(() => '?').join(',');
            conditions.push(`levelID IN (${placeholders})`);
            params.push(...type25LevelOrder);
        }
        const hypeHour = Math.floor(Date.now() / 3600000);
        if (type === 31) {
            conditions.push('isSent = 1');
            conditions.push('lastSent >= ?');
            params.push(Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60);
        }
        
        if (diff === '-1') {
            conditions.push('starDifficulty = 0');
        } else if (diff === '-3') {
            conditions.push('starAuto = 1');
        } else if (diff === '-2') {
            conditions.push('starDemon = 1');
            if (demonFilter === 1) conditions.push('starDemonDiff = 3');
            if (demonFilter === 2) conditions.push('starDemonDiff = 4');
            if (demonFilter === 3) conditions.push('starDemonDiff = 0');
            if (demonFilter === 4) conditions.push('starDemonDiff = 5');
            if (demonFilter === 5) conditions.push('starDemonDiff = 6');
        } else if (diff && diff !== '-') {
            const diffValues = diff.split(',').filter(value => value !== '').map(Number);
            if (diffValues.some(value => !Number.isInteger(value))) return res.send('-1');
            const placeholders = diffValues.map(() => '?').join(',');
            conditions.push(`starDifficulty IN (${placeholders}) AND starAuto = 0 AND starDemon = 0`);
            params.push(...diffValues);
        }
        if (len && len !== "-") {
            const lenValues = len.split(',').filter(value => value !== '').map(Number);
            if (lenValues.some(value => !Number.isInteger(value))) return res.send('-1');
            const placeholders = lenValues.map(() => '?').join(',');
            conditions.push(`levelLength IN (${placeholders})`);
            params.push(...lenValues);
        }
        const searchedByID = (type === 0 && isNumericStr) || type === 5 || type === 10 || type === 25;
        conditions.push('accountID IN (SELECT accountID FROM accounts WHERE isDisabled = 0)');
        if (!searchedByID && local !== 1) {
            conditions.push('unlisted = 0');
        }
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

        const mainSql = `SELECT levelID, levelName, levelDesc, levelVersion, accountID,
            starDifficulty, downloads, audioTrack, gameVersion, likes, levelLength,
            starDemon, starStars, featured, starAuto, originalReup, twoPlayer, songID, songIDs,
            coins, starCoins, requestedStars, starEpic, starDemonDiff, objects,
            wt, wt2, ts, uploadDate, updateDate, unlisted, dailyNumber
            FROM levels${whereClause}${[25, 31].includes(type) ? '' : ` ORDER BY ${order} LIMIT ? OFFSET ?`}`;
        const stmt = db.prepare(mainSql);
        let levels;
        if (type === 31) {
            levels = stmt.all(...params)
                .map(level => ({
                    level,
                    order: crypto.createHash('sha256').update(`${hypeHour}:${level.levelID}`).digest('hex')
                }))
                .sort((left, right) => left.order.localeCompare(right.order) || left.level.levelID - right.level.levelID)
                .slice(offset, offset + limit)
                .map(item => item.level);
        } else if (type === 25) {
            const listOrder = new Map(type25LevelOrder.map((levelID, index) => [levelID, index]));
            levels = stmt.all(...params)
                .sort((left, right) => listOrder.get(left.levelID) - listOrder.get(right.levelID))
                .slice(offset, offset + limit);
        } else {
            levels = stmt.all(...params, limit, offset);
        }
        
        if (searchedByID && levels.length > 0) {
            let friendIDs = new Set();
            if (accountID) {
                const friendships = db.prepare('SELECT person1, person2 FROM friendships WHERE person1 = ? OR person2 = ?').all(accountID, accountID);
                for (const friendship of friendships) {
                    if (friendship.person1 === accountID) {
                        friendIDs.add(friendship.person2);
                    } else {
                        friendIDs.add(friendship.person1);
                    }
                }
            }
            levels = levels.filter(level => {
                if (type === 5 && level.unlisted === 2) return local === 1 && level.accountID === accountID;
                if (level.unlisted === 0 || level.unlisted === 2) return true;
                if (level.unlisted === 1 && (
                    (local === 1 && level.accountID === accountID) ||
                    (type === 25 && level.accountID === accountID) ||
                    friendIDs.has(level.accountID)
                )) return true;
                return false;
            });
        }
        
        if (levels.length === 0) {
            const pageInfo = `0:${offset}:10`;
            const hash = crypto.createHash('sha1').update('xI25fpAapCQg').digest('hex');
            return res.send(`#${pageInfo}#${hash}`);
        }

        const accountIDs = new Set();
        const customSongIDs = new Set();
        levels.forEach(level => {
            accountIDs.add(level.accountID);

            if (level.audioTrack === 0 && level.songID > 0) {
                customSongIDs.add(level.songID);
            }

            if (level.songIDs) {
                String(level.songIDs)
                    .split(',')
                    .map(value => Number(value.trim()))
                    .filter(id => Number.isInteger(id) && id > 0)
                    .forEach(id => customSongIDs.add(id));
            }
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
        const serializeSong = fields => fields
            .flatMap(([key, value]) => [key, value ?? ''])
            .join('~|~');
        const encodeSongValue = value => typeof value === 'string' && value ? encodeURIComponent(value) : value;

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
                17: level.starDemon ? 1 : 0,
                18: level.starStars || 0,
                19: level.featured ? 1 : 0,
                25: level.starAuto ? 1 : 0,
                30: level.originalReup || 0,
                31: level.twoPlayer ? 1 : 0,
                35: level.songID || 0,
                37: level.coins || 0,
                38: level.starCoins ? 1 : 0,
                39: level.requestedStars || 0,
                42: level.starEpic || 0,
                43: level.starDemonDiff || 0,
                45: level.objects || 0,
                46: level.wt || 0,
                47: level.wt2 || 0,
                54: 0,
                57: level.ts || 0,
                62: level.uploadDate || 0,
                63: level.updateDate || 0,
                65: [32, 33, 34].includes(type) ? level.dailyNumber : undefined
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
            const songFields = [
                [1, songData.ID],
                [2, songData.name || ''],
                [3, songData.artistID || 0],
                [4, songData.artistName || ''],
                [5, songData.size || 0],
                [6, songData.videoID || ''],
                [10, encodeSongValue(songData.link || '')],
                [11, songData.platform || 0],
                [16, encodeSongValue(songData.downloadSoundtrackOverride || '')],
                [7, songData.youtubeURL || ''],
                [8, songData.allowedForUse ? 1 : 0]
            ];
            const songStr = serializeSong(songFields);
            songStrings.push(songStr);
        }

        const levelsStr = levelStrings.join('|');
        const creatorsStr = creatorStrings.join('|');
        const songsStr = songStrings.join('~:~');

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
            console.error('\x1b[1;31m✗ [getGJLevels21] request failed:\x1b[0m', error);
            if (!res.headersSent) res.send('-1');
        }
    }
};

// SON 618 😭🙏
