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
    const { getCurrentDailyLevel } = require('../endpoints/levels/getGJDailyLevel');
    const getLevelsEndpoint = require('../endpoints/levels/getGJLevels21');
    const insertAccount = database.prepare('INSERT INTO accounts (accountID, userName, gjp2, isDisabled) VALUES (?, ?, ?, 0)');
    for (let accountID = 1; accountID <= 5; accountID++) {
        insertAccount.run(accountID, `User ${accountID}`, 'test');
    }
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

    reconcileLevelSchedule(1999);
    let rows = database.prepare('SELECT levelName, dailyNumber, dailyTime FROM levels ORDER BY levelID').all();
    assert.deepEqual(rows.map(row => row.dailyNumber), [1, 0, 0, 0]);
    assert.equal(getCurrentDailyLevel(false, false, 1999), null);

    reconcileLevelSchedule(2000);
    rows = database.prepare('SELECT levelName, dailyNumber, dailyTime FROM levels ORDER BY levelID').all();
    assert.deepEqual(rows.map(row => [row.levelName, row.dailyNumber]), [
        ['Daily 1', 1],
        ['Daily 2', 2],
        ['Weekly 1', 100001],
        ['Event 1', 200001]
    ]);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM level_schedule WHERE applied = 1`).get().count, 3);
    assert.equal(getCurrentDailyLevel(false, false, 2000).dailyNumber, 2);

    reconcileLevelSchedule(2011);
    rows = database.prepare('SELECT levelName, dailyNumber, dailyTime FROM levels ORDER BY levelID').all();
    assert.deepEqual(rows.map(row => [row.levelName, row.dailyNumber]), [
        ['Daily 1', 1],
        ['Daily 2', 2],
        ['Weekly 1', 100001],
        ['Event 1', 200001]
    ]);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM level_schedule WHERE applied = 2`).get().count, 1);
    assert.equal(getCurrentDailyLevel(false, false, 2011), null);
    database.prepare('UPDATE levels SET dailyTime = 3000 WHERE levelID = ?').run(oldDaily);
    assert.equal(getCurrentDailyLevel(false, false, 2011).dailyNumber, 1);
    database.prepare('UPDATE levels SET dailyTime = 1000 WHERE levelID = ?').run(oldDaily);

    const followingDaily = insertLevel.run(5, 'Daily 3', 5, 5, 0, 0).lastInsertRowid;
    insertSchedule.run('daily', 3, followingDaily, 2020, 2030, 2011);
    database.prepare('UPDATE levels SET dailyNumber = 3, dailyTime = 2030 WHERE levelID = ?').run(followingDaily);
    reconcileLevelSchedule(2015);
    assert.equal(database.prepare('SELECT dailyNumber FROM levels WHERE levelID = ?').get(followingDaily).dailyNumber, 0);
    assert.equal(getCurrentDailyLevel(false, false, 2015), null);
    reconcileLevelSchedule(2020);
    assert.equal(database.prepare('SELECT dailyNumber FROM levels WHERE levelID = ?').get(followingDaily).dailyNumber, 3);
    assert.equal(getCurrentDailyLevel(false, false, 2020).dailyNumber, 3);
    assert.equal(getCurrentDailyLevel(false, false, 2030), null);

    assert.equal(getCurrentDailyLevel(true, false, 2000).dailyNumber, 100001);
    assert.equal(getCurrentDailyLevel(false, true, 2000).dailyNumber, 200001);

    const now = Math.floor(Date.now() / 1000);
    const setSchedule = database.prepare('UPDATE level_schedule SET startsAt = ?, expiresAt = ?, applied = ? WHERE type = ? AND slot = ?');
    const setLevelExpiry = database.prepare('UPDATE levels SET dailyTime = ? WHERE levelID = ?');
    setSchedule.run(now - 1000, now - 50, 2, 'daily', 1);
    setLevelExpiry.run(now - 50, oldDaily);
    setSchedule.run(now - 25, now + 500, 1, 'daily', 2);
    setLevelExpiry.run(now + 500, nextDaily);
    setSchedule.run(now + 500, now + 1000, 0, 'daily', 3);
    setLevelExpiry.run(now + 1000, followingDaily);
    setSchedule.run(now - 25, now + 500, 1, 'weekly', 1);
    setLevelExpiry.run(now + 500, weekly);
    setSchedule.run(now - 25, now + 500, 1, 'event', 1);
    setLevelExpiry.run(now + 500, event);
    reconcileLevelSchedule(now);

    const getLevelIDs = type => {
        let response = '';
        getLevelsEndpoint.handler({ body: { type } }, { send: value => { response = value; }, headersSent: false });
        return response.split('#')[0].split('|').filter(Boolean).map(level => {
            const fields = level.split(':');
            const dailyNumberIndex = fields.indexOf('65');
            return {
                levelID: Number(fields[1]),
                dailyNumber: dailyNumberIndex === -1 ? null : Number(fields[dailyNumberIndex + 1])
            };
        });
    };
    assert.equal(getCurrentDailyLevel(false, false, now).dailyNumber, 2);
    assert.equal(getCurrentDailyLevel(true, false, now).dailyNumber, 100001);
    assert.equal(getCurrentDailyLevel(false, true, now).dailyNumber, 200001);
    assert.deepEqual(getLevelIDs(21).map(level => level.levelID).sort((a, b) => a - b), [oldDaily, nextDaily].sort((a, b) => a - b));
    assert.deepEqual(getLevelIDs(22), [{ levelID: weekly, dailyNumber: null }]);
    assert.deepEqual(getLevelIDs(23), [{ levelID: event, dailyNumber: null }]);
    assert.deepEqual(getLevelIDs(32), [{ levelID: oldDaily, dailyNumber: 1 }]);
    assert.deepEqual(getLevelIDs(33), []);
    assert.deepEqual(getLevelIDs(34), []);

    setSchedule.run(now - 1000, now - 10, 2, 'daily', 2);
    setLevelExpiry.run(now - 10, nextDaily);
    assert.equal(getCurrentDailyLevel(false, false, now), null);
    assert.deepEqual(getLevelIDs(21).map(level => level.levelID).sort((a, b) => a - b), [oldDaily, nextDaily].sort((a, b) => a - b));
    assert.deepEqual(getLevelIDs(32).map(level => level.dailyNumber).sort((a, b) => a - b), [1, 2]);

    setSchedule.run(now - 1000, now - 10, 2, 'weekly', 1);
    setLevelExpiry.run(now - 10, weekly);
    setSchedule.run(now - 1000, now - 10, 2, 'event', 1);
    setLevelExpiry.run(now - 10, event);
    assert.equal(getCurrentDailyLevel(true, false, now), null);
    assert.equal(getCurrentDailyLevel(false, true, now), null);
    assert.deepEqual(getLevelIDs(33), [{ levelID: weekly, dailyNumber: 100001 }]);
    assert.deepEqual(getLevelIDs(34), [{ levelID: event, dailyNumber: 200001 }]);

    setSchedule.run(now - 1000, now - 10, 2, 'daily', 3);
    setLevelExpiry.run(now - 10, followingDaily);
    database.prepare('UPDATE levels SET dailyNumber = 3 WHERE levelID = ?').run(followingDaily);
    assert.equal(getCurrentDailyLevel(false, false, now), null);
    assert.deepEqual(getLevelIDs(32).map(level => level.dailyNumber).sort((a, b) => a - b), [1, 2, 3]);
} finally {
    if (database?.open) database.close();
    for (const suffix of ['', '-shm', '-wal']) {
        const filePath = `${databasePath}${suffix}`;
        if (fs.existsSync(filePath)) fs.rmSync(filePath);
    }
}

console.log('On-demand level schedule reconciliation checks passed');
