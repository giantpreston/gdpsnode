# GDPSnode

[![Watch the trailer](https://img.shields.io/badge/Watch_the_trailer-YouTube-red?logo=youtube&logoColor=white)](https://www.youtube.com/watch?v=2F5ZYpTTSGM)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

A fully rewritten version of the Geomtry Dash backend in Node.js, with account storage, levels, custom songs, rewards, and an admin dashboard.

## Quick start

Requirements: Node.js 20.6+ and npm.

```sh
npm install
cp .env.example .env
npm start
```

The server runs on port `10000` by default. Change the `port` value at the top of `server.js` to use another port.

## Dashboard

Open [http://localhost:10000/dashboard/](http://localhost:10000/dashboard/) after starting the server.

Configure these values in `.env`:

```env
DASHBOARD_PATH=/dashboard
DASHBOARD_USER=elder
DASHBOARD_PASSWORD=use-a-long-random-password
DASHBOARD_ACCOUNT_ID=123
```

The account must already exist and have `modLevel=2` (elder). Change the default dashboard path and password before exposing the server to the internet. Set `DASHBOARD_SECURE_COOKIES=1` when using HTTPS.

## What is included

- Geometry Dash-compatible account, level, list, score, comment, message, social, rating, reward, and moderation endpoints
- Custom song hosting at `/songs/<filename>`
- GDPS Switcher support at `/switcher/getInfo.php`
- SQLite database created automatically as `gd_server.db`
- Dashboard tools for users, levels, ratings, songs, collections, rewards, quests, and server scheduling

API routes are loaded automatically from `endpoints/`. All game requests use `POST` form data, matching the Geometry Dash client protocol.

## Configuration

See `.env.example` for all available settings, including daily chest wait times and reward ranges.

The application allows 100 requests per minute per client. Dashboard login is limited to 10 attempts per 15 minutes.

## Development

```sh
npm test
```

To measure SQLite on your hardware with a temporary database:

```sh
npm run benchmark:sqlite -- --rows=1000000 --writers=4 --rounds=5000
```

The benchmark reports seed speed, mixed indexed read/write throughput, and
95th-percentile operation latency. Increase `rows` until it matches your
expected population, then increase `writers` and `rounds` to model traffic.
Move to a server database when measured write latency or throughput no longer meets your requirements!

To add an endpoint, create a module in `endpoints/` that exports `method`, `path`, and `handler`. It will be registered automatically when the server restarts.

## License

Open-source as it should be, [MIT Licensed](LICENSE)
