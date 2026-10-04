const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs/promises');
const db = require('./database');
const config = require('./config');
const utils = require('./utils');
const { cleanupLevelRelatedData, cleanupListRelatedData, cleanupSongReferences } = require('./contentCleanup');
const { levelRatingWebhookEmbed } = require('./webhook');

const ACCOUNT_ACTION_FEATURES = ['accountRole', 'accountDisable', 'leaderboardBan', 'commentBan', 'creatorBan', 'accountAccess'];
const DASHBOARD_FEATURES = ['overview', 'levels', 'collections', 'management', 'users', 'schedule', ...ACCOUNT_ACTION_FEATURES];
const DASHBOARD_FEATURE_LABELS = {
    overview: 'Overview',
    levels: 'Level moderation',
    collections: 'Collections',
    management: 'Server management',
    users: 'Accounts and moderation',
    schedule: 'Daily, weekly, and event schedule',
    accountRole: 'Change moderator roles',
    accountDisable: 'Disable accounts',
    leaderboardBan: 'Leaderboard bans',
    commentBan: 'Comment bans',
    creatorBan: 'Creator bans',
    accountAccess: 'Edit account dashboard access'
};
const DEFAULT_DASHBOARD_PERMISSIONS = {
    0: [],
    1: ['overview', 'leaderboardBan'],
    2: ['overview', 'levels', 'collections', 'management', 'users', 'schedule', ...ACCOUNT_ACTION_FEATURES],
    3: ['overview', 'leaderboardBan']
};
const MODERATOR_RANK = { 0: 0, 3: 1, 1: 2, 2: 3 };

function getModeratorRank(modLevel) {
    return MODERATOR_RANK[Number(modLevel)] ?? -1;
}

const router = express.Router();
const sessions = new Map();
const sessionTtl = 8 * 60 * 60 * 1000;
const dashboardUser = process.env.DASHBOARD_USER;
const dashboardPassword = process.env.DASHBOARD_PASSWORD;
const dashboardAccountId = Number(process.env.DASHBOARD_ACCOUNT_ID);
const secureCookies = process.env.DASHBOARD_SECURE_COOKIES === '1';
const dashboardPath = config.dashboard.path;
const songsDirectory = path.join(__dirname, 'songs');

function decodeBase64Url(value) {
    if (!value) return '';
    try {
        const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return Buffer.from(padded, 'base64').toString('utf8');
    } catch {
        return value;
    }
}

function sameSecret(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeFeatureList(value) {
    if (value === '*' || value === null || value === undefined) return [...DASHBOARD_FEATURES];
    if (typeof value !== 'string') return [];
    return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean).filter(feature => DASHBOARD_FEATURES.includes(feature)))];
}

function getDashboardPermissionSchema() {
    const row = db.prepare('SELECT schema FROM dashboard_permission_schema WHERE id = 1').get();
    if (!row) return { roles: DEFAULT_DASHBOARD_PERMISSIONS };

    try {
        const stored = JSON.parse(row.schema);
        const roles = {};
        const legacySchema = stored.version !== 2 && stored.version !== 3;
        for (const modLevel of [0, 1, 2, 3]) {
            const permissions = stored.roles?.[modLevel];
            roles[modLevel] = Array.isArray(permissions)
                ? [...new Set(permissions.filter(feature => DASHBOARD_FEATURES.includes(feature)))].sort()
                : [...DEFAULT_DASHBOARD_PERMISSIONS[modLevel]];
            if (legacySchema && roles[modLevel].includes('users')) {
                roles[modLevel] = [...new Set([...roles[modLevel], ...ACCOUNT_ACTION_FEATURES])].sort();
            }
            const previousRoleThreeDefaults = Array.isArray(permissions) && permissions.length === 2 &&
                ((permissions.includes('leaderboard') && permissions.includes('overview')) ||
                    (permissions.includes('users') && permissions.includes('leaderboardBan')));
            if (modLevel === 3 && previousRoleThreeDefaults && (legacySchema || stored.version === 2)) {
                roles[modLevel] = [...DEFAULT_DASHBOARD_PERMISSIONS[3]];
            }
        }
        return { roles };
    } catch {
        return { roles: DEFAULT_DASHBOARD_PERMISSIONS };
    }
}

function getDefaultDashboardFeatures(modLevel) {
    return [...(getDashboardPermissionSchema().roles[modLevel] || [])];
}

function getDashboardAccess(accountId) {
    const profile = db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(accountId);
    const modLevel = Number(profile?.modLevel || 0);
    const defaults = new Set(getDefaultDashboardFeatures(modLevel));
    const row = db.prepare('SELECT allowedFeatures, restrictedBy, updatedAt, permissionsVersion FROM dashboard_access WHERE accountID = ?').get(accountId);

    if (!row) {
        return { modLevel, allowedFeatures: [...defaults].sort() };
    }

    const override = row.allowedFeatures;
    let allowed = override === '*' ? [...defaults] : normalizeFeatureList(override).filter(feature => defaults.has(feature));
    if (override !== '*' && Number(row.permissionsVersion || 1) < 2 && allowed.includes('users')) {
        for (const feature of ACCOUNT_ACTION_FEATURES) {
            if (defaults.has(feature)) allowed.push(feature);
        }
    }
    return { modLevel, allowedFeatures: [...new Set(allowed)].sort(), restrictedBy: row.restrictedBy || 0, updatedAt: row.updatedAt || 0 };
}

function hasDashboardFeature(accountId, feature) {
    if (!feature) return false;
    const access = getDashboardAccess(accountId);
    return access.allowedFeatures.includes(feature);
}

