const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs/promises');
const db = require('./database');

const router = express.Router();
const sessions = new Map();
const sessionTtl = 8 * 60 * 60 * 1000;
const dashboardUser = process.env.DASHBOARD_USER;
const dashboardPassword = process.env.DASHBOARD_PASSWORD;
const dashboardAccountId = Number(process.env.DASHBOARD_ACCOUNT_ID);
const secureCookies = process.env.DASHBOARD_SECURE_COOKIES === '1';
const dashboardPath = (process.env.DASHBOARD_PATH || '/dashboard').replace(/\/+$/, '').replace(/^([^/])/, '/$1') || '/dashboard';
const songsDirectory = path.join(__dirname, 'songs');

function sameSecret(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function issueSession(res) {
    const id = crypto.randomBytes(32).toString('hex');
    const csrf = crypto.randomBytes(24).toString('hex');
    sessions.set(id, { csrf, expires: Date.now() + sessionTtl });
    const flags = ['HttpOnly', 'SameSite=Strict', `Max-Age=${sessionTtl / 1000}`, `Path=${dashboardPath}`];
    if (secureCookies) flags.push('Secure');
    res.setHeader('Set-Cookie', `dashboard_session=${id}; ${flags.join('; ')}`);
    return csrf;
}

function getSession(req) {
    const cookie = req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith('dashboard_session='));
    if (!cookie) return null;
    const session = sessions.get(cookie.slice('dashboard_session='.length));
    if (!session || session.expires < Date.now()) return null;
    return session;
}

function requireAuth(req, res, next) {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Authentication required' });
    req.dashboardSession = session;
    next();
}

function requireCsrf(req, res, next) {
    if (!sameSecret(req.get('X-CSRF-Token'), req.dashboardSession.csrf)) {
        return res.status(403).json({ error: 'Invalid request token' });
    }
    next();
}

function applyRating(levelId, stars, feature, demonDiff) {
    const values = [stars];
    const updates = ['starStars = ?', 'starAuto = 0', 'starDemon = 0', 'starDemonDiff = 0'];
    if (stars === 1) {
        updates.push('starAuto = 1', 'starDifficulty = 1');
    } else if (stars === 2) {
        updates.push('starDifficulty = 1');
    } else if (stars === 3) {
        updates.push('starDifficulty = 2');
    } else if (stars <= 5) {
        updates.push('starDifficulty = 3');
    } else if (stars <= 7) {
        updates.push('starDifficulty = 4');
    } else if (stars <= 9) {
        updates.push('starDifficulty = 5');
    } else {
        updates.push('starDemon = 1');
        updates.push('starDifficulty = 0');
        updates.push('starDemonDiff = ?');
        values.push(demonDiff);
    }
    if (feature === 1) updates.push('featured = 1', 'starEpic = 0');
    else if (feature >= 2) updates.push('featured = 1', `starEpic = ${feature - 1}`);
    else updates.push('featured = 0', 'starEpic = 0');
    values.push(levelId);

    const update = db.prepare(`UPDATE levels SET ${updates.join(', ')}, isSent = 0, lastSent = 0 WHERE levelID = ?`);
    const clear = db.prepare('DELETE FROM modSuggest WHERE levelID = ?');
    const transaction = db.transaction(() => {
        const result = update.run(...values);
        clear.run(levelId);
        return result.changes;
    });
    return transaction();
}

function clearRating(levelId) {
    const result = db.prepare(`UPDATE levels SET starStars = 0,
        starAuto = 0, starDemon = 0, featured = 0, starEpic = 0, starDemonDiff = 0,
        isSent = 0, lastSent = 0 WHERE levelID = ?`).run(levelId);
    db.prepare('DELETE FROM modSuggest WHERE levelID = ?').run(levelId);
    return result.changes;
}

function applyDifficulty(levelId, difficulty) {
    return db.prepare('UPDATE levels SET starDifficulty = ? WHERE levelID = ?').run(difficulty, levelId).changes;
}

