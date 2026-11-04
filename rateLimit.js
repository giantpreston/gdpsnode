const net = require('node:net');

function getClientKey(address) {
    if (net.isIPv4(address)) return `ipv4:${address}`;
    if (!net.isIPv6(address)) return 'unknown';

    let normalizedAddress = address.toLowerCase();
    const ipv4Tail = normalizedAddress.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (ipv4Tail) {
        const octets = ipv4Tail[1].split('.').map(Number);
        const firstHextet = ((octets[0] << 8) | octets[1]).toString(16);
        const secondHextet = ((octets[2] << 8) | octets[3]).toString(16);
        normalizedAddress = normalizedAddress.replace(ipv4Tail[1], `${firstHextet}:${secondHextet}`);
    }

    const halves = normalizedAddress.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const hextets = halves.length === 2
        ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
        : left;
    const subnet = [
        ...hextets.slice(0, 3),
        (Number.parseInt(hextets[3], 16) >> 8).toString(16)
    ];

    return `ipv6:${subnet.join(':')}`;
}

function createRateLimiter({
    windowMs,
    max,
    statusCode = 429,
    message = 'Too many requests, please try again later.'
}) {
    const clients = new Map();
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, client] of clients) {
            if (client.resetTime <= now) clients.delete(key);
        }
    }, Math.max(1, Math.ceil(windowMs / 2)));
    cleanupInterval.unref();

    return (req, res, next) => {
        const address = req.ip || req.socket?.remoteAddress || 'unknown';
        const key = getClientKey(address);
        const now = Date.now();
        let client = clients.get(key);

        if (!client || client.resetTime <= now) {
            client = { hits: 0, resetTime: now + windowMs };
            clients.set(key, client);
        }
        client.hits += 1;

        if (client.hits > max) return res.status(statusCode).send(message);
        next();
    };
}

module.exports = createRateLimiter;
