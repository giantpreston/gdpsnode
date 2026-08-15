const Database = require('better-sqlite3');
const db = new Database('gd_server.db');

db.pragma('journal_mode = WAL');
db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
        accountID INTEGER PRIMARY KEY AUTOINCREMENT,
        userName TEXT NOT NULL,
        gjp2 TEXT NOT NULL,
        isDisabled BOOLEAN NOT NULL,
        saveData TEXT
    );

    CREATE TABLE IF NOT EXISTS profiles (
        accountID INTEGER NOT NULL,
        userName TEXT NOT NULL DEFAULT 'undefined',
        modLevel INTEGER NOT NULL DEFAULT 0,
        stars INTEGER NOT NULL DEFAULT 0,
        demons INTEGER NOT NULL DEFAULT 0,
        icon INTEGER NOT NULL DEFAULT 0,
        color1 INTEGER NOT NULL DEFAULT 0,
        color2 INTEGER NOT NULL DEFAULT 3,
        color3 INTEGER NOT NULL DEFAULT 0,
        iconType INTEGER NOT NULL DEFAULT 0,
        coins INTEGER NOT NULL DEFAULT 0,
        userCoins INTEGER NOT NULL DEFAULT 0,
        special INTEGER NOT NULL DEFAULT 0,
        gameVersion INTEGER NOT NULL DEFAULT 0,
        secret TEXT NOT NULL DEFAULT 'none',
        accIcon INTEGER NOT NULL DEFAULT 0,
        accShip INTEGER NOT NULL DEFAULT 0,
        accBall INTEGER NOT NULL DEFAULT 0,
        accBird INTEGER NOT NULL DEFAULT 0,
        accDart INTEGER NOT NULL DEFAULT 0,
        accRobot INTEGER DEFAULT 0,
        accGlow INTEGER NOT NULL DEFAULT 0,
        accSwing INTEGER NOT NULL DEFAULT 0,
        accJetpack INTEGER NOT NULL DEFAULT 0,
        dinfo TEXT DEFAULT '',
        sinfo TEXT DEFAULT '',
        pinfo TEXT DEFAULT '',
        creatorPoints REAL NOT NULL DEFAULT 0,
        diamonds INTEGER NOT NULL DEFAULT 0,
        moons INTEGER NOT NULL DEFAULT 0,
        orbs INTEGER NOT NULL DEFAULT 0,
        completedLvls INTEGER NOT NULL DEFAULT 0,
        accSpider INTEGER NOT NULL DEFAULT 0,
        accExplosion INTEGER NOT NULL DEFAULT 0,
        chest1time INTEGER NOT NULL DEFAULT 0,
        chest2time INTEGER NOT NULL DEFAULT 0,
        chest1count INTEGER NOT NULL DEFAULT 0,
        chest2count INTEGER NOT NULL DEFAULT 0
    );
`);

module.exports = db;