function requireDashboardFeature(feature) {
    return (req, res, next) => {
        const session = getSession(req);
        if (!session || !session.accountID) return res.status(401).json({ error: 'Authentication required' });
        if (!hasDashboardFeature(session.accountID, feature)) {
            return res.status(403).json({ error: `Access denied for ${feature}` });
        }
        req.dashboardSession = session;
        req.dashboardAccess = getDashboardAccess(session.accountID);
        next();
    };
}

function hasAccountManagementAccess(accountId) {
    const features = new Set(getDashboardAccess(accountId).allowedFeatures);
    return features.has('users') || ACCOUNT_ACTION_FEATURES.some(feature => features.has(feature));
}

function requireAccountManagementAccess(req, res, next) {
    if (!req.dashboardSession || !hasAccountManagementAccess(req.dashboardSession.accountID)) {
        return res.status(403).json({ error: 'Account management is not enabled for your role' });
    }
    next();
}

function issueSession(res, accountId, modLevel) {
    const id = crypto.randomBytes(32).toString('hex');
    const csrf = crypto.randomBytes(24).toString('hex');
    const features = getDashboardAccess(accountId).allowedFeatures;
    sessions.set(id, { accountID: accountId, modLevel, features, csrf, expires: Date.now() + sessionTtl });
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
    req.dashboardAccess = getDashboardAccess(session.accountID);
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
    const getLevel = db.prepare('SELECT accountID, starStars, featured, starEpic FROM levels WHERE levelID = ?');
    const updateCreatorPoints = db.prepare('UPDATE profiles SET creatorPoints = creatorPoints + ? WHERE accountID = ?');
    const transaction = db.transaction(() => {
        const level = getLevel.get(levelId);
        if (!level) return 0;
        const result = update.run(...values);
        clear.run(levelId);
        const oldFeature = level.featured ? level.starEpic + 1 : 0;
        const pointDelta = utils.creatorPointsForRating(stars, feature) -
            utils.creatorPointsForRating(level.starStars, oldFeature);
        if (pointDelta) updateCreatorPoints.run(pointDelta, level.accountID);
        return result.changes;
    });
    return transaction();
}

function clearRating(levelId) {
    const clear = db.prepare(`UPDATE levels SET starStars = 0,
        starAuto = 0, starDemon = 0, featured = 0, starEpic = 0, starDemonDiff = 0,
        isSent = 0, lastSent = 0, starDifficulty = ? WHERE levelID = ?`);
    const getLevel = db.prepare('SELECT accountID, starStars, featured, starEpic, avgUserRate FROM levels WHERE levelID = ?');
    const updateCreatorPoints = db.prepare('UPDATE profiles SET creatorPoints = creatorPoints - ? WHERE accountID = ?');
    const transaction = db.transaction(() => {
        const level = getLevel.get(levelId);
        if (!level) return 0;
        const result = clear.run(difficultyFromAverage(level.avgUserRate), levelId);
        const oldFeature = level.featured ? level.starEpic + 1 : 0;
        const points = utils.creatorPointsForRating(level.starStars, oldFeature);
        if (points) updateCreatorPoints.run(points, level.accountID);
        db.prepare('DELETE FROM modSuggest WHERE levelID = ?').run(levelId);
        return result.changes;
    });
    return transaction();
}

function applyDifficulty(levelId, difficulty) {
    return db.prepare('UPDATE levels SET starDifficulty = ? WHERE levelID = ?').run(difficulty, levelId).changes;
}

function difficultyFromAverage(average) {
    if (average <= 0) return 0;
    if (average <= 2) return 1;
    if (average === 3) return 2;
    if (average <= 5) return 3;
    if (average <= 7) return 4;
    return 5;
}

