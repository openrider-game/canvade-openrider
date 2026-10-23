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
- PostgreSQL (`db/tables.sql`), or SQLite 3.35 or later (`db/tables.sqlite.sql`, with the
  `pdo_sqlite` extension)

## Configuration

The database is configured with environment variables:

| Variable                | Default                                          |
| ----------------------- | ------------------------------------------------ |
| `OPENRIDER_DB_DSN`      | `pgsql:host=localhost;port=5432;dbname=postgres` |
| `OPENRIDER_DB_USER`     | `postgres`                                       |
| `OPENRIDER_DB_PASSWORD` | `postgres`                                       |

## Running locally

`local/router.php` runs the game and the backend with the PHP built-in server and SQLite, from
the root of the project once the game is built:

```sh
php -S localhost:8000 .setup/local/router.php
```

On the first request, it creates the database `.setup/local/openrider.db` with the tables and the
sample data of `local/sample.sql`; delete the file to start over. Setting `OPENRIDER_DB_DSN` uses
that database instead. The router also serves the endpoints, as the built-in server does not
resolve the `index.php` of directories under `.setup`.

In VS Code, the `OpenRider: local server` task builds the game, then starts the server with the
PHP executable of the `php.validate.executablePath` setting (e.g. `C:\xampp\php\php.exe`).

### Sample website

`http://localhost:8000/` is a sample website embedding the game in its pages:

- `/` lists the tracks, newest first, with their thumbnail, title, bike, number of ghosts and best
  time;
- `/tracks/<id>/` runs the game racing the track, with the leaderboard of its ghosts under it,
  ordered by time. Clicking a rider adds their ghost to the race, and clicking it again removes
  it;
- `/create/` runs the game editing a new track, whose upload opens its track page.

Each page loads `dist/main.js` with a `#game` element configuring it (see "Usage" in the main
README), and the leaderboard drives the game through its page API (`window.OpenRider`). The game
alone stays at `/index.html`.

The backend stores no track title: the site reads them from its own `LOCAL_TRACK_TITLES` table,
and names the other tracks after their id.

```
local/
├── router.php            router of the built-in server: database, endpoints, then the site
├── sample.sql            sample tracks, ghosts and titles
└── site/
    ├── app.php           front controller: routes of the site and static files
    ├── src/              database queries, formatting, template rendering
    ├── templates/        layout, pages and partials (track card, game host element)
    └── public/           static files served under /assets/: css/, js/ and the favicon
```

The sample holds three tracks, each with a ghost finishing it:

| Track | Title              | Bike | Ghost        | Shows                                    |
| ----- | ------------------ | ---- | ------------ | ---------------------------------------- |
| 1     | First ride         | BMX  | 1, `Rookie`  | A jump, a checkpoint and scenery         |
| 2     | Linked checkpoints | MTB  | 2, `Linker`  | A boost and a pair of linked checkpoints |
| 3     | Hills              | BMX  | 3, `Climber` | Hills and a foreground layer             |

## Deploying

Serve the root of the project (`index.html`, `styles.css`, `dist/`, `media/` and `.setup/db/`)
with PHP enabled. `sample.htaccess` holds optional Apache rules: the redirection of the
`/tracks/<id>/` pages to the game racing the track, and the protection of the shared helpers of
the endpoints.
