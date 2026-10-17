# GDPSnode

[![Watch the trailer](https://img.shields.io/badge/Watch_the_trailer-YouTube-red?logo=youtube&logoColor=white)](https://www.youtube.com/watch?v=2F5ZYpTTSGM)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

GDPSnode is a Geometry Dash private server backend written in Node.js. It includes account handling, level and score APIs, social features, custom songs, rewards, dashboard moderation tools, and a plugin system so the server can be extended without editing the core codebase.

> [!NOTE]
> GDPSnode only supports the latest Geometry Dash version (2.209 as of right now). Any older version will have support immediately dropped if a newer one comes out, so don't expect **ANY** backwards compatibility with older versions!

> [!WARNING]
> The 2.209 implementation is still not fully done! As more discoveries are made, these endpoints will be added here. I added only the information that is 100% confirmed as of right now, so please be patient while we figure this out! This warning will be removed once it is fully complete and your servers won't show an update pop up until I entirely complete this version.

## Documentation

- [First steps and quick setup](docs/SETUP.md)
- [GDPS Switcher setup](docs/GDPS_SWITCHER.md)
- [Hooks and plugin development](docs/PLUGIN_DEVELOPMENT.md)
- [Contributing to the project](docs/CONTRIBUTING.md)

## Quick start

Requirements:

- Node.js 22+
- npm
- A Linux, macOS, or Windows machine capable of running a local Node.js service

Run the server:

```sh
npm install
cp .env.example .env
npm start
```

Then open the dashboard in a browser:

```text
http://localhost:10000/dashboard/
```

The default port is 10000. You can override it in the environment via `.env` or in the config object.

## How GDPSnode is structured

- `server.js` starts the Express app and boots the backend.
- `endpoints/` contains Geometry Dash-compatible request handlers.
- `dashboard/` contains the admin dashboard front-end and logic.
- `database.js` manages the SQLite schema and database operations.
- `hooks.js` provides the plugin and hook system.
- `plugins/` is where custom extension modules are auto-loaded.
- `songs/` stores custom music files.
- `levels/` stores metadata and local content data.

## Core features

- Geometry Dash account creation, login, and profile management
- Level upload/download endpoints and metadata handling
- Social endpoints for friends and messages
- Scores and leaderboards
- Rewards, quests, and chest logic
- Admin dashboard for moderation and management
- Plugin system for custom game logic and APIs
- SQLite database with automatic initialization

## Default dashboard login

The dashboard supports normal in-game moderator credentials by validating username + password against the stored account `gjp2` data. This means you can log in with a regular server account instead of keeping a separate dashboard-only password.

Legacy environment values are still supported, but the account-based login is the recommended path.

## Environment configuration

The main environment template is `.env.example`. It contains the server and dashboard settings used during startup.

Common examples:

```env
DASHBOARD_PATH=/dashboard
DASHBOARD_SECURE_COOKIES=0
TRUST_PROXY_HOPS=0
PORT=10000
ENABLE_PLUGINS=1
PLUGINS_DIR=plugins
```

## Running in development

```sh
npm test
```

Optional local benchmarking:

```sh
npm run benchmark:sqlite -- --rows=1000000 --writers=4 --rounds=5000
```

## Note
GDPSnode has its own versioning system so you can know if you're behind on the latest builds, features or bug patches.

Its versioning system is close to RobTop's, versions are incremented usually +0.1 for each patch or major version.
For example, if you see a jump from 1.9R to 2.0R, this doesn't mean it's a major version, it could simply be a minor patch, or even just a version bump.

Be mindful of that, and only update if the update is truly important or a feature addition you value, not every X.0 jump is important.

## Plugin ecosystem

The project includes a hook and plugin framework that allows you to:

- register lifecycle hooks
- add middleware
- mount custom endpoints
- add dashboard routes
- integrate with server startup and request flow

See [docs/PLUGIN_DEVELOPMENT.md](docs/PLUGIN_DEVELOPMENT.md) for full examples and API details.

## Contributing

Pull requests are welcome. Please read the contribution guide before opening a PR or starting a larger change.

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## License

Open-source as all things should be, [MIT Licensed](LICENSE).

Not affiliated with, endorsed, or approved by RobTop Games AB. Purchase Geometry Dash through the official stores.
