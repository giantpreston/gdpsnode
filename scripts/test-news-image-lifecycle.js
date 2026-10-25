const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const tempRoot = path.join(os.tmpdir(), `gdpsnode-news-images-${process.pid}`);
const databasePath = `${tempRoot}.sqlite`;
process.env.GDPS_DATABASE_PATH = databasePath;
let database;
let imageDirectory;

async function main() {
    await fs.mkdir(tempRoot, { recursive: true });
    imageDirectory = path.join(tempRoot, 'news');
    const { saveNewsItems } = require('../newsContent');
    const newsImages = require('../newsImages');
    database = require('../database');
    const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const localImage = await newsImages.saveUploadedImage({ data: imageData, extension: '.png' }, imageDirectory);
    const article = (id, imageFile) => ({
        id,
        publishDate: 'October 24, 2026',
        title: `Test article ${id}`,
        body: 'Image lifecycle test',
        imageFile,
        imageWidth: 800,
        imageHeight: 454,
        imageClickable: 0,
        imageUrl: '',
        buttonLabel: '',
        buttonUrl: ''
    });

    saveNewsItems([article(1, localImage.filename), article(2, '')]);
    assert.equal(await newsImages.removeUnusedNewsImages(imageDirectory), 0);
    assert.equal((await fs.readdir(imageDirectory)).includes(localImage.filename), true);

    saveNewsItems([article(2, '')]);
    assert.equal(await newsImages.removeUnusedNewsImages(imageDirectory), 1);
    await assert.rejects(fs.access(path.join(imageDirectory, localImage.filename)));

    const temporaryImage = await newsImages.saveUploadedImage({ data: imageData, extension: '.png' }, imageDirectory);
    assert.equal(await newsImages.removeUnusedNewsImages(imageDirectory), 1);
    await assert.rejects(fs.access(path.join(imageDirectory, temporaryImage.filename)));

    saveNewsItems([]);
    assert.equal(await newsImages.removeUnusedNewsImages(imageDirectory), 0);
    console.log('News image lifecycle checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (database?.open) database.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
    for (const suffix of ['', '-shm', '-wal']) {
        await fs.rm(`${databasePath}${suffix}`, { force: true });
    }
});