function refreshUserRatingStats(levelId) {
    const ratings = db.prepare('SELECT stars FROM level_ratings WHERE levelID = ?').all(levelId).map(row => row.stars);
    const average = ratings.length ? Math.round(ratings.reduce((sum, stars) => sum + stars, 0) / ratings.length) : 0;
    const filtered = ratings.filter(stars => stars > 1 && stars < 10);
    const filteredAverage = filtered.length ? Math.round(filtered.reduce((sum, stars) => sum + stars, 0) / filtered.length) : 0;
    db.prepare(`UPDATE levels SET userRates = ?, avgUserRate = ?, noMinMaxAvgUserRate = ?,
        noMinMaxMinUserRate = ?, noMinMaxMaxUserRate = ? WHERE levelID = ?`).run(
        ratings.length, average, filteredAverage, filtered.length ? Math.min(...filtered) : 0,
        filtered.length ? Math.max(...filtered) : 0, levelId
    );
}

function collectionLevelIds(value, count = null) {
    if (typeof value !== 'string' || !/^\d+(,\d+)*$/.test(value)) return null;
    const values = value.split(',');
    if ((count !== null && values.length !== count) || values.length < 1) return null;
    const ids = values.map(Number);
    if (ids.some(id => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) return null;
    const placeholders = ids.map(() => '?').join(',');
    const existing = db.prepare(`SELECT levelID FROM levels WHERE levelID IN (${placeholders})`).all(...ids);
    return existing.length === ids.length ? ids : null;
}

function collectionColor(value) {
    if (typeof value !== 'string' || !/^\d+,\d+,\d+$/.test(value)) return null;
    const channels = value.split(',').map(Number);
    return channels.every(channel => channel >= 0 && channel <= 255) ? value : null;
}

async function parseSongUpload(req) {
    const contentType = req.get('content-type') || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) throw new Error('Song uploads must use multipart form data');
    const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > 25 * 1024 * 1024) throw new Error('Song file is too large');
        chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const fields = {};
    let file = null;
    let start = body.indexOf(boundary);
    while (start !== -1) {
        const partStart = start + boundary.length + 2;
        const next = body.indexOf(boundary, partStart);
        if (next === -1) break;
        const part = body.subarray(partStart, Math.max(partStart, next - 2));
        const separator = part.indexOf('\r\n\r\n');
        if (separator !== -1) {
            const headers = part.subarray(0, separator).toString('utf8');
            const content = part.subarray(separator + 4);
            const name = headers.match(/name="([^"]+)"/i)?.[1];
            const filename = headers.match(/filename="([^"]*)"/i)?.[1];
            if (name && filename !== undefined) file = { filename, content };
            else if (name) fields[name] = content.toString('utf8');
        }
        start = next;
    }
    return { fields, file };
}

function songExtension(filename) {
    const extension = path.extname(filename || '').toLowerCase();
    return ['.mp3'].includes(extension) ? extension : null;
}

router.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:");
    next();
});

