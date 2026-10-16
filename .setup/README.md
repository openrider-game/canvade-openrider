# OpenRider backend

PHP endpoints storing the published tracks and the ghosts, called by the game with url-encoded
POST requests (see `src/openrider/constants/request.constants.ts`). They answer in JSON, with a
400 status for invalid parameters, 404 for an unknown track or ghost, 405 for other methods and
500 for server errors (logged with `error_log`).

| Endpoint          | Parameters                        | Response                  |
| ----------------- | --------------------------------- | ------------------------- |
| `db/trackdata/`   | `id`                              | `{ "CODE", "THUMBNAIL" }` |
| `db/trackupload/` | `trackCode`, `thumbnail` (base64) | `{ "ID" }`                |
| `db/ghostdata/`   | `trackId`, `id`                   | `{ "GHOSTSTRING" }`       |
| `db/ghostupload/` | `ghostString`, `trackId`, `time`  | `{ "ID" }`                |

## Requirements

- PHP 7.4 or later, with the PDO driver of the database
- PostgreSQL (`db/tables.sql`), or SQLite 3.35 or later (`db/tables.sqlite.sql`)

## Configuration

The database is configured with environment variables, the defaults being those of the original
game:

| Variable                | Default                                          |
| ----------------------- | ------------------------------------------------ |
| `OPENRIDER_DB_DSN`      | `pgsql:host=localhost;port=5432;dbname=postgres` |
| `OPENRIDER_DB_USER`     | `postgres`                                       |
| `OPENRIDER_DB_PASSWORD` | `postgres`                                       |

## Running locally

With SQLite and the PHP built-in server, from the root of the project once the game is built:

```sh
sqlite3 openrider.db < .setup/db/tables.sqlite.sql
OPENRIDER_DB_DSN="sqlite:$PWD/openrider.db" php -S localhost:8000
```

Then open `http://localhost:8000/` to edit and upload a track, and
`http://localhost:8000/?track=1` to race it.

## Deploying

Serve the root of the project (`index.html`, `styles.css`, `dist/`, `media/` and `.setup/db/`)
with PHP enabled. `sample.htaccess` holds optional Apache rules: the redirection of the track
pages of the original game, `/tracks/<id>/`, to the game, and the protection of the shared
helpers of the endpoints.
