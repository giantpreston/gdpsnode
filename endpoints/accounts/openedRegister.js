const { accountSecret } = require("../../middleware/secrets");
const crypto = require('crypto');

module.exports = {
    method: 'post',
    path: '/accounts/openedRegister.php',
    middleware: [accountSecret],
    handler: (req, res) => {
        res.send(crypto.randomUUID().replace(/-/, ''));
    }
};

// i could check if it matches this in register, since that's what the real server does now, but i won't.
// why? because i'm lazy! that's why.