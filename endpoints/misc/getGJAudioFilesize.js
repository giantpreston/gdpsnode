const { commonSecret } = require('../../middleware/secrets');
const config = require('../../config');
const {
    BYTES_PER_MIB,
    MAX_SONG_IDS,
    MAX_SFX_IDS,
    getTotalAudioFilesize,
    parseAudioIDs
} = require('../../audioFilesize');

module.exports = {
    method: 'post',
    path: '/getGJAudioFilesize.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const songIDs = parseAudioIDs(req.body?.songIDs ?? '');
        const sfxIDs = parseAudioIDs(req.body?.sfxIDs ?? '');

        if (songIDs === null || sfxIDs === null
            || songIDs.length > MAX_SONG_IDS || sfxIDs.length > MAX_SFX_IDS) {
            return res.send('-1');
        }

        const totalSize = getTotalAudioFilesize(songIDs, sfxIDs);
        const maximumSize = config.maxAudioFilesize * BYTES_PER_MIB;
        return res.send(`${totalSize}:${maximumSize}`);
    }
};

// holy shit preston!!15!65176  3782361467563268746t324875 tfhjkzfhyguhdxfjg