const db = require('../database');
const { commonSecret } = require('../middleware/secrets');

module.exports = {
    method: 'post',
    path: '/updateGJUserScore22.php',
    middleware: [commonSecret],
    handler: (req, res) => {
        const secret = req.body?.secret;
        const stars = parseInt(req.body?.stars) || 0;
        const demons = parseInt(req.body?.demons) || 0;
        const icon = parseInt(req.body?.icon) || 0;
        const color1 = parseInt(req.body?.color1) || 0;
        const color2 = parseInt(req.body?.color2) || 0;
        const accountID = req.body?.accountID;
        const udid = req.body?.udid;

        // sanity checks
        if (!secret || !accountID) {
            return res.send('-1');
        }

        // db checks
        const getProfile = db.prepare('SELECT * FROM profiles WHERE accountID = ?');
        const profile = getProfile.get(accountID);

        if (!profile) {
            return res.send('-1');
        }

        const coins = parseInt(req.body?.coins) || 0;
        const iconType = parseInt(req.body?.iconType) || 0;
        const userCoins = parseInt(req.body?.userCoins) || 0;
        const special = parseInt(req.body?.special) || 0;
        const accIcon = parseInt(req.body?.accIcon) || 0;
        const accShip = parseInt(req.body?.accShip) || 0;
        const accBall = parseInt(req.body?.accBall) || 0;
        const accBird = parseInt(req.body?.accBird) || 0;
        const accDart = parseInt(req.body?.accDart) || 0;
        const accRobot = parseInt(req.body?.accRobot) || 0;
        const accGlow = parseInt(req.body?.accGlow) || 0;
        const accSpider = parseInt(req.body?.accSpider) || 0;
        const accExplosion = parseInt(req.body?.accExplosion) || 0;
        const accSwing = parseInt(req.body?.accSwing) || 0;
        const accJetpack = parseInt(req.body?.accJetpack) || 0;
        const diamonds = parseInt(req.body?.diamonds) || 0;
        const moons = parseInt(req.body?.moons) || 0;
        const color3 = parseInt(req.body?.color3) || 0;
        const dinfo = req.body?.dinfo || '';
        const sinfo = req.body?.sinfo || '';

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
                parseInt(req.body?.dinfow) || 0,
                parseInt(req.body?.dinfog) || 0
            ].join(',');
        }

        let processedSinfo = sinfo;
        let processedPinfo = '';
        if (sinfo) {
            const sinfoArr = sinfo.split(',');
            const starsCount = sinfoArr.slice(0, 6).concat([
                parseInt(req.body?.sinfod) || 0,
                parseInt(req.body?.sinfog) || 0
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

        return res.send(String(accountID));
    }
};