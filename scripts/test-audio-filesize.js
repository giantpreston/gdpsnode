const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const databasePath = path.join(os.tmpdir(), `gdpsnode-audio-filesize-${process.pid}.sqlite`);
process.env.GDPS_DATABASE_PATH = databasePath;
process.env.MAX_AUDIO_FILESIZE = '5';

const db = require('../database');
const { BYTES_PER_MIB, getTotalAudioFilesize, parseAudioID, parseAudioIDs } = require('../audioFilesize');
const endpoint = require('../endpoints/misc/getGJAudioFilesize');

try {
    db.prepare(`
        INSERT INTO songs (ID, name, artistID, artistName, link, size)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 'Song one', 1, 'Artist', '', 1.25);
    db.prepare(`
        INSERT INTO songs (ID, name, artistID, artistName, link, size)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(2, 'Song two', 1, 'Artist', '', 0.75);
    db.prepare('INSERT INTO sfx (ID, name, size) VALUES (?, ?, ?)').run(1, 'SFX one', 2.5);

    assert.deepEqual(parseAudioIDs('1, 1,0,2'), [1, 1, 2]);
    assert.equal(parseAudioIDs('1 2'), null);
    assert.equal(parseAudioIDs("1,2' OR 1=1--"), null);
    assert.ok(Number.isNaN(parseAudioID('1 OR 1=1')));
    assert.equal(parseAudioID('1'), 1);
    assert.equal(getTotalAudioFilesize([1, 2], [1]), 4.5 * BYTES_PER_MIB);
    assert.equal(getTotalAudioFilesize([1, 1, 2], [1, 1]), 4.5 * BYTES_PER_MIB);
    assert.equal(getTotalAudioFilesize([], []), 0);

    let response;
    endpoint.handler(
        { body: { songIDs: '1,1,2', sfxIDs: '1,1' } },
        { send: value => { response = value; } }
    );
    assert.equal(response, `${4.5 * BYTES_PER_MIB}:${5 * BYTES_PER_MIB}`);

    endpoint.handler(
        { body: { songIDs: "1' OR 1=1--", sfxIDs: '' } },
        { send: value => { response = value; } }
    );
    assert.equal(response, '-1');

    endpoint.handler(
        { body: { songIDs: Array.from({ length: 102 }, (_, index) => String(index + 1)).join(','), sfxIDs: '' } },
        { send: value => { response = value; } }
    );
    assert.equal(response, '-1');

    endpoint.handler(
        { body: { songIDs: Array(102).fill('1').join(','), sfxIDs: '' } },
        { send: value => { response = value; } }
    );
    assert.equal(response, '-1');
} finally {
    db.closeDB();
    for (const suffix of ['', '-shm', '-wal']) {
        const filePath = `${databasePath}${suffix}`;
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
}

console.log('Audio filesize checks passed.');
