const commonSecret = (req, res, next) => {
    if (!req.body?.secret) return res.send("-1");
    if (req.body?.secret !== "Wmfd2893gb7") return res.send("-1"); // haha idiot imagine forgetting Wmfd2893gb7 haha what a lsoer
    next();
};
const llMid = (req, res, next) => {
    if (!req.body?.secret) return res.send("-100");
    if (req.body?.secret !== "Wmfd2893gb7") return res.send("-100");
    next();
}
const accountSecret = (req, res, next) => {
    if (!req.body?.secret) return res.send("-1");
    if (req.body?.secret !== "Wmfv3899gc9") return res.send("-1");
    next();
};
const levelSecret = (req, res, next) => {
    if (!req.body?.secret) return res.send("-1");
    if (req.body?.secret !== "Wmfv2898gc9") return res.send("-1");
    next();
};
const modSecret = (req, res, next) => {
    if (!req.body?.secret) return res.send("-1");
    if (req.body?.secret !== "Wmfp3879gc3") return res.send("-1");
    next();
};

module.exports = { commonSecret, llMid, accountSecret, levelSecret, modSecret };