const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const zlib = require('node:zlib');

const databasePath = path.join(os.tmpdir(), `gdpsnode-news-format-${process.pid}.sqlite`);
process.env.GDPS_DATABASE_PATH = databasePath;
let database;

try {
    const { serializeNews } = require('../newsContent');
    database = require('../database');
    const imageUrl = 'https://www.youtube.com/watch?v=_B8-o6hU57Y';
    const buttonUrl = 'https://example.com/?a=1';
    const encoded = serializeNews([
        {
            id: 3,
            publishDate: 'October 18, 2026',
            title: 'Demo title >',
            body: 'First paragraph\nSecond paragraph',
            imageFile: 'news_3.jpg',
            imageWidth: 800,
            imageHeight: 454,
            imageClickable: 1,
            imageUrl,
            buttonLabel: 'Visit',
            buttonUrl,
            buttonSecondaryUrl: 'https://ignored.example/'
        },
        {
            id: 2,
            publishDate: 'October 17, 2026',
            title: 'Image only',
            body: '',
            imageFile: 'news_2.jpg',
            imageWidth: 800,
            imageHeight: 562,
            imageClickable: 0,
            imageUrl: ''
        },
        {
            id: 1,
            publishDate: 'October 16, 2026',
            title: 'Text only',
            body: 'Only text',
            imageFile: ''
        }
    ]);

    assert.match(encoded, /^[A-Za-z0-9_-]+$/);
    const payload = zlib.gunzipSync(Buffer.from(encoded, 'base64url')).toString('utf8');
    const [header, textArticle, imageArticle, plainArticle] = payload.split('|');
    assert.equal(header, '5,3');

    const textParts = textArticle.split('~');
    const textFields = Object.fromEntries(textParts[0].split(';').map(field => field.split(':', 2)));
    assert.equal(Buffer.from(textFields['2'], 'base64url').toString('utf8'), 'October 18, 2026');
    assert.equal(Buffer.from(textFields['3'], 'base64url').toString('utf8'), 'Demo title >');
    assert.equal(textFields['3'], Buffer.from('Demo title >').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_'));
    assert.match(textFields['3'], /-/);
    assert.equal(
        Buffer.from(textFields['4'].split(',', 2)[1], 'base64url').toString('utf8'),
        'First paragraph\nSecond paragraph'
    );
    assert.equal(textFields['2'].length % 4, 0);
    assert.equal(textFields['3'].length % 4, 0);
    assert.deepEqual(textParts.slice(1).map(part => part.split(',')[0]), ['2', '1']);

    const button = textParts[1].split(',');
    assert.equal(button.length, 3);
    assert.equal(Buffer.from(button[1], 'base64url').toString('utf8'), 'Visit');
    assert.equal(Buffer.from(button[2], 'base64url').toString('utf8'), buttonUrl);
    const imageExtension = textParts[2].split(',');
    assert.equal(imageExtension.length, 6);
    assert.equal(imageExtension[5], Buffer.from(imageUrl).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'));
    assert.equal(Buffer.from(imageExtension[5], 'base64url').toString('utf8'), imageUrl);
    assert.ok(!textArticle.includes('ignored.example'));
    const sparseHeader = zlib.gunzipSync(Buffer.from(
        serializeNews([{ id: 9, publishDate: 'date', title: 'new', body: 'text' },
            { id: 1, publishDate: 'date', title: 'old', body: 'text' }]),
        'base64url'
    )).toString('utf8').split('|')[0];
    assert.equal(sparseHeader, '5,2');

    const imageFields = imageArticle.split(';');
    assert.equal(imageFields[3], '4:1,news_2.jpg,800,562,0,');
    assert.equal(plainArticle.split(';')[3], `4:0,${Buffer.from('Only text').toString('base64url')}`);

    const newsEndpoint = require('../endpoints/content/news');
    const newsVersionEndpoint = require('../endpoints/content/news_version');
    const headers = {};
    let responseBody = '';
    const response = {
        setHeader(name, value) { headers[name] = value; },
        send(value) { responseBody = value; }
    };
    newsEndpoint.handler({}, response);
    assert.equal(newsEndpoint.path, '/content/news/news.dat');
    assert.equal(headers['Content-Type'], 'application/octet-stream');
    const seededPayload = zlib.gunzipSync(Buffer.from(responseBody, 'base64url')).toString('utf8');
    assert.match(seededPayload, /^5,1\|1:1;/);
    assert.doesNotMatch(seededPayload, /delete the news\.dat file/i);

    responseBody = '';
    newsVersionEndpoint.handler({}, response);
    assert.equal(newsVersionEndpoint.path, '/content/news/news_version.txt');
    assert.equal(headers['Content-Type'], 'text/plain');
    assert.equal(responseBody, '1001');

    database.prepare(`UPDATE dashboard_news_settings
        SET version = 1003, payloadFormatVersion = 2 WHERE id = 1`).run();
    database.exec('ALTER TABLE dashboard_news_settings DROP COLUMN payloadFormatVersion');
    database.close();
    database = null;

    const migrationCheck = `const db = require('./database'); console.log(db.prepare('SELECT version FROM dashboard_news_settings WHERE id = 1').get().version); db.close();`;
    const migrationEnv = { ...process.env, GDPS_DATABASE_PATH: databasePath };
    assert.equal(execFileSync(process.execPath, ['-e', migrationCheck], { env: migrationEnv, encoding: 'utf8' }).trim(), '1004');
    assert.equal(execFileSync(process.execPath, ['-e', migrationCheck], { env: migrationEnv, encoding: 'utf8' }).trim(), '1004');
} finally {
    if (database?.open) database.close();
    for (const suffix of ['', '-shm', '-wal']) {
        const filePath = `${databasePath}${suffix}`;
        if (fs.existsSync(filePath)) fs.rmSync(filePath);
    }
}

console.log('News wire format checks passed');
