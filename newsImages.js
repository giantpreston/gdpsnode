const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('./database');

const newsImageDirectory = path.join(__dirname, 'endpoints', 'content', 'news');
const maxImageSize = 10 * 1024 * 1024;
const imageSignatures = [
    { extension: '.jpg', matches: data => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
    { extension: '.png', matches: data => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }
];

function imageExtension(data) {
    return imageSignatures.find(signature => signature.matches(data))?.extension || null;
}

async function parseImageUpload(req) {
    const contentType = req.get('content-type') || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!contentType.toLowerCase().startsWith('multipart/form-data') || !boundaryMatch) {
        throw new Error('Image uploads must use multipart form data');
    }
    const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > maxImageSize + 65536) tooLarge = true;
        else if (!tooLarge) chunks.push(chunk);
    }
    if (tooLarge) throw new Error('News images must be 10 MB or smaller');

    const body = Buffer.concat(chunks);
    const firstBoundary = body.indexOf(boundary);
    if (firstBoundary === -1) throw new Error('The image upload was empty or malformed');
    const partStart = firstBoundary + boundary.length + 2;
    const nextBoundary = body.indexOf(boundary, partStart);
    if (nextBoundary === -1) throw new Error('The image upload was malformed');
    const part = body.subarray(partStart, Math.max(partStart, nextBoundary - 2));
    const separator = part.indexOf('\r\n\r\n');
    if (separator === -1) throw new Error('The image upload was malformed');
    const headers = part.subarray(0, separator).toString('utf8');
    if (!/name="file"/i.test(headers) || !/filename="[^"]+"/i.test(headers)) {
        throw new Error('Choose an image file to upload');
    }
    const data = part.subarray(separator + 4);
    if (!data.length || data.length > maxImageSize) throw new Error('News images must be between 1 byte and 10 MB');
    const extension = imageExtension(data);
    if (!extension) throw new Error('Use a JPG or PNG image');
    return { data, extension };
}

async function saveUploadedImage(upload, directory = newsImageDirectory) {
    await fs.mkdir(directory, { recursive: true });
    const filename = `news_${crypto.randomUUID()}${upload.extension}`;
    await fs.writeFile(path.join(directory, filename), upload.data, { flag: 'wx' });
    return { filename };
}

async function listNewsImages(directory = newsImageDirectory) {
    await fs.mkdir(directory, { recursive: true });
    const files = await fs.readdir(directory, { withFileTypes: true });
    const images = files
        .filter(entry => entry.isFile() && imageExtensionFromFilename(entry.name))
        .map(entry => ({ filename: entry.name }));
    return images.sort((left, right) => left.filename.localeCompare(right.filename));
}

async function removeUnusedNewsImages(directory = newsImageDirectory) {
    const usedImages = new Set(db.prepare("SELECT imageFile FROM dashboard_news WHERE imageFile != ''")
        .all().map(image => image.imageFile));
    await fs.mkdir(directory, { recursive: true });
    const files = await fs.readdir(directory, { withFileTypes: true });
    let removed = 0;
    for (const entry of files) {
        if (!entry.isFile() || !/^news_[0-9a-f-]{36}\.(?:jpg|png)$/i.test(entry.name) || usedImages.has(entry.name)) continue;
        await fs.unlink(path.join(directory, entry.name));
        removed++;
    }
    return removed;
}

function imageExtensionFromFilename(filename) {
    return ['.jpg', '.png'].includes(path.extname(filename).toLowerCase());
}

module.exports = {
    listNewsImages,
    parseImageUpload,
    removeUnusedNewsImages,
    saveUploadedImage
};
