require('dotenv').config();
const express = require('express'); // im so excited
const rateLimit = require('express-rate-limit');
const fs = require('fs/promises');
const path = require('path');
const dashboard = require('./dashboard');

// Change this parameter to start the server at a different port.
// To not require typing in a port, use port 80 (requires root/admin usually), or port 443 in case of https.
const port = 10000
const dashboardPath = (process.env.DASHBOARD_PATH || '/dashboard').replace(/\/+$/, '').replace(/^([^/])/, '/$1') || '/dashboard';
// Don't change anything below unless you know what you're doing!

const app = express();
app.disable('x-powered-by');

// spoof robtop's version of apache lmaoooooo
app.use((req, res, next) => {
    res.setHeader('Server', 'Apache/2.4.52 (Ubuntu)');
    res.setHeader('X-Powered-By', 'PHP/8.1.2-1ubuntu2.22');
    next();
});

const bodyLimit = '25mb'; // levels rarely if ever reach this

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: '-1',
    statusCode: 429,
    validate: { xForwardedForHeader: false }
});

app.use(express.urlencoded({
    extended: true,
    limit: bodyLimit,
    parameterLimit: 100000
}));
app.use(limiter);
app.get(dashboardPath, (req, res, next) => {
    if (req.path === dashboardPath) return res.redirect(308, `${dashboardPath}/`);
    next();
});
app.use(dashboardPath, dashboard);

const endpointsDir = path.join(__dirname, 'endpoints');

async function registerEndpoints() {
    const files = await fs.readdir(endpointsDir);

    for (const file of files) {
        if (!file.endsWith('.js')) continue;

        const endpoint = require(path.join(endpointsDir, file));
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

registerEndpoints().then(() => {
    app.use((err, req, res, next) => {
        console.error(`\x1b[1;31m✗ Unhandled API error on ${req.method} ${req.originalUrl}\x1b[0m`, err);
        if (!res.headersSent) {
            res.status(200).type('text/plain').send('-1');
        }
    });

    app.use((req, res) => {
        if (!res.headersSent) {
            res.status(200).type('text/plain').send('-1');
        }
    });

    app.listen(port, () => {
        console.log(`\x1b[1;32m✓ GDPS Running Successfully! Port: ${port}\x1b[0m`);
    });
}).catch(err => {
    console.error('\x1b[1;31m✗ Failed to load endpoints:', err);
    process.exit(1);
});