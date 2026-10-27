# Hooks and plugin development

GDPSnode includes a lightweight plugin framework so you can extend the server without modifying the core code directly.

## Plugin directory

Plugins are discovered from the `plugins/` folder automatically. The system also supports nested plugin folders that expose an `index.js` file.

Valid locations:

```text
plugins/my-plugin.js
plugins/my-plugin/index.js
```

## Basic plugin structure

```js
module.exports = {
  name: 'example-plugin',
  metadata: {
    version: '1.0.0',
    description: 'Example GDPSnode plugin.'
  },
  install(api) {
    api.registerHook('server:ready', ({ app, config }) => {
      console.log('Plugin loaded on port', config.port);
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

## Available API

When a plugin installs, it receives an `api` object with useful helpers:

- `registerHook(name, callback)`
- `trigger(name, payload, context)`
- `triggerAsync(name, payload, context)`
- `use(middleware)`
- `addEndpoint({ method, path, handler, middleware })`
- `addDashboardRoute({ method, path, handler, middleware })`
- `app`
- `db`
- `config`
- `utils`
- `hooks`

## Lifecycle hooks

Hook names are just strings, and they are triggered through the central hook registry. Common ones include:

- `server:before_start`
- `server:ready`
- `server:listening`
- `request:before`
- `request:after`
- `account:created`
- `account:login`
- `level:uploaded`
- `comment:submitted`

Example:

```js
api.registerHook('account:created', (payload) => {
  console.log('New account created:', payload.accountID);
  return payload;
});
```

## Overriding database queries

Plugins can intercept synchronous database operations through two hooks:

- `database:prepare` runs before a statement is prepared. Its payload contains `sql` and `cancel()`. Return the payload with a modified `sql` to rewrite the statement, or call `cancel()` to prevent the active database backend from preparing it.
- `database:query` runs when a prepared statement's `run`, `get`, `all`, or `iterate` method is called, and for `db.exec()` and `db.pragma()`. Its payload contains `sql`, `method`, `params`, `handled`, `cancelled`, `result`, `cancel(result)`, and `execute`.

Leave `handled` and `cancelled` false to let the active database backend execute the operation. Plugins may update `params` before execution, or set `handled` to `true` and supply `result` to replace the database operation entirely. Calling `cancel(result)` prevents backend execution and optionally supplies its result. If preparation was cancelled, a query hook must handle or cancel the later statement execution; otherwise an error is thrown instead of falling back to the default backend. `execute(...params)` runs the original database operation and uses the payload's current parameters when called without arguments.

This interception allows a plugin to route SQL to another database driver, provided it can synchronously return values with the same shapes expected by the caller. The current core database API is synchronous, so an asynchronous driver such as most MySQL clients cannot be substituted transparently without converting the relevant core call paths to async.

For plugins that should own all application queries, install a database adapter instead of registering a per-query callback:

```js
api.db.setAdapter({
  prepare(sql) {
    const translatedSql = translateSql(sql);
    return {
      run(...params) {
        const result = runSync(translatedSql, params);
        return { changes: result.affectedRows, lastInsertRowid: result.insertId };
      },
      get(...params) {
        return getSync(translatedSql, params);
      },
      all(...params) {
        return allSync(translatedSql, params);
      },
      iterate(...params) {
        return iterateSync(translatedSql, params);
      }
    };
  },
  exec(sql) {
    return execSync(translateSql(sql));
  },
  transaction(callback) {
    return (...args) => transactionSync(() => callback(...args));
  },
  close() {
    closeConnection();
  }
});
```

`setAdapter()` routes statements prepared afterward, plus `exec()` and `transaction()` calls, through the adapter. Adapters must preserve the synchronous API: `get()` returns one row or `undefined`, `all()` returns an array, `run()` returns `changes` and `lastInsertRowid`, `iterate()` returns a synchronous iterator, and `transaction(callback)` returns a callable transaction. `pragma()` is only available when the adapter implements it or a query hook handles it. Calling `api.db.setAdapter(null)` restores SQLite. SQLite initialization is lazy: if a plugin selects an adapter during `install()`, the SQLite database is not opened and its schema migrations do not run. In that case the adapter/plugin must make the application's schema available in its target database. SQL rewriting is adapter-specific because core statements use SQLite syntax such as `INSERT OR REPLACE` and `INSERT OR IGNORE`.

The adapter example uses placeholder helpers; real adapters must map them to the selected driver's synchronous API. This is not a transparent adapter for promise-based MySQL clients.

```js
api.registerHook('database:prepare', (query) => {
  if (query.sql === 'SELECT value FROM settings WHERE id = ?') {
    return {
      ...query,
      sql: 'SELECT value FROM plugin_settings WHERE id = ?'
    };
  }
  return query;
});

api.registerHook('database:query', (query) => {
  if (query.sql === 'SELECT value FROM remote_settings WHERE id = ?' && query.method === 'get') {
    query.cancel({ value: 'provided by plugin' });
  }
});
```

## Adding middleware

```js
api.use((req, res, next) => {
  if (req.path === '/debug') {
    console.log('Debug middleware ran');
  }
  next();
});
```

Middleware is mounted through the main Express app, so it can inspect or modify requests before they reach the rest of the server.

## Adding custom endpoints

```js
api.addEndpoint({
  method: 'get',
  path: '/plugins/custom-status',
  handler: (req, res) => {
    res.json({ ok: true, plugin: 'custom-status' });
  }
});
```

This lets plugin authors expose custom gameplay or admin APIs without altering the route registry in core files.

## Adding dashboard routes

```js
api.addDashboardRoute({
  method: 'get',
  path: '/plugin-status',
  handler: (req, res) => {
    res.json({ plugin: 'example-plugin', loaded: true });
  }
});
```

The dashboard base path is automatically applied so that the route resolves under the configured dashboard route.

## Best practices

- Keep plugins small and focused on one job.
- Avoid mutating core files when a hook or route can do the job.
- Return payloads consistently from hooks when you want them to flow through other listeners.
- Put plugin metadata in the module so it is easy to inspect in logs and dashboards.
- Handle errors gracefully: do not crash the whole server because of one plugin bug.

## Example plugin directory

The repository includes a basic example plugin at `plugins/example-plugin.js`.

## Related docs

- [First steps and setup](SETUP.md)
- [GDPS Switcher setup](GDPS_SWITCHER.md)
- [Contributing to the project](CONTRIBUTING.md)
