const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const querystring = require('node:querystring');

const MIME_TYPES = {
    '.css': 'text/css',
    '.dat': 'text/plain',
    '.html': 'text/html',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.mp3': 'audio/mpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.webp': 'image/webp'
};

function parseLimit(value) {
    if (typeof value === 'number') return value;
    const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
    if (!match) throw new TypeError(`Invalid body size limit: ${value}`);
    const units = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
    return Math.floor(Number(match[1]) * (units[match[2]?.toLowerCase()] || 1));
}

function parseContentType(value = '') {
    return value.split(';', 1)[0].trim().toLowerCase();
}

function matchesType(contentType, expected) {
    if (typeof expected === 'function') return expected;
    if (Array.isArray(expected)) return req => expected.some(type => matchesType(contentType, type)(req));
    const type = String(expected || '').toLowerCase();
    return req => {
        const actual = parseContentType(req.headers['content-type']);
        if (type.startsWith('.')) return actual.endsWith(type);
        if (type.endsWith('/*')) return actual.startsWith(type.slice(0, -1));
        return actual === type;
    };
}

function requestHasBody(req) {
    return req.headers['transfer-encoding'] !== undefined ||
        (Number.parseInt(req.headers['content-length'], 10) || 0) > 0;
}

async function readBody(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) {
            req.resume();
            const error = new Error('Request entity too large');
            error.status = 413;
            error.type = 'entity.too.large';
            error.limit = limit;
            throw error;
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
}

function bodyParser(kind, options = {}) {
    const limit = parseLimit(options.limit ?? '100kb');
    const type = matchesType(null, options.type ?? (kind === 'json' ? 'application/json' : kind === 'urlencoded' ? 'application/x-www-form-urlencoded' : '*/*'));

    return async (req, res, next) => {
        if (req.body !== undefined || !requestHasBody(req) || !type(req)) return next();
        try {
            const body = await readBody(req, limit);
            if (kind === 'raw') {
                req.body = body;
            } else if (kind === 'json') {
                try {
                    req.body = body.length ? JSON.parse(body.toString('utf8')) : {};
                } catch (cause) {
                    const error = new SyntaxError('Invalid JSON request body', { cause });
                    error.status = 400;
                    error.type = 'entity.parse.failed';
                    throw error;
                }
            } else {
                const params = new URLSearchParams(body.toString('utf8'));
                if ([...params.keys()].length > (options.parameterLimit ?? 1000)) {
                    const error = new Error('Too many parameters');
                    error.status = 413;
                    error.type = 'parameters.too.many';
                    throw error;
                }
                req.body = querystring.parse(params.toString(), '&', '=', {
                    maxKeys: options.parameterLimit ?? 1000
                });
            }
            return next();
        } catch (error) {
            return next(error);
        }
    };
}

function makeRequestHelpers(req, trustProxyHops) {
    req.originalUrl = req.url || '/';
    req.baseUrl = '';
    req.params = {};

    Object.defineProperties(req, {
        path: {
            configurable: true,
            get() {
                return new URL(this.url || '/', 'http://localhost').pathname;
            }
        },
        query: {
            configurable: true,
            get() {
                const search = new URL(this.url || '/', 'http://localhost').search.slice(1);
                return querystring.parse(search);
            }
        },
        ip: {
            configurable: true,
            get() {
                const remoteAddress = this.socket?.remoteAddress || '';
                if (!trustProxyHops || !net.isIP(remoteAddress)) return remoteAddress;
                const forwarded = String(this.headers['x-forwarded-for'] || '').split(',').map(value => value.trim());
                if (!forwarded.length || forwarded.some(address => !net.isIP(address))) return remoteAddress;
                const chain = [...forwarded.reverse(), remoteAddress];
                return chain[Math.max(0, chain.length - trustProxyHops - 1)];
            }
        }
    });

    req.get = name => req.headers[String(name).toLowerCase()];
    req.is = expected => {
        const actual = parseContentType(req.headers['content-type']);
        const types = Array.isArray(expected) ? expected : [expected];
        return types.some(value => {
            const type = String(value || '').toLowerCase();
            if (type.endsWith('/*')) return actual.startsWith(type.slice(0, -1));
            if (type.startsWith('.')) return actual.endsWith(type);
            return actual === type || actual.split('/')[1]?.split('+')[0] === type;
        }) || false;
    };
}

function requestPath(url) {
    return new URL(url || '/', 'http://localhost').pathname || '/';
}

function matchPrefix(url, prefix) {
    if (prefix === '/' || prefix === '') return '';
    const pathname = requestPath(url);
    const normalized = prefix.length > 1 ? prefix.replace(/\/+$/, '') : prefix;
    if (pathname !== normalized && !pathname.startsWith(`${normalized}/`)) return null;
    return normalized;
}

