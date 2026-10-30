/*
This module no longer contains only configs! Make sure to add the new .env.example keys to your .env file
so you can edit the settings that were previously here from there instead.

That change was done to simplify and centralize settings into only one file to avoid needing to check
multiple files to change basic server settings.

Thanks!
*/

const normalizeNumber = (value, fallback) => {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const normalizePath = (value, fallback = '/dashboard') => {
    const pathValue = typeof value === 'string' ? value.trim() : fallback;
    return pathValue ? pathValue.replace(/\/+$/, '').replace(/^([^/])/, '/$1') || fallback : fallback;
};

const normalizePublicUrl = (value, name) => {
    if (!value) return '';
    let parsed;
    try {
        parsed = new URL(String(value).trim());
    } catch {
        throw new Error(`${name} must be an absolute HTTP or HTTPS URL`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error(`${name} must be an absolute HTTP or HTTPS URL without credentials, query, or fragment`);
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
};

const normalizeDashboardLoginMode = value => {
    const mode = String(value || 'account').trim().toLowerCase();
    return ['account', 'legacy', 'both'].includes(mode) ? mode : 'account';
};

const normalizeNewsVersion = value => {
    const version = String(value ?? '5').trim();
    if (!/^\d+$/.test(version)) throw new Error('NEWS_VERSION must be a non-negative integer');
    return version;
};

const env = process.env;

module.exports = {
    webhook: env.webhook || 'https://discord.com/api/webhooks/tung/dihh',
    port: normalizeNumber(env.PORT || env.GDPS_PORT || 10000, 10000),
    publicUrl: normalizePublicUrl(env.PUBLIC_URL, 'PUBLIC_URL'),
    songBaseUrl: normalizePublicUrl(env.SONG_BASE_URL, 'SONG_BASE_URL'),
    newsVersion: normalizeNewsVersion(env.NEWS_VERSION),
    motd: env.MOTD || 'A GDPSnode Private Server.',
    icon: env.ICON || 'https://raw.githubusercontent.com/Kingminer7/gdps-switcher/refs/heads/main/resources/gdlogo.png',
    lang: env.LANG || 'js',
    dashboard: {
        path: normalizePath(env.DASHBOARD_PATH, '/dashboard'),
        user: env.DASHBOARD_USER || '',
        password: env.DASHBOARD_PASSWORD || '',
        accountId: normalizeNumber(env.DASHBOARD_ACCOUNT_ID, 0),
        secureCookies: normalizeBoolean(env.DASHBOARD_SECURE_COOKIES, false),
        trustProxyHops: normalizeNumber(env.TRUST_PROXY_HOPS ?? env.TRUST_PROXY, 0),
        mode: normalizeDashboardLoginMode(env.DASHBOARD_LOGIN_MODE)
    },
    plugins: {
        enabled: normalizeBoolean(env.ENABLE_PLUGINS, true),
        directory: env.PLUGINS_DIR || 'plugins'
    },
    security: {
        rateLimitPerMinute: normalizeNumber(env.RATE_LIMIT_PER_MINUTE, 350),
        dashboardAttemptsPerWindow: normalizeNumber(env.DASHBOARD_ATTEMPTS_PER_WINDOW, 10)
    },
    rewards: {
        chest1: {
            wait: normalizeNumber(env.CHEST1_WAIT, 14400),
            minOrbs: normalizeNumber(env.CHEST1_MIN_ORBS, 20),
            maxOrbs: normalizeNumber(env.CHEST1_MAX_ORBS, 100),
            minDiamonds: normalizeNumber(env.CHEST1_MIN_DIAMONDS, 1),
            maxDiamonds: normalizeNumber(env.CHEST1_MAX_DIAMONDS, 3),
            minKeys: normalizeNumber(env.CHEST1_MIN_KEYS, 1),
            maxKeys: normalizeNumber(env.CHEST1_MAX_KEYS, 3)
        },
        chest2: {
            wait: normalizeNumber(env.CHEST2_WAIT, 86400),
            minOrbs: normalizeNumber(env.CHEST2_MIN_ORBS, 100),
            maxOrbs: normalizeNumber(env.CHEST2_MAX_ORBS, 200),
            minDiamonds: normalizeNumber(env.CHEST2_MIN_DIAMONDS, 5),
            maxDiamonds: normalizeNumber(env.CHEST2_MAX_DIAMONDS, 10),
            minKeys: normalizeNumber(env.CHEST2_MIN_KEYS, 1),
            maxKeys: normalizeNumber(env.CHEST2_MAX_KEYS, 3)
        }
    }
};

module.exports.dashboardPath = module.exports.dashboard.path;
module.exports.dashboardPassword = module.exports.dashboard.password;
module.exports.dashboardUser = module.exports.dashboard.user;
module.exports.dashboardAccountId = module.exports.dashboard.accountId;
module.exports.secureCookies = module.exports.dashboard.secureCookies;
