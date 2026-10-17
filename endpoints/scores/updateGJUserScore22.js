const db = require('../../database');
const utils = require('../../utils');
const { commonSecret } = require('../../middleware/secrets');

module.exports = {
    method: 'post',
    path: '/updateGJUserScore22.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const body = req.body || {};
        const parseIntegerOrZero = value => value == null || value === '' ? 0 : parseInt(value, 10);
        const stars = parseIntegerOrZero(body.stars);
        const demons = parseIntegerOrZero(body.demons);
        const icon = parseIntegerOrZero(body.icon);
        const color1 = parseIntegerOrZero(body.color1);
        const color2 = parseIntegerOrZero(body.color2);
        const rawAccountID = body.accountID;
        const accountID = rawAccountID == null || rawAccountID === '' ? 0 : parseInt(utils.number(rawAccountID), 10);
        const gjp2 = utils.remove(body.gjp2 || '');

        // sanity checks
        if (!Number.isInteger(accountID)) return res.send('-1');
        if (!accountID || !gjp2) return res.send('1'); // to prevent signed-out clients from not rendering scores UI or comments?? i have no idea why this affects comments, but whatever... go figure
        if (gjp2.length !== 40) return res.send('-1');
        if (![stars, demons, icon, color1, color2].every(Number.isInteger)) return res.send('-1');

        // db checks
        const check = db.prepare('SELECT * FROM profiles WHERE accountID = ?');
        const profile = check.get(accountID);
        const checkAccount = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
        const account = checkAccount.get(accountID);

        if (!profile || !account) return res.send('-1');
        if (gjp2 !== account.gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        const coins = parseIntegerOrZero(body.coins);
        const iconType = parseIntegerOrZero(body.iconType);
        const userCoins = parseIntegerOrZero(body.userCoins);
        const special = parseIntegerOrZero(body.special);
        const accIcon = parseIntegerOrZero(body.accIcon);
        const accShip = parseIntegerOrZero(body.accShip);
        const accBall = parseIntegerOrZero(body.accBall);
        const accBird = parseIntegerOrZero(body.accBird);
        const accDart = parseIntegerOrZero(body.accDart);
        const accRobot = parseIntegerOrZero(body.accRobot);
        const accGlow = parseIntegerOrZero(body.accGlow);
        const accSpider = parseIntegerOrZero(body.accSpider);
        const accExplosion = parseIntegerOrZero(body.accExplosion);
        const accSwing = parseIntegerOrZero(body.accSwing);
        const accJetpack = parseIntegerOrZero(body.accJetpack);
        const diamonds = parseIntegerOrZero(body.diamonds);
        const moons = parseIntegerOrZero(body.moons);
        const color3 = parseIntegerOrZero(body.color3);
        const demonInfoWins = parseIntegerOrZero(body.dinfow);
        const demonInfoGauntlets = parseIntegerOrZero(body.dinfog);
        const starInfoDemons = parseIntegerOrZero(body.sinfod);
        const starInfoGauntlets = parseIntegerOrZero(body.sinfog);
        if (![coins, iconType, userCoins, special, accIcon, accShip, accBall, accBird, accDart, accRobot, accGlow, accSpider, accExplosion, accSwing, accJetpack, diamonds, moons, color3].every(Number.isInteger)) return res.send('-1');
        const dinfo = utils.numbercolon(body.dinfo || '');
        const sinfo = utils.numbercolon(body.sinfo || '');
        if ((dinfo && ![demonInfoWins, demonInfoGauntlets].every(Number.isInteger)) ||
            (sinfo && ![starInfoDemons, starInfoGauntlets].every(Number.isInteger))) return res.send('-1');

        let processedDinfo = dinfo;
        if (dinfo) {
            const levelIds = dinfo.split(',');
            
            const levelCheck = db.prepare(`
                SELECT 
                    SUM(CASE WHEN starDemonDiff = 3 AND levelLength != 5 AND starDemon != 0 THEN 1 ELSE 0 END) as easyNormal,
                    SUM(CASE WHEN starDemonDiff = 4 AND levelLength != 5 AND starDemon != 0 THEN 1 ELSE 0 END) as mediumNormal,
                    SUM(CASE WHEN starDemonDiff = 0 AND levelLength != 5 AND starDemon != 0 THEN 1 ELSE 0 END) as hardNormal,
                    SUM(CASE WHEN starDemonDiff = 5 AND levelLength != 5 AND starDemon != 0 THEN 1 ELSE 0 END) as insaneNormal,
                    SUM(CASE WHEN starDemonDiff = 6 AND levelLength != 5 AND starDemon != 0 THEN 1 ELSE 0 END) as extremeNormal,
                    SUM(CASE WHEN starDemonDiff = 3 AND levelLength = 5 AND starDemon != 0 THEN 1 ELSE 0 END) as easyPlatformer,
                    SUM(CASE WHEN starDemonDiff = 4 AND levelLength = 5 AND starDemon != 0 THEN 1 ELSE 0 END) as mediumPlatformer,
                    SUM(CASE WHEN starDemonDiff = 0 AND levelLength = 5 AND starDemon != 0 THEN 1 ELSE 0 END) as hardPlatformer,
                    SUM(CASE WHEN starDemonDiff = 5 AND levelLength = 5 AND starDemon != 0 THEN 1 ELSE 0 END) as insanePlatformer,
                    SUM(CASE WHEN starDemonDiff = 6 AND levelLength = 5 AND starDemon != 0 THEN 1 ELSE 0 END) as extremePlatformer
                FROM levels 
                WHERE levelID IN (${levelIds.map(() => '?').join(',')})
            `);
            
            const demonCounts = levelCheck.get(levelIds);
            const totalDemons = Object.values(demonCounts).reduce((a, b) => a + b, 0);
            const demonDiff = Math.min(demons - totalDemons, 3);
            
            processedDinfo = [
                demonCounts.easyNormal + demonDiff,
                demonCounts.mediumNormal,
                demonCounts.hardNormal,
                demonCounts.insaneNormal,
                demonCounts.extremeNormal,
                demonCounts.easyPlatformer,
                demonCounts.mediumPlatformer,
                demonCounts.hardPlatformer,
                demonCounts.insanePlatformer,
                demonCounts.extremePlatformer,
                demonInfoWins,
                demonInfoGauntlets
            ].join(',');
        }

        let processedSinfo = sinfo;
        let processedPinfo = '';
        if (sinfo) {
            const sinfoArr = sinfo.split(',');
            const starsCount = sinfoArr.slice(0, 6).concat([
                starInfoDemons,
                starInfoGauntlets
            ]).join(',');
            
            const platformerCount = sinfoArr.slice(6, 12).concat([0]).join(',');
            
            processedSinfo = starsCount;
            processedPinfo = platformerCount;
        }
        const updateProfile = db.prepare(`
            UPDATE profiles SET 
                coins = ?,
                stars = ?,
                demons = ?,
                icon = ?,
                color1 = ?,
                color2 = ?,
                iconType = ?,
                userCoins = ?,
                special = ?,
                accIcon = ?,
                accShip = ?,
                accBall = ?,
                accBird = ?,
                accDart = ?,
                accRobot = ?,
                accGlow = ?,
                accSpider = ?,
                accExplosion = ?,
                accSwing = ?,
                accJetpack = ?,
                diamonds = ?,
                moons = ?,
                color3 = ?,
                dinfo = ?,
                sinfo = ?,
                pinfo = ?
            WHERE accountID = ?
        `);

        updateProfile.run(
            coins,
            stars,
            demons,
            icon,
            color1,
            color2,
            iconType,
            userCoins,
            special,
            accIcon,
            accShip,
            accBall,
            accBird,
            accDart,
            accRobot,
            accGlow,
            accSpider,
            accExplosion,
            accSwing,
            accJetpack,
            diamonds,
            moons,
            color3,
            processedDinfo,
            processedSinfo,
            processedPinfo,
            accountID
        );

        return res.send(String(accountID + 1));
    }
};