function compileRoute(routePath) {
    const names = [];
    const segments = routePath.split('/').map(segment => {
        if (segment.startsWith(':')) {
            names.push(segment.slice(1));
            return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    const regex = new RegExp(`^${segments.join('/')}/?$`, 'i');
    return { names, regex };
}

function matchRoute(url, routePath) {
    const { names, regex } = compileRoute(routePath);
    const match = regex.exec(requestPath(url));
    if (!match) return null;
    try {
        return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
    } catch {
        const error = new URIError('Failed to decode route parameter');
        error.status = 400;
        return { error };
    }
}

function contentTypeFor(filePath) {
    return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function sendFile(res, filePath, options = {}, next = () => {}) {
    fsPromises.stat(filePath).then(stat => {
        if (!stat.isFile()) {
            const error = new Error('Not a file');
            error.status = 404;
            return next(error);
        }

        res.statusCode = options.statusCode ?? res.statusCode;
        if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', `${contentTypeFor(filePath)}${contentTypeFor(filePath).startsWith('text/') ? '; charset=utf-8' : ''}`);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Last-Modified', stat.mtime.toUTCString());
        if (reqMethodIsHead(res)) return res.end();

        const stream = fs.createReadStream(filePath);
        stream.on('error', error => {
            if (res.headersSent) res.destroy(error);
            else next(error);
        });
        stream.pipe(res);
    }).catch(error => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') error.status = 404;
        next(error);
    });
}

function reqMethodIsHead(res) {
    return res.req?.method === 'HEAD';
}

function staticFiles(root, options = {}) {
    const absoluteRoot = path.resolve(root);
    return (req, res, next) => {
        let relativePath;
        try {
            relativePath = decodeURIComponent(requestPath(req.url));
        } catch {
            return next();
        }
        if (options.dotfiles === 'deny' && relativePath.split('/').some(part => part.startsWith('.') && part !== '.' && part !== '..')) {
            return next();
        }

        const filePath = path.resolve(absoluteRoot, `.${relativePath}`);
        if (filePath !== absoluteRoot && !filePath.startsWith(`${absoluteRoot}${path.sep}`)) return next();

        fsPromises.stat(filePath).then(stat => {
            const target = stat.isDirectory() && options.index !== false
                ? path.join(filePath, options.index || 'index.html')
                : filePath;
            sendFile(res, target, {}, error => {
                if (!options.fallthrough) return next(error);
                next();
            });
        }).catch(error => {
            if (!options.fallthrough) {
                if (error.code === 'ENOENT' || error.code === 'ENOTDIR') error.status = 404;
                return next(error);
            }
            next();
        });
    };
}

function sendResponse(res, value) {
    if (res.writableEnded) return res;
    if (value === undefined || value === null) value = '';
    if (Buffer.isBuffer(value) || typeof value === 'string') {
        const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
        if (!res.hasHeader('Content-Type')) {
            res.setHeader('Content-Type', Buffer.isBuffer(value) ? 'application/octet-stream' : 'text/html; charset=utf-8');
        }
        if (res.statusCode === 204 || res.statusCode === 304) return res.end();
        res.setHeader('Content-Length', body.length);
        return res.end(body);
    }
    return res.json(value);
}

function enhanceResponse(res) {
    res.status = code => {
        res.statusCode = code;
        return res;
    };
    res.type = value => {
        const type = String(value).startsWith('.') ? contentTypeFor(`file${value}`) : value;
        res.setHeader('Content-Type', type.includes('/') ? type : `${type}; charset=utf-8`);
        return res;
    };
    res.send = value => sendResponse(res, value);
    res.json = value => {
        if (res.writableEnded) return res;
        const body = Buffer.from(JSON.stringify(value));
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Length', body.length);
        return res.end(body);
    };
    res.redirect = (statusOrUrl, maybeUrl) => {
        const status = maybeUrl === undefined ? 302 : statusOrUrl;
        const url = maybeUrl === undefined ? statusOrUrl : maybeUrl;
        res.statusCode = status;
        res.setHeader('Location', url);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(`<p>Found. Redirecting to <a href="${String(url).replaceAll('"', '&quot;')}">${String(url).replaceAll('&', '&amp;')}</a></p>`);
    };
    res.sendFile = (filePath, options, callback) => {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        sendFile(res, filePath, options || {}, error => {
            if (callback) callback(error);
            else if (error) res.req._next(error);
        });
        return res;
    };
}

function flattenHandlers(handlers) {
    return handlers.flat(Infinity).filter(handler => typeof handler === 'function');
}

function createRouter() {
    const stack = [];
    const router = (req, res, next) => router.handle(req, res, next);
    router._stack = stack;
    router._isRouter = true;
    router.handle = (req, res, done) => runStack(stack, req, res, done);
    router.use = (routePath, ...handlers) => {
        if (typeof routePath !== 'string') {
            handlers.unshift(routePath);
            routePath = '/';
        }
        for (const handler of flattenHandlers(handlers)) stack.push({ type: 'middleware', path: routePath, handler });
        return router;
    };

    for (const method of ['get', 'post', 'put', 'delete', 'patch', 'all', 'options', 'head']) {
        router[method] = (routePath, ...handlers) => {
            stack.push({ type: 'route', method: method.toUpperCase(), path: routePath, handlers: flattenHandlers(handlers) });
            return router;
        };
    }

    return router;
}

function invokeHandler(handler, req, res, next, error) {
    let called = false;
    const advance = nextError => {
        if (called) return;
        called = true;
        next(nextError);
    };
    req._next = advance;
    try {
        const result = error
            ? handler(error, req, res, advance)
            : handler(req, res, advance);
        if (result && typeof result.then === 'function') result.catch(advance);
    } catch (caught) {
        advance(caught);
    }
}

function runHandlerChain(handlers, req, res, next, error = null, index = 0) {
    if (index >= handlers.length) return next(error);
    const handler = handlers[index];
    if (error ? handler.length !== 4 : handler.length === 4) {
        return runHandlerChain(handlers, req, res, next, error, index + 1);
    }
    invokeHandler(handler, req, res, nextError => {
        if (nextError === 'route' && !error) return next();
        runHandlerChain(handlers, req, res, next, nextError ?? null, index + 1);
    }, error);
}

function runMountedRouter(router, req, res, next, prefix) {
    const previousUrl = req.url;
    const previousBaseUrl = req.baseUrl;
    const previousParams = req.params;
    const url = new URL(req.url || '/', 'http://localhost');
    const currentPath = url.pathname;
    url.pathname = currentPath.slice(prefix.length) || '/';
    req.url = `${url.pathname}${url.search}`;
    req.baseUrl = `${previousBaseUrl}${prefix}`;
    router.handle(req, res, error => {
        req.url = previousUrl;
        req.baseUrl = previousBaseUrl;
        req.params = previousParams;
        next(error);
    });
}

function runMountedMiddleware(handler, req, res, next, prefix, error) {
    if (!prefix) return invokeHandler(handler, req, res, next, error);

    const previousUrl = req.url;
    const previousBaseUrl = req.baseUrl;
    const url = new URL(req.url || '/', 'http://localhost');
    url.pathname = url.pathname.slice(prefix.length) || '/';
    req.url = `${url.pathname}${url.search}`;
    req.baseUrl = `${previousBaseUrl}${prefix}`;
    invokeHandler(handler, req, res, nextError => {
        req.url = previousUrl;
        req.baseUrl = previousBaseUrl;
        next(nextError);
    }, error);
}

function runStack(stack, req, res, done, currentError = null, index = 0) {
    while (index < stack.length) {
        const entry = stack[index];
        const nextIndex = index + 1;
        if (currentError ? entry.handler?.length !== 4 && !(entry.handlers || []).some(handler => handler.length === 4) :
            entry.type === 'middleware' && entry.handler.length === 4) {
            index += 1;
            continue;
        }

        if (entry.type === 'route') {
            const methodMatches = entry.method === 'ALL' || entry.method === req.method ||
                (req.method === 'HEAD' && entry.method === 'GET');
            if (!methodMatches) {
                index += 1;
                continue;
            }
            const params = matchRoute(req.url, entry.path);
            if (params === null) {
                index += 1;
                continue;
            }
            if (params.error) {
                currentError = params.error;
                index += 1;
                continue;
            }
            const previousParams = req.params;
            req.params = params;
            return runHandlerChain(entry.handlers, req, res, error => {
                req.params = previousParams;
                runStack(stack, req, res, done, error, nextIndex);
            }, currentError);
        }

        const prefix = matchPrefix(req.url, entry.path);
        if (prefix === null) {
            index += 1;
            continue;
        }
        if (entry.handler._isRouter) {
            return runMountedRouter(entry.handler, req, res, error => {
                runStack(stack, req, res, done, error, nextIndex);
            }, prefix);
        }
        return runMountedMiddleware(entry.handler, req, res, error => {
            runStack(stack, req, res, done, error, nextIndex);
        }, prefix, currentError);
    }
    done(currentError);
}

function createApplication() {
    const app = createRouter();
    app.locals = {};
    app._settings = {};
    app.disable = name => {
        app._settings[name] = false;
        return app;
    };
    app.set = (name, value) => {
        app._settings[name] = value;
        return app;
    };
    app.listen = (port, callback) => {
        const server = http.createServer((req, res) => {
            const originalUrl = req.url || '/';
            makeRequestHelpers(req, Number(app._settings['trust proxy']) || 0);
            enhanceResponse(res);
            req.originalUrl = originalUrl;
            req.next = error => {
                if (error) {
                    if (!res.headersSent) {
                        res.statusCode = error.status || 500;
                        res.end();
                    } else {
                        res.destroy(error);
                    }
                }
            };
            app.handle(req, res, error => {
                if (error && !res.headersSent) {
                    res.statusCode = error.status || 500;
                    res.end();
                } else if (!res.writableEnded) {
                    res.statusCode = 404;
                    res.end('Not Found');
                }
            });
        });
        return server.listen(port, callback);
    };
    return app;
}

createApplication.Router = createRouter;
createApplication.raw = options => bodyParser('raw', options);
createApplication.urlencoded = options => bodyParser('urlencoded', options);
createApplication.json = options => bodyParser('json', options);
createApplication.static = staticFiles;

module.exports = createApplication;
