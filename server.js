const express = require('express'); // im so excited
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

// Change this parameter to start the server at a different port.
// To not require typing in a port, use port 80 (requires root/admin usually), or port 443 in case of https.
const port = 10000
// Don't change anything below unless you know what you're doing!

const app = express();

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

const endpointsDir = path.join(__dirname, 'endpoints');

fs.readdirSync(endpointsDir).forEach(file => {
    if (!file.endsWith('.js')) return;

    const endpoint = require(path.join(endpointsDir, file));
    const middleware = endpoint.middleware || [];

    app[endpoint.method](endpoint.path, ...middleware, endpoint.handler);
});

app.listen(port, () => {
    console.log(`\x1b[1;32m✓ GDPS Running Successfully! Port: ${port}\x1b[0m`);
});