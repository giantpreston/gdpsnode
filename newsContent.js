const zlib = require('node:zlib');
const path = require('node:path');
const db = require('./database');

function encodeBase64Url(value) {
    return Buffer.from(value, 'utf8').toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function getNewsItems() {
    return db.prepare(`SELECT newsID AS id, publishDate, title, body, imageFile, imageWidth,
        imageHeight, buttonLabel, buttonUrl
        FROM dashboard_news ORDER BY newsID DESC`).all();
}

function getNewsVersion() {
    return Number(db.prepare('SELECT version FROM dashboard_news_settings WHERE id = 1').get()?.version || 1001);
}

function newsImageFilename(value) {
    const imagePath = String(value || '').split(/[?#]/, 1)[0];
    try {
        return path.posix.basename(decodeURIComponent(new URL(value).pathname));
    } catch {
        return path.posix.basename(imagePath);
    }
}

function serializeNews(items = getNewsItems()) {
    const records = items.map(item => {
        const body = String(item.body || '');
        const hasBody = body.length > 0;
        const imageFile = newsImageFilename(item.imageFile);
        const primaryContent = !hasBody && imageFile
            ? `1,${imageFile},${item.imageWidth},${item.imageHeight},0,`
            : `0,${encodeBase64Url(body)}`;
        let record = `1:${item.id};2:${encodeBase64Url(item.publishDate)};3:${encodeBase64Url(item.title)};4:${primaryContent}`;
        if (item.buttonLabel) {
            record += `~2,${encodeBase64Url(item.buttonLabel)},${encodeBase64Url(item.buttonUrl)}`;
        }
        if (hasBody && imageFile) {
            record += `~1,${imageFile},${item.imageWidth},${item.imageHeight},0,`;
        }
        return record;
    });
    const payload = `${getNewsVersion()},${records.length}|${records.join('|')}`;
    return zlib.gzipSync(Buffer.from(payload, 'utf8')).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function normalizeNewsItems(input) {
    if (!Array.isArray(input) || input.length > 100) throw new Error('News must be a list of at most 100 articles');
    if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 28000) throw new Error('News content is too large to save');
    const ids = new Set();
    return input.map((item, index) => {
        const id = Number(item?.id);
        const publishDate = typeof item?.publishDate === 'string' ? item.publishDate.trim() : '';
        const title = typeof item?.title === 'string' ? item.title.trim() : '';
        const body = typeof item?.body === 'string' ? item.body.trim() : '';
        const imageFile = typeof item?.imageFile === 'string' ? item.imageFile.trim() : '';
        const imageWidth = Number(item?.imageWidth ?? 800);
        const imageHeight = Number(item?.imageHeight ?? 454);
        const buttonLabel = typeof item?.buttonLabel === 'string' ? item.buttonLabel.trim() : '';
        const buttonUrl = typeof item?.buttonUrl === 'string' ? item.buttonUrl.trim() : '';
        if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) throw new Error(`Article ${index + 1} has an invalid or duplicate ID`);
        if (!publishDate || publishDate.length > 64) throw new Error(`Article ${index + 1} needs a date of 64 characters or fewer`);
        if (!title || title.length > 120) throw new Error(`Article ${index + 1} needs a title of 120 characters or fewer`);
        if (body.length > 12000) throw new Error(`Article ${index + 1} body is too long`);
        if (imageFile && (!/^[A-Za-z0-9._-]{1,128}$/.test(imageFile) || imageFile === '.' || imageFile === '..')) {
            throw new Error(`Article ${index + 1} has an invalid image filename`);
        }
        if (!Number.isInteger(imageWidth) || imageWidth < 1 || imageWidth > 8192 ||
            !Number.isInteger(imageHeight) || imageHeight < 1 || imageHeight > 8192) {
            throw new Error(`Article ${index + 1} has invalid image settings`);
        }
        if (buttonLabel.length > 120 || buttonUrl.length > 2048 || (!!buttonLabel !== !!buttonUrl)) {
            throw new Error(`Article ${index + 1} has invalid button or link details`);
        }
        if (!body && !imageFile && !buttonLabel) throw new Error(`Article ${index + 1} needs body text, an image, or a button`);
        ids.add(id);
        return { id, publishDate, title, body, imageFile, imageWidth, imageHeight, buttonLabel, buttonUrl };
    }).sort((left, right) => right.id - left.id);
}

function saveNewsItems(input) {
    const items = normalizeNewsItems(input);
    const currentItems = getNewsItems();
    const changed = JSON.stringify(items) !== JSON.stringify(currentItems);
    if (!changed) return { items: currentItems, version: getNewsVersion(), changed: false };

    const transaction = db.transaction(() => {
        db.prepare('DELETE FROM dashboard_news').run();
        const insert = db.prepare(`INSERT INTO dashboard_news
            (newsID, publishDate, title, body, imageFile, imageWidth, imageHeight, buttonLabel, buttonUrl)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const item of items) {
            insert.run(item.id, item.publishDate, item.title, item.body, item.imageFile,
                item.imageWidth, item.imageHeight, item.buttonLabel, item.buttonUrl);
        }
        db.prepare('UPDATE dashboard_news_settings SET version = version + 1 WHERE id = 1').run();
    });
    transaction();
    return { items: getNewsItems(), version: getNewsVersion(), changed: true };
}

module.exports = { getNewsItems, getNewsVersion, normalizeNewsItems, saveNewsItems, serializeNews };
