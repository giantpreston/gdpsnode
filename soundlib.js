const zlib = require("zlib");
const db = require("./database")
let musicUpdatePromise;

function bulkInsert(tableName, records) {
    if (records.length === 0) return;

    // 1. Get column names and create placeholders
    const columns = Object.keys(records[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const columnNames = columns.join(', ');

    // 2. Build the prepared statement
    const sql = `INSERT OR REPLACE INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;
    const stmt = db.prepare(sql);

    // 3. Wrap in a transaction for maximum performance
    const insertMany = db.transaction((rows) => {
        for (const row of rows) {
            const values = columns.map(col => row[col]);
            stmt.run(values);
        }
    });

    insertMany(records);
}

function decodeLibrary(rawData) {
    try {
        const buf = Buffer.from(rawData, 'base64url');
        const inflated = zlib.inflateSync(buf);
        return inflated.toString("utf8");
    } catch (err) {
        console.log("Decompression error:", err);
        return null;
    }
}

function parseMusicLib(data) {
    const parts = data.split('|');

    const [versionStr, artistsStr, songsStr, tagsStr] = parts;

    // helper for safe url decoding
    const safeDecode = (str) => {
        if (!str || str.trim() === '') return '';
        try { return decodeURIComponent(str.trim()); } catch { return str.trim(); }
    };

    // parse artists
    const artists = {};
    if (artistsStr) {
        artistsStr.split(';').forEach(entry => {
            if (!entry) return;
            const [id, name, website, youtubeChannel] = entry.split(',');
            if (id) artists[id.trim()] = safeDecode(name);
        });
    }

    // parse songs
    const songs = [];
    if (songsStr) {
        songsStr.split(';').forEach(entry => {
            if (!entry) return;
            const fields = entry.split(',');

            const song = {
                ID: fields[0] ? fields[0].trim() : '',
                name: safeDecode(fields[1]),
                artistID: fields[2] ? fields[2].trim() : '',
                size: fields[3] ? Number(fields[3].trim() ) : 0,
                platform: fields[6] ? Number(fields[6].trim()) : 0,
                link: "-",      // since gd ignores it, leaving a placeholder
                artistName: ""  // default value
            }

            // finding the artist
            try { song.artistName = artists[song.artistID] } catch { console.log(song); }
            if (!song.artistName) song.artistName = (fields[7] || '').split(",")[0];
            // converting the size; rounded to 2 decimal places
            song.size = Math.round(song.size / 1024 / 1024 * 100) / 100;


            songs.push(song);
        });
    }

    return songs;
}

function parseSFXLib(decodedData) {
    const entries = decodedData.split(';');
    const sfxList = [];

    for (const entry of entries) {
        if (!entry.trim()) continue;
        const fields = entry.split(',');

        const id = fields[0];
        const name = fields[1];
        let fileSize = fields[3] || fields[4];

        // skip folders
        if (!fileSize || fileSize === '0' || fields.length < 3) continue;

        // convert size
        fileSize = Math.round(fileSize / 1024 / 1024 * 100) / 100;

        sfxList.push({ ID: parseInt(id, 10), name: name, size: fileSize });
    }

    return sfxList;
}

async function fetchMusicLibrary() {
    const response = await fetch("https://geometrydashfiles.b-cdn.net/music/musiclibrary_02.dat");
    if (!response.ok) throw new Error(`Music library download failed: HTTP ${response.status}`);

    const decoded = decodeLibrary(await response.text());
    if (!decoded) throw new Error('Music library could not be decompressed');

    const songs = parseMusicLib(decoded);
    if (songs.length === 0 || songs.some(song => !Number.isInteger(Number(song.ID)) || Number(song.ID) <= 0)) {
        throw new Error('Music library data contained no valid songs');
    }

    bulkInsert("songs", songs);
}

function fetchSFXLibrary(currentVersion) {
    fetch("https://geometrydashfiles.b-cdn.net/sfx/sfxlibrary.dat")
    .then((resp) => resp.text())
    .then((res) => {
        const decoded = decodeLibrary(res);
        const sfx = parseSFXLib(decoded);
        bulkInsert("sfx", sfx);

    });
}

function ensureMusicLib(currentVersion) {
    if (musicUpdatePromise) return musicUpdatePromise;

    musicUpdatePromise = updateMusicLibrary(currentVersion)
    .catch((err) => {
        console.error(`Music library update failed: ${err.message}`);
    })
    .finally(() => {
        musicUpdatePromise = null;
    });

    return musicUpdatePromise;
}

async function updateMusicLibrary(currentVersion) {
    const schedule = db.prepare("SELECT version, scheduled, verified FROM lib_update_scheduling WHERE id=0").get();
    const hasSongs = db.prepare('SELECT 1 FROM songs LIMIT 1').get();

    if (currentVersion === 0 && hasSongs && schedule?.verified === 1 && schedule.scheduled > Date.now()) return;

    if (currentVersion === 0) {
        currentVersion = schedule?.verified === 1 ? schedule.version : 0;
    }

    if (!hasSongs) currentVersion = 0;

    const response = await fetch("https://geometrydashfiles.b-cdn.net/music/musiclibrary_version_02.txt");
    if (!response.ok) throw new Error(`Music library version check failed: HTTP ${response.status}`);

    const remoteVersion = Number((await response.text()).trim());
    if (!Number.isFinite(remoteVersion)) throw new Error('Music library version response was invalid');

    if (remoteVersion > currentVersion || !hasSongs) {
        await fetchMusicLibrary();
    }

    const scheduled = Date.now() + 14 * 24 * 60 * 60 * 1000;
    db.prepare("INSERT OR REPLACE INTO lib_update_scheduling (id, version, scheduled, verified) VALUES (?, ?, ?, 1)").run(0, remoteVersion, scheduled);
}

function ensureSFXLib(currentVersion) {
    if (currentVersion === 0) {
        const t = db.prepare("SELECT version FROM lib_update_scheduling WHERE id=1").get();
        if (!t) currentVersion = 0;
        else currentVersion = t.version;
    }

    fetch("https://geometrydashfiles.b-cdn.net/sfx/sfxlibrary_version.txt")
    .then((resp) => resp.text())
    .then((res) => {
        if (Number(res) > currentVersion) fetchSFXLibrary();
        const scheduled = new Date().getTime() + 60*60*24*14;  // refresh after 2 weeks (better!)
        db.prepare("INSERT OR REPLACE INTO lib_update_scheduling VALUES (?, ?, ?)").run(1, res, scheduled);
    })
}

module.exports = {ensureMusicLib, ensureSFXLib};
