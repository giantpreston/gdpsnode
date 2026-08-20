const { levelSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');
const fs = require('fs/promises');
const path = require('path');

module.exports = {
    method: 'post',
    path: '/deleteGJLevelUser20.php',
    middleware: [levelSecret],
    handler: async (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID || ''), 10);
        const levelID = parseInt(utils.number(req.body?.levelID || ''), 10);
        const gjp2 = utils.remove(req.body?.gjp2);

        // sanity checks
        if (!accountID || !gjp2 || !levelID) return res.send('-1'); // missing accountID, gjp2 or levelID
        if (gjp2.length !== 40) return res.send('-1'); // gjp2 doesn't match format
        
        // db checks
        const check = db.prepare("SELECT * FROM accounts WHERE accountID = ?");
        const account = check.get(accountID);
        const check2 = db.prepare("SELECT * FROM profiles WHERE accountID = ?");
        const profile = check2.get(accountID);

        if (!account) return res.send('-1'); // account doesn't exist

        const check2 = db.prepare("SELECT * FROM levels WHERE levelID = ?");
        const level = check2.get(levelID);

        if (!level) return res.send('-1'); // level doesn't exist
        if (gjp2 !== account.gjp2) return res.send('-1'); // doesn't own account
        if (level.accountID !== accountID && profile.modLevel !== 2) return res.send('-1'); // doesn't own level/isn't elder mod

        // level deletion
        const levelsDir = path.join(__dirname, '..', 'levels');
        try {
            await fs.access(levelsDir);
        } catch {
            await fs.mkdir(levelsDir, { recursive: true });
            return res.send('-1'); // levels dir doesn't exist, therefore level doesn't exist.
        }
        const filePath = path.join(levelsDir, `${levelID}.gdcs`);

        try {
            const action = db.prepare('DELETE FROM levels WHERE levelID = ?');
            const info = action.run(levelID); // delete level from db
            await fs.unlink(filePath); // delete level data from folder

            if (info.changes > 0) return res.send('1');
        } catch (err) {
            console.error('\x1b[1;31m✗ Failed to delete level:', err);
            return res.send('-1');
        }
        return res.send('-1'); // just in case something really gets fucked up so we still serve a response
    }
};