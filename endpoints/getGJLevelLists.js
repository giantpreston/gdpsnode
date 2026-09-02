const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const crypto = require('crypto');
const utils = require('../utils');

const pageSize = 10;

function generateMulti(lists) {
    let hash = '';
    for (const list of lists) {
        const id = String(list.listID);
        hash += id[0] + id[id.length - 1] + list.starStars + list.countForReward;
    }
    return crypto.createHash('sha1').update(hash + 'xI25fpAapCQg').digest('hex');
}

function integer(value, fallback = 0) {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function hasValue(body, name) {
    return body[name] !== undefined && body[name] !== '';
}

module.exports = {
    method: 'post',
    path: '/getGJLevelLists.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        try {
            const body = req.body || {};
            const accountID = body.accountID ? parseInt(utils.number(body.accountID), 10) : 0;
            const type = integer(body.type);
            const page = Math.max(integer(body.page), 0);
            const offset = page * pageSize;
            const str = hasValue(body, 'str') ? utils.remove(String(body.str)) : '';
            const diff = hasValue(body, 'diff') ? utils.numbercolon(String(body.diff)) : '-';
            const demonFilter = integer(body.demonFilter);
            const isIdSearch = type === 0 && /^\d+$/.test(str);
            const conditions = [];
            const params = [];
            let order = 'likes DESC';

            if (integer(body.star) !== 0 || integer(body.featured) === 1) {
                conditions.push('starStars != 0');
            }

            if (diff === '-1') {
                conditions.push("starDifficulty = -1");
            } else if (diff === '-3') {
                conditions.push('starDifficulty = 0');
            } else if (diff === '-2') {
                conditions.push('starDemon = 1');
                if (demonFilter) {
                    conditions.push('starDifficulty = ?');
                    params.push(5 + demonFilter);
                }
            } else if (diff && diff !== "-") {
                const values = diff.split(',').filter(value => value !== '').map(Number);
                if (values.some(value => !Number.isInteger(value))) return res.send('-1');
                conditions.push(`starDifficulty IN (${values.map(() => '?').join(',')})`);
                params.push(...values);
            }

            switch (type) {
            case 0:
                if (str) {
                    if (/^\d+$/.test(str)) {
                        conditions.length = 0;
                        conditions.push('listID = ?');
                        params.length = 0;
                        params.push(Number(str));
                    } else {
                        conditions.push('listName LIKE ?');
                        params.push(`%${str}%`);
                    }
                }
                order = 'likes DESC';
                break;
            case 1:
                order = 'downloads DESC';
                break;
            case 2:
                order = 'likes DESC';
                break;
            case 3:
                conditions.push('uploadDate > ?');
                params.push(Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60);
                order = 'downloads DESC';
                break;
            case 4:
                order = 'uploadDate DESC';
                break;
            case 5:
                if (!/^\d+$/.test(str)) return res.send('-1');
                conditions.push('accountID = ?');
                params.push(Number(str));
                break;
            case 6:
                conditions.push('featured != 0');
                order = 'downloads DESC';
                break;
            case 11:
                conditions.push('starStars != 0');
                order = 'downloads DESC';
                break;
            case 12: {
                const followed = utils.numbercolon(String(body.followed || ''));
                if (!followed) return res.send('-1');
                const ids = followed.split(',').filter(value => value !== '').map(Number);
                if (ids.some(value => !Number.isInteger(value))) return res.send('-1');
                conditions.push(`accountID IN (${ids.map(() => '?').join(',')})`);
                params.push(...ids);
                break;
            }
            case 13: {
                const friendships = db.prepare('SELECT person1, person2 FROM friendships WHERE person1 = ? OR person2 = ?').all(accountID, accountID);
                const friendIDs = new Set();
                for (const friendship of friendships) {
                    if (friendship.person1 === accountID) {
                        friendIDs.add(friendship.person2);
                    } else {
                        friendIDs.add(friendship.person1);
                    }
                }
                if (friendIDs.size === 0) return res.send('-1');
                const ids = Array.from(friendIDs);
                conditions.push(`accountID IN (${ids.map(() => '?').join(',')})`);
                params.push(...ids);
                order = 'likes DESC';
                break;
            }
            case 7:
                order = 'likes DESC';
                break;
            case 27:
                // no such thing as sent lists, robtop's servers just do this
                order = 'likes DESC';
                break;
            default:
                break;
            }

            if (!isIdSearch) {
                conditions.push('unlisted = 0');
            }

            const where = ` WHERE ${conditions.join(' AND ')}`;
            const total = db.prepare(`SELECT COUNT(*) AS count FROM lists${where}`).get(...params).count;
            let lists = db.prepare(`SELECT * FROM lists${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
                .all(...params, pageSize, offset);

            if (accountID) {
                const friendships = db.prepare('SELECT person1, person2 FROM friendships WHERE person1 = ? OR person2 = ?').all(accountID, accountID);
                const friendIDs = new Set();
                for (const friendship of friendships) {
                    if (friendship.person1 === accountID) {
                        friendIDs.add(friendship.person2);
                    } else {
                        friendIDs.add(friendship.person1);
                    }
                }
                lists = lists.filter(list => {
                    if (list.unlisted === 0 || list.unlisted === 2) return true;
                    if (list.unlisted === 1 && (list.accountID === accountID || friendIDs.has(list.accountID))) return true;
                    return false;
                });
            } else {
                lists = lists.filter(list => list.unlisted === 0 || list.unlisted === 2);
            }

            if (lists.length === 0) return res.send('-1');

            const accountIDs = [...new Set(lists.map(list => list.accountID))];
            const placeholders = accountIDs.map(() => '?').join(',');
            const profiles = db.prepare(`SELECT accountID, userName FROM profiles WHERE accountID IN (${placeholders})`)
                .all(...accountIDs);
            const names = new Map(profiles.map(profile => [profile.accountID, profile.userName]));

            const listString = lists.map(list => [
                1, list.listID, 2, list.listName, 3, list.listDesc, 5, list.listVersion,
                49, list.accountID, 50, names.get(list.accountID) || '', 10, list.downloads,
                7, list.starDifficulty, 14, list.likes, 19, list.featured, 51, list.listLevels,
                55, list.starStars, 56, list.countForReward, 28, list.uploadDate,
                29, list.updateDate
            ].join(':')).join('|');
            const userString = profiles.map(profile => [
                1, profile.userName, 2, profile.accountID + 1, 16, profile.accountID
            ].join(':')).join('|');

            if (/^\d+$/.test(str) && type === 0 && lists.length === 1) {
                const listID = Number(str);
                if (accountID) {
                    const existingIncrement = db.prepare('SELECT * FROM content_increments WHERE accountID = ? AND contentID = ? AND contentType = ?').get(accountID, listID, 'list');
                    if (!existingIncrement) {
                        const inf = db.prepare('UPDATE lists SET downloads = downloads + 1 WHERE listID = ?').run(listID);
                        if (inf.changes > 0) {
                            db.prepare('INSERT OR IGNORE INTO content_increments (accountID, contentID, contentType) VALUES (?, ?, ?)').run(accountID, listID, 'list');
                        }
                    }
                }
            }

            const responseHash = generateMulti(lists);
            res.send(`${listString}#${userString}#${total}:${offset}:${pageSize}#${responseHash}`);
        } catch (error) {
            console.error('\x1b[1;31m✗ [getGJLevelLists] request failed:\x1b[0m', error);
            if (!res.headersSent) res.send('-1');
        }
    }
};

// lists! yay