const { commonSecret } = require('../middleware/secrets');

// literally just returns our own endpoint because robtop thought itd be a good idea to separate the servers game servers and backup servers on real gd

module.exports = {
    method: 'post',
    path: '/getAccountURL.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID || ''), 10);
        
        if (!accountID) return res.send('-1');
        if (isNaN(accountID)) return res.send('-1');
        return res.send(`${req.protocol}://${req.headers.host}`); // this could be spoofed but spoofing it is pointless since it changes nothing, does nothing..
    }
};