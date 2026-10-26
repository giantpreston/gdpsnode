const { llMid } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');
const crypto = require('crypto');
const { infoWebhookEmbed, errorWebhookEmbed, warnWebhookEmbed, hook } = require('../../webhook.js');


function generateListSeed(listLevels, accountID, seed2) {
    const chars = 50;
    const step = Math.floor(listLevels.length / chars);
    const selected = listLevels.length <= chars 
        ? listLevels 
        : Array.from({length: chars}, (_, i) => listLevels[step * i]).join('');
    
    const combined = selected + accountID;
    const sha1Hex = crypto.createHash('sha1').update(combined).digest('hex');
    const seed2Str = String(seed2);
    
    const xorBuffer = Buffer.from(
        Array.from(sha1Hex, (ch, i) => 
            ch.charCodeAt(0) ^ seed2Str.charCodeAt(i % seed2Str.length)
        )
    );
    
    return xorBuffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function parseListLevels(listLevels) {
    if (typeof listLevels !== 'string' || !/^\d+(,\d+)*$/.test(listLevels)) {
        return null;
    }

    const levelIDs = listLevels.split(',').map(Number);
    if (levelIDs.some(levelID => !Number.isInteger(levelID) || levelID < 1) || new Set(levelIDs).size !== levelIDs.length) {
        return null;
    }

    const placeholders = levelIDs.map(() => '?').join(',');
    const existingLevels = db.prepare(`SELECT levelID FROM levels WHERE levelID IN (${placeholders})`).all(...levelIDs);
    return existingLevels.length === levelIDs.length ? levelIDs : null;
}

function publicListLevels(levelIDs) {
    const placeholders = levelIDs.map(() => '?').join(',');
    const publicLevels = new Set(db.prepare(
        `SELECT levelID FROM levels WHERE unlisted = 0 AND levelID IN (${placeholders})`
    ).all(...levelIDs).map(level => level.levelID));
    return levelIDs.filter(levelID => publicLevels.has(levelID));
}

module.exports = {
    method: 'post',
    path: '/uploadGJLevelList.php',
    middleware: [llMid],
    handler: (req, res) => {
        const body = req.body || {};
        const submittedListLevels = utils.remove(body.listLevels);
        const accountID = parseInt(utils.number(body.accountID), 10);
        const gjp2 = utils.remove(body.gjp2);
        const listID = parseInt(utils.number(body.listID), 10);
        const listName = utils.remove(body.listName);
        const listDesc = utils.remove(body.listDesc);
        const difficulty = parseInt(utils.number(body.difficulty), 10);
        const listVersion = parseInt(utils.number(body.listVersion), 10);
        const original = parseInt(utils.number(body.original), 10);
        const unlisted = parseInt(utils.number(body.unlisted), 10);
        const gameVersion = Number(body.gameVersion);
        const binaryVersion = Number(body.binaryVersion);
        const notify = body.notify == null || body.notify === '' ? 0 : parseInt(body.notify, 10);
        const seed = utils.remove(body.seed);
        const seed2 = utils.remove(body.seed2);

        // sanity checks
        if (!accountID || !gjp2 || !submittedListLevels || !Number.isInteger(listID) || listName === null || listName === undefined || listDesc === null || listDesc === undefined || !Number.isInteger(difficulty) || !Number.isInteger(listVersion) || !Number.isInteger(original) || !Number.isInteger(unlisted) || Number.isNaN(notify) || !body.gameVersion || !body.binaryVersion || !Number.isInteger(gameVersion) || !Number.isInteger(binaryVersion) || !seed || !seed2) return res.send('-1'); // fah
        const submittedLevelIDs = parseListLevels(submittedListLevels);
        if (!submittedLevelIDs) return res.send('-1');
        if (generateListSeed(submittedListLevels, accountID, seed2) !== seed) return res.send('-100');
        const listLevels = publicListLevels(submittedLevelIDs).join(',');
        if (!listLevels) return res.send('-1');
        if (gameVersion > 22) return res.send('-1');
        if (binaryVersion > 51) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (listName.length > 20 || listName.length < 0) return res.send('-1');
        if (listDesc && !utils.isURLBase64(listDesc)) return res.send('-1');
        if (listID < 0) return res.send('-1');
        if (listVersion < 0) return res.send('-1');
        if (difficulty < -1 || difficulty > 10) return res.send('-1');
        if (original < 0) return res.send('-1');
        if (unlisted < 0 || unlisted > 2) return res.send('-1');
        if (notify < 0 || notify > 3) return res.send('-1');
        if (notify && unlisted !== 0) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);

        if (!account) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');
        
        const isUpdate = listID > 0;
        const list = isUpdate
            ? db.prepare('SELECT * FROM lists WHERE listID = ? AND accountID = ?').get(listID, accountID)
            : null;

        if (isUpdate) {
            if (!list) return res.send('-1'); // not a real list or doesn't own list

            const updateQuery = `
                UPDATE lists SET
                    listName = ?,
                    listDesc = ?,
                    listVersion = ?,
                    listLevels = ?,
                    starDifficulty = ?,
                    starDemon = ?,
                    unlisted = ?,
                    updateDate = ?
                WHERE listID = ?
            `;
            const updateValues = [
                listName, listDesc, list.listVersion + 1, listLevels,
                difficulty, difficulty > 5 ? 1 : 0, list.featured ? 0 : unlisted,
                Math.floor(Date.now()/ 1000), listID
            ];

            const updateList = db.prepare(updateQuery);
            const inf = updateList.run(...updateValues);

            if (inf.changes > 0) return res.send(String(listID));
        } else {
            const columns = [
                'listName', 'listDesc', 'listVersion', 'accountID',
                'starDifficulty', 'starDemon', 'listLevels', 'uploadDate', 'updateDate',
                'original', 'unlisted'
            ];
            const values = [
                listName, listDesc, 1, accountID, difficulty, difficulty > 5 ? 1 : 0, listLevels,
                Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000),
                original, unlisted
            ];

            const placeholders = values.map(() => '?').join(', ');
            const insertQuery = `INSERT INTO lists (${columns.join(', ')}) VALUES (${placeholders})`;
            const addlist = db.prepare(insertQuery);
            const inf = addlist.run(...values);

            const newListID = inf.lastInsertRowid;
            infoWebhookEmbed(`New list uploaded!\n List ID: ${newListID}\n List Name: ${listName}`, hook);

            const recipients = new Map();
            if (notify === 1 || notify === 3) {
                const friends = db.prepare(`
                    SELECT person2 AS accountID FROM friendships WHERE person1 = ?
                    UNION
                    SELECT person1 AS accountID FROM friendships WHERE person2 = ?
                `).all(accountID, accountID);
                for (const friend of friends) recipients.set(friend.accountID, (recipients.get(friend.accountID) || 0) | 1);
            }
            if (notify === 2 || notify === 3) {
                const followers = db.prepare('SELECT person1 AS accountID FROM follows WHERE person2 = ?').all(accountID);
                for (const follower of followers) recipients.set(follower.accountID, (recipients.get(follower.accountID) || 0) | 2);
            }
            for (const [recipientID, notificationMask] of recipients) {
                utils.notifAdd({
                    toAccountID: recipientID,
                    notificationMask,
                    type: 10,
                    emoteIcon: 'cube',
                    title: 'New List!',
                    description: `<cg>${account.userName}</c> uploaded the list <cy>${listName}</c>!`,
                    accountID,
                    username: account.userName
                });
            }
            
            return res.send(String(newListID));
        }
        return res.send('-1'); // if fail
    }
};