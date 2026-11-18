const db = require('./database');
const utils = require('./utils');

const BYTES_PER_MIB = 1_048_576;
const MAX_SONG_IDS = 101;
const MAX_SFX_IDS = 1001;

function parseAudioID(value) {
    const rawID = typeof value === 'number' && Number.isSafeInteger(value)
        ? String(value)
        : typeof value === 'string'
            ? value.trim()
            : '';
    if (!/^\d+$/.test(rawID)) return NaN;

    const id = Number(utils.number(rawID));
    return Number.isSafeInteger(id) ? id : NaN;
}

function parseAudioIDs(value) {
    if (value == null || value === '') return [];
    if (typeof value !== 'string' || value.length > MAX_SFX_IDS * 32) return null;

    const rawIDs = value.split(',');
    if (rawIDs.some(rawID => rawID.trim() !== '' && !/^\d+$/.test(rawID.trim()))) return null;

    const ids = [];
    for (const rawID of utils.numbercolon(value).split(',')) {
        if (!rawID) continue;
        const id = parseAudioID(rawID);
        if (!Number.isSafeInteger(id)) return null;
        if (id !== 0) ids.push(id);
    }

    return ids;
}

function getTotalAudioFilesize(songIDs, sfxIDs) {
    const uniqueSongIDs = [...new Set(songIDs)];
    const uniqueSfxIDs = [...new Set(sfxIDs)];
    const songParams = uniqueSongIDs.length ? uniqueSongIDs : [0];
    const sfxParams = uniqueSfxIDs.length ? uniqueSfxIDs : [0];
    const query = db.prepare(`
        SELECT
            (SELECT COALESCE(SUM(size), 0) FROM songs WHERE ID IN (${songParams.map(() => '?').join(',')})) AS songs,
            (SELECT COALESCE(SUM(size), 0) FROM sfx WHERE ID IN (${sfxParams.map(() => '?').join(',')})) AS sfx
    `);
    const sizes = query.get(...songParams, ...sfxParams);

    return Math.round((Number(sizes.songs) + Number(sizes.sfx)) * BYTES_PER_MIB);
}

module.exports = {
    BYTES_PER_MIB,
    MAX_SONG_IDS,
    MAX_SFX_IDS,
    getTotalAudioFilesize,
    parseAudioID,
    parseAudioIDs
};
