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
        creatorPoints INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS levels (
        levelID INTEGER PRIMARY KEY AUTOINCREMENT,
        accountID INTEGER NOT NULL,
        levelName TEXT NOT NULL,
        levelDesc TEXT NOT NULL,
        userRates INTEGER NOT NULL DEFAULT 0,
        noMinMaxAvgUserRate INTEGER NOT NULL DEFAULT 0,
        avgUserRate INTEGER NOT NULL DEFAULT 0,
        noMinMaxMinUserRate INTEGER NOT NULL DEFAULT 0,
        noMinMaxMaxUserRate INTEGER NOT NULL DEFAULT 0,
        levelVersion INTEGER NOT NULL DEFAULT 0,
        levelLength INTEGER NOT NULL DEFAULT 0,
        audioTrack INTEGER NOT NULL,
        password INTEGER NOT NULL,
        levelReports INTEGER NOT NULL DEFAULT 0,
        lastSent INTEGER NOT NULL DEFAULT 0,
        twoPlayer INTEGER NOT NULL DEFAULT 0,
        songID INTEGER NOT NULL DEFAULT 0,
        songIDs TEXT DEFAULT '',
        sfxIDs TEXT DEFAULT '',
        objects INTEGER NOT NULL DEFAULT 0,
        coins INTEGER NOT NULL DEFAULT 0,
        requestedStars INTEGER NOT NULL DEFAULT 0,
        extraString TEXT NOT NULL DEFAULT '',
        starDifficulty INTEGER NOT NULL DEFAULT 0,
        downloads INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        dislikes INTEGER NOT NULL DEFAULT 0,
        starDemon INTEGER NOT NULL DEFAULT 0,
        dailyNumber INTEGER NOT NULL DEFAULT 0,
        inGauntlet INTEGER NOT NULL DEFAULT 0,
        starAuto INTEGER NOT NULL DEFAULT 0,
        starStars INTEGER NOT NULL DEFAULT 0,
        uploadDate BIGINT NOT NULL,
        updateDate BIGINT NOT NULL,
        starCoins INTEGER NOT NULL DEFAULT 0,
        starHall INTEGER NOT NULL DEFAULT 0,
        isSent INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0,
        starEpic INTEGER NOT NULL DEFAULT 0,
        starDemonDiff INTEGER NOT NULL DEFAULT 0,
        unlisted INTEGER NOT NULL DEFAULT 0,
        originalReup INTEGER NOT NULL DEFAULT 0,
        isLDM INTEGER NOT NULL DEFAULT 0,
        gameVersion INTEGER NOT NULL DEFAULT 22
    );
    CREATE TABLE IF NOT EXISTS mapPacks (
        packID INTEGER PRIMARY KEY AUTOINCREMENT,
        packName TEXT NOT NULL,
        levels TEXT NOT NULL, -- comma separated level list!
        stars INTEGER NOT NULL DEFAULT 0,
        coins INTEGER DEFAULT 0,
        difficulty INTEGER NOT NULL DEFAULT 1,
        textColor TEXT NOT NULL,
        barColor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS level_ratings (
        levelID INTEGER NOT NULL,
        accountID INTEGER NOT NULL,
        stars INTEGER NOT NULL,
        PRIMARY KEY (levelID, accountID)
    );

    CREATE TABLE IF NOT EXISTS modSuggest (
        accountID INTEGER NOT NULL,
        levelID INTEGER NOT NULL,
        stars INTEGER NOT NULL,
        demonDiff INTEGER NOT NULL,
        feature INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gauntlets (
        ID INTEGER PRIMARY KEY, -- official gauntlet IDs are 1 through 61
        level1 INTEGER NOT NULL,
        level2 INTEGER NOT NULL,
        level3 INTEGER NOT NULL,
        level4 INTEGER NOT NULL,
        level5 INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS songs (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        artistID INTEGER NOT NULL,
        artistName TEXT NOT NULL,
        videoID TEXT DEFAULT '',
        youtubeURL TEXT DEFAULT '',
        allowedForUse INTEGER NOT NULL DEFAULT 1,
        songPriority INTEGER,
        link TEXT NOT NULL,
        nongEnum INTEGER NOT NULL DEFAULT 0,
        extraArtistIDs TEXT DEFAULT '',
        isNew INTEGER NOT NULL DEFAULT 0,
        newType INTEGER NOT NULL DEFAULT 0,
        extraArtistNames TEXT DEFAULT '',
        downloadSoundtrackOverride TEXT NOT NULL DEFAULT ''
    );
`);

module.exports = db;