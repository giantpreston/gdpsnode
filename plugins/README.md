# GDPSnode plugin system

GDPSnode ships with a lightweight but flexible plugin framework designed for server customization without patching core files.

## What plugins can do

A plugin can:

- listen to lifecycle hooks like `server:before_start`, `server:ready`, or `account:created`
- register custom middleware
- mount custom API endpoints or dashboard routes
- hook into existing requests and mutate context before/after handlers run
- access the database, config, and shared utilities

## Minimal plugin

```js
module.exports = {
  name: 'example-plugin',
  metadata: { version: '1.0.0' },
  install(api) {
    api.registerHook('server:ready', ({ app, config }) => {
      console.log('GDPSnode is ready and plugin is active');
      return { app, config };
    });

    api.addEndpoint({
      method: 'get',
      path: '/plugin/ping',
      handler: (req, res) => {
        res.json({ ok: true, message: 'pong' });
      }
    });
  }
};
```

## Useful hook names

Common names include:

- `server:before_start`
- `server:ready`
- `server:listening`
- `request:before`
- `request:after`
- `account:created`
- `account:login`
- `level:uploaded`
- `level:deleted`
- `comment:submitted`

## Route and middleware APIs

Plugins receive an API object with:

- `registerHook(...)`
- `trigger(...)`
- `triggerAsync(...)`
- `use(...)`
- `addEndpoint(...)`
- `addDashboardRoute(...)`
- `app`
- `db`
- `config`
- `utils`
- `hooks`

## Express compatibility

The core server no longer uses Express. `api.app` is the core server app, not an Express application, and plugins must not depend on Express being installed at the project root or use Express-specific methods on `api.app`.

If a plugin needs Express internally, declare and install Express as that plugin's own dependency (for example, in `plugins/my-plugin/package.json`, followed by `npm install --prefix plugins/my-plugin`). The plugin can then `require('express')` from its own files. Its Express app or router is separate and cannot be mounted through `api.use()` on the core server. Use `api.addEndpoint()`, `api.addDashboardRoute()`, or core-compatible middleware for routes served by GDPSnode. Any independent Express server must manage its own lifecycle and port.

## Plugin directory

Any file in the `plugins/` folder or in a nested `plugins/<name>/index.js` file will be auto-loaded on server start.

This makes it easy to build things like:

- custom rewards or achievements
- leaderboard dashboards
- anti-cheat filters
- custom social features
- external integrations with Discord, webhooks, or analytics
- gameplay mods that sit on top of the existing server logic
