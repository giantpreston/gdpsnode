const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const databasePath = path.join(os.tmpdir(), `gdpsnode-schedule-${process.pid}.sqlite`);
process.env.GDPS_DATABASE_PATH = databasePath;
let database;

try {
    database = require('../database');
    const utils = require('../utils');
    utils.notifAdd = () => {};
    const { reconcileLevelSchedule } = require('../levelSchedule');
    const insertLevel = database.prepare(`INSERT INTO levels
        (accountID, levelName, levelDesc, audioTrack, password, uploadDate, updateDate, dailyNumber, dailyTime)
        VALUES (?, ?, '', 0, 0, ?, ?, ?, ?)`);
    const insertSchedule = database.prepare(`INSERT INTO level_schedule
        (type, slot, levelID, startsAt, expiresAt, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)`);
    const oldDaily = insertLevel.run(1, 'Daily 1', 1, 1, 1, 1000).lastInsertRowid;
    const nextDaily = insertLevel.run(2, 'Daily 2', 2, 2, 0, 0).lastInsertRowid;
    const weekly = insertLevel.run(3, 'Weekly 1', 3, 3, 0, 0).lastInsertRowid;
    const event = insertLevel.run(4, 'Event 1', 4, 4, 0, 0).lastInsertRowid;

    insertSchedule.run('daily', 2, nextDaily, 2000, 2010, 1900);
    insertSchedule.run('weekly', 1, weekly, 2000, 2020, 1900);
    insertSchedule.run('event', 1, event, 2000, 2030, 1900);

    reconcileLevelSchedule(2000);
    let rows = database.prepare('SELECT levelName, dailyNumber, dailyTime FROM levels ORDER BY levelID').all();
    assert.deepEqual(rows.map(row => [row.levelName, row.dailyNumber]), [
        ['Daily 1', 1],
        ['Daily 2', 2],
        ['Weekly 1', 100001],
        ['Event 1', 200001]
    ]);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM level_schedule WHERE applied = 1`).get().count, 3);

    reconcileLevelSchedule(2011);
    rows = database.prepare('SELECT levelName, dailyNumber, dailyTime FROM levels ORDER BY levelID').all();
    assert.deepEqual(rows.map(row => [row.levelName, row.dailyNumber]), [
        ['Daily 1', 1],
        ['Daily 2', 2],
        ['Weekly 1', 100001],
        ['Event 1', 200001]
    ]);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM level_schedule WHERE applied = 2`).get().count, 1);

    const followingDaily = insertLevel.run(5, 'Daily 3', 5, 5, 0, 0).lastInsertRowid;
    insertSchedule.run('daily', 3, followingDaily, 2020, 2030, 2011);
    reconcileLevelSchedule(2020);
    assert.equal(database.prepare('SELECT dailyNumber FROM levels WHERE levelID = ?').get(followingDaily).dailyNumber, 3);
} finally {
    if (database?.open) database.close();
    for (const suffix of ['', '-shm', '-wal']) {
        const filePath = `${databasePath}${suffix}`;
        if (fs.existsSync(filePath)) fs.rmSync(filePath);
    }
}

console.log('On-demand level schedule reconciliation checks passed');
