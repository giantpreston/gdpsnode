const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class HookRegistry extends EventEmitter {
    constructor(app = null) {
        super();
        this.app = app;
        this.plugins = new Map();
        this.loadedPluginCount = 0;
        this.middleware = [];
        this.routes = [];
        this.dashboardRoutes = [];
    }

    setApp(app) {
        this.app = app;
        return this; 
    }

    register(name, callback, metadata = {}) {
        if (typeof callback !== 'function') throw new TypeError('Hook callback must be a function');
        const listeners = this.listeners(name);
        const alreadyRegistered = listeners.some(listener => listener === callback);
        if (!alreadyRegistered) {
            this.on(name, callback);
        }
        this.plugins.set(callback, { name, metadata, registeredAt: Date.now() });
        return callback;
    }

    unregister(name, callback) {
        this.removeListener(name, callback);
        this.plugins.delete(callback);
    }

    trigger(name, payload = {}, context = {}) {
        const listeners = this.listeners(name);
        if (!listeners.length) return payload;

        let nextPayload = payload;
        for (const listener of listeners) {
            try {
                const result = listener(nextPayload, context, this);
                if (result !== undefined) nextPayload = result;
                if (result === false) break;
            } catch (error) {
                console.error(`\x1b[1;31m✗ Hook failed: ${name}\x1b[0m`, error);
            }
        }
        return nextPayload;
    }

    async triggerAsync(name, payload = {}, context = {}) {
        const listeners = this.listeners(name);
        if (!listeners.length) return payload;

        let nextPayload = payload;
        for (const listener of listeners) {
            try {
                const result = await listener(nextPayload, context, this);
                if (result !== undefined) nextPayload = result;
                if (result === false) break;
            } catch (error) {
                console.error(`\x1b[1;31m✗ Hook failed: ${name}\x1b[0m`, error);
            }
        }
        return nextPayload;
    }

    use(middleware, metadata = {}) {
        if (typeof middleware !== 'function') throw new TypeError('Plugin middleware must be a function');
        this.middleware.push({ middleware, metadata, registeredAt: Date.now() });
        if (this.app) this.app.use(middleware);
        return middleware;
    }

    addEndpoint(definition) {
        if (!definition || typeof definition !== 'object' || !definition.path || typeof definition.handler !== 'function') {
            throw new TypeError('Plugin endpoint must include path and handler');
        }

        const route = {
            method: (definition.method || 'get').toLowerCase(),
            path: definition.path,
            middleware: definition.middleware || [],
            handler: definition.handler,
            plugin: definition.plugin || 'unknown',
            metadata: definition.metadata || {},
            registeredAt: Date.now()
        };

        this.routes.push(route);
        if (this.app) {
            this.app[route.method](route.path, ...route.middleware, route.handler);
        }
        return route;
    }

    addDashboardRoute(definition) {
        if (!definition || typeof definition !== 'object' || !definition.path || typeof definition.handler !== 'function') {
            throw new TypeError('Dashboard route must include path and handler');
        }

        const route = {
            method: (definition.method || 'get').toLowerCase(),
            path: definition.path,
            middleware: definition.middleware || [],
            handler: definition.handler,
            plugin: definition.plugin || 'unknown',
            metadata: definition.metadata || {},
            registeredAt: Date.now()
        };

        this.dashboardRoutes.push(route);
        if (this.app) {
            const dashboardBase = (this.app.locals && this.app.locals.config && this.app.locals.config.dashboard)
                ? this.app.locals.config.dashboard.path
                : '/dashboard';
            this.app[route.method](`${dashboardBase}${route.path}`, ...route.middleware, route.handler);
        }
        return route;
    }

    registerPlugin(plugin, context = {}) {
        if (!plugin) return null;

        let normalized = plugin;
        if (typeof plugin === 'function') {
            normalized = { name: plugin.name || 'anonymous-plugin', install: plugin };
        }

        if (typeof normalized !== 'object') return null;

        const install = normalized.install || normalized.register || normalized.setup || normalized.default;
        if (typeof install !== 'function') return null;

        const api = {
            app: this.app,
            db: context.db || require('./database'),
            config: context.config || require('./config'),
            utils: context.utils || require('./utils'),
            hooks: this,
            registerHook: this.register.bind(this),
            on: this.on.bind(this),
            once: this.once.bind(this),
            trigger: this.trigger.bind(this),
            triggerAsync: this.triggerAsync.bind(this),
            use: this.use.bind(this),
            addEndpoint: this.addEndpoint.bind(this),
            addDashboardRoute: this.addDashboardRoute.bind(this),
            getApp: () => this.app,
            getPlugin: name => this.plugins.get(name) || null,
            listPlugins: () => [...this.plugins.values()]
        };

        const result = install(api, context, this);
        const pluginMeta = {
            name: normalized.name || normalized.id || `plugin-${Date.now()}`,
            metadata: normalized.metadata || {},
            registeredAt: Date.now(),
            plugin: normalized
        };

        const completeRegistration = resolvedResult => {
            pluginMeta.result = resolvedResult;
            this.plugins.set(pluginMeta.name, pluginMeta);
            return resolvedResult ?? normalized;
        };

        if (result && typeof result.then === 'function') {
            return Promise.resolve(result).then(completeRegistration);
        }
        return completeRegistration(result);
    }
}

const hooks = new HookRegistry();

async function loadPlugins(directory = path.join(__dirname, 'plugins'), app = null) {
    if (app) hooks.setApp(app);

    const pluginDir = path.resolve(directory);
    let loadedPluginCount = 0;

    try {
        const entries = await fs.promises.readdir(pluginDir, { withFileTypes: true });
        const candidates = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const nested = path.join(pluginDir, entry.name, 'index.js');
                try {
                    await fs.promises.access(nested);
                    candidates.push(nested);
                } catch {}
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                candidates.push(path.join(pluginDir, entry.name));
            }
        }

        for (const file of candidates) {
            try {
                const plugin = require(file);
                const registration = hooks.registerPlugin(plugin, {
                    app,
                    config: require('./config'),
                    db: require('./database'),
                    utils: require('./utils')
                });
                if (registration === null) {
                    throw new TypeError('Plugin must export a function or an object with an install, register, setup, or default function');
                }
                await registration;
                loadedPluginCount++;
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                console.warn(`\x1b[1;33m⚠ Failed to load plugin: ${file} (${reason})\x1b[0m`);
            }
        }
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            const reason = error instanceof Error ? error.message : String(error);
            console.warn(`\x1b[1;33m⚠ Failed to load plugin directory: ${reason}\x1b[0m`);
        }
    }

    hooks.loadedPluginCount = loadedPluginCount;
    return hooks;
}

module.exports = {
    HookRegistry,
    hooks,
    registerPlugin: hooks.registerPlugin.bind(hooks),
    registerHook: hooks.register.bind(hooks),
    trigger: hooks.trigger.bind(hooks),
    triggerAsync: hooks.triggerAsync.bind(hooks),
    use: hooks.use.bind(hooks),
    addEndpoint: hooks.addEndpoint.bind(hooks),
    addDashboardRoute: hooks.addDashboardRoute.bind(hooks),
    loadPlugins,
    listRegisteredPlugins: () => [...hooks.plugins.values()]
};
