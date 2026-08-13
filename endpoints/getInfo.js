const config = require('../config');

module.exports = {
    method: 'get',
    path: '/switcher/getInfo.php',
    handler: (req, res) => {
        res.send(`{"motd": "${config.motd}", "version": 1, "icon": "${config.icon}"}`);
    }
};