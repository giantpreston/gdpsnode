const { commonSecret } = require('../../middleware/secrets');
const db = require('../../database');

function getStuff() {
    const stuff = db.prepare(`WITH ranked AS (
        SELECT *, ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN dailyNumber <= 100000 THEN 0 WHEN dailyNumber <= 200000 THEN 1 ELSE 2 END
            ORDER BY dailyNumber DESC
        ) AS rn
        FROM levels
        WHERE dailyNumber != 0 AND (dailyTime = 0 OR dailyTime > strftime('%s', 'now'))
    )
    SELECT * FROM ranked WHERE rn = 1
    ORDER BY CASE WHEN dailyNumber <= 100000 THEN 0 WHEN dailyNumber <= 200000 THEN 1 ELSE 2 END`).all();
    return `${stuff[0]?.dailyNumber ?? 0},${stuff[1]?.dailyNumber ?? 0},${stuff[2]?.dailyNumber ?? 0}`;
    // i really wanted to add stuff2 but this was faster. RIP stuff2, died too young.
}

module.exports = {
    method: 'post',
    path: '/getGJContentStatus.php', // spoofing php never gets old lmao
    middleware: [commonSecret],
    handler: (req, res) => {
        // errrrrr uhhh errrr
        res.send(`${getStuff()},49,61`); // idfk what 49 and 61 are. thats what appeared in the real one so thats whats staying. sm1 will prolly figure it out xd
    }
};