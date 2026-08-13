const express = require('express'); // im so excited
const fs = require('fs');
const path = require('path');

// Change this parameter to start the server at a different port.
// To not require typing in a port, use port 80 (requires root/admin usually), or port 443 in case of https.
const port = 10000
// Don't change anything below unless you know what you're doing!

const app = express();
app.use(express.urlencoded({ extended: true }));

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