router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));
router.use(express.json({ limit: '32kb' }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
router.post('/api/login', loginLimiter, (req, res) => {
    const elder = Number.isInteger(dashboardAccountId) ? db.prepare('SELECT userName, modLevel FROM profiles WHERE accountID = ?').get(dashboardAccountId) : null;
    if (!dashboardUser || !dashboardPassword || !elder || elder.modLevel !== 2) return res.status(503).json({ error: 'Dashboard elder credentials are not configured' });
    if (!sameSecret(req.body?.username, dashboardUser) || !sameSecret(req.body?.username, elder.userName) || !sameSecret(req.body?.password, dashboardPassword)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ csrf: issueSession(res) });
});

router.post('/api/logout', requireAuth, requireCsrf, (req, res) => {
    const sessionId = req.headers.cookie.split(';').map(item => item.trim()).find(item => item.startsWith('dashboard_session='))?.slice(19);
    sessions.delete(sessionId);
    res.setHeader('Set-Cookie', `dashboard_session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=${dashboardPath}`);
    res.status(204).end();
});

router.get('/api/bootstrap', requireAuth, (req, res) => {
    const stats = db.prepare(`SELECT
        (SELECT COUNT(*) FROM accounts) AS accounts,
        (SELECT COUNT(*) FROM levels) AS levels,
        (SELECT COUNT(*) FROM profiles WHERE modLevel > 0) AS moderators,
        (SELECT COUNT(*) FROM profiles WHERE modLevel = 2) AS elders,
        (SELECT COUNT(*) FROM modSuggest) AS pending`).get();
    const pending = db.prepare(`SELECT m.levelID, m.stars, m.demonDiff, m.feature, l.levelName,
        l.levelLength, l.uploadDate, p.userName AS moderator
        FROM modSuggest m JOIN levels l ON l.levelID = m.levelID
        LEFT JOIN profiles p ON p.accountID = m.accountID
        ORDER BY l.lastSent DESC, l.levelID DESC LIMIT 100`).all();
    const recent = db.prepare(`SELECT l.levelID, l.levelName, l.starStars, l.starDifficulty, l.starDemon,
        l.starDemonDiff, l.featured, l.starEpic, l.starAuto, l.userRates, l.avgUserRate,
        l.uploadDate, p.userName AS creator
        FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID
        ORDER BY l.uploadDate DESC LIMIT 25`).all();
    res.json({ stats, pending, recent, csrf: req.dashboardSession.csrf });
});

router.get('/api/collections', requireAuth, (req, res) => {
    const gauntlets = db.prepare('SELECT * FROM gauntlets WHERE ID BETWEEN 1 AND 60 ORDER BY ID').all();
    const mapPacks = db.prepare('SELECT * FROM mapPacks ORDER BY packID').all();
    const lists = db.prepare(`SELECT l.*, p.userName AS creator FROM lists l
        LEFT JOIN profiles p ON p.accountID = l.accountID ORDER BY l.listID`).all();
    res.json({ gauntlets, mapPacks, lists });
});

router.get('/api/users', requireAuth, (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 64) : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const users = db.prepare(`SELECT a.accountID, a.userName, a.isDisabled,
        COALESCE(p.userName, '') AS profileName, COALESCE(p.modLevel, 0) AS modLevel,
        COALESCE(p.stars, 0) AS stars, COALESCE(p.demons, 0) AS demons,
        COALESCE(p.icon, 0) AS icon, COALESCE(p.iconType, 0) AS iconType,
        COALESCE(p.special, 0) AS special
        FROM accounts a
        LEFT JOIN profiles p ON p.accountID = a.accountID
        WHERE (? = '' OR a.userName LIKE ? ESCAPE '\\' OR COALESCE(p.userName, '') LIKE ? ESCAPE '\\' OR CAST(a.accountID AS TEXT) = ?)
        ORDER BY a.accountID DESC
        LIMIT ? OFFSET ?`).all(query, like, like, query, limit, offset);
    res.json({ users, query, offset, limit });
});

