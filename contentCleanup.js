const db = require('./database');
const utils = require('./utils');

function cleanupListRelatedData(listID) {
    const negativeListID = -listID;
    db.prepare('DELETE FROM levelscores WHERE levelID = ?').run(negativeListID);
    db.prepare('DELETE FROM platscores WHERE levelID = ?').run(negativeListID);
    db.prepare(`DELETE FROM content_increments
        WHERE contentType = 'likes_comments'
        AND contentID IN (SELECT commentID FROM comments WHERE levelID = ?)`)
        .run(negativeListID);
    db.prepare('DELETE FROM comments WHERE levelID = ?').run(negativeListID);
    db.prepare(`DELETE FROM content_increments
        WHERE contentID = ? AND contentType IN ('list', 'likes_lists')`).run(listID);
}

function cleanupLevelRelatedData(levelID, level) {
    const feature = level.featured ? level.starEpic + 1 : 0;
    const points = utils.creatorPointsForRating(level.starStars, feature);
    if (points) {
        db.prepare('UPDATE profiles SET creatorPoints = creatorPoints - ? WHERE accountID = ?')
            .run(points, level.accountID);
    }

    db.prepare('DELETE FROM level_ratings WHERE levelID = ?').run(levelID);
    db.prepare('DELETE FROM level_demon_ratings WHERE levelID = ?').run(levelID);
    db.prepare('DELETE FROM modSuggest WHERE levelID = ?').run(levelID);
    db.prepare('DELETE FROM level_schedule WHERE levelID = ?').run(levelID);
    db.prepare('DELETE FROM levelscores WHERE levelID = ?').run(levelID);
    db.prepare('DELETE FROM platscores WHERE levelID = ?').run(levelID);
    db.prepare(`DELETE FROM content_increments
        WHERE contentID = ? AND contentType IN ('level', 'likes_levels', 'demon_rating')`).run(levelID);
    db.prepare(`DELETE FROM content_increments
        WHERE contentType = 'likes_comments'
        AND contentID IN (SELECT commentID FROM comments WHERE levelID = ?)`)
        .run(levelID);
    db.prepare('DELETE FROM comments WHERE levelID = ?').run(levelID);

    const currentTime = Math.floor(Date.now() / 1000);
    const lists = db.prepare('SELECT listID, listLevels FROM lists').all();
    for (const list of lists) {
        const listLevels = list.listLevels.split(',');
        const remainingLevels = listLevels.filter(id => id !== String(levelID));
        if (remainingLevels.length === listLevels.length) continue;
        if (remainingLevels.length === 0) {
            cleanupListRelatedData(list.listID);
            db.prepare('DELETE FROM lists WHERE listID = ?').run(list.listID);
        } else {
            db.prepare('UPDATE lists SET listLevels = ?, listVersion = listVersion + 1, updateDate = ? WHERE listID = ?')
                .run(remainingLevels.join(','), currentTime, list.listID);
        }
    }

    const mapPacks = db.prepare('SELECT packID, levels FROM mapPacks').all();
    for (const pack of mapPacks) {
        const packLevels = pack.levels.split(',');
        const remainingLevels = packLevels.filter(id => id !== String(levelID));
        if (remainingLevels.length === packLevels.length) continue;
        if (remainingLevels.length === 0) {
            db.prepare('DELETE FROM mapPacks WHERE packID = ?').run(pack.packID);
        } else {
            db.prepare('UPDATE mapPacks SET levels = ? WHERE packID = ?').run(remainingLevels.join(','), pack.packID);
        }
    }

    db.prepare(`DELETE FROM gauntlets
        WHERE level1 = ? OR level2 = ? OR level3 = ? OR level4 = ? OR level5 = ?`)
        .run(levelID, levelID, levelID, levelID, levelID);
}

function cleanupSongReferences(songID) {
    db.prepare('UPDATE levels SET songID = 0 WHERE songID = ?').run(songID);
    const levels = db.prepare('SELECT levelID, songIDs FROM levels WHERE songIDs != ?').all('');
    for (const level of levels) {
        const songIDs = level.songIDs.split(',');
        const remainingIDs = songIDs.filter(id => id !== String(songID));
        if (remainingIDs.length !== songIDs.length) {
            db.prepare('UPDATE levels SET songIDs = ? WHERE levelID = ?').run(remainingIDs.join(','), level.levelID);
        }
    }
}

module.exports = { cleanupLevelRelatedData, cleanupListRelatedData, cleanupSongReferences };