module.exports = {
    method: 'get',
    path: '/content/news/news_version.txt',
    handler: (req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.send("1001");
    }
}