function refreshUserRatingStats(levelId) {
    const ratings = db.prepare('SELECT stars FROM level_ratings WHERE levelID = ?').all(levelId).map(row => row.stars);
    const average = ratings.length ? Math.round(ratings.reduce((sum, stars) => sum + stars, 0) / ratings.length) : 0;
    const difficulty = difficultyFromAverage(average);
    const filtered = ratings.filter(stars => stars > 1 && stars < 10);
    const filteredAverage = filtered.length ? Math.round(filtered.reduce((sum, stars) => sum + stars, 0) / filtered.length) : 0;
    db.prepare(`UPDATE levels SET userRates = ?, avgUserRate = ?, noMinMaxAvgUserRate = ?,
        noMinMaxMinUserRate = ?, noMinMaxMaxUserRate = ?,
        starDifficulty = CASE WHEN starStars = 0 THEN ? ELSE starDifficulty END WHERE levelID = ?`).run(
        ratings.length, average, filteredAverage, filtered.length ? Math.min(...filtered) : 0,
        filtered.length ? Math.max(...filtered) : 0, difficulty, levelId
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

router.use('/api/collections', requireAuth, requireDashboardFeature('collections'));
router.use('/api/gauntlets', requireAuth, requireDashboardFeature('collections'));
router.use('/api/map-packs', requireAuth, requireDashboardFeature('collections'));
router.use('/api/lists', requireAuth, requireDashboardFeature('collections'));
router.use('/api/levels', requireAuth, requireDashboardFeature('levels'));
router.use('/api/rate', requireAuth, requireDashboardFeature('levels'));
router.use('/api/reject', requireAuth, requireDashboardFeature('levels'));
router.use('/api/users', requireAuth, requireAccountManagementAccess);
router.use('/api/server-schedule', requireAuth, requireDashboardFeature('schedule'));
router.use('/api/secret-rewards', requireAuth, requireDashboardFeature('management'));
router.use('/api/songs', requireAuth, requireDashboardFeature('management'));
router.use('/api/quests', requireAuth, requireDashboardFeature('management'));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
router.post('/api/login', loginLimiter, (req, res) => {
    const username = utils.remove(String(req.body?.username || '')).trim();
    const password = String(req.body?.password || '');
    const account = username ? db.prepare('SELECT * FROM accounts WHERE LOWER(userName) = ?').get(utils.normalizeUsername(username)) : null;
    const profile = account ? db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(account.accountID) : null;
    const validInGameCredentials = Boolean(account && profile && getModeratorRank(profile.modLevel) > 0 && account.gjp2 === utils.generateGJP2(password));
    const legacyCredentialsConfigured = Boolean(dashboardUser && dashboardPassword && Number.isInteger(dashboardAccountId));
    const legacyAccount = legacyCredentialsConfigured ? db.prepare('SELECT userName, modLevel FROM profiles WHERE accountID = ?').get(dashboardAccountId) : null;
    const legacyValid = Boolean(legacyAccount && getModeratorRank(legacyAccount.modLevel) >= getModeratorRank(2) && sameSecret(String(req.body?.username || ''), dashboardUser) && sameSecret(String(req.body?.username || ''), legacyAccount.userName) && sameSecret(String(req.body?.password || ''), dashboardPassword));

    if (!validInGameCredentials && !legacyValid) {
        return res.status(401).json({ error: 'Invalid dashboard credentials' });
    }

    const authenticatedAccount = validInGameCredentials ? account : legacyAccount ? db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(dashboardAccountId) : null;
    const authenticatedProfile = authenticatedAccount ? db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(authenticatedAccount.accountID) : null;
    if (!authenticatedAccount || !authenticatedProfile || getModeratorRank(authenticatedProfile.modLevel) < 1 || authenticatedAccount.isDisabled === 1) {
        return res.status(403).json({ error: 'Account is not allowed to use the dashboard' });
    }

    const csrf = issueSession(res, authenticatedAccount.accountID, authenticatedProfile.modLevel);
    res.json({ csrf, accountID: authenticatedAccount.accountID, modLevel: authenticatedProfile.modLevel, features: getDashboardAccess(authenticatedAccount.accountID).allowedFeatures });
});

router.post('/api/logout', requireAuth, requireCsrf, (req, res) => {
    const sessionId = req.headers.cookie.split(';').map(item => item.trim()).find(item => item.startsWith('dashboard_session='))?.slice(19);
    sessions.delete(sessionId);
    res.setHeader('Set-Cookie', `dashboard_session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=${dashboardPath}`);
    res.status(204).end();
});

router.get('/api/access', requireAuth, (req, res) => {
    const current = db.prepare('SELECT modLevel, userName FROM profiles WHERE accountID = ?').get(req.dashboardSession.accountID);
    const access = getDashboardAccess(req.dashboardSession.accountID);
    const row = db.prepare('SELECT allowedFeatures, restrictedBy, updatedAt FROM dashboard_access WHERE accountID = ?').get(req.dashboardSession.accountID);
    res.json({
        modLevel: current?.modLevel || 0,
        username: current?.userName || '',
        features: access.allowedFeatures,
        customRestrictions: row ? { allowedFeatures: row.allowedFeatures, restrictedBy: row.restrictedBy, updatedAt: row.updatedAt } : null,
        csrf: req.dashboardSession.csrf
    });
});

router.get('/api/access/:accountId', requireAuth, requireDashboardFeature('accountAccess'), (req, res) => {
    const targetAccountId = Number(req.params.accountId);
    const requesterProfile = db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(req.dashboardSession.accountID);
    const targetAccount = db.prepare('SELECT accountID FROM accounts WHERE accountID = ?').get(targetAccountId);
    const targetProfile = db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(targetAccountId) || { modLevel: 0 };
    if (!requesterProfile) return res.status(403).json({ error: 'Moderator profile required' });
    if (!targetAccount) return res.status(404).json({ error: 'Target account not found' });
    if (getModeratorRank(targetProfile.modLevel) > getModeratorRank(requesterProfile.modLevel)) return res.status(403).json({ error: 'You cannot manage access for a higher-ranked mod' });

    const access = getDashboardAccess(targetAccountId);
    const row = db.prepare('SELECT allowedFeatures, restrictedBy, updatedAt FROM dashboard_access WHERE accountID = ?').get(targetAccountId);
    res.json({
        accountId: targetAccountId,
        modLevel: targetProfile.modLevel,
        defaults: getDefaultDashboardFeatures(targetProfile.modLevel),
        rolePermissions: getDashboardPermissionSchema().roles,
        features: access.allowedFeatures,
        featureCatalog: DASHBOARD_FEATURES.map(key => ({ key, label: DASHBOARD_FEATURE_LABELS[key] })),
        customRestrictions: row ? { allowedFeatures: row.allowedFeatures, restrictedBy: row.restrictedBy, updatedAt: row.updatedAt } : null
    });
});

router.put('/api/access/:accountId', requireAuth, requireDashboardFeature('accountAccess'), requireCsrf, (req, res) => {
    const targetAccountId = Number(req.params.accountId);
    const requesterProfile = db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(req.dashboardSession.accountID);
    const targetProfile = db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(targetAccountId);
    if (!requesterProfile) return res.status(403).json({ error: 'Moderator profile required' });
    if (!targetProfile) return res.status(404).json({ error: 'Target account not found' });

    const rawFeatures = Array.isArray(req.body?.features) ? req.body.features : [];
    const cleaned = [...new Set(rawFeatures.map(String).map(item => item.trim()).filter(item => DASHBOARD_FEATURES.includes(item)))];
    const defaultFeatures = new Set(getDefaultDashboardFeatures(targetProfile.modLevel));
    const filtered = cleaned.filter(feature => defaultFeatures.has(feature));
    if (getModeratorRank(targetProfile.modLevel) > getModeratorRank(requesterProfile.modLevel)) {
        return res.status(403).json({ error: 'You cannot manage access for a higher-ranked mod' });
    }

    if (req.body?.inheritDefaults === true) {
        db.prepare('DELETE FROM dashboard_access WHERE accountID = ?').run(targetAccountId);
        return res.json({ accountID: targetAccountId, features: [...defaultFeatures].sort(), inherited: true });
    }

    const nextValue = filtered.join(',');
    const now = Math.floor(Date.now() / 1000);
    db.prepare('INSERT INTO dashboard_access (accountID, allowedFeatures, updatedAt, restrictedBy, permissionsVersion) VALUES (?, ?, ?, ?, 2) ON CONFLICT(accountID) DO UPDATE SET allowedFeatures = excluded.allowedFeatures, updatedAt = excluded.updatedAt, restrictedBy = excluded.restrictedBy, permissionsVersion = 2').run(targetAccountId, nextValue, now, req.dashboardSession.accountID);
    res.json({ accountID: targetAccountId, features: filtered });
});

router.get('/api/permissions/schema', requireAuth, (req, res) => {
    const profile = db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(req.dashboardSession.accountID);
    if (!profile || getModeratorRank(profile.modLevel) < getModeratorRank(2)) return res.status(403).json({ error: 'Only mods can manage the permission schema' });
    const row = db.prepare('SELECT updatedAt, updatedBy FROM dashboard_permission_schema WHERE id = 1').get();
    res.json({
        roles: getDashboardPermissionSchema().roles,
        features: DASHBOARD_FEATURES.map(key => ({ key, label: DASHBOARD_FEATURE_LABELS[key] })),
        updatedAt: row?.updatedAt || 0,
        updatedBy: row?.updatedBy || 0
    });
});

router.put('/api/permissions/schema', requireAuth, requireCsrf, (req, res) => {
    const profile = db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(req.dashboardSession.accountID);
    if (!profile || getModeratorRank(profile.modLevel) < getModeratorRank(2)) return res.status(403).json({ error: 'Only mods can manage the permission schema' });

    const rawRoles = req.body?.roles;
    if (!rawRoles || typeof rawRoles !== 'object' || Array.isArray(rawRoles)) {
        return res.status(400).json({ error: 'A role permission map is required' });
    }

    const roles = {};
    for (const modLevel of [0, 1, 2, 3]) {
        const permissions = rawRoles[modLevel];
        if (!Array.isArray(permissions) || permissions.some(feature => !DASHBOARD_FEATURES.includes(feature))) {
            return res.status(400).json({ error: `Invalid permissions for moderator level ${modLevel}` });
        }
        roles[modLevel] = [...new Set(permissions)].sort();
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO dashboard_permission_schema (id, schema, updatedAt, updatedBy) VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET schema = excluded.schema, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy`)
        .run(JSON.stringify({ version: 3, roles }), now, req.dashboardSession.accountID);
    res.json({ roles, updatedAt: now });
});

router.get('/api/bootstrap', requireAuth, (req, res) => {
    const features = new Set(req.dashboardAccess.allowedFeatures);
    const stats = features.has('overview') ? db.prepare(`SELECT
        (SELECT COUNT(*) FROM accounts) AS accounts,
        (SELECT COUNT(*) FROM levels) AS levels,
        (SELECT COUNT(*) FROM profiles WHERE modLevel > 0) AS moderators,
        (SELECT COUNT(*) FROM profiles WHERE modLevel = 2) AS elders,
        (SELECT COUNT(*) FROM modSuggest) AS pending`).get() : null;
    const pending = features.has('levels') ? db.prepare(`SELECT m.levelID, m.stars, m.demonDiff, m.feature, l.levelName,
        l.levelLength, l.uploadDate, p.userName AS moderator
        FROM modSuggest m JOIN levels l ON l.levelID = m.levelID
        LEFT JOIN profiles p ON p.accountID = m.accountID
        ORDER BY l.lastSent DESC, l.levelID DESC LIMIT 100`).all() : [];
    const recent = features.has('levels') ? db.prepare(`SELECT l.levelID, l.levelName, l.starStars, l.starDifficulty, l.starDemon,
        l.starDemonDiff, l.featured, l.starEpic, l.starAuto, l.userRates, l.avgUserRate,
        l.uploadDate, p.userName AS creator
        FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID
        ORDER BY l.uploadDate DESC LIMIT 25`).all() : [];
    res.json({ stats, pending, recent, motd: config.motd ?? '', csrf: req.dashboardSession.csrf, features: [...features] });
});

router.get('/api/collections', requireAuth, (req, res) => {
    const gauntlets = db.prepare('SELECT * FROM gauntlets WHERE ID BETWEEN 1 AND 60 ORDER BY ID').all();
    const mapPacks = db.prepare('SELECT * FROM mapPacks ORDER BY packID').all();
    const lists = db.prepare(`SELECT l.*, p.userName AS creator FROM lists l
        LEFT JOIN profiles p ON p.accountID = l.accountID ORDER BY l.listID`).all().map(list => ({
            ...list,
            listDesc: decodeBase64Url(list.listDesc)
        }));
    res.json({ gauntlets, mapPacks, lists });
});

router.get('/api/users', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 64) : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 10);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const total = db.prepare(`SELECT COUNT(*) AS total FROM accounts a
        LEFT JOIN profiles p ON p.accountID = a.accountID
        WHERE (? = '' OR a.userName LIKE ? ESCAPE '\\' OR COALESCE(p.userName, '') LIKE ? ESCAPE '\\' OR CAST(a.accountID AS TEXT) = ?)`)
        .get(query, like, like, query).total;
    const users = db.prepare(`SELECT a.accountID, a.userName, a.isDisabled, a.leaderboardBan, a.commentBan, a.commentBanReason,
        a.permaCommentBan, a.creatorBanned,
        COALESCE(p.userName, '') AS profileName, COALESCE(p.modLevel, 0) AS modLevel,
        COALESCE(p.stars, 0) AS stars, COALESCE(p.demons, 0) AS demons,
        COALESCE(p.icon, 0) AS icon, COALESCE(p.iconType, 0) AS iconType,
        COALESCE(p.special, 0) AS special
        FROM accounts a
        LEFT JOIN profiles p ON p.accountID = a.accountID
        WHERE (? = '' OR a.userName LIKE ? ESCAPE '\\' OR COALESCE(p.userName, '') LIKE ? ESCAPE '\\' OR CAST(a.accountID AS TEXT) = ?)
        ORDER BY a.accountID DESC
        LIMIT ? OFFSET ?`).all(query, like, like, query, limit, offset);
    res.json({ users, query, offset, limit, total });
});

router.put('/api/users/:accountId', requireCsrf, (req, res) => {
    const accountId = Number(req.params.accountId);
    const body = req.body || {};
    const requestedActions = [
        ['modLevel', 'accountRole'],
        ['isDisabled', 'accountDisable'],
        ['leaderboardBan', 'leaderboardBan'],
        ['commentBan', 'commentBan'],
        ['commentBanReason', 'commentBan'],
        ['permaCommentBan', 'commentBan'],
        ['creatorBanned', 'creatorBan']
    ].filter(([field]) => Object.hasOwn(body, field));
    for (const [, feature] of requestedActions) {
        if (!hasDashboardFeature(req.dashboardSession.accountID, feature)) {
            return res.status(403).json({ error: `Access denied for ${feature}` });
        }
    }
    const modLevel = Number(body.modLevel);
    const isDisabled = Number(body.isDisabled);
    const commentBan = Number(body.commentBan);
    const commentBanReason = typeof body.commentBanReason === 'string' ? body.commentBanReason.trim().slice(0, 64) : '';
    const permaCommentBan = Number(body.permaCommentBan);
    const creatorBanned = Number(body.creatorBanned);
    const leaderboardBan = Number(body.leaderboardBan);
    const currentTime = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(accountId) || accountId < 1) return res.status(400).json({ error: 'Invalid account' });

    const account = db.prepare('SELECT userName, isDisabled, leaderboardBan, commentBan, commentBanReason, permaCommentBan, creatorBanned FROM accounts WHERE accountID = ?').get(accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const requesterProfile = db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(req.dashboardSession.accountID);
    const targetProfile = db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(accountId);
    const targetModLevel = Number(targetProfile?.modLevel || 0);
    const nextModLevel = Object.hasOwn(body, 'modLevel') ? modLevel : targetModLevel;
    const nextDisabled = Object.hasOwn(body, 'isDisabled') ? isDisabled : Number(account.isDisabled);
    const nextLeaderboardBan = Object.hasOwn(body, 'leaderboardBan') ? leaderboardBan : Number(account.leaderboardBan);
    const nextCommentBan = Object.hasOwn(body, 'commentBan') ? commentBan : Number(account.commentBan);
    const nextPermaCommentBan = Object.hasOwn(body, 'permaCommentBan') ? permaCommentBan : Number(account.permaCommentBan);
    const nextCreatorBanned = Object.hasOwn(body, 'creatorBanned') ? creatorBanned : Number(account.creatorBanned);
    if (Object.hasOwn(body, 'modLevel') && (!Number.isInteger(modLevel) || modLevel < 0 || modLevel > 3)) return res.status(400).json({ error: 'Invalid moderator level' });
    if (Object.hasOwn(body, 'isDisabled') && (!Number.isInteger(isDisabled) || (isDisabled !== 0 && isDisabled !== 1))) return res.status(400).json({ error: 'Invalid disabled flag' });
    if (Object.hasOwn(body, 'commentBan') && (!Number.isInteger(commentBan) || commentBan < 0 || (commentBan !== 0 && (commentBan <= currentTime || commentBan > currentTime + 31536000)))) return res.status(400).json({ error: 'Invalid comment ban expiry' });
    if (Object.hasOwn(body, 'permaCommentBan') && (!Number.isInteger(permaCommentBan) || (permaCommentBan !== 0 && permaCommentBan !== 1))) return res.status(400).json({ error: 'Invalid permanent comment ban flag' });
    if (Object.hasOwn(body, 'creatorBanned') && (!Number.isInteger(creatorBanned) || (creatorBanned !== 0 && creatorBanned !== 1))) return res.status(400).json({ error: 'Invalid creator ban flag' });
    if (Object.hasOwn(body, 'leaderboardBan') && (!Number.isInteger(leaderboardBan) || (leaderboardBan !== 0 && leaderboardBan !== 1))) return res.status(400).json({ error: 'Invalid leaderboard ban flag' });
    if (requestedActions.length === 0) return res.status(400).json({ error: 'No account changes provided' });
    if (!requesterProfile) return res.status(403).json({ error: 'Moderator profile required' });
    if (accountId === req.dashboardSession.accountID && nextModLevel !== requesterProfile.modLevel) {
        return res.status(403).json({ error: 'You cannot change your own moderator role' });
    }
    if (getModeratorRank(targetModLevel) > getModeratorRank(requesterProfile.modLevel) ||
        getModeratorRank(nextModLevel) > getModeratorRank(requesterProfile.modLevel)) {
        return res.status(403).json({ error: 'You cannot manage a higher-ranked mod or assign a higher moderator level' });
    }

    const transaction = db.transaction(() => {
        if (Object.hasOwn(body, 'modLevel')) {
            const profile = db.prepare('SELECT accountID FROM profiles WHERE accountID = ?').get(accountId);
            if (!profile) {
                db.prepare('INSERT INTO profiles (accountID, userName, modLevel) VALUES (?, ?, ?)').run(accountId, account.userName, modLevel);
            } else {
                db.prepare('UPDATE profiles SET modLevel = ?, userName = ? WHERE accountID = ?').run(modLevel, account.userName, accountId);
            }
        }
        const sanitizedReason = Object.hasOwn(body, 'commentBanReason')
            ? (nextPermaCommentBan === 1 || nextCommentBan > 0 ? commentBanReason : '')
            : account.commentBanReason;
        db.prepare('UPDATE accounts SET isDisabled = ?, leaderboardBan = ?, commentBan = ?, commentBanReason = ?, permaCommentBan = ?, creatorBanned = ? WHERE accountID = ?').run(
            nextDisabled, nextLeaderboardBan, nextCommentBan, sanitizedReason, nextPermaCommentBan, nextCreatorBanned, accountId
        );
        return { modLevel: nextModLevel, isDisabled: nextDisabled, leaderboardBan: nextLeaderboardBan, commentBan: nextCommentBan, commentBanReason: sanitizedReason, permaCommentBan: nextPermaCommentBan, creatorBanned: nextCreatorBanned };
    });

    res.json(transaction());
});

router.get('/api/server-schedule', requireAuth, (req, res) => {
    const daily = db.prepare(`SELECT l.levelID, l.levelName, l.dailyNumber, l.dailyTime,
        p.userName AS creator FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID
        WHERE l.dailyNumber > 0 AND l.dailyNumber < 100001 ORDER BY l.dailyNumber ASC, l.dailyTime DESC`).all();
    const weekly = db.prepare(`SELECT l.levelID, l.levelName, l.dailyNumber, l.dailyTime,
        p.userName AS creator FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID
        WHERE l.dailyNumber >= 100001 AND l.dailyNumber <= 200000 ORDER BY l.dailyNumber ASC, l.dailyTime DESC`).all();
    const event = db.prepare(`SELECT l.levelID, l.levelName, l.dailyNumber, l.dailyTime,
        p.userName AS creator FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID
        WHERE l.dailyNumber > 200000 ORDER BY l.dailyNumber ASC, l.dailyTime DESC`).all();
    res.json({ daily, weekly, event });
});

function scheduleTargetNumber(type, slot) {
    if (type === 'event') return slot + 200000;
    if (type === 'weekly') return slot + 100000;
    return slot;
}

function scheduleTypeFromNumber(number) {
    if (number > 200000) return 'event';
    if (number >= 100001 && number <= 200000) return 'weekly';
    if (number > 0 && number < 100001) return 'daily';
    return null;
}

router.post('/api/server-schedule', requireAuth, requireCsrf, (req, res) => {
    const levelId = Number(req.body?.levelId);
    const slot = Number(req.body?.slot);
    const rawExpiresAt = req.body?.expiresAt;
    const expiresAt = Number(rawExpiresAt);
    const type = String(req.body?.type || 'daily');
    const isWeekly = type === 'weekly';
    const isEvent = type === 'event';

    if (!Number.isInteger(levelId) || levelId < 1) return res.status(400).json({ error: 'Invalid level ID' });
    if (!Number.isInteger(slot) || slot < 1) return res.status(400).json({ error: 'Invalid slot number' });
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(expiresAt) || expiresAt <= now) return res.status(400).json({ error: 'Schedule levels must have a future expiry' });

    const level = db.prepare('SELECT levelID FROM levels WHERE levelID = ?').get(levelId);
    if (!level) return res.status(404).json({ error: 'Level not found' });

    const targetNumber = scheduleTargetNumber(type, slot);
    const slotConflict = db.prepare('SELECT levelID FROM levels WHERE dailyNumber = ? AND levelID != ?').get(targetNumber, levelId);
    if (slotConflict) return res.status(409).json({ error: `That ${type} slot is already assigned to level #${slotConflict.levelID}` });

    const otherAssignments = db.prepare('SELECT dailyNumber FROM levels WHERE levelID = ? AND dailyNumber != 0').all(levelId);
    const duplicateInType = otherAssignments.some(item => {
        const currentType = scheduleTypeFromNumber(item.dailyNumber);
        return currentType === type && item.dailyNumber !== targetNumber;
    });
    if (duplicateInType) return res.status(409).json({ error: `This level is already assigned to another ${type} slot` });

    db.transaction(() => {
        db.prepare('UPDATE levels SET dailyNumber = ?, dailyTime = ? WHERE levelID = ?').run(targetNumber, expiresAt, levelId);
    })();

    res.status(204).end();
});

router.post('/api/server-schedule/clear', requireAuth, requireCsrf, (req, res) => {
    const type = String(req.body?.type || 'daily');
    if (type === 'event') {
        db.prepare('UPDATE levels SET dailyNumber = 0, dailyTime = 0 WHERE dailyNumber > 200000').run();
    } else if (type === 'weekly') {
        db.prepare('UPDATE levels SET dailyNumber = 0, dailyTime = 0 WHERE dailyNumber >= 100001 AND dailyNumber <= 200000').run();
    } else {
        db.prepare('UPDATE levels SET dailyNumber = 0, dailyTime = 0 WHERE dailyNumber > 0 AND dailyNumber < 100001').run();
    }
    res.status(204).end();
});

router.delete('/api/server-schedule/:type/:slot', requireAuth, requireCsrf, (req, res) => {
    const type = String(req.params.type || 'daily');
    const slot = Number(req.params.slot);
    if (!Number.isInteger(slot) || slot < 1) return res.status(400).json({ error: 'Invalid slot number' });
    const targetNumber = scheduleTargetNumber(type, slot);
    const result = db.prepare('UPDATE levels SET dailyNumber = 0, dailyTime = 0 WHERE dailyNumber = ?').run(targetNumber);
    if (!result.changes) return res.status(404).json({ error: 'Schedule slot not found' });
    res.status(204).end();
});

const secretRewardItemIds = new Set([1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15,
    1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015]);

function secretRewardInput(body) {
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const uses = Number(body?.uses);
    const duration = Number(body?.duration || 0);
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!code || code.length > 64 || !Number.isInteger(uses) || (uses !== -1 && uses < 1) ||
        !Number.isInteger(duration) || duration < 0 || items.length < 1 || items.length > 20) return null;

    const rewards = [];
    for (const item of items) {
        const itemID = Number(item?.itemID);
        const total = Number(item?.total);
        if (!secretRewardItemIds.has(itemID) || !Number.isInteger(total) || total < 1 || total > 999999) return null;
        rewards.push(itemID, total);
    }

    return {
        code: Buffer.from(code, 'utf8').toString('base64'),
        uses,
        duration,
        rewards: rewards.join(',')
    };
}

function secretRewardIsActive(reward, now = Math.floor(Date.now() / 1000)) {
    if (!reward || reward.uses === 0) return false;
    if (reward.duration !== 0 && Number(reward.createdAt) + Number(reward.duration) <= now) return false;
    return true;
}

router.get('/api/secret-rewards', requireAuth, (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const rewards = db.prepare('SELECT rewardID, code, uses, duration, rewards, createdAt FROM secret_rewards ORDER BY rewardID DESC').all()
        .filter(reward => secretRewardIsActive(reward, now));
    res.json({ rewards });
});

router.post('/api/secret-rewards', requireAuth, requireCsrf, (req, res) => {
    const reward = secretRewardInput(req.body);
    if (!reward) return res.status(400).json({ error: 'Invalid secret reward details' });

    try {
        const result = db.prepare(`INSERT INTO secret_rewards (code, uses, duration, rewards, createdAt)
            VALUES (?, ?, ?, ?, ?)`).run(reward.code, reward.uses, reward.duration, reward.rewards, Math.floor(Date.now() / 1000));
        res.status(201).json({ reward: db.prepare('SELECT rewardID, code, uses, duration, rewards, createdAt FROM secret_rewards WHERE rewardID = ?').get(result.lastInsertRowid) });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That secret code already exists' });
        throw error;
    }
});

router.delete('/api/secret-rewards/:id', requireAuth, requireCsrf, (req, res) => {
    const rewardID = Number(req.params.id);
    if (!Number.isInteger(rewardID) || rewardID < 1) return res.status(400).json({ error: 'Invalid secret reward' });
    const result = db.transaction(() => {
        const deleted = db.prepare('DELETE FROM secret_rewards WHERE rewardID = ?').run(rewardID);
        db.prepare('DELETE FROM content_increments WHERE contentID = ? AND contentType = ?').run(rewardID, 'secret_reward');
        return deleted.changes;
    })();
    if (!result) return res.status(404).json({ error: 'Secret reward not found' });
    res.status(204).end();
});

router.get('/api/songs', requireAuth, (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 64) : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 10);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const where = "link != '-' AND (? = '' OR name LIKE ? ESCAPE '\\' OR artistName LIKE ? ESCAPE '\\' OR CAST(ID AS TEXT) = ?)";
    const total = db.prepare(`SELECT COUNT(*) AS total FROM songs WHERE ${where}`).get(query, like, like, query).total;
    const songs = db.prepare(`SELECT * FROM songs WHERE ${where} ORDER BY ID DESC LIMIT ? OFFSET ?`)
        .all(query, like, like, query, limit, offset);
    res.json({ songs, query, offset, limit, total });
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
        (name, artistID, artistName, videoID, youtubeURL, allowedForUse, link, size, downloadSoundtrackOverride)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        name, artistID, artistName, String(fields.videoID || ''), String(fields.youtubeURL || ''),
        Number(fields.allowedForUse ?? 1) ? 1 : 0, '',
        Math.round(upload.file.content.length / 1048576 * 100) / 100,
        String(fields.downloadSoundtrackOverride || '')
    );
    const songID = Number(result.lastInsertRowid);
    const fileName = `${songID}${extension}`;
    const songBaseUrl = config.songBaseUrl || `${utils.getPublicBaseUrl(req, config.publicUrl)}/songs`;
    const link = `${songBaseUrl.replace(/\/+$/, '')}/${fileName}`;
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
    const fileName = path.basename(new URL(song.link, 'http://gdpsnode.invalid').pathname);
    const filePath = path.join(songsDirectory, fileName);
    let songFile = null;
    try {
        songFile = await fs.readFile(filePath).catch(error => {
            if (error.code === 'ENOENT') return null;
            throw error;
        });
        await fs.unlink(filePath).catch(error => {
            if (error.code !== 'ENOENT') throw error;
        });

        const deleted = db.transaction(() => {
            cleanupSongReferences(id);
            return db.prepare('DELETE FROM songs WHERE ID = ?').run(id);
        })();
        if (!deleted.changes) {
            if (songFile) await fs.writeFile(filePath, songFile);
            return res.status(404).json({ error: 'Song not found' });
        }
    } catch (error) {
        if (songFile) await fs.writeFile(filePath, songFile).catch(() => {});
        console.error('\x1b[1;31m✗ Dashboard song deletion failed:\x1b[0m', error);
        return res.status(500).json({ error: 'Could not delete song' });
    }
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
    const result = db.transaction(() => {
        const deletion = db.prepare('DELETE FROM lists WHERE listID = ?').run(id);
        if (deletion.changes > 0) cleanupListRelatedData(id);
        return deletion;
    })();
    if (!result.changes) return res.status(404).json({ error: 'Level list not found' });
    res.status(204).end();
});

