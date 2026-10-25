const db = require('./database');
const utils = require('./utils');

const scheduleTargetNumber = (type, slot) => {
    if (type === 'weekly') return slot + 100000;
    if (type === 'event') return slot + 200000;
    return slot;
};

function reconcileLevelSchedule(now = Math.floor(Date.now() / 1000)) {
    const expired = db.prepare('SELECT scheduleID FROM level_schedule WHERE applied = 1 AND expiresAt <= ?').all(now);
    const missed = db.prepare('SELECT scheduleID FROM level_schedule WHERE applied = 0 AND expiresAt <= ?').all(now);
    const unstarted = db.prepare(`SELECT s.type, s.slot, s.levelID, s.expiresAt
        FROM level_schedule s JOIN levels l ON l.levelID = s.levelID
        WHERE s.applied = 0 AND (s.startsAt > ? OR s.expiresAt <= ?)
        AND l.dailyNumber = CASE
            WHEN s.type = 'weekly' THEN s.slot + 100000
            WHEN s.type = 'event' THEN s.slot + 200000
            ELSE s.slot
        END AND l.dailyTime = s.expiresAt`).all(now, now);
    const activeRows = db.prepare(`SELECT s.scheduleID, s.type, s.slot, s.levelID, s.startsAt, s.expiresAt,
        l.accountID, l.dailyNumber, p.userName
        FROM level_schedule s JOIN levels l ON l.levelID = s.levelID
        LEFT JOIN profiles p ON p.accountID = l.accountID
        WHERE s.applied = 0 AND s.startsAt <= ? AND s.expiresAt > ?
        ORDER BY s.startsAt DESC, s.scheduleID DESC`).all(now, now);
    if (!expired.length && !missed.length && !unstarted.length && !activeRows.length) return;
    const active = new Map();
    for (const row of activeRows) {
        const key = `${row.type}:${row.slot}`;
        if (!active.has(key)) active.set(key, row);
    }

    db.transaction(() => {
        const clearUnstarted = db.prepare(`UPDATE levels SET dailyNumber = 0, dailyTime = 0
            WHERE levelID = ? AND dailyNumber = ? AND dailyTime = ?`);
        for (const row of unstarted) {
            clearUnstarted.run(row.levelID, scheduleTargetNumber(row.type, row.slot), row.expiresAt);
        }
        db.prepare('UPDATE level_schedule SET applied = 2 WHERE applied = 1 AND expiresAt <= ?').run(now);
        db.prepare('UPDATE level_schedule SET applied = 2 WHERE applied = 0 AND expiresAt <= ?').run(now);

        const activate = db.prepare('UPDATE levels SET dailyNumber = ?, dailyTime = ? WHERE levelID = ?');
        const markActive = db.prepare('UPDATE level_schedule SET applied = 1 WHERE scheduleID = ?');
        for (const row of active.values()) {
            const targetNumber = scheduleTargetNumber(row.type, row.slot);
            activate.run(targetNumber, row.expiresAt, row.levelID);
            markActive.run(row.scheduleID);
        }
    })();
    for (const row of active.values()) {
        if (row.type !== 'daily' || scheduleTypeFromNumber(row.dailyNumber) === 'daily') continue;
        const username = row.userName || '';
        utils.notifAdd({
            toAccountID: row.accountID,
            type: 15,
            emoteIcon: 'royal',
            title: 'Daily!',
            description: `<cg>${username}</c>'s level is now <cy>daily!</c>`,
            age: '0 seconds',
            hasLevel: true,
            levelID: row.levelID,
            accountID: row.accountID,
            username
        });
    }
}

function scheduleTypeFromNumber(number) {
    if (number > 200000) return 'event';
    if (number >= 100001 && number <= 200000) return 'weekly';
    if (number > 0 && number < 100001) return 'daily';
    return null;
}

module.exports = { reconcileLevelSchedule };
