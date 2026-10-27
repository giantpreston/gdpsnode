const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const databasePath = path.join(os.tmpdir(), `gdpsnode-database-hooks-${process.pid}.sqlite`);
process.env.GDPS_DATABASE_PATH = databasePath;

let db;
try {
    db = require('../database');
    const { hooks } = require('../hooks');

    hooks.register('database:prepare', query => {
        if (query.sql === 'SELECT 1 AS value') {
            return { ...query, sql: 'SELECT 2 AS value' };
        }
        if (query.sql === 'SELECT value FROM mysql_only' || query.sql === 'SELECT value FROM mysql_unhandled_only') {
            query.cancel();
        }
        return query;
    });

    hooks.register('database:query', query => {
        if (query.sql === 'SELECT ? AS value' && query.method === 'get') {
            return { ...query, params: ['updated by plugin'] };
        }
        if (query.sql === 'SELECT 99 AS value' && query.method === 'get') {
            return { ...query, handled: true, result: { value: 'provided by plugin' } };
        }
        if (query.sql === 'SELECT 98 AS value' && query.method === 'get') {
            query.cancel({ value: 'cancelled by plugin' });
        }
        if (query.sql === 'SELECT value FROM mysql_only' && query.method === 'get') {
            query.cancel({ value: 'redirected to plugin database' });
        }
        if (query.method === 'exec' && query.sql === 'SELECT plugin_exec()') {
            return { ...query, handled: true, result: 'exec provided by plugin' };
        }
        if (query.method === 'pragma' && query.sql === 'user_version') {
            return { ...query, handled: true, result: 123 };
        }
    });

    assert.equal(db.prepare('SELECT 1 AS value').get().value, 2);
    assert.equal(db.prepare('SELECT ? AS value').get('original').value, 'updated by plugin');
    assert.equal(db.prepare('SELECT 99 AS value').get().value, 'provided by plugin');
    assert.equal(db.prepare('SELECT 98 AS value').get().value, 'cancelled by plugin');
    assert.equal(db.prepare('SELECT value FROM mysql_only').get().value, 'redirected to plugin database');
    assert.throws(
        () => db.prepare('SELECT value FROM mysql_unhandled_only').get(),
        /was cancelled before preparation and was not handled by a plugin/
    );
    assert.equal(db.prepare('SELECT 3 AS value').get().value, 3);
    assert.equal(db.exec('SELECT plugin_exec()'), 'exec provided by plugin');
    assert.equal(db.pragma('user_version'), 123);

    const adapterQueries = [];
    const adapter = {
        open: true,
        prepare(sql) {
            return {
                run(...params) {
                    adapterQueries.push({ sql, method: 'run', params });
                    return { changes: 1, lastInsertRowid: 42 };
                },
                get(...params) {
                    adapterQueries.push({ sql, method: 'get', params });
                    return { value: 'routed through adapter' };
                },
                all(...params) {
                    adapterQueries.push({ sql, method: 'all', params });
                    return [];
                },
                iterate(...params) {
                    adapterQueries.push({ sql, method: 'iterate', params });
                    return [][Symbol.iterator]();
                }
            };
        },
        exec(sql) {
            adapterQueries.push({ sql, method: 'exec' });
        },
        transaction(callback) {
            return (...params) => callback(...params);
        },
        close() {}
    };

    assert.equal(db.setAdapter(adapter), adapter);
    assert.equal(db.prepare('SELECT adapter_value').get().value, 'routed through adapter');
    assert.equal(db.prepare('INSERT adapter_value').run().lastInsertRowid, 42);
    db.exec('adapter_exec');
    db.transaction(() => db.prepare('UPDATE adapter_value').run())();
    assert.deepEqual(adapterQueries.map(query => query.method), ['get', 'run', 'exec', 'run']);
    assert.throws(() => db.pragma('journal_mode'), /does not support pragma/);
    assert.equal(db.getAdapter(), adapter);
    db.setAdapter(null);
    assert.equal(db.getAdapter(), null);
    assert.equal(
        db.prepare('EXPLAIN QUERY PLAN SELECT * FROM profiles WHERE LOWER(userName) = ?').all('name')
            .some(row => row.detail.includes('idx_profiles_lower_userName')),
        true
    );
    assert.equal(
        db.prepare('EXPLAIN QUERY PLAN SELECT * FROM accounts WHERE LOWER(userName) = ?').all('name')
            .some(row => row.detail.includes('idx_accounts_lower_userName')),
        true
    );

    db.close();
    console.log('Database query hooks passed.');
} finally {
    if (db && db.open) db.close();
    for (const suffix of ['', '-shm', '-wal']) {
        fs.rmSync(`${databasePath}${suffix}`, { force: true });
    }
}
