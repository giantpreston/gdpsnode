const assert = require('node:assert/strict');
const path = require('node:path');
const httpFramework = require('../httpFramework');
const { HookRegistry } = require('../hooks');

async function main() {
    const app = httpFramework();
    const router = httpFramework.Router();
    app.set('trust proxy', 1);

    router.get('/users/:id', (req, res) => {
        res.json({
            id: req.params.id,
            baseUrl: req.baseUrl,
            path: req.path,
            query: req.query,
            originalUrl: req.originalUrl
        });
    });
    app.use('/mounted', router);
    app.use(httpFramework.json({ limit: '1kb' }));
    app.use(httpFramework.urlencoded({ extended: true, limit: '1kb' }));
    app.post('/json', (req, res) => res.json(req.body));
    app.post('/form', (req, res) => res.json(req.body));
    app.post('/raw', httpFramework.raw({ type: 'application/octet-stream', limit: '16b' }), (req, res) => res.send(req.body));
    app.post('/async-error', async () => {
        throw new Error('handled async error');
    });
    app.get('/client-ip', (req, res) => res.send(req.ip));
    app.use('/assets', httpFramework.static(path.join(__dirname), { index: false, dotfiles: 'deny' }));
    app.use((error, req, res, next) => res.status(418).send(error.message));

    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        const mounted = await fetch(`${baseUrl}/mounted/users/a%20b?sort=name`);
        assert.equal(mounted.status, 200);
        assert.deepEqual(await mounted.json(), {
            id: 'a b',
            baseUrl: '/mounted',
            path: '/users/a%20b',
            query: { sort: 'name' },
            originalUrl: '/mounted/users/a%20b?sort=name'
        });

        const json = await fetch(`${baseUrl}/json`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: true })
        });
        assert.deepEqual(await json.json(), { enabled: true });

        const form = await fetch(`${baseUrl}/form`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'name=game&count=2'
        });
        assert.deepEqual(await form.json(), { name: 'game', count: '2' });

        const raw = await fetch(`${baseUrl}/raw`, {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream' },
            body: 'raw bytes'
        });
        assert.equal(await raw.text(), 'raw bytes');

        const file = await fetch(`${baseUrl}/assets/test-http-framework.js`);
        assert.equal(file.status, 200);
        assert.match(await file.text(), /test-http-framework/);

        const asyncError = await fetch(`${baseUrl}/async-error`, { method: 'POST' });
        assert.equal(asyncError.status, 418);
        assert.equal(await asyncError.text(), 'handled async error');

        const clientIp = await fetch(`${baseUrl}/client-ip`, {
            headers: { 'x-forwarded-for': '198.51.100.10' }
        });
        assert.equal(await clientIp.text(), '198.51.100.10');
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }

    const pluginApp = httpFramework();
    pluginApp.locals.config = { dashboard: { path: '/control' } };
    const hooks = new HookRegistry(pluginApp);
    hooks.registerPlugin({
        name: 'community-plugin',
        install(api) {
            api.use((req, res, next) => {
                if (req.path === '/plugin/middleware') res.setHeader('X-Community-Plugin', 'loaded');
                next();
            });
            api.addEndpoint({
                method: 'get',
                path: '/plugin/endpoint',
                handler: (req, res) => res.json({ plugin: 'endpoint' })
            });
            api.addDashboardRoute({
                method: 'get',
                path: '/plugin-status',
                handler: (req, res) => res.json({ plugin: 'dashboard' })
            });
            api.app.get('/plugin/direct-app-route', (req, res) => res.send('direct app route'));
        }
    });

    const pluginServer = pluginApp.listen(0);
    await new Promise(resolve => pluginServer.once('listening', resolve));
    const pluginBaseUrl = `http://127.0.0.1:${pluginServer.address().port}`;

    try {
        const pluginEndpoint = await fetch(`${pluginBaseUrl}/plugin/endpoint`);
        assert.deepEqual(await pluginEndpoint.json(), { plugin: 'endpoint' });

        const pluginMiddleware = await fetch(`${pluginBaseUrl}/plugin/middleware`);
        assert.equal(pluginMiddleware.headers.get('x-community-plugin'), 'loaded');
        assert.equal(await pluginMiddleware.text(), 'Not Found');

        const dashboardRoute = await fetch(`${pluginBaseUrl}/control/plugin-status`);
        assert.deepEqual(await dashboardRoute.json(), { plugin: 'dashboard' });

        const directAppRoute = await fetch(`${pluginBaseUrl}/plugin/direct-app-route`);
        assert.equal(await directAppRoute.text(), 'direct app route');
    } finally {
        await new Promise((resolve, reject) => pluginServer.close(error => error ? reject(error) : resolve()));
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
