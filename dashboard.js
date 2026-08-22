const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./database');

const router = express.Router();
const sessions = new Map();
const sessionTtl = 8 * 60 * 60 * 1000;
const dashboardUser = process.env.DASHBOARD_USER;
const dashboardPassword = process.env.DASHBOARD_PASSWORD;
const dashboardAccountId = Number(process.env.DASHBOARD_ACCOUNT_ID);
const secureCookies = process.env.DASHBOARD_SECURE_COOKIES === '1';
const dashboardPath = (process.env.DASHBOARD_PATH || '/dashboard').replace(/\/+$/, '').replace(/^([^/])/, '/$1') || '/dashboard';

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
    const updates = ['starStars = ?', 'starAuto = 0', 'starDemon = 0', 'starDifficulty = 0'];
    if (stars === 1) updates.push('starAuto = 1', 'starDifficulty = 1');
    else if (stars === 2) updates.push('starDifficulty = 1');
    else if (stars === 3) updates.push('starDifficulty = 2');
    else if (stars <= 5) updates.push('starDifficulty = 3');
    else if (stars <= 7) updates.push('starDifficulty = 4');
    else if (stars <= 9) updates.push('starDifficulty = 5');
    else {
        updates.push('starDemon = 1', 'starDifficulty = 5');
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
    const recent = db.prepare(`SELECT l.levelID, l.levelName, l.starStars, l.starDemon,
        l.starDemonDiff, l.featured, l.starEpic, l.uploadDate, p.userName AS creator
        FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID
        ORDER BY l.uploadDate DESC LIMIT 25`).all();
    res.json({ stats, pending, recent, csrf: req.dashboardSession.csrf });
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
    try {
        if (!applyRating(levelId, stars, feature, demonDiff)) return res.status(404).json({ error: 'Level not found' });
        res.status(204).end();
    } catch (error) {
        console.error('Dashboard rating failed:', error);
        res.status(500).json({ error: 'Could not rate level' });
    }
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

router.use(express.static(path.join(__dirname, 'dashboard'), { index: false, dotfiles: 'deny' }));

module.exports = router;
