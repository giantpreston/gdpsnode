const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const express = require('express');

const tempRoot = path.join(os.tmpdir(), `gdpsnode-news-http-${process.pid}`);
const databasePath = `${tempRoot}.sqlite`;
const contentDirectory = path.join(tempRoot, 'content');
const newsDirectory = path.join(contentDirectory, 'news');
process.env.GDPS_DATABASE_PATH = databasePath;
let database;
let server;

async function main() {
    await fs.mkdir(newsDirectory, { recursive: true });
    database = require('../database');
    const { getNewsVersion } = require('../newsContent');
    const newsImages = require('../newsImages');
    const newsEndpoint = require('../endpoints/content/news');
    const newsVersionEndpoint = require('../endpoints/content/news_version');

    const localImage = await newsImages.saveUploadedImage({
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        extension: '.png'
    }, newsDirectory);
    const app = express();
    const rawBodyParser = express.raw({
        type: req => !req.is('application/x-www-form-urlencoded') &&
            !req.is('multipart/form-data') && !(req.path.startsWith('/dashboard') && req.is('application/json')),
        limit: '1mb'
    });
    app.use(rawBodyParser);
    app.use((req, res, next) => {
        if (Buffer.isBuffer(req.body)) delete req.body;
        next();
    });
    app.use('/content', express.static(contentDirectory, { fallthrough: true, index: false, dotfiles: 'deny' }));
    app.post('/dashboard/api/news/images/upload', async (req, res) => {
        try {
            const upload = await newsImages.parseImageUpload(req);
            const image = await newsImages.saveUploadedImage(upload, newsDirectory);
            res.status(201).json({ image });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    for (const endpoint of [newsEndpoint, newsVersionEndpoint]) {
        app[endpoint.method](endpoint.path, (req, res, next) => endpoint.handler(req, res, next));
    }
    app.use('/content', (req, res) => res.redirect(302, `https://cdn.example.test${req.url}`));
    server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const formData = new FormData();
    formData.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0x00])], { type: 'image/jpeg' }), 'test.jpg');
    const uploadResponse = await fetch(`${baseUrl}/dashboard/api/news/images/upload`, {
        method: 'POST',
        body: formData
    });
    assert.equal(uploadResponse.status, 201);
    const uploadedImage = (await uploadResponse.json()).image;
    assert.match(uploadedImage.filename, /^news_[0-9a-f-]{36}\.jpg$/);

    const versionResponse = await fetch(`${baseUrl}/content/news/news_version.txt`);
    assert.equal(versionResponse.status, 200);
    assert.equal(await versionResponse.text(), String(getNewsVersion()));

    const feedResponse = await fetch(`${baseUrl}/content/news/news.dat`);
    assert.equal(feedResponse.status, 200);
    assert.equal(feedResponse.headers.get('content-type').split(';')[0], 'application/octet-stream');
    const feed = zlib.gunzipSync(Buffer.from(await feedResponse.text(), 'base64url')).toString('utf8');
    assert.match(feed, new RegExp(`^${getNewsVersion()},1\\\\|1:1;`));

    const localResponse = await fetch(`${baseUrl}/content/news/${localImage.filename}`);
    assert.equal(localResponse.status, 200);
    assert.deepEqual(Buffer.from(await localResponse.arrayBuffer()), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    console.log('News HTTP route checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    if (database?.open) database.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
    for (const suffix of ['', '-shm', '-wal']) {
        await fs.rm(`${databasePath}${suffix}`, { force: true });
    }
});
