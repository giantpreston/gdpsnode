module.exports = {
    method: 'post',
    path: '/getCustomContentURL.php',
    handler: (req, res) => {
        return res.send(`https://geometrydashfiles.b-cdn.net`);
    }
};