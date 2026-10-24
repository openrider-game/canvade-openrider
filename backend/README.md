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
- For the sample website, Node (tested with Node 24), verifying the ghosts with `dist/verify-ghost.cjs`
  (built with the game by `npm run build`)

## Configuration

The backend and the sample website are configured with environment variables:

| Variable                  | Setting                                              | Default                                          |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| `OPENRIDER_DB_DSN`        | PDO data source of the database                      | `pgsql:host=localhost;port=5432;dbname=postgres` |
| `OPENRIDER_DB_USER`       | User of the database                                 | `postgres`                                       |
| `OPENRIDER_DB_PASSWORD`   | Password of the database                             | `postgres`                                       |
| `OPENRIDER_NODE`          | Node executable verifying the ghosts                 | `node`                                           |
| `OPENRIDER_VERIFY_GHOSTS` | `0` to save the ghosts without verifying them        | Verified                                         |
| `OPENRIDER_ADMINS`        | User names of the admins, separated with commas      | None                                             |

## Running locally

`local/router.php` runs the game and the backend with the PHP built-in server and SQLite, from
the root of the project once the game is built:

```sh
php -S localhost:8000 backend/local/router.php
```

On the first request, it creates the database `backend/local/openrider.db` with the tables and the
sample data of `local/sample.sql`; delete the file to start over. Setting `OPENRIDER_DB_DSN` uses
that database instead. The router refuses the same requests as the Apache rules of the deployed
site (see "Deploying").

In VS Code, the `OpenRider: local server` task builds the game, then starts the server with the
PHP executable of the `php.validate.executablePath` setting (e.g. `C:\xampp\php\php.exe`).

### Sample website

`http://localhost:8000/` is a sample website embedding the game in its pages, with accounts:
everyone can browse and race the tracks, while creating tracks and saving drafts and ghosts need
an account.

- `/` lists the published tracks, newest first, with their thumbnail, title, author, bike,
  number of ghosts and best time, marking the unverified ones;
- `/tracks/<id>/` runs the game racing the track, under its title, author, description and
  verifier, with its leaderboard under it, in two tabs: the 10 best riders, ranked by their best
  ghost (a rider holding several of the best times counts once), their other ghosts folded under
  it; and the ghosts of the account logged in, with its rank and its ghosts waiting for an admin.
  The run verifying the track is marked. Clicking a rider adds their ghost to the race, and
  clicking it again removes it. A finished race is saved for the account logged in, named after
  it;
- `/users/` lists the accounts by name, 50 a page, with the number of their tracks and ghosts,
  and searches them by name (`?q=`), whatever its case; the header links to it;
- `/users/<name>/` lists the tracks published by an account, and its ghosts with their rank;
- `/reviews/` lists the ghosts and the verifying runs waiting for an admin, for the admins only
  (see "Reviews");
- `/register/` and `/login/` create an account (a user name of 3 to 20 letters, digits, `_` or
  `-`, and a password of 8 characters at least) and log in; the header logs out (`/logout/`);
- `/create/` runs the game editing a new track, whose upload opens the page of the upload;
- `/uploads/<id>/` asks for the title (60 characters at most) and the description (500
  characters at most) of an uploaded track, both required. A track code also needs a verifier,
  the account itself by default, and opens its verification page. An editor file cannot be
  raced: it is saved as a draft instead;
- `/verify/<id>/` runs the game racing a track waiting for verification, for its author, its
  verifier and the admins only (see "Verification");
- `/drafts/` lists the tracks waiting for verification that the account made or verifies, then
  its drafts, each one opening its editor page;
- `/drafts/<id>/` runs the game editing the draft (`data-track-mode="edit"`). Uploading its
  editor file again saves the changes to the draft, uploading its track code publishes it as a
  new track, keeping the draft. Its editor file also downloads from
  `/uploads/<id>/track.openrider.json`.

The uploads and drafts are only seen by their own account, and the tracks waiting for
verification by their author and verifier.

Each page loads `dist/main.js` with a `#game` element configuring it (see "Usage" in the main
README), and the leaderboard drives the game through its page API (`window.OpenRider`). The game
alone stays at `/index.html`.

The game gets the URL of its page as base URL, `/tracks/<id>/`, `/create/`, `/drafts/<id>/` or
`/verify/<id>/`, so that its uploads of tracks and ghosts reach the site instead of the backend
endpoints, to know their account and check them. The site keeps the uploaded tracks in its own
`LOCAL_UPLOADS` table, and adds a track code to the tracks of the backend only once verified and
published. On a draft or verification page, it also answers the `trackdata` endpoint with the
draft or the track, and on a verification page the `ghostdata` endpoint with the verifying run,
whose id is the one of the track.
The other requests reach the backend endpoints and the icons under the page. The `trackupload`
and `ghostupload` endpoints of `backend/db/` are refused, which would bypass the accounts.

The backend stores no account, title nor description: the site keeps them in its own tables
(`LOCAL_USERS`, `LOCAL_TRACK_DETAILS`, `LOCAL_GHOST_OWNERS` and `LOCAL_GHOST_REVIEWS`), adding
the missing ones and their missing columns to an existing database. The tracks and ghosts uploaded without the site or before the accounts have
no author: the tracks are named after their id when they have no title, and the ghosts after the
name of their ghost string. The first account created takes over the drafts made before the
accounts. A database created before the titles holds none: delete `openrider.db` to start over
with the sample.

#### Security

- Accounts: the passwords are hashed with `password_hash`, logging in starts a new session id,
  and the session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS (also behind a
  proxy setting `X-Forwarded-Proto`). The forms carry a CSRF token, and the posted requests whose
  `Origin` is another site are refused.
