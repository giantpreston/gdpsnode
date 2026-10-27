const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const databasePath = path.join(os.tmpdir(), `gdpsnode-lazy-adapter-${process.pid}.sqlite`);
process.env.GDPS_DATABASE_PATH = databasePath;

const db = require('../database');
const { HookRegistry } = require('../hooks');
assert.equal(fs.existsSync(databasePath), false);

const calls = [];
let closed = false;
const adapter = {
    prepare(sql) {
        return {
            get(...params) {
                calls.push({ method: 'get', sql, params });
                return { value: 'adapter result' };
            },
            run(...params) {
                calls.push({ method: 'run', sql, params });
                return { changes: 1, lastInsertRowid: 1 };
            },
            all() {
                return [];
            },
            iterate() {
                return [][Symbol.iterator]();
            }
        };
    },
    exec(sql) {
        calls.push({ method: 'exec', sql });
    },
    transaction(callback) {
        return (...args) => callback(...args);
    },
    close() {
        closed = true;
    }
};
new HookRegistry().registerPlugin({
    install(api) {
        api.db.setAdapter(adapter);
    }
}, { db });

assert.equal(db.prepare('SELECT adapter').get().value, 'adapter result');
db.exec('adapter exec');
db.transaction(() => db.prepare('UPDATE adapter').run())();
assert.deepEqual(calls.map(call => call.method), ['get', 'exec', 'run']);
assert.equal(fs.existsSync(databasePath), false);

db.close();
assert.equal(closed, true);
assert.equal(fs.existsSync(databasePath), false);
console.log('Lazy database adapter checks passed.');
