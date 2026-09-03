const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/getGJSongInfo.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const songID = utils.number(req.body?.songID);

        // sanity checks
        if (!songID) return res.send('-1');

        // db checks
        const pre = db.prepare('SELECT * FROM songs WHERE ID = ?');
        const song = pre.get(songID);

        if (!song) return res.send('-1');
        if (song.allowedForUse !== 1) return res.send('-2');

        return res.send(`1~|~${songID}~|~2~|~${song.name}~|~3~|~${song.artistID}~|~4~|~${song.artistName}~|~5~|~${song.size}~|~6~|~${song.videoID}~|~7~|~${song.youtubeURL}~|~9~|~${song.songPriority}~|~10~|~${song.link}~|~11~|~${song.nongEnum}~|~12~|~${song.extraArtistIDs}~|~13~|~${song.isNew}~|~14~|~${song.newType}~|~15~|~${song.extraArtistNames}~|~16~|~${song.downloadSoundtrackOverride}`);
    }
};