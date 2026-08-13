const { accountSecret } = require('../middleware/secrets');
const db = require('../database');
const zlib = require('zlib');

module.exports = {
    method: 'post',
    path: '/database/accounts/backupGJAccountNew.php',
    middleware: [accountSecret],
    handler: (req, res) => {
        const accountId = req.body?.accountID;
        const gjp2 = req.body?.gjp2;
        const saveData = req.body?.saveData;

        // sanity checks
        if (!accountId || !gjp2 || !saveData || !req.body.gameVersion || !req.body.binaryVersion || !req.body.udid || !req.body.uuid) return res.send('-1'); // cut off like 99% of the wrong reqsts
        if (gjp2.length !== 40) return res.send('-5'); // the game doesn't say it (it just displays -5) but this means invalid login info, gjp2 is 40 chars always

        // db checks
        const check = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
        const account = check.get(accountId);

        if (!account) return res.send('-5');
        if (account.gjp2 === gjp2) {
            if (account.isDisabled === 1) return res.send('-1'); // generic error since this has no disabled handler in-client

            // everything so far was ok, save the data!
            
            // split save data into ccgamemanager and cclocallevels
            const saveDataArr = saveData.split(';');
            
            // decode the first part (ccgamemanager)
            let decodedSave = saveDataArr[0]
                .replace(/-/g, '+')
                .replace(/_/g, '/');
            
            // base64 decode and gunzip
            const buffer = Buffer.from(decodedSave, 'base64');
            let decompressed;
            try {
                decompressed = zlib.gunzipSync(buffer).toString();
            } catch (err) {
                return res.send('-3'); // invalid save data
            }
            
            // extract orbs from key 14
            const orbsMatch = decompressed.match(/<k>14<\/k><s>(.*?)<\/s>/);
            const orbs = orbsMatch ? orbsMatch[1] : 0;
            
            // extract completed levels from key 4 (GS_value)
            const lvlsMatch = decompressed.match(/<k>GS_value<\/k>.*?<k>4<\/k><s>(.*?)<\/s>/);
            const lvls = lvlsMatch ? lvlsMatch[1] : 0;
            
            // replace password with placeholder for security
            const saveDataReplaced = decompressed.replace(/<k>GJA_002<\/k><s>.*?<\/s>/, '<k>GJA_002</k><s>password</s>');
            
            // recompress and re-encode
            const compressed = zlib.gzipSync(saveDataReplaced);
            let encodedSave = compressed.toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_');
            
            // merge back with cclocallevels
            const finalSaveData = encodedSave + ';' + saveDataArr[1];
            
            // update account with save data
            const updateAccount = db.prepare('UPDATE accounts SET saveData = ? WHERE accountID = ?');
            updateAccount.run(finalSaveData, accountId);
            
            // update profile orbs and completed levels
            const profileCheck = db.prepare('SELECT accountID FROM profiles WHERE userName = ?');
            const profile = profileCheck.get(account.userName);
            
            if (profile) {
                const updateProfile = db.prepare('UPDATE profiles SET orbs = ?, completedLvls = ? WHERE accountID = ?');
                updateProfile.run(orbs, lvls, profile.accountID);
            }
            
            return res.send('1');
            
        } else {
            return res.send('-2'); // login failure
        }
    }
};