router.get('/api/levels', requireAuth, (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 10);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const sort = ['name', 'stars'].includes(req.query.sort) ? req.query.sort : 'id';
    const orderBy = sort === 'name' ? 'l.levelName COLLATE NOCASE ASC, l.levelID DESC' :
        sort === 'stars' ? 'l.starStars DESC, l.uploadDate DESC, l.levelID DESC' : 'l.uploadDate DESC, l.levelID DESC';
    const total = db.prepare(`SELECT COUNT(*) AS total FROM levels l
        WHERE (? = '' OR l.levelName LIKE ? ESCAPE '\\' OR CAST(l.levelID AS TEXT) = ?)`)
        .get(query, like, query).total;
    const levels = db.prepare(`SELECT l.levelID, l.levelName, l.levelDesc, l.levelLength,
        l.starStars, l.starDifficulty, l.starAuto, l.starDemon, l.starDemonDiff,
        l.featured, l.starEpic, l.userRates, l.avgUserRate, l.downloads, l.likes,
        l.isSent, l.uploadDate, p.userName AS creator
        FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID
        WHERE (? = '' OR l.levelName LIKE ? ESCAPE '\\' OR CAST(l.levelID AS TEXT) = ?)
        ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(query, like, query, limit, offset);
    res.json({ levels, query, offset, limit, total });
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

router.put('/api/levels/:levelId/details', requireAuth, requireCsrf, (req, res) => {
    const levelId = Number(req.params.levelId);
    const levelName = utils.charclean(String(req.body?.levelName || '').trim());
    const levelDescription = String(req.body?.levelDescription || '');
    const starCoins = Number(req.body?.starCoins);
    const encodedDescription = Buffer.from(levelDescription, 'utf8').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_');
    if (!Number.isInteger(levelId) || levelId < 1 || !levelName || levelName.length > 20 ||
        encodedDescription.length > 240 || ![0, 1].includes(starCoins)) {
        return res.status(400).json({ error: 'Invalid level details' });
    }
    const result = db.prepare(`UPDATE levels SET levelName = ?, levelDesc = ?, starCoins = ?,
        updateDate = ? WHERE levelID = ?`).run(
        levelName, encodedDescription, starCoins, Math.floor(Date.now() / 1000), levelId
    );
    if (!result.changes) return res.status(404).json({ error: 'Level not found' });
    res.status(204).end();
});

router.delete('/api/levels/:levelId', requireAuth, requireCsrf, async (req, res) => {
    const levelId = Number(req.params.levelId);
    if (!Number.isInteger(levelId) || levelId < 1) return res.status(400).json({ error: 'Invalid level' });
    const level = db.prepare('SELECT levelID, accountID, levelName FROM levels WHERE levelID = ?').get(levelId);
    if (!level) return res.status(404).json({ error: 'Level not found' });

    const levelsDir = path.join(__dirname, 'levels');
    const filePath = path.join(levelsDir, `${levelId}.gdcs`);
    let levelData = null;

    try {
        levelData = await fs.readFile(filePath).catch(error => {
            if (error.code === 'ENOENT') return null;
            throw error;
        });
        await fs.unlink(filePath).catch(error => {
            if (error.code !== 'ENOENT') throw error;
        });

        const result = db.transaction(() => {
            const currentLevel = db.prepare('SELECT accountID, starStars, featured, starEpic FROM levels WHERE levelID = ?').get(levelId);
            if (!currentLevel) return { changes: 0 };
            const deleted = db.prepare('DELETE FROM levels WHERE levelID = ?').run(levelId);
            if (deleted.changes > 0) cleanupLevelRelatedData(levelId, currentLevel);
            return deleted;
        })();

        if (!result.changes) return res.status(404).json({ error: 'Level not found' });
        res.status(204).end();
    } catch (error) {
        if (levelData) {
            await fs.writeFile(filePath, levelData).catch(() => {});
        }
        console.error('\x1b[1;31m✗ Dashboard level deletion failed:\x1b[0m', error);
        res.status(500).json({ error: 'Could not delete level' });
    }
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
        const level = db.prepare(`SELECT l.levelID, l.levelName, l.starStars, l.starDifficulty, l.starAuto,
            l.starDemon, l.starDemonDiff, l.featured, l.starEpic, l.coins, l.starCoins, p.userName AS creator
            FROM levels l LEFT JOIN profiles p ON p.accountID = l.accountID WHERE l.levelID = ?`).get(levelId);
        levelRatingWebhookEmbed(level);
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
