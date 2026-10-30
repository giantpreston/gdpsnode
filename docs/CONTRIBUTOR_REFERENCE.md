# Contributor reference: configuration, numbers, and statuses

This guide collects conventions that are easy to misread when working on GDPSnode. It describes the current implementation; the code remains the source of truth when a behavior changes.

## Configuration and environment variables

At startup, `server.js` loads `.env` if present, then `config.js` normalizes configuration values. Missing `.env` is allowed: built-in defaults are used. The checked-in `.env.example` is the template for local settings.

### Parsing rules

- Most numeric settings are converted to integers. Blank or missing values use the documented default, and non-finite values fall back to that default. Decimal values can therefore be accepted; the loader does **not** generally enforce integer-ness, positivity, or a range. Use sensible integers and validate any new configuration at the point where it is consumed.
- Boolean settings accept `1`, `true`, `yes`, and `on` (case-insensitive) as true. Other non-empty values are false; missing or empty values use the default.
- `DASHBOARD_LOGIN_MODE` is case-insensitive and accepts `account`, `legacy`, or `both`. An unrecognized value falls back to `account`.
- `NEWS_VERSION` must contain only decimal digits; invalid input stops startup with an error.
- `PUBLIC_URL` and `SONG_BASE_URL`, when set, must be absolute HTTP or HTTPS URLs without credentials, query strings, or fragments. Trailing slashes are removed.
- `DASHBOARD_PATH` is trimmed, given a leading slash if needed, and has trailing slashes removed. The root dashboard URL redirects to its slash-terminated form.

### Server and content settings

| Variable | Default | Meaning |
|---|---:|---|
| `PORT` | `10000` | HTTP listen port. `GDPS_PORT` is a legacy fallback when `PORT` is empty or unset. Prefer an integer from 1 to 65535; ports 80 and 443 may require elevated privileges on some systems. |
| `GDPS_PORT` | — | Legacy fallback for `PORT`; `PORT` is recommended instead. |
| `GDPS_DATABASE_PATH` | `gd_server.db` | SQLite database file path. Relative paths resolve from the process working directory. |
| `PUBLIC_URL` | Derived from the request | Public server origin/path used to build URLs when the request host is not suitable. Set it when a reverse proxy or external domain should be advertised. |
| `SONG_BASE_URL` | Public server URL plus `/songs` | Base URL used for custom song links. Set it when songs are hosted separately, for example on a CDN. |
| `NEWS_VERSION` | `5` | Starting news version for a newly initialized database. Existing databases retain their stored version; saving changed articles increments it. |
| `MOTD` | `A GDPSnode Private Server.` | Message returned by the server for the GDPS Switcher mod. |
| `ICON` | [Default GDPS Switcher Icon] | Server icon URL for GDPS Switcher in the format of an image. |
| `LANG` | `js` | Advertises the server uses GDPSnode through the GDPS Switcher endpoint. This isn't part of the GDPS Switcher protocol, but is sent anyway by the server. |
| `webhook` | Built-in placeholder URL | Optional Discord webhook target for server notifications. This key is lowercase in `.env.example` and in the loader. |

### Dashboard and proxy settings

| Variable | Default | Meaning |
|---|---:|---|
| `DASHBOARD_PATH` | `/dashboard` | URL mount path for the dashboard. |
| `DASHBOARD_LOGIN_MODE` | `account` | `account` authenticates with an in-game moderator account; `legacy` enables the configured legacy credentials; `both` permits either. |
| `DASHBOARD_USER` | Empty | Username used only by legacy dashboard login. |
| `DASHBOARD_PASSWORD` | Empty | Password used only by legacy dashboard login. Avoid relying on legacy credentials when account login is feasible. |
| `DASHBOARD_ACCOUNT_ID` | `0` | Account ID whose account is used with the legacy dashboard credentials. Configure a real moderator account when using legacy login. |
| `DASHBOARD_SECURE_COOKIES` | `0` | Set to `1` when HTTPS is used so the dashboard session cookie gets the `Secure` attribute. |
| `TRUST_PROXY_HOPS` | `0` | Number of trusted proxy hops, passed to Express's `trust proxy` setting. Set this to match the actual proxy chain; an incorrect value can make client IP/protocol information unreliable. |
| `TRUST_PROXY` | — | Legacy fallback used only when `TRUST_PROXY_HOPS` is unset. Prefer `TRUST_PROXY_HOPS`. |

The dashboard's own JSON API uses HTTP authentication/authorization statuses such as `401` and `403`. These are separate from the text responses used by the Geometry Dash-compatible endpoints below.

### Request limits and plugins

| Variable | Default | Meaning |
|---|---:|---|
| `RATE_LIMIT_PER_MINUTE` | `350` | Per-client-IP request limit across game and dashboard routes in a 60-second window. Game browsing endpoints no longer have a separate stricter cap; dashboard login attempts retain their own stricter limit. |
| `DASHBOARD_ATTEMPTS_PER_WINDOW` | `10` | Maximum dashboard login attempts per 15-minute window. |
| `ENABLE_PLUGINS` | `1` | Boolean toggle for automatic plugin loading. |
| `PLUGINS_DIR` | `plugins` | Plugin directory, relative to the project directory when using a relative path. |

The server also has fixed parser limits: most request bodies are limited to 32 MiB, while level upload/download transfer requests are configured for 50 MiB. Level download responses also have a separate 50 MiB cap. These are implementation constants and not configurable.

### Daily chest settings