- Ghosts: their string must have the format the game writes, and its time must be the one posted.
  The site then replays the ghost on its track with `dist/verify-ghost.cjs` (the physics of the
  game, see `src/verify/` of the game), and refuses it unless it reaches every target exactly at
  its time: a forged time or ghost string does not. A ghost of a large track takes a few seconds,
  and the verification gives up after 60 seconds or for runs over two hours.
- Uploads: a track code or editor file holds 16 MB at most (with `post_max_size` large enough in
  the PHP configuration), and its thumbnail must be a 500x300 PNG.
- Rate limits (`LOCAL_RATE_EVENTS`): 30 uploads and 60 ghosts an hour per account, 5 new accounts
  an hour per address, and 20 failed logins per address and 10 per user name over 15 minutes,
  after which even the right password is refused for a while.

Not covered: captchas, changing a password, and the moderation of the titles and descriptions
before they are published.

#### Verification

A track is published once someone finished it, proving it can be finished:

1. Its author sends its track code to verification, naming its verifier: themselves, or another
   account, which finds it in its drafts. Until published, only them and the admins can race it,
   on its verification page.
2. The author can give the verification to another account, and the verifier give it back to the
   author, until verified.
3. The verifier finishes the track and saves their run, checked as any ghost: replayed from the
   start, so that going back to the checkpoints is fine, and analysed (see "Reviews"). Once
   saved, the track is verified, the page reloading by itself (`public/js/verification.js`).
4. Its author publishes it: the verifying run becomes the first ghost of the track, marked in the
   leaderboard, and only the admins can delete it.

The tracks published before the verification are marked unverified.

#### Reviews

Replaying a ghost proves the run is possible, not that a human played it: a program pressing the
keys (tool-assisted runs) gives valid ghosts too. The site analyses the inputs of every ghost and
verifying run (`site_analyse_ghost()` in `security.php`), and sends to the admins the runs with:

- more than 5 key presses of a single tick, left and right leans, accelerating and braking only
  (the game records each turn as a press of a single tick);
- more than 25 key toggles within a second;
- a time more than 20% better than the record of the track.

Runs played by hand, spacebarring included, hold at most 2 presses of a single tick and 15 toggles
a second on tracks of several minutes. A ghost waiting for an admin is saved but out of the
leaderboard and the best times, shown to its account only; a verifying run waiting for an admin
keeps its track from being published. On `/reviews/`, the admins watch them and approve or reject
them: a rejected ghost is deleted, and a rejected verifying run dropped, its verifier saving
another one. These signs catch the programs playing fast or precisely, not the ones imitating a
human: the reviews are the safeguard.

#### Moderation

An account deletes its own tracks (with all their ghosts), ghosts (except a verifying run),
drafts, tracks waiting for verification and account (with everything it made), with the buttons
of their pages. The admins, named in `OPENRIDER_ADMINS`, delete those of any account, and review
the suspicious runs.

```
site.php                  front controller of the site with Apache, see "Deploying"
local/
├── router.php            router of the built-in server: database, endpoints, then the site
├── sample.sql            sample tracks, ghosts, titles and descriptions
└── site/
    ├── app.php           front controller: routes of the site and static files
    ├── src/              accounts, security, database queries, formatting, template rendering
    ├── templates/        layout, pages and partials (track card, game host element, delete button)
    └── public/           static files served under /assets/: css/, js/ and the favicon
```

The sample holds three tracks, each with a ghost finishing it:

| Track | Title              | Bike | Ghost        | Shows                                    |
| ----- | ------------------ | ---- | ------------ | ---------------------------------------- |
| 1     | First ride         | BMX  | 1, `Rookie`  | A jump, a checkpoint and scenery         |
| 2     | Linked checkpoints | MTB  | 2, `Linker`  | A boost and a pair of linked checkpoints |
| 3     | Hills              | BMX  | 3, `Climber` | Hills and a foreground layer             |

## Deploying

### Sample website

The site is served by Apache with PHP, at the root of a domain (its links start with `/`):

1. Build the game with `npm run build`, which writes `dist/main.js` and `dist/verify-ghost.cjs`.
2. Upload the root of the project, keeping its structure: `.htaccess`, `index.html`,
   `styles.css`, `dist/`, `media/` and `backend/` (without `backend/local/openrider.db`). The
   sources (`src/`, `test/`), `node_modules/` and the other files of the project are not needed.
3. Create the tables of the backend in the database, `db/tables.sql` for PostgreSQL: the site
   adds its own on the first request. Without the local router, no sample data is loaded.
4. Set the environment variables of the configuration: the database, the Node executable when
   `node` is not in the path of the web server, and the admins.
5. Serve the site over HTTPS.

`.htaccess`, at the root of the project, sends the pages to `backend/site.php`, the front
controller of the site, and refuses the sources of the site and its local database
(`backend/local/`), the shared helpers of the endpoints, the upload endpoints, the dot files and
the other files of the project (`.md`, `.sql`, `.json`...). The PHP built-in server applies the
same rules with `local/router.php`.

The tables of MySQL are not supported: the queries use `RETURNING` and quoted identifiers.

### Game alone

Serve the root of the project (`index.html`, `styles.css`, `dist/`, `media/` and `backend/db/`)
with PHP enabled, with `sample.htaccess` as `.htaccess` instead of the one of the site: it
redirects the `/tracks/<id>/` pages to the game racing the track, and protects the shared helpers
of the endpoints. The upload endpoints then stay open to anyone, without accounts nor checks.
