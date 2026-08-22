# GDPSnode

> [!WARNING]
> **Work-in-progress!** GDPSnode is currently under active development. I'm actively porting endpoints over from the original PHP implementation (*GMDPrivateServer*).
> [!WARNING]
> **Elder mods have full control!** If you give somebody the Elder Moderator role, they'll be able to do virtually anything on your server, since there isn't a distinction made between elder mods and owners. This might change in the future, but for now, make sure to only give Elder to highly trusted members.

GDPSnode is a ground-up, modern replacement for *[GMDPrivateServer](https://github.com/cvolton/gmdprivateserver)*, built from scratch using documentation from [gd-docs](https://github.com/rifct/gd-docs) ([boomlings.dev](https://boomlings.dev/)).

[![View Video Demo](https://www.youtube.com/watch?v=2F5ZYpTTSGM)](https://www.youtube.com/watch?v=2F5ZYpTTSGM)

Instead of relying on heavy, legacy web server stacks like Apache or Nginx, GDPSnode runs on a clean, lightweight **Node.js + Express + better-sqlite3** setup. Making deployment fast, reliable, and painless for sysadmins. Every endpoint is thoroughly tested as it's built to keep things stable.

### Main features

* **Drop-in Compatibility:** Fully compatible with vanilla Geometry Dash out of the box by accurately mimicking standard server behavior (`.php` endpoints).
* **GDPS Switcher Support:** Native integration with [GDPS Switcher](https://geode-sdk.org/mods/km7dev.gdps-switcher), including custom MOTD and icon support.
* **Modern Stack:** Built for better performance, easier maintainability, and simpler hosting compared to traditional PHP backends.

### Elder moderator dashboard

The moderation dashboard runs alongside the game server at the path configured by `DASHBOARD_PATH` (default: `/dashboard`). It is disabled until credentials are configured, so set these environment variables before starting the server:

Copy `.env.example` to `.env`, fill in the dashboard values, and start the server:

```sh
cp .env.example .env
npm start
```

The dashboard provides server statistics, pending mod suggestions, recent level activity, rating, and rejection actions.

Since the project is still in development, many endpoints are still being ported over. Thanks for checking it out and hanging in there as we build this out! ❤️
