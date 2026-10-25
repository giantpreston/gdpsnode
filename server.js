// security check block
try {
    process.loadEnvFile();
} catch (e) {
    console.warn('\x1b[1;31m✗ No .env file found! Falling back to defaults...\x1b[0m');
}

const config = require('./config');
const { infoWebhookEmbed, errorWebhookEmbed, warnWebhookEmbed, hook } = require('./webhook.js');
const port = Number(config.port);
const dashboardPath = config.dashboard.path;
const isDefaultPath = dashboardPath === '/dashboard';
const isDefaultPass = config.dashboard.password === 'replace-with-a-long-random-password';

if (isDefaultPath || isDefaultPass) {
    console.warn('\x1b[1;33m⚠ Default environment variables detected!\x1b[0m');
    console.warn('\x1b[1;33m  Change your DASHBOARD_PASSWORD (if using legacy password) and DASHBOARD_PATH before exposing this server to the internet.\x1b[0m');
    
    if (!config.dashboard.secureCookies && port === 443) {
        console.warn('\x1b[1;33m⚠ Running on port 443 without DASHBOARD_SECURE_COOKIES=1. HTTPS recommended!\x1b[0m');
    }
}

// actual server code
const express = require('express'); // im so excited
const rateLimit = require('express-rate-limit');
const { execSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const dashboard = require('./dashboard');
const db = require('./database');
const { loadPlugins, hooks } = require('./hooks');
const { closeDB } = require('./database');
const soundlib = require("./soundlib")

const VERSION = '6.0R'; // geometry dash ▣ ▲▲▲
const VERSION_URL = 'https://raw.githubusercontent.com/giantpreston/gdpsnode/refs/heads/main/version.txt';

async function checkForUpdates() {
    try {
        const response = await fetch(VERSION_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const latestVersion = (await response.text()).trim();
        if (latestVersion && latestVersion !== VERSION) {
            console.warn(`\x1b[1;31m⚠ This server is outdated (v${VERSION}). Latest version: v${latestVersion}. Run 'git pull' to update!\x1b[0m`);
            warnWebhookEmbed("The GDPS is outdated. Please update the GDPS: https://github.com/GiantPreston/GDPSnode")
        }
    } catch (err) {
        console.warn(`\x1b[1;33m⚠ Could not check for updates: ${err.message}\x1b[0m`);
        warnWebhookEmbed("Failed to check for updates. The GDPS may be outdated. Please manually check for updates: https://github.com/GiantPreston/GDPSnode")
    }
}

function isElevated() {
  if (process.getuid) {
    return process.getuid() === 0;
  }

  if (process.platform === 'win32') {
    try {
      execSync('net session', { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// update the songs before the server launches
soundlib.ensureMusicLib(0);
// soundlib.ensureSFXLib(0);


const app = express();
hooks.setApp(app);
app.disable('x-powered-by');
app.set('trust proxy', config.dashboard.trustProxyHops);
app.locals.hooks = hooks;
app.locals.config = config;

// spoof robtop's version of apache lmaoooooo
app.use((req, res, next) => {
    res.setHeader('Server', 'Apache/2.4.52 (Ubuntu)');
    res.setHeader('X-Powered-By', 'PHP/8.1.2-1ubuntu2.22');
    next();
});

app.use((req, res, next) => {
    const queryIndex = req.url.indexOf('?');
    const pathname = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
    const query = queryIndex === -1 ? '' : req.url.slice(queryIndex);
    req.url = `${pathname.replace(/\/{2,}/g, '/')}${query}`;
    next();
});

const bodyLimitBytes = 32 * 1024 * 1024;
const bodyLimit = '32mb';
const levelTransferLimit = '50mb';
const isLevelTransferRequest = req =>
    req.path === '/uploadGJLevel21.php' || req.path === '/downloadGJLevel22.php';

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: config.security.rateLimitPerMinute,
    standardHeaders: false,
    legacyHeaders: false,
    message: '-1',
    statusCode: 429,
    validate: { xForwardedForHeader: false }
});

const highVolumeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Math.max(1, Math.floor(config.security.rateLimitPerMinute / 5)),
    standardHeaders: false,
    legacyHeaders: false,
    message: '-1',
    statusCode: 429,
    validate: { xForwardedForHeader: false }
});
const highVolumeEndpoint = /\/(?:getGJLevels21|getGJLevelLists|getGJMapPacks21|getGJGauntlets21|getGJComments21|getGJCommentHistory|getGJAccountComments20|getGJUsers20|getGJUserList20|getGJMessages20|downloadGJLevel22|downloadGJMessage20|downloadGJEditorSound|getGJThreads|getGJThreadMessages|searchGJThreadMessages|getGJFollowing|getGJFriendRequests20|getGJScores20|getGJLevelScores(?:211|Plat)|getGJEditorSounds)\.php$/i;

app.use(limiter);
app.use((req, res, next) => {
    if (!highVolumeEndpoint.test(req.path)) return next();
    return highVolumeLimiter(req, res, next);
});

const dashboardJsonRequest = req =>
    (req.path === dashboardPath || req.path.startsWith(`${dashboardPath}/`)) &&
    req.is('application/json');

const defaultRawBodyParser = express.raw({
    type: req => !req.is('application/x-www-form-urlencoded') &&
        !req.is('multipart/form-data') && !dashboardJsonRequest(req),
    limit: bodyLimit
});
const levelTransferRawBodyParser = express.raw({
    type: req => !req.is('application/x-www-form-urlencoded') &&
        !req.is('multipart/form-data') && !dashboardJsonRequest(req),
    limit: levelTransferLimit
});
app.use((req, res, next) =>
    (isLevelTransferRequest(req) ? levelTransferRawBodyParser : defaultRawBodyParser)(req, res, next)
);
app.use((req, res, next) => {
    if (Buffer.isBuffer(req.body)) delete req.body;
    next();
});
const defaultUrlencodedBodyParser = express.urlencoded({
    extended: true,
    limit: bodyLimit,
    parameterLimit: 100000
});
const levelTransferUrlencodedBodyParser = express.urlencoded({
    extended: true,
    limit: levelTransferLimit,
    parameterLimit: 100000
});
app.use((req, res, next) =>
    (isLevelTransferRequest(req) ? levelTransferUrlencodedBodyParser : defaultUrlencodedBodyParser)(req, res, next)
);
app.use((req, res, next) => {
    if (req.method.toLowerCase() !== 'post') return next();
    const body = req.body || {};
    const rawAccountID = body.accountID;
    if (rawAccountID === undefined || rawAccountID === null || rawAccountID === '') return next();

    const accountID = Number.parseInt(String(rawAccountID), 10);
    if (!Number.isInteger(accountID) || accountID <= 0) return next();

    const account = db.prepare('SELECT isDisabled FROM accounts WHERE accountID = ?').get(accountID);
    if (account && account.isDisabled === 1) {
        return res.status(200).type('text/plain').send('-1');
    }

    return next();
});
app.get(dashboardPath, (req, res, next) => {
    if (req.path === dashboardPath) return res.redirect(308, `${dashboardPath}/`);
    next();
});
app.use(dashboardPath, dashboard);

app.use('/content', express.static(path.join(__dirname, 'endpoints', 'content'), {
    fallthrough: true,
    index: false,
    dotfiles: 'deny'
}));

app.use('/songs', express.static(path.join(__dirname, 'songs'), {
    fallthrough: false,
    index: false
}));

const endpointsDir = path.join(__dirname, 'endpoints');

async function getEndpointFiles(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await getEndpointFiles(entryPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(entryPath);
        }
    }

    return files.sort();
}

async function registerEndpoints() {
    const files = await getEndpointFiles(endpointsDir);

    for (const filePath of files) {
        const endpoint = require(filePath);
        const middleware = endpoint.middleware || [];

        app[endpoint.method](endpoint.path, ...middleware, async (req, res, next) => {
            try {
                await endpoint.handler(req, res, next);
            } catch (err) {
                next(err);
            }
        });
    }
}

const pluginsReady = config.plugins.enabled
    ? loadPlugins(path.join(__dirname, config.plugins.directory), app)
    : Promise.resolve(hooks);

pluginsReady.then(() => {
    hooks.trigger('server:before_start', { app, config, path: __dirname });
    return registerEndpoints();
}).then(() => {
    app.use('/content', (req, res) => {
        return res.redirect(302, `https://geometrydashfiles.b-cdn.net${req.url}`);
    });

    hooks.trigger('server:ready', { app, config, port, dashboardPath });
    app.use((err, req, res, next) => {
        console.error(`\x1b[1;31m✗ Unhandled API error on ${req.method} ${req.originalUrl}\x1b[0m`, err);
        if (!res.headersSent) {
            if (err?.type === 'entity.too.large' && err.limit >= bodyLimitBytes) {
                return res.status(200).type('text/plain').send('-4');
            }
            res.status(200).type('text/plain').send('-1');
        }
    });

    app.use((req, res) => {
        if (!res.headersSent) {
            res.status(200).type('text/plain').send('-1');
        }
    });

    const server = app.listen(port, () => {
        hooks.trigger('server:listening', { app, config, port });
        console.log(`\x1b[1;32m✓ GDPS Running Successfully! Port: ${port}\x1b[0m`);
        console.log(`\x1b[1;34m𝐢 Dashboard route: ${dashboardPath}/\x1b[0m`);
        infoWebhookEmbed('Server has started!', hook);
        void checkForUpdates();
        if (!isElevated() && port === 80 || !isElevated() && port === 443) { console.log('\x1b[1;33m⚠ Running on a privileged port without elevated permissions!'); console.log('\x1b[1;33m  This server is most likely NOT listening on the set port, to do so, elevate this process.'); }

        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('data', (key) => {
                if (key.toString() === '\u0003') {
                    process.emit('SIGINT');
                }
            });
        }
    });

    let isShuttingDown = false;
    const handleShutdown = (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        infoWebhookEmbed("Server is shutting down..", hook);

        console.log(`\x1b[1;33m⚠ Received ${signal}. Cleaning up...\x1b[0m`);

        server.close(() => {
            console.log('\x1b[1;32m✓ HTTP server closed.\x1b[0m');
            closeDB();
            process.exit(0);
        });

        setTimeout(() => {
            errorWebhookEmbed(`Force closing server due to timeout`, hook);
            // delay for a bit so webhook can send
            setTimeout(() => {
                console.error('\x1b[1;31m✗ Shutdown timed out, forcing exit.\x1b[0m');
                closeDB();
                process.exit(1);
            }, 450);
        }, 5000);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGBREAK', () => handleShutdown('SIGBREAK'));

}).catch(err => {
    console.error('\x1b[1;31m✗ Failed to load endpoints:\x1b[0m', err);
    process.exit(1);
});
