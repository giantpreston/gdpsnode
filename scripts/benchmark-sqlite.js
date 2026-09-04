const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const Database = require('better-sqlite3');
const { performance } = require('perf_hooks');

function option(name, fallback) {
    const argument = process.argv.find(value => value.startsWith(`--${name}=`));
    if (!argument) return fallback;
    const value = Number(argument.slice(name.length + 3));
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

function configure(db) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 30000');
    db.pragma('wal_autocheckpoint = 1000');
    db.pragma('cache_size = -64000');
    db.pragma('temp_store = MEMORY');
}

function percentile(values, percentage) {
    const sorted = values.slice().sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)] || 0;
}

if (!isMainThread) {
    const db = new Database(workerData.file);
    configure(db);
    const write = db.prepare('UPDATE levels SET downloads = downloads + 1 WHERE levelID = ?');
    const feed = db.prepare('SELECT levelID FROM levels WHERE unlisted = 0 ORDER BY likes DESC, levelID DESC LIMIT 10');
    const owner = db.prepare('SELECT levelID FROM levels WHERE accountID = ? ORDER BY uploadDate DESC LIMIT 10');
    const latencies = [];
    const started = performance.now();

    try {
        for (let round = 0; round < workerData.rounds; round += 1) {
            const operationStarted = performance.now();
            write.run(workerData.firstID + (round % workerData.rowSpan));
            feed.all();
            owner.all((round % workerData.accounts) + 1);
            latencies.push(performance.now() - operationStarted);
        }
        parentPort.postMessage({
            rounds: workerData.rounds,
            elapsed: performance.now() - started,
            p95: percentile(latencies, 0.95)
        });
    } catch (error) {
        parentPort.postMessage({ error: error.message });
    } finally {
        db.close();
    }
    return;
}

const rows = option('rows', 100000);
const writers = Math.min(option('writers', 4), rows);
const rounds = option('rounds', 1000);
const accounts = Math.max(100, Math.ceil(rows / 100));
const file = path.join(os.tmpdir(), `gdps-sqlite-benchmark-${process.pid}.db`);
const db = new Database(file);
configure(db);

try {
    db.exec(`
        CREATE TABLE levels (
            levelID INTEGER PRIMARY KEY,
            accountID INTEGER NOT NULL,
            levelName TEXT NOT NULL,
            downloads INTEGER NOT NULL DEFAULT 0,
            likes INTEGER NOT NULL DEFAULT 0,
            uploadDate INTEGER NOT NULL,
            unlisted INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_bench_levels_account_date ON levels(accountID, uploadDate DESC, levelID DESC);
        CREATE INDEX idx_bench_levels_unlisted_likes ON levels(unlisted, likes DESC, levelID DESC);
    `);

    const insert = db.prepare(`
        INSERT INTO levels (levelID, accountID, levelName, downloads, likes, uploadDate, unlisted)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const seed = db.transaction(() => {
        for (let levelID = 1; levelID <= rows; levelID += 1) {
            insert.run(levelID, ((levelID - 1) % accounts) + 1, `Level ${levelID}`, levelID % 1000, levelID % 10000, levelID, levelID % 20 === 0 ? 1 : 0);
        }
    });

    const seedStarted = performance.now();
    seed();
    const seedSeconds = (performance.now() - seedStarted) / 1000;
    db.pragma('optimize');
    db.close();

    const started = performance.now();
    const jobs = Array.from({ length: writers }, (_, index) => new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
            workerData: {
                file,
                firstID: (index * Math.ceil(rows / writers)) + 1,
                rowSpan: Math.min(Math.ceil(rows / writers), rows - (index * Math.ceil(rows / writers))),
                accounts,
                rounds
            }
        });
        worker.once('message', result => result.error ? reject(new Error(result.error)) : resolve(result));
        worker.once('error', reject);
    }));

    Promise.all(jobs).then(results => {
        const elapsedSeconds = (performance.now() - started) / 1000;
        const totalRounds = results.reduce((total, result) => total + result.rounds, 0);
        const p95 = percentile(results.map(result => result.p95), 0.95);
        console.log(`SQLite benchmark: ${rows.toLocaleString()} rows, ${writers} concurrent writers, ${rounds.toLocaleString()} rounds each`);
        console.log(`Seed: ${seedSeconds.toFixed(2)}s (${Math.round(rows / seedSeconds).toLocaleString()} rows/s)`);
        console.log(`Workload: ${elapsedSeconds.toFixed(2)}s (${Math.round(totalRounds / elapsedSeconds).toLocaleString()} mixed write/read rounds/s)`);
        console.log(`Worker round latency p95: ${p95.toFixed(2)}ms`);
        console.log(`Database: ${file}`);
        fs.rmSync(file, { force: true });
        fs.rmSync(`${file}-wal`, { force: true });
        fs.rmSync(`${file}-shm`, { force: true });
    }).catch(error => {
        console.error(`SQLite benchmark failed: ${error.message}`);
        process.exitCode = 1;
    });
} catch (error) {
    db.close();
    fs.rmSync(file, { force: true });
    throw error;
}