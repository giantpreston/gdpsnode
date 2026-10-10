const config = require('../../config');
const utils = require('../../utils');

module.exports = {
    method: 'post',
    path: '/getCustomContentURL.php',
    handler: (req, res) => {
        const publicUrl = utils.getPublicBaseUrl(req, config.publicUrl);
        return publicUrl ? res.send(`${publicUrl}/content`) : res.send('-1');
    }
};