const db = require('../database');
const utils = require('../utils');
const { commonSecret } = require('../middleware/secrets');

module.exports = {
    method: 'post',
    path: '/updateGJUserScore22.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const body = req.body || {};
        const stars = parseInt(body.stars, 10) || 0;
        const demons = parseInt(body.demons, 10) || 0;
        const icon = parseInt(body.icon, 10) || 0;
        const color1 = parseInt(body.color1, 10) || 0;
        const color2 = parseInt(body.color2, 10) || 0;
        const accountID = parseInt(utils.number(body.accountID || ''), 10);
        const gjp2 = utils.remove(body.gjp2 || '');

        // sanity checks
        if (!accountID || !gjp2) return res.send('-1');
        if (gjp2.length !== 40) return res.send('-1');

        // db checks
        const check = db.prepare('SELECT * FROM profiles WHERE accountID = ?');
        const profile = check.get(accountID);
        const checkAccount = db.prepare('SELECT * FROM accounts WHERE accountID = ?');
        const account = checkAccount.get(accountID);

        if (!profile || !account) return res.send('-1');
        if (gjp2 !== account.gjp2) return res.send('-1');
        if (account.isDisabled === 1) return res.send('-1');

        const coins = parseInt(body.coins, 10) || 0;
        const iconType = parseInt(body.iconType, 10) || 0;
        const userCoins = parseInt(body.userCoins, 10) || 0;
        const special = parseInt(body.special, 10) || 0;
        const accIcon = parseInt(body.accIcon, 10) || 0;
        const accShip = parseInt(body.accShip, 10) || 0;
        const accBall = parseInt(body.accBall, 10) || 0;
        const accBird = parseInt(body.accBird, 10) || 0;
        const accDart = parseInt(body.accDart, 10) || 0;
        const accRobot = parseInt(body.accRobot, 10) || 0;
        const accGlow = parseInt(body.accGlow, 10) || 0;
        const accSpider = parseInt(body.accSpider, 10) || 0;
        const accExplosion = parseInt(body.accExplosion, 10) || 0;
        const accSwing = parseInt(body.accSwing, 10) || 0;
        const accJetpack = parseInt(body.accJetpack, 10) || 0;
        const diamonds = parseInt(body.diamonds, 10) || 0;
        const moons = parseInt(body.moons, 10) || 0;
        const color3 = parseInt(body.color3, 10) || 0;
        const dinfo = utils.numbercolon(body.dinfo || '');
        const sinfo = utils.numbercolon(body.sinfo || '');

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
                parseInt(body.dinfow, 10) || 0,
                parseInt(body.dinfog, 10) || 0
            ].join(',');
        }

        let processedSinfo = sinfo;
        let processedPinfo = '';
        if (sinfo) {
            const sinfoArr = sinfo.split(',');
            const starsCount = sinfoArr.slice(0, 6).concat([
                parseInt(body.sinfod, 10) || 0,
                parseInt(body.sinfog, 10) || 0
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