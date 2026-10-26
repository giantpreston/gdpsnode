const crypto = require('crypto');
const db = require('./database');

function generateGJP2(password = "", salt = "mI29fmAnxgTs") {
    const combined = password + salt;
    const hash = crypto.createHash('sha1').update(combined).digest('hex');
    return hash;
}

function isURLBase64(str) {
    if (typeof str !== 'string') return false;
    if (str === '') return false;

    let converted = str.replace(/-/g, '+').replace(/_/g, '/');
    while (converted.length % 4) {
        converted += '=';
    }

    try {
        const decoded = Buffer.from(converted, 'base64');
        return Buffer.from(decoded).toString('base64') === converted;
    } catch {
        return false;
    }
}

function remove(str) {
    if (typeof str !== 'string') return '';
    // basic htmlspecialchars equivalent
    let esc = str.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .trim();

    // replace blocked delimiter characters with a space, but keep surrounding content
    // blocked: :, |, ~, #, null, )
    esc = esc.replace(/\0/g, '');
    esc = esc.replace(/[:|~#)]+/g, ' ');

    // collapse multiple spaces and trim
    esc = esc.replace(/\s+/g, ' ').trim();
    return esc;
}

function normalizeUsername(str) {
    if (typeof str !== 'string') return '';
    return remove(str).toLowerCase();
}

function charclean(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^A-Za-z0-9 ]/g, '');
}

function numbercolon(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^0-9,\-]/g, '');
}

function number(str) {
    if (typeof str !== 'string' && typeof str !== 'number') return '';
    return String(str).replace(/[^0-9]/g, '');
}

function getRelative(unixTimestamp) {
  const targetMs = unixTimestamp * 1000;
  let delta = Math.abs(Date.now() - targetMs);

  const units = [
    { label: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
    { label: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
    { label: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: 'day', ms: 24 * 60 * 60 * 1000 },
    { label: 'hour', ms: 60 * 60 * 1000 },
    { label: 'minute', ms: 60 * 1000 },
    { label: 'second', ms: 1000 }
  ];

  for (const { label, ms } of units) {
    const value = Math.floor(delta / ms);
        if (value > 0) return `${value} ${label}${value > 1 ? 's' : ''}`;
  }

    return "0 seconds";
}

function xorCipher(buffer, key) {
    const result = Buffer.alloc(buffer.length);
    let keyBytes;
    
    if (typeof key === 'string') {
        keyBytes = Buffer.from(key, 'utf8');
    } else if (typeof key === 'number') {
        // If numeric, convert to string then to UTF8 bytes
        keyBytes = Buffer.from(String(key), 'utf8');
    } else {
        keyBytes = key;
    }
    
    for (let i = 0; i < buffer.length; i++) {
        result[i] = buffer[i] ^ keyBytes[i % keyBytes.length];
    }
    return result;
}

function genSolo3(str) {
    return generateGJP2(str, 'oC36fpYaPtdg').toLowerCase();
}

function genSolo4(str) {
    return generateGJP2(str, 'pC26fpYaQCtg').toLowerCase();
}

function randomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function creatorPointsForRating(stars, feature) {
    if (!stars) return 0;
    return Math.max(0, Math.min(4, feature)) + 1;
}

function getPublicBaseUrl(req, configuredUrl = '') {
    if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

    const host = req.get('host');
    if (!host) return '';

    const trustProxy = req.app?.get('trust proxy');
    const trustsProxy = trustProxy === true || (typeof trustProxy === 'number' && trustProxy > 0) ||
        (typeof trustProxy === 'string' && trustProxy !== '' && trustProxy !== '0' && trustProxy !== 'false');
    const forwardedProto = trustsProxy
        ? String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase()
        : '';
    const protocol = ['http', 'https'].includes(forwardedProto) ? forwardedProto : 'http';

    try {
        return new URL(`${protocol}://${host}`).origin;
    } catch {
        return '';
    }
}

function notifAdd(notification) {
    const toFlag = value => value === true ? 1 : value === false ? 0 : value ?? 0;
    const encodeNotificationText = value => Buffer.from(String(value ?? ''), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    const result = db.prepare(`
        INSERT INTO notifications (
            toAccountID, notificationMask, type, emoteIcon, title, description, age, isNew, hasLevel,
            levelID, achievement, hasChest, chestType, accountID, username, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        notification.toAccountID ?? 0,
        notification.notificationMask ?? 0,
        notification.type,
        notification.emoteIcon ?? '',
        encodeNotificationText(notification.title),
        encodeNotificationText(notification.description),
        notification.age ?? '0 seconds',
        toFlag(notification.isNew ?? 1),
        toFlag(notification.hasLevel),
        notification.levelID ?? 0,
        notification.achievement ?? '',
        toFlag(notification.hasChest),
        notification.chestType ?? 0,
        notification.accountID ?? 0,
        notification.username ?? '',
        notification.createdAt ?? Math.floor(Date.now() / 1000)
    );
    return result.lastInsertRowid;
}

function notifLevelRating(level, previousLevel) {
    const recipientID = level.accountID;
    const username = level.creator || level.username || '';
    const oldFeature = previousLevel.featured
        ? previousLevel.starEpic >= 3 ? 3 : previousLevel.starEpic >= 2 ? 2 : 1
        : 0;
    const feature = level.featured
        ? level.starEpic >= 3 ? 3 : level.starEpic >= 2 ? 2 : 1
        : 0;
    const difficultyIcons = {
        '0': 'harddemon',
        '3': 'easydemon',
        '4': 'mediumdemon',
        '5': 'insanedemon',
        '6': 'extremedemon'
    };

    if (previousLevel.starStars === 0 && level.starStars > 0) {
        const emoteIcon = level.starAuto ? 'auto'
            : level.starDemon ? difficultyIcons[String(level.starDemonDiff)] || 'harddemon'
                : ['easy', 'normal', 'hard', 'harder', 'insane'][Math.max(0, Math.min(4, level.starDifficulty - 1))];
        notifAdd({
            toAccountID: recipientID,
            type: 15,
            emoteIcon,
            title: 'Rated!',
            description: `Your level <cg>${level.levelName}</c> is now <cy>rated</c>!`,
            notificationMask: 0,
            hasLevel: true,
            levelID: level.levelID,
            achievement: 'geometry.ach.creator02', // Geometry Star
            accountID: recipientID,
            username
        });
    }

    if (feature > oldFeature) {
        const tiers = {
            1: { name: 'Featured', color: 'cy', icon: 'featured' },
            2: { name: 'Epic', color: 'co', icon: 'epic' },
            3: { name: 'Legendary', color: 'cd', icon: 'legendary' },
            4: { name: 'Mythic', color: 'cj', icon: 'mythic' }
        };
        const tier = tiers[feature];
        notifAdd({
            toAccountID: recipientID,
            type: 15,
            emoteIcon: tier.icon,
            title: `${tier.name}!`,
            description: `Your level <cy>${level.levelName}</c> is now <${tier.color}>${tier.name}</c>!`,
            hasLevel: true,
            levelID: level.levelID
        });
    }
}

module.exports = { generateGJP2, isURLBase64, remove, normalizeUsername, charclean, numbercolon, number, getRelative, xorCipher, genSolo3, genSolo4, randomString, creatorPointsForRating, getPublicBaseUrl, notifAdd, notifLevelRating };
