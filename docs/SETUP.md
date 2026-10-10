# First steps and setup

This guide covers the basics of running GDPSnode locally and getting a clean development environment working.

## Requirements

Before you begin, make sure you have:

- Node.js 22 or newer
- npm
- A Git client
- A local environment that can bind a port, usually port 10000 by default

## Install dependencies

From the project root:

```sh
npm install
```

## Create your environment file

Copy the example configuration into a real local file:

```sh
cp .env.example .env
```

The `.env` file is where you set:

- the dashboard path
- cookie security options
- reverse proxy trust settings
- port configuration
- plugin configuration
- optional legacy compatibility settings

## Start the server

```sh
npm start
```

By default the server listens on port 10000. You can confirm it started by checking the console output for the startup banner.

## Open the dashboard

Once the server is running, open:

```text
http://localhost:10000/dashboard/
```

The dashboard supports standard in-game moderator credentials. In other words, a regular moderator account can log in using its username and password, validated against the stored `gjp2` hash, instead of requiring a separate dashboard-only password.

## Common configuration values

```env
DASHBOARD_PATH=/dashboard
DASHBOARD_SECURE_COOKIES=0
TRUST_PROXY_HOPS=0
PORT=10000
ENABLE_PLUGINS=1
PLUGINS_DIR=plugins
```

### Notes

- `DASHBOARD_SECURE_COOKIES=1` should be used when you are running under HTTPS.
- `TRUST_PROXY_HOPS` is important if your server sits behind a reverse proxy like Nginx or Cloudflare.
- Keep `ENABLE_PLUGINS` enabled if you are using custom plugin modules.

## Working with the project layout

- `server.js` boots the HTTP server and loads the routes
- `endpoints/` contains Geometry Dash-compatible handlers grouped by domain (`accounts/`, `comments/`, `friends/`, `levels/`, `messages/`, `moderation/`, `rewards/`, `scores/`, `songs/`, `system/`, and `users/`)
- `endpoints/content/` contains local content files served before the CDN fallback
- `dashboard/` contains the web dashboard UI and auth logic
- `database.js` initializes and manages the SQLite database
- `config.js` normalizes settings from environment values
- `plugins/` is where custom plugins are discovered automatically

## Troubleshooting

### The server does not start

Check:

- whether Node.js is installed and available in PATH
- whether dependencies installed successfully
- whether the `.env` file exists and contains valid values
- whether another process is already using the configured port

### The dashboard does not load

Confirm:

- the port is correct
- `DASHBOARD_PATH` matches your proxy or reverse proxy configuration
- the server process is still running
- your login credentials are valid for a real server account

### Plugin files are not loading

Check:

- `ENABLE_PLUGINS` is set to `1` or `true`
- `PLUGINS_DIR` points to the correct folder
- the plugin file name ends in `.js` or is placed in a nested plugin folder with `index.js`

## Next steps

- Read the [GDPS Switcher setup guide](GDPS_SWITCHER.md)
- Read the [plugin development guide](PLUGIN_DEVELOPMENT.md)
- Contribute to the project using the [contribution guide](CONTRIBUTING.md)