`CHEST1_WAIT` and `CHEST2_WAIT` are cooldowns in **seconds** (defaults: 14,400 seconds / 4 hours and 86,400 seconds / 24 hours). Each chest's `MIN_*` and `MAX_*` settings define inclusive integer bounds for the randomly generated orbs, diamonds, and keys reward on the free chests. For example:

```env
CHEST1_WAIT=14400
CHEST1_MIN_ORBS=20
CHEST1_MAX_ORBS=100
```

## Numeric values and flags are context-specific

Many client payloads are colon-, comma-, or pipe-delimited strings containing numeric field identifiers, IDs, counters, and booleans. A number's meaning comes from the specific endpoint and field—not from a global GDPSnode enum. When changing a value, trace its parser, producer, database column, and client serializer rather than inferring meaning from the number alone.

### Account and moderator fields

- Boolean database flags conventionally use `0` for false and `1` for true. Examples include `isDisabled`, `leaderboardBan`, `permaCommentBan`, and `creatorBanned`.
- `commentBan` is **not** a boolean flag: `0` means no timed ban; a positive value is a Unix timestamp in seconds when the ban expires. `permaCommentBan` is the separate permanent-ban flag.
- `profiles.modLevel` accepts values 0 through 3 in dashboard moderation:
  - `0`: no moderator role
  - `1`: advisor
  - `2`: moderator
  - `3`: leaderboard moderator
- The `requestUserAccess.php` response encodes moderator levels differently: it returns `-1` for no access/failure, `1` for advisor, `2` for moderator, and `99` for leaderboard moderator. Do not copy these response values into the internal `modLevel`.
- Dashboard permissions are additionally feature-based. The built-in defaults are:

  | `modLevel` | Default dashboard features |
  |---:|---|
  | `0` | None |
  | `1` | Overview and leaderboard bans |
  | `2` | All dashboard features |
  | `3` | Overview and leaderboard bans |

  These defaults can be customized in the dashboard permission settings, and individual accounts can be further restricted. A moderator level is not a universal promise of access to every dashboard screen.

### Thread membership state

`thread_members.status` is a membership lifecycle, not an HTTP status:

| Value | Meaning |
|---:|---|
| `0` | Invitation or pending membership |
| `1` | Active member |
| `2` | Kicked/former member; retained for history and possible rejoining |
| `3` | Member who left |

Direct-message flows have some special handling for pending state, so do not assume every `status = 0` thread behaves exactly like a group invite. Other thread fields such as `hidden`, `muted`, and `pinned` are separate `0`/`1` flags; they do not replace membership status.

### IDs, counters, and timestamps

- Database `accountID`, `levelID`, `threadID`, and similar IDs are distinct identifier spaces. Some Geometry Dash response fields transform IDs (for example, user serialization can expose an offset client ID alongside the database account ID); do not substitute one for another without checking the endpoint serializer.
- Most persisted timestamps created with `Math.floor(Date.now() / 1000)` are Unix seconds. In-memory dashboard session expirations use milliseconds. Check the code path before comparing or converting numeric time values.
- A field named `version`, `count`, `rank`, or `number` is not necessarily a timestamp or a boolean. Check its owning table and response shape.

## Geometry Dash endpoint responses versus HTTP statuses

Many game endpoints preserve the legacy protocol by returning plain-text sentinel values, often while the HTTP response status remains `200`. The value in the response body is not itself an HTTP status code. Conversely, rate limiting can return HTTP `429` with body `-1` (for compatibility).

Common values you may encounter include:

| Body value | Examples in this project | Important caveat |
|---|---|---|
| `1` | Generic Success response; can also mean Advisor in the requestUserAccess endpoint. | Meaning depends on the endpoint. |
| `-1` | Generic validation/authentication failure, missing route, disabled account access, or caught endpoint error | Not a detailed error code; endpoint-specific meanings may overlap. |
| `-2` | Duplicate username at registration; missing results in some list/message endpoints; not-a-moderator in star suggestions | Interpret only in the endpoint that emitted it. |
| `-3` | Invalid save data in account backup | Not a general server failure code. |
| `-4` | Username too long during registration; oversized server request or level-download response | The same value is used for unrelated conditions. |
| `-5`, `-8`, `-9` | Password too long, password too short, and username too short during registration | Registration-specific validation responses. |
| `none` | No more messages for a thread-message page | A protocol sentinel, not an empty response. |

This table is illustrative, not a complete response catalog. A particular endpoint may use a sentinel differently or return a structured payload instead. Follow the endpoint implementation and keep its established client contract when changing behavior.

## Contributor workflow for protocol and schema changes

1. Find the endpoint and any shared serializer/helper it uses before changing a field or response.
2. Check whether a numeric field is a boolean, a timestamp, a counter, an ID, a wire-protocol enumeration, or a text response. Document new or changed meanings near the relevant section here.
3. Keep HTTP behavior and body behavior distinct. Avoid replacing a game-protocol response with a JSON error (mainly because the vanilla game doesn't support JSON) or a different HTTP status unless the client compatibility change is intentional.
4. If a database value changes, inspect schema initialization/migrations and all readers/writers. Preserve old stored data where feasible.
5. Add or update a focused test for numeric boundaries, sentinel output, or state transitions; run `npm test` for the project validation suite.

## Related documentation

- [Setup](SETUP.md)
- [Contributing](CONTRIBUTING.md)
- [Plugin development](PLUGIN_DEVELOPMENT.md)
- [GDPS Switcher setup](GDPS_SWITCHER.md)
