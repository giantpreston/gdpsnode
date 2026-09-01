const { commonSecret } = require('../middleware/secrets');
const db = require('../database');
const utils = require('../utils');

module.exports = {
    method: 'post',
    path: '/getGJUserList20.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const accountID = parseInt(utils.number(req.body?.accountID), 10);
        const gjp2 = utils.remove(req.body?.gjp2);
        const type = parseInt(utils.number(req.body?.type), 10);

        // sanity checks
        if (!accountID || !gjp2 || isNaN(type)) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');
        if (type !== 0 && type !== 1) return res.send('-1');

        // db checks
        const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
        
        if (!account) return res.send('-1');
        if (account.gjp2 !== gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        let results;
        let people = [];
        const isNewMap = {};

        if (type === 0) {
            results = db.prepare('SELECT person1, isNew1, person2, isNew2 FROM friendships WHERE person1 = ? OR person2 = ?').all(accountID, accountID);
            
            if (results.length === 0) return res.send('-2');

            for (const friendship of results) {
                let person = friendship.person1;
                let isNew = friendship.isNew1;
                
                if (friendship.person1 === accountID) {
                    person = friendship.person2;
                    isNew = friendship.isNew2;
                }
                
                people.push(person);
                isNewMap[person] = isNew;
            }

            db.prepare('UPDATE friendships SET isNew1 = 0 WHERE person2 = ?').run(accountID);
            db.prepare('UPDATE friendships SET isNew2 = 0 WHERE person1 = ?').run(accountID);
        } else if (type === 1) {
            results = db.prepare('SELECT person2 FROM blocks WHERE person1 = ?').all(accountID);
            
            if (results.length === 0) return res.send('-2');
            
            for (const block of results) {
                people.push(block.person2);
            }
        }

        if (people.length === 0) return res.send('-1');

        let peopleString = '';
        for (const personID of people) {
            const profile = db.prepare('SELECT userName, accountID, icon, color1, color2, iconType, special, creatorPoints FROM profiles WHERE accountID = ?').get(personID);
            
            if (profile) {
                const isNew = isNewMap[personID] || 0;
                peopleString += `1:${profile.userName}:2:${profile.accountID + 1}:9:${profile.icon}:10:${profile.color1}:11:${profile.color2}:14:${profile.iconType}:15:${profile.special}:16:${profile.accountID}:8:${profile.creatorPoints}:41:${isNew}|`;
            }
        }

        if (peopleString === '') return res.send('-1');
        peopleString = peopleString.slice(0, -1);

        return res.send(peopleString);
    }
};
