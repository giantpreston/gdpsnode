const Database = require('better-sqlite3');
const db = new Database('gd_server.db');

db.pragma('journal_mode = WAL');
db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
        accountID INTEGER PRIMARY KEY AUTOINCREMENT,
        userName TEXT NOT NULL,
        gjp2 TEXT NOT NULL,
        isDisabled INTEGER NOT NULL,
        commentBan INTEGER NOT NULL DEFAULT 0,
        commentBanReason TEXT DEFAULT '',
        permaCommentBan INTEGER NOT NULL DEFAULT 0,
        creatorBanned INTEGER NOT NULL DEFAULT 0,
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
        mS INTEGER NOT NULL DEFAULT 0,
        frS INTEGER NOT NULL DEFAULT 0,
        cS INTEGER NOT NULL DEFAULT 0,
        youtubeurl TEXT NOT NULL DEFAULT '',
        twitter TEXT NOT NULL DEFAULT '',
        twitch TEXT NOT NULL DEFAULT '',
        discord TEXT NOT NULL DEFAULT '',
        instagram TEXT NOT NULL DEFAULT '',
        tiktok TEXT NOT NULL DEFAULT '',
        custom TEXT NOT NULL DEFAULT '',
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
        starDemon INTEGER NOT NULL DEFAULT 0,
        dailyNumber INTEGER NOT NULL DEFAULT 0,
        dailyTime INTEGER NOT NULL DEFAULT 0,
        eventNumber INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS comments (
        accountID INTEGER NOT NULL,
        userName TEXT NOT NULL,
        comment TEXT NOT NULL,
        levelID INTEGER NOT NULL,
        commentID INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        percent INTEGER NOT NULL DEFAULT 0,
        isSpam INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS acccomments (
        accountID INTEGER NOT NULL,
        userName TEXT NOT NULL,
        comment TEXT NOT NULL,
        commentID INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        isSpam INTEGER NOT NULL DEFAULT 0
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

    CREATE TABLE IF NOT EXISTS lists (
        listID INTEGER PRIMARY KEY AUTOINCREMENT,
        listName TEXT NOT NULL,
        listDesc TEXT NOT NULL,
        listVersion INTEGER NOT NULL DEFAULT 1,
        accountID INTEGER NOT NULL,
        downloads INTEGER NOT NULL DEFAULT 0,
        starDifficulty INTEGER NOT NULL,
        starDemon INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0,
        starStars INTEGER NOT NULL DEFAULT 0,
        listLevels TEXT NOT NULL,
        countForReward INTEGER NOT NULL DEFAULT 0,
        uploadDate INTEGER NOT NULL,
        updateDate INTEGER NOT NULL,
        original INTEGER NOT NULL DEFAULT 0,
        unlisted INTEGER NOT NULL DEFAULT 0
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
        size INTEGER NOT NULL DEFAULT 0, -- size in MB, rounded to 2 decimal places
        extraArtistNames TEXT DEFAULT '',
        downloadSoundtrackOverride TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS content_increments (
        accountID INTEGER NOT NULL,
        contentID INTEGER NOT NULL,
        contentType TEXT NOT NULL,
        PRIMARY KEY (accountID, contentID, contentType)
    );
    
    CREATE TABLE IF NOT EXISTS friendships (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        person1 INTEGER NOT NULL,
        person2 INTEGER NOT NULL,
        isNew1 INTEGER NOT NULL,
        isNew2 INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        person1 INTEGER NOT NULL,
        person2 INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS friendreqs (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        accountID INTEGER NOT NULL,
        toAccountID INTEGER NOT NULL,
        comment TEXT NOT NULL,
        uploadDate INTEGER NOT NULL,
        isNew INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS messages (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        accID INTEGER NOT NULL,
        userName TEXT NOT NULL,
        toAccountID INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        isNew INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS quests (
        questID INTEGER PRIMARY KEY AUTOINCREMENT,
        type INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        reward INTEGER NOT NULL,
        name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS levelscores (
        scoreID INTEGER PRIMARY KEY AUTOINCREMENT,
        accountID INTEGER NOT NULL,
        levelID INTEGER NOT NULL,
        percent INTEGER NOT NULL,
        uploadDate INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 1,
        coins INTEGER NOT NULL DEFAULT 0,
        clicks INTEGER NOT NULL DEFAULT 0,
        time INTEGER NOT NULL DEFAULT 0,
        progresses TEXT NOT NULL DEFAULT '',
        dailyID INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS platscores (
        scoreID INTEGER PRIMARY KEY AUTOINCREMENT,
        accountID INTEGER NOT NULL,
        levelID INTEGER NOT NULL,
        time INTEGER NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS secret_rewards (
        rewardID INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        uses INTEGER NOT NULL DEFAULT 1,
        duration INTEGER NOT NULL DEFAULT 0,
        rewards TEXT NOT NULL,
        createdAt INTEGER NOT NULL
    );
`);

function setInitialSequence(table, firstID) {
    if (db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()) return;

    const sequence = db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?');
    if (sequence.run(firstID - 1, table).changes === 0) {
        db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, firstID - 1);
    }
}

setInitialSequence('accounts', 72);
setInitialSequence('levels', 128);

function closeDB() {
    try {
        db.pragma('wal_checkpoint(FULL)');
        db.close();
        console.log('\x1b[1;32m✓ SQLite database closed.\x1b[0m');
    } catch (err) {
        console.error('\x1b[1;31m✗ Error closing SQLite database:\x1b[0m', err);
    }
}

module.exports = db;
module.exports.closeDB = closeDB;