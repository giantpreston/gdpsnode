const { getNewsItems, serializeNews } = require('../../newsContent');

module.exports = {
    method: 'get',
    path: '/content/news/news.dat',
    handler: (req, res) => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(serializeNews(getNewsItems()));
    }
};