router.put('/api/users/:accountId', requireAuth, requireCsrf, (req, res) => {
    const accountId = Number(req.params.accountId);
    const modLevel = Number(req.body?.modLevel);
    const isDisabled = Number(req.body?.isDisabled);
    if (!Number.isInteger(accountId) || accountId < 1) return res.status(400).json({ error: 'Invalid account' });
    if (!Number.isInteger(modLevel) || modLevel < 0 || modLevel > 3) return res.status(400).json({ error: 'Invalid moderator level' });
    if (!Number.isInteger(isDisabled) || (isDisabled !== 0 && isDisabled !== 1)) return res.status(400).json({ error: 'Invalid disabled flag' });

    const account = db.prepare('SELECT userName FROM accounts WHERE accountID = ?').get(accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const transaction = db.transaction(() => {
        const profile = db.prepare('SELECT accountID FROM profiles WHERE accountID = ?').get(accountId);
        if (!profile) {
            db.prepare('INSERT INTO profiles (accountID, userName, modLevel) VALUES (?, ?, ?)').run(accountId, account.userName, modLevel);
        } else {
            db.prepare('UPDATE profiles SET modLevel = ?, userName = ? WHERE accountID = ?').run(modLevel, account.userName, accountId);
        }
        db.prepare('UPDATE accounts SET isDisabled = ? WHERE accountID = ?').run(isDisabled, accountId);
        return { modLevel, isDisabled };
    });

    res.json(transaction());
});

router.get('/api/server-schedule', requireAuth, (req, res) => {
    const daily = db.prepare(`SELECT l.levelID, l.levelName, l.dailyNumber, l.dailyTime,
        p.userName AS creator FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID
        WHERE l.dailyNumber > 0 AND l.dailyNumber < 100001 ORDER BY l.dailyNumber ASC, l.dailyTime DESC`).all();
    const weekly = db.prepare(`SELECT l.levelID, l.levelName, l.dailyNumber, l.dailyTime,
        p.userName AS creator FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID
        WHERE l.dailyNumber >= 100001 ORDER BY l.dailyNumber ASC, l.dailyTime DESC`).all();
    res.json({ daily, weekly });
});

router.post('/api/server-schedule', requireAuth, requireCsrf, (req, res) => {
    const levelId = Number(req.body?.levelId);
    const slot = Number(req.body?.slot);
    const expiresAt = Number(req.body?.expiresAt) || Math.floor(Date.now() / 1000) + 86400;
    const type = String(req.body?.type || 'daily');
    const isWeekly = type === 'weekly';

    if (!Number.isInteger(levelId) || levelId < 1) return res.status(400).json({ error: 'Invalid level ID' });
    if (!Number.isInteger(slot) || slot < 1) return res.status(400).json({ error: 'Invalid slot number' });
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return res.status(400).json({ error: 'Invalid expiry time' });

    const level = db.prepare('SELECT levelID FROM levels WHERE levelID = ?').get(levelId);
    if (!level) return res.status(404).json({ error: 'Level not found' });

    const targetNumber = isWeekly ? slot + 100000 : slot;

    db.transaction(() => {
        if (isWeekly) {
            db.prepare('UPDATE levels SET dailyNumber = 0, dailyTime = 0 WHERE dailyNumber >= 100001').run();
        } else {
            db.prepare('UPDATE levels SET dailyNumber = 0, dailyTime = 0 WHERE dailyNumber > 0 AND dailyNumber < 100001').run();
        }
        db.prepare('UPDATE levels SET dailyNumber = ?, dailyTime = ? WHERE levelID = ?').run(targetNumber, expiresAt, levelId);
    })();

    res.status(204).end();
});

router.post('/api/server-schedule/clear', requireAuth, requireCsrf, (req, res) => {
    const type = String(req.body?.type || 'daily');
    if (type === 'weekly') {
        db.prepare('UPDATE levels SET dailyNumber = 0, dailyTime = 0 WHERE dailyNumber >= 100001').run();
    } else {
        db.prepare('UPDATE levels SET dailyNumber = 0, dailyTime = 0 WHERE dailyNumber > 0 AND dailyNumber < 100001').run();
    }
    res.status(204).end();
});

router.get('/api/songs', requireAuth, (req, res) => {
    res.json({ songs: db.prepare('SELECT * FROM songs ORDER BY ID DESC').all() });
});

router.post('/api/songs', requireAuth, requireCsrf, async (req, res) => {
    let upload;
    try {
        upload = await parseSongUpload(req);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
    const fields = upload.fields;
    const name = String(fields.name || '').trim();
    const artistName = String(fields.artistName || '').trim();
    const artistID = Number(fields.artistID || 0);
    const extension = songExtension(upload.file?.filename);
    if (!name || name.length > 64 || !artistName || artistName.length > 64 ||
        !Number.isInteger(artistID) || artistID < 0 || !upload.file?.content.length || !extension) {
        return res.status(400).json({ error: 'Song name, artist, artist ID, and a supported audio file are required' });
    }

    await fs.mkdir(songsDirectory, { recursive: true });
    const result = db.prepare(`INSERT INTO songs
        (name, artistID, artistName, videoID, youtubeURL, allowedForUse, songPriority, link,
        nongEnum, extraArtistIDs, isNew, newType, size, extraArtistNames, downloadSoundtrackOverride)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        name, artistID, artistName, String(fields.videoID || ''), String(fields.youtubeURL || ''),
        Number(fields.allowedForUse ?? 1) ? 1 : 0, Number(fields.songPriority || 0), '',
        Number(fields.nongEnum || 0), String(fields.extraArtistIDs || ''), Number(fields.isNew || 0) ? 1 : 0,
        Number(fields.newType || 0), Math.round(upload.file.content.length / 1048576 * 100) / 100,
        String(fields.extraArtistNames || ''), String(fields.downloadSoundtrackOverride || '')
    );
    const songID = Number(result.lastInsertRowid);
    const fileName = `${songID}${extension}`;
    const link = `${String(process.env.SONG_BASE_URL || `${req.protocol}://${req.get('host')}/songs`).replace(/\/+$/, '')}/${fileName}`;
    try {
        await fs.writeFile(path.join(songsDirectory, fileName), upload.file.content, { flag: 'wx' });
        db.prepare('UPDATE songs SET link = ? WHERE ID = ?').run(link, songID);
    } catch (error) {
        db.prepare('DELETE FROM songs WHERE ID = ?').run(songID);
        await fs.unlink(path.join(songsDirectory, fileName)).catch(() => {});
        return res.status(500).json({ error: 'Failed to store song file' });
    }
    res.status(201).json({ song: db.prepare('SELECT * FROM songs WHERE ID = ?').get(songID) });
});

router.delete('/api/songs/:id', requireAuth, requireCsrf, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid song' });
    const song = db.prepare('SELECT link FROM songs WHERE ID = ?').get(id);
    if (!song) return res.status(404).json({ error: 'Song not found' });
    const fileName = path.basename(new URL(song.link, `${req.protocol}://${req.get('host')}`).pathname);
    await fs.unlink(path.join(songsDirectory, fileName)).catch(() => {});
    db.prepare('DELETE FROM songs WHERE ID = ?').run(id);
    res.status(204).end();
});

router.put('/api/gauntlets/:id', requireAuth, requireCsrf, (req, res) => {
    const id = Number(req.params.id);
    const levels = collectionLevelIds(req.body?.levels, 5);
    if (!Number.isInteger(id) || id < 1 || id > 60 || !levels) return res.status(400).json({ error: 'Gauntlets require five existing, unique level IDs' });
    db.prepare(`INSERT INTO gauntlets (ID, level1, level2, level3, level4, level5) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(ID) DO UPDATE SET level1 = excluded.level1, level2 = excluded.level2,
        level3 = excluded.level3, level4 = excluded.level4, level5 = excluded.level5`).run(id, ...levels);
    res.status(204).end();
});

router.delete('/api/gauntlets/:id', requireAuth, requireCsrf, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1 || id > 60) return res.status(400).json({ error: 'Invalid gauntlet' });
    if (!db.prepare('DELETE FROM gauntlets WHERE ID = ?').run(id).changes) return res.status(404).json({ error: 'Gauntlet not found' });
    res.status(204).end();
});

function mapPackInput(body) {
    const packName = typeof body?.packName === 'string' ? body.packName.trim() : '';
    const levels = collectionLevelIds(body?.levels);
    const stars = Number(body?.stars);
    const coins = Number(body?.coins);
    const difficulty = Number(body?.difficulty);
    const barColor = collectionColor(body?.barColor);
    const textColor = collectionColor(body?.textColor);
    if (!packName || packName.length > 64 || !levels || !Number.isInteger(stars) || stars < 0 ||
        !Number.isInteger(coins) || coins < 0 || !Number.isInteger(difficulty) || difficulty < 0 || difficulty > 5 || !barColor || !textColor) return null;
    return { packName, levels: levels.join(','), stars, coins, difficulty, barColor, textColor };
}

router.post('/api/map-packs', requireAuth, requireCsrf, (req, res) => {
    const pack = mapPackInput(req.body);
    if (!pack) return res.status(400).json({ error: 'Invalid map pack details' });
    const result = db.prepare(`INSERT INTO mapPacks (packName, levels, stars, coins, difficulty, barColor, textColor)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(pack.packName, pack.levels, pack.stars, pack.coins, pack.difficulty, pack.barColor, pack.textColor);
    res.status(201).json({ pack: db.prepare('SELECT * FROM mapPacks WHERE packID = ?').get(result.lastInsertRowid) });
});

router.put('/api/map-packs/:id', requireAuth, requireCsrf, (req, res) => {
    const id = Number(req.params.id);
    const pack = mapPackInput(req.body);
    if (!Number.isInteger(id) || id < 1 || !pack) return res.status(400).json({ error: 'Invalid map pack details' });
    const result = db.prepare(`UPDATE mapPacks SET packName = ?, levels = ?, stars = ?, coins = ?, difficulty = ?,
        barColor = ?, textColor = ? WHERE packID = ?`).run(pack.packName, pack.levels, pack.stars, pack.coins, pack.difficulty, pack.barColor, pack.textColor, id);
    if (!result.changes) return res.status(404).json({ error: 'Map pack not found' });
    res.status(204).end();
});

router.delete('/api/map-packs/:id', requireAuth, requireCsrf, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid map pack' });
    if (!db.prepare('DELETE FROM mapPacks WHERE packID = ?').run(id).changes) return res.status(404).json({ error: 'Map pack not found' });
    res.status(204).end();
});

function levelListInput(body) {
    const listName = typeof body?.listName === 'string' ? body.listName.trim() : '';
    const listDesc = typeof body?.listDesc === 'string' ? body.listDesc : '';
    const levels = collectionLevelIds(body?.listLevels);
    const difficulty = Number(body?.starDifficulty);
    const stars = Number(body?.starStars);
    const featured = Number(body?.featured);
    const countForReward = Number(body?.countForReward);
    const original = Number(body?.original);
    const unlisted = Number(body?.unlisted);
    if (!listName || listName.length > 20 || (listDesc && !/^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}==|[A-Za-z0-9_-]{3}=)$/.test(listDesc)) || !levels ||
        !Number.isInteger(difficulty) || difficulty < -1 || difficulty > 10 ||
        !Number.isInteger(stars) || stars < 0 || stars > 10 ||
        !Number.isInteger(featured) || featured < 0 || featured > 1 ||
        !Number.isInteger(countForReward) || countForReward < 0 || countForReward > 1 ||
        (stars > 0 && countForReward < 1) ||
        !Number.isInteger(original) || original < 0 || original > 1 ||
        !Number.isInteger(unlisted) || unlisted < 0 || unlisted > 2) return null;
    return { listName, listDesc, listLevels: levels.join(','), difficulty, stars, featured, countForReward, original, unlisted };
}

router.post('/api/lists', requireAuth, requireCsrf, (req, res) => {
    const list = levelListInput(req.body);
    const accountID = dashboardAccountId;
    if (!list || !Number.isInteger(accountID) || accountID < 1) return res.status(400).json({ error: 'Invalid level list details' });
    const account = db.prepare('SELECT accountID FROM accounts WHERE accountID = ?').get(accountID);
    if (!account) return res.status(400).json({ error: 'Dashboard account not found' });
    const now = Math.floor(Date.now() / 1000);
    const result = db.prepare(`INSERT INTO lists
        (listName, listDesc, accountID, starDifficulty, starDemon, starStars, featured, listLevels,
        countForReward, uploadDate, updateDate, original, unlisted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        list.listName, list.listDesc, accountID, list.difficulty, list.difficulty > 5 ? 1 : 0, list.stars,
        list.featured, list.listLevels, list.countForReward, now, now, list.original, list.unlisted
    );
    res.status(201).json({ list: db.prepare('SELECT * FROM lists WHERE listID = ?').get(result.lastInsertRowid) });
});

router.put('/api/lists/:id', requireAuth, requireCsrf, (req, res) => {
    const id = Number(req.params.id);
    const list = levelListInput(req.body);
    if (!Number.isInteger(id) || id < 1 || !list) return res.status(400).json({ error: 'Invalid level list details' });
    const result = db.prepare(`UPDATE lists SET listName = ?, listDesc = ?, listVersion = listVersion + 1,
        listLevels = ?, starDifficulty = ?, starDemon = ?, starStars = ?, featured = ?, countForReward = ?,
        updateDate = ?, original = ?, unlisted = ? WHERE listID = ?`).run(
        list.listName, list.listDesc, list.listLevels, list.difficulty, list.difficulty > 5 ? 1 : 0,
        list.stars, list.featured, list.countForReward, Math.floor(Date.now() / 1000), list.original, list.unlisted, id
    );
    if (!result.changes) return res.status(404).json({ error: 'Level list not found' });
    res.status(204).end();
});

router.delete('/api/lists/:id', requireAuth, requireCsrf, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid level list' });
    if (!db.prepare('DELETE FROM lists WHERE listID = ?').run(id).changes) return res.status(404).json({ error: 'Level list not found' });
    res.status(204).end();
});

router.get('/api/levels', requireAuth, (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const levels = db.prepare(`SELECT l.levelID, l.levelName, l.levelDesc, l.levelLength,
        l.starStars, l.starDifficulty, l.starAuto, l.starDemon, l.starDemonDiff,
        l.featured, l.starEpic, l.userRates, l.avgUserRate, l.downloads, l.likes,
        l.isSent, l.uploadDate, p.userName AS creator
        FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID
        WHERE (? = '' OR l.levelName LIKE ? ESCAPE '\\' OR CAST(l.levelID AS TEXT) = ?)
        ORDER BY l.uploadDate DESC, l.levelID DESC LIMIT ? OFFSET ?`).all(query, like, query, limit, offset);
    res.json({ levels, query, offset, limit });
});

router.get('/api/levels/:levelId', requireAuth, (req, res) => {
    const levelId = Number(req.params.levelId);
    if (!Number.isInteger(levelId) || levelId < 1) return res.status(400).json({ error: 'Invalid level' });
    const level = db.prepare(`SELECT l.*, p.userName AS creator FROM levels l
        LEFT JOIN profiles p ON p.accountID = l.accountID WHERE l.levelID = ?`).get(levelId);
    if (!level) return res.status(404).json({ error: 'Level not found' });
    const suggestions = db.prepare(`SELECT m.stars, m.demonDiff, m.feature, p.userName AS moderator
        FROM modSuggest m LEFT JOIN profiles p ON p.accountID = m.accountID
        WHERE m.levelID = ? ORDER BY p.userName`).all(levelId);
    const ratings = db.prepare(`SELECT r.accountID, r.stars, p.userName FROM level_ratings r
        LEFT JOIN profiles p ON p.accountID = r.accountID WHERE r.levelID = ? ORDER BY r.accountID`).all(levelId);
    res.json({ level, suggestions, ratings });
});

router.post('/api/rate', requireAuth, requireCsrf, (req, res) => {
    const levelId = Number(req.body?.levelId);
    const stars = Number(req.body?.stars);
    const feature = Number(req.body?.feature || 0);
    const demonDiff = Number(req.body?.demonDiff || 0);
    if (!Number.isInteger(levelId) || levelId < 1 || !Number.isInteger(stars) || stars < 1 || stars > 10 || !Number.isInteger(feature) || feature < 0 || feature > 4) {
        return res.status(400).json({ error: 'Invalid rating' });
    }
    if (stars === 10 && ![0, 3, 4, 5, 6].includes(demonDiff)) return res.status(400).json({ error: 'Invalid demon difficulty' });
    if (stars !== 10 && demonDiff !== 0) return res.status(400).json({ error: 'Demon difficulty requires a 10-star rating' });
    try {
        if (!applyRating(levelId, stars, feature, demonDiff)) return res.status(404).json({ error: 'Level not found' });
        res.status(204).end();
    } catch (error) {
        console.error('\x1b[1;31m✗ Dashboard rating failed:\x1b[0m', error);
        res.status(500).json({ error: 'Could not rate level' });
    }
});

router.post('/api/levels/:levelId/unrate', requireAuth, requireCsrf, (req, res) => {
    const levelId = Number(req.params.levelId);
    if (!Number.isInteger(levelId) || levelId < 1) return res.status(400).json({ error: 'Invalid level' });
    if (!clearRating(levelId)) return res.status(404).json({ error: 'Level not found' });
    res.status(204).end();
});

router.post('/api/levels/:levelId/difficulty', requireAuth, requireCsrf, (req, res) => {
    const levelId = Number(req.params.levelId);
    const difficulty = Number(req.body?.difficulty);
    if (!Number.isInteger(levelId) || levelId < 1 || !Number.isInteger(difficulty) || difficulty < 0 || difficulty > 5) {
        return res.status(400).json({ error: 'Invalid difficulty' });
    }
    const level = db.prepare('SELECT starStars FROM levels WHERE levelID = ?').get(levelId);
    if (!level) return res.status(404).json({ error: 'Level not found' });
    if (level.starStars !== 0) return res.status(409).json({ error: 'Unrate the level before changing its difficulty' });
    if (!applyDifficulty(levelId, difficulty)) return res.status(404).json({ error: 'Level not found' });
    res.status(204).end();
});

router.delete('/api/levels/:levelId/user-ratings/:accountId', requireAuth, requireCsrf, (req, res) => {
    const levelId = Number(req.params.levelId);
    const accountId = Number(req.params.accountId);
    if (!Number.isInteger(levelId) || levelId < 1 || !Number.isInteger(accountId) || accountId < 1) {
        return res.status(400).json({ error: 'Invalid rating' });
    }
    const result = db.prepare('DELETE FROM level_ratings WHERE levelID = ? AND accountID = ?').run(levelId, accountId);
    if (!result.changes) return res.status(404).json({ error: 'Rating not found' });
    refreshUserRatingStats(levelId);
    res.status(204).end();
});

router.post('/api/reject', requireAuth, requireCsrf, (req, res) => {
    const levelId = Number(req.body?.levelId);
    if (!Number.isInteger(levelId) || levelId < 1) return res.status(400).json({ error: 'Invalid level' });
    const result = db.transaction(() => {
        const deleted = db.prepare('DELETE FROM modSuggest WHERE levelID = ?').run(levelId);
        db.prepare('UPDATE levels SET isSent = 0, lastSent = 0 WHERE levelID = ?').run(levelId);
        return deleted.changes;
    })();
    if (!result) return res.status(404).json({ error: 'Suggestion not found' });
    res.status(204).end();
});

router.get('/api/quests', requireAuth, (req, res) => {
    const quests = db.prepare('SELECT * FROM quests ORDER BY questID DESC').all();
    res.json({ quests });
});

router.post('/api/quests', requireAuth, requireCsrf, (req, res) => {
    const type = Number(req.body?.type);
    const amount = Number(req.body?.amount);
    const reward = Number(req.body?.reward);
    const name = String(req.body?.name || '').trim();

    if (![1, 2, 3].includes(type)) return res.status(400).json({ error: 'Invalid quest type (must be 1=Orbs, 2=Coins, or 3=Stars)' });
    if (!Number.isInteger(amount) || amount < 1 || amount > 999) return res.status(400).json({ error: 'Quest amount must be between 1 and 999' });
    if (!Number.isInteger(reward) || reward < 1 || reward > 999) return res.status(400).json({ error: 'Quest reward must be between 1 and 999' });
    if (!name || name.length > 64) return res.status(400).json({ error: 'Quest name is required and must be under 64 characters' });

    const result = db.prepare('INSERT INTO quests (type, amount, reward, name) VALUES (?, ?, ?, ?)').run(type, amount, reward, name);
    res.status(201).json({ quest: db.prepare('SELECT * FROM quests WHERE questID = ?').get(result.lastInsertRowid) });
});

router.delete('/api/quests/:id', requireAuth, requireCsrf, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid quest' });
    const result = db.prepare('DELETE FROM quests WHERE questID = ?').run(id);
    if (!result.changes) return res.status(404).json({ error: 'Quest not found' });
    res.status(204).end();
});

router.use(express.static(path.join(__dirname, 'dashboard'), { index: false, dotfiles: 'deny' }));

module.exports = router;
