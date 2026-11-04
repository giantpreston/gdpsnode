const assert = require('node:assert/strict');
const createRateLimiter = require('../rateLimit');

function request(limiter, ip) {
    let statusCode;
    let body;
    let allowed = false;
    const response = {
        status(code) {
            statusCode = code;
            return this;
        },
        send(value) {
            body = value;
            return this;
        }
    };

    limiter({ ip }, response, () => {
        allowed = true;
    });

    return { allowed, statusCode, body };
}

async function main() {
    const limiter = createRateLimiter({ windowMs: 40, max: 2, message: '-1' });
    assert.deepEqual(request(limiter, '192.0.2.1'), { allowed: true, statusCode: undefined, body: undefined });
    assert.deepEqual(request(limiter, '192.0.2.1'), { allowed: true, statusCode: undefined, body: undefined });
    assert.deepEqual(request(limiter, '192.0.2.1'), { allowed: false, statusCode: 429, body: '-1' });
    assert.equal(request(limiter, '192.0.2.2').allowed, true);

    const ipv6Limiter = createRateLimiter({ windowMs: 40, max: 1 });
    assert.equal(request(ipv6Limiter, '2001:db8:abcd:1200::1').allowed, true);
    assert.equal(request(ipv6Limiter, '2001:db8:abcd:12ff::1').allowed, false);

    const defaultMessageLimiter = createRateLimiter({ windowMs: 40, max: 0 });
    assert.deepEqual(request(defaultMessageLimiter, '192.0.2.3'), {
        allowed: false,
        statusCode: 429,
        body: 'Too many requests, please try again later.'
    });

    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(request(limiter, '192.0.2.1').allowed, true);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
