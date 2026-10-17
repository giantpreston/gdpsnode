const config = require('../../config');

module.exports = {
    method: 'get',
    path: '/',
    handler: (req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.send(`<!DOCTYPE html><html lang="en"><head><title>Welcome to your Geometry Dash Private server!</title><body><font face="Arial">All set up! Copy the link from your URL bar and paste it in GDPS Switcher!<br><br> Current MOTD: ${config.motd}</font></body></html>`);
    }
};
