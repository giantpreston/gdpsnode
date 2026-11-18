const db = require('./database');

const BYTES_PER_MIB = 1_048_576;
const MAX_SONG_IDS = 101;
const MAX_SFX_IDS = 1001;

function parseAudioIDs(value) {
    if (typeof value !== 'string' || value === '') return [];

    return value.split(',')
        .filter(id => /^-?\d+$/.test(id))
        .map(id => Number(id))
        .filter(id => Number.isSafeInteger(id) && id !== 0);
}

function getTotalAudioFilesize(songIDs, sfxIDs) {
    const songParams = songIDs.length ? songIDs : [0];
    const sfxParams = sfxIDs.length ? sfxIDs : [0];
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
    parseAudioIDs
};
