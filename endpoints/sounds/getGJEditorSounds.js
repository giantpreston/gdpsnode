const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');
const utils = require('../../utils');

const pageSize = 10;
const responseHash = 'f5da5823d94bbe7208dd83a30ff427c7d88fdb99';

module.exports = {
    method: 'post',
    path: '/getGJEditorSounds.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const body = req.body || {};
        const accountID = body.accountID == null || body.accountID === '' ? 0 : parseInt(utils.number(body.accountID), 10);
        const page = body.page == null || body.page === '' ? 0 : parseInt(utils.number(body.page), 10);
        const type = body.type == null || body.type === '' ? 2 : parseInt(utils.number(body.type), 10);
        const str = body.str == null ? '' : utils.remove(String(body.str));

        // sanity checks
        if (![accountID, page, type].every(Number.isInteger) || accountID < 0 || page < 0) return res.send('-1');

        // db checks
        let viewerID = 0;
        if (accountID > 0) {
            const gjp2 = utils.remove(body.gjp2 || '');
            const account = db.prepare('SELECT accountID, gjp2, isDisabled FROM accounts WHERE accountID = ?').get(accountID);
            if (!account || !gjp2 || account.gjp2 !== gjp2 || account.isDisabled === 1) return res.send('-1');
            viewerID = accountID;
        }

        const conditions = [];
        const params = [];
        let order = 's.likes DESC, s.soundID DESC';
        const directIDSearch = type === 0 && /^\d+$/.test(str);

        switch (type) {
            case 0:
                if (str) {
                    if (directIDSearch) {
                        conditions.push('s.soundID = ?');
                        params.push(Number(str));
                    } else {
                        conditions.push('s.soundName LIKE ?');
                        params.push(`%${str}%`);
                    }
                }
                break;
            case 1:
                order = 's.downloads DESC, s.soundID DESC';
                break;
            case 2:
                break;
            case 3:
                conditions.push('s.uploadDate > ?');
                params.push(Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60);
                order = 's.downloads DESC, s.soundID DESC';
                break;
            case 4:
                order = 's.uploadDate DESC, s.soundID DESC';
                break;
            case 5: {
                const creatorID = parseInt(utils.number(str), 10);
                if (!creatorID) return res.send('-1');
                conditions.push('s.accountID = ?');
                params.push(creatorID);
                break;
            }
            case 6:
                conditions.push('s.featured != 0');
                order = 's.downloads DESC, s.soundID DESC';
                break;
            case 11:
                conditions.push('s.awarded != 0');
                order = 's.downloads DESC, s.soundID DESC';
                break;
            case 13: {
                if (!viewerID) return res.send('-1');
                const friendships = db.prepare('SELECT person1, person2 FROM friendships WHERE person1 = ? OR person2 = ?').all(viewerID, viewerID);
                const friendIDs = friendships.map(friendship => friendship.person1 === viewerID ? friendship.person2 : friendship.person1);
                if (friendIDs.length === 0) return res.send(`#${0}:${page * pageSize}:${pageSize}#${responseHash}`);
                conditions.push(`s.accountID IN (${friendIDs.map(() => '?').join(',')})`);
                params.push(...friendIDs);
                break;
            }
            default:
                return res.send('-1');
        }

        const friendships = viewerID
            ? db.prepare('SELECT person1, person2 FROM friendships WHERE person1 = ? OR person2 = ?').all(viewerID, viewerID)
            : [];
        const friendIDs = new Set(friendships.map(friendship => friendship.person1 === viewerID ? friendship.person2 : friendship.person1));
        const visibility = ['s.unlisted = 0'];
        if (viewerID) {
            visibility.push('s.accountID = ?');
            params.push(viewerID);
            if (friendIDs.size > 0) {
                visibility.push(`(s.unlisted = 3 AND s.accountID IN (${[...friendIDs].map(() => '?').join(',')}))`);
                params.push(...friendIDs);
            }
        }
        if (directIDSearch) visibility.push('s.unlisted = 4');
        conditions.push(`(${visibility.join(' OR ')})`);
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        try {
            const total = db.prepare(`
                SELECT COUNT(*) AS total
                FROM editor_sounds s
                JOIN accounts a ON a.accountID = s.accountID
                ${where}
            `).get(...params).total;
            const packs = db.prepare(`
                SELECT s.*, a.userName
                FROM editor_sounds s
                JOIN accounts a ON a.accountID = s.accountID
                ${where}
                ORDER BY ${order}
                LIMIT ? OFFSET ?
            `).all(...params, pageSize, page * pageSize);

            const creators = new Map();
            const packStrings = packs.map(pack => {
                creators.set(pack.accountID, `${pack.accountID + 1}:${pack.userName}:${pack.accountID}`);
                return `1:${pack.soundID}:2:${pack.soundName}:3:${pack.soundDesc}:5:${pack.version}:49:${pack.accountID}:50:${pack.userName}:10:${pack.downloads}:14:${pack.likes}:19::51:${pack.soundData}:28:${pack.uploadDate}:29:${pack.updateDate}:59:${pack.actionCount}:60:${pack.soundCount}:61:${pack.unlisted}:64:${pack.emote}`;
            });
            const creatorString = [...creators.values()].join('|');
            const offset = page * pageSize;
            return res.send(`${packStrings.join('|')}#${creatorString}#${total}:${offset}:${pageSize}#${responseHash}`);
        } catch (error) {
            console.error('\x1b[1;31m✗ Failed to search editor sound packs:\x1b[0m', error);
            return res.send('-1');
        }
    }
};