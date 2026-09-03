const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/getGJChallenges.php',
    handler: (req, res) => {
        try {
            let accountID = parseInt(utils.number(req.body?.accountID || '0'), 10);
            let udid = utils.remove(req.body?.udid || '');
            const userID = parseInt(utils.number(req.body?.uuid), 10);
            let chk = utils.remove(req.body?.chk || '');

            if (/^\d+$/.test(udid)) return res.send('-1');

            if (accountID && accountID != 0) {
                const account = db.prepare('SELECT accountID FROM accounts WHERE accountID = ?').get(accountID);
                if (!account) return res.send('-1');
            }

            if (!userID && !udid) return res.send('-1');

            let decodedChk = '';
            if (chk && chk.length > 5) {

                try {
                    const chkPayload = chk.substring(5);
                    const decodedBuffer = Buffer.from(chkPayload, 'base64');
                    const decipheredBuffer = utils.xorCipher(decodedBuffer, '19847');
                    decodedChk = decipheredBuffer.toString('utf8');
                } catch (e) {
                }
            }

            const from = new Date('2000-12-17').getTime();
            const today = Date.now();
            const difference = today - from;
            const questID = Math.floor(difference / 86400000) * 3;
            const quest1ID = questID;
            const quest2ID = questID + 1;
            const quest3ID = questID + 2;

            const midnight = new Date();
            midnight.setDate(midnight.getDate() + 1);
            midnight.setHours(0, 0, 0, 0);
            const current = Date.now();
            const timeLeft = Math.floor((midnight.getTime() - current) / 1000);

            const allQuests = db.prepare('SELECT type, amount, reward, name FROM quests').all();
            
            if (!allQuests || allQuests.length < 3) {
                return res.send('-1');
            }

            const shuffled = allQuests.sort(() => Math.random() - 0.5);
            const result = shuffled.slice(0, 3);

            if (!result[0] || !result[1] || !result[2]) {
                return res.send('-1');
            }

            const quest1 = `${quest1ID},${result[0].type},${result[0].amount},${result[0].reward},${result[0].name}`;
            const quest2 = `${quest2ID},${result[1].type},${result[1].amount},${result[1].reward},${result[1].name}`;
            const quest3 = `${quest3ID},${result[2].type},${result[2].amount},${result[2].reward},${result[2].name}`;
            
            const responsePrefix = 'PrStn';
            const responseContent = `${responsePrefix}:${userID}:${decodedChk}:${udid}:${accountID}:${timeLeft}:${quest1}:${quest2}:${quest3}`;

            const responseBuffer = Buffer.from(responseContent, 'utf8');
            const cipheredBuffer = utils.xorCipher(responseBuffer, '19847');
            const encodedString = Buffer.from(cipheredBuffer).toString('base64');

            const hash = utils.genSolo3(encodedString);
            res.send(`${responsePrefix}${encodedString}|${hash}`);
        } catch (error) {
            console.error('\x1b[1;31m✗ [getGJChallenges] request failed:\x1b[0m', error);
            if (!res.headersSent) res.send('-1');
        }
    }
};
