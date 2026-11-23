# OpenRider backend

PHP endpoints storing the published tracks and the ghosts, called by the game with POST requests
(see `src/openrider/constants/request.constants.ts`). They answer in JSON, but the download of a
track, with a 400 status for invalid parameters, 404 for an unknown track or ghost, 405 for other
methods and 500 for server errors (logged with `error_log`).

| Endpoint          | Parameters                                     | Response                      |
| ----------------- | ---------------------------------------------- | ----------------------------- |
| `db/trackdata/`   | `id`                                           | The track file, as bytes      |
| `db/trackupload/` | `trackCode` (a file), `thumbnail` (base64)     | `{ "ID" }`                    |
| `db/ghostdata/`   | `trackId`, `id`                                | `{ "GHOSTSTRING" }`           |
| `db/ghostupload/` | `ghostString`, `trackId`, `time`               | `{ "ID" }`                    |

The tracks are track files, the binary format of the game (see `TrackFormat`): stored as bytes
(`CODE`, `BYTEA` with PostgreSQL, `BLOB` with SQLite), downloaded as bytes
(`application/octet-stream`, with their size in `X-File-Size`) and uploaded as the file of a
multipart form. Their header, uncompressed, gives the bike and whether a track is an editor file
without reading the rest (`openrider_track_header()` of `db/api.php`). The tracks saved in the
original text formats are still read everywhere, until migrated (see "Migrating the tracks").

## Requirements

- PHP 7.4 or later, with the PDO driver of the database
- PostgreSQL (`db/tables.sql`), or SQLite 3.35 or later (`db/tables.sqlite.sql`, with the
  `pdo_sqlite` extension)
- For the sample website, Node (tested with Node 24), verifying the ghosts with
  `dist/verify-ghost.cjs` (built with the game by `npm run build`)
- For the live races, Node running the session server `dist/live-server.cjs`, behind Apache with
  `mod_proxy_wstunnel` (see "Live sessions")

## Configuration

The backend and the sample website are configured with environment variables:

| Variable                  | Setting                                         | Default                                          |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| `OPENRIDER_DB_DSN`        | PDO data source of the database                 | `pgsql:host=localhost;port=5432;dbname=postgres` |
| `OPENRIDER_DB_USER`       | User of the database                            | `postgres`                                       |
| `OPENRIDER_DB_PASSWORD`   | Password of the database                        | `postgres`                                       |
| `OPENRIDER_NODE`          | Node executable verifying the ghosts            | `node`                                           |
| `OPENRIDER_VERIFY_GHOSTS` | `0` to save the ghosts without verifying them   | Verified                                         |
| `OPENRIDER_ADMINS`        | User names of the admins who cannot be demoted, separated with commas | None                       |
| `OPENRIDER_REVIEW_WEBHOOK` | Discord or Slack webhook told of what to review | None: the header of the admins only          |
| `OPENRIDER_LIVE_SECRET`   | Secret of the session server of the live races  | None: no live races                              |
| `OPENRIDER_LIVE_URL`      | URL of the session server for the game          | `/live/` of the site, `ws://` or `wss://`        |

## Running locally

`local/router.php` runs the game and the backend with the PHP built-in server and SQLite, from the
root of the project once the game is built:

```sh
php -S localhost:8000 backend/local/router.php
```

On the first request, it creates the database `backend/local/openrider.db` with the tables and the
sample data of `local/sample.sql`; delete the file to start over. Setting `OPENRIDER_DB_DSN` uses
that database instead. The router refuses the same requests as the Apache rules of the deployed site
(see "Deploying").

In VS Code, the `OpenRider: local server` task builds the game, then starts the server with the PHP
executable of the `php.validate.executablePath` setting (e.g. `C:\xampp\php\php.exe`).

The session server of the live races runs next to it, on `ws://127.0.0.1:8090/`, downloading the
tracks from `http://localhost:8000/` (see "Live sessions"). Unless they are set, the router sets
`OPENRIDER_LIVE_SECRET` to the secret `--dev` gives the server, and `OPENRIDER_LIVE_URL` to the
server: the "Race live" button of a track page then starts a session, its link opened in another
browser, or a private window, joining it as another guest.

```sh
npm run live:dev
```

### Sample website

`http://localhost:8000/` is a sample website embedding the game in its pages, with accounts:
everyone can browse and race the tracks, while creating tracks and saving drafts and ghosts need an
account.

- `/` presents the endurance mode, linking to the track of the day and to a new track, then lists
  the published tracks in two tabs, the newest ones and the most liked ones (`?sort=liked`), with
  their thumbnail, thumbs up, title, author, bike, number of ghosts and best time, marking the
  unverified ones;
- `/endurance/` runs the game in endurance mode (`data-game-mode="endurance"`): a new track on each
  load, or the track of its `seed` parameter, the number the game shows (`data-seed`, from 0 to
  4294967295), on the version of the generator of its `version` parameter (`data-version`), the
  version of the day by default. The track of the day is the same for everyone, its seed derived
  from the date in UTC and its version from `SITE_ENDURANCE_VERSIONS`, which tells the first day of
  each version (see "Endurance mode" in the README of the game), and has a leaderboard under the
  game: the 10 best accounts, by their best run of the day (further, then faster), and the rank of
  the account logged in. The game saves the runs of the account beating its best one
  (`data-endurance-save`, see "Endurance runs"), the leaderboard showing them right away
  (`public/js/endurance-leaderboard.js`). Clicking a rider adds their ghost to the race, and
  clicking it again removes it. The leaderboards of the days before stay, closed; the header links
  to the page. An account with a ranked run challenges its friends from the bar above the game,
  sharing a message with a link racing it ("I rode 105 m in 6.76 s in the daily endurance of
  OpenRider! Can you do better?", `/endurance/?seed=<seed>&rider=<name>`; the share sheet on touch
  screens, else copied): the page names the rider and gives the game its run (`data-ghosts`), its
  best one on the track whenever the link is opened;
- `/templates/` lists the templates of the account logged in, which it makes public or private and
  deletes, then the public templates of every account, newest first. A template is a group of
  objects saved from the select tool of the editor, at most 5000 (`SITE_TEMPLATE_MAX_OBJECTS`, the
  most the tool selects), stored as a track file holding them (`ObjectClipboard` of the game);
  those saved before the track files are the first three sections of a track code. Each template is a
  card showing its thumbnail (`/templates/<id>/thumbnail/`, "No preview" for a template saved
  without one); its Copy code button copies its code (`public/js/templates.js`, from
  `/templates/<id>/code/`, the base 64 text of its track file), to paste in the editor with Ctrl+V;
- `/tracks/<id>/` runs the game racing the track, under its title, author, description and verifier,
  with its leaderboard under it, in two tabs: the 10 best riders, ranked by their best ghost (a
  rider holding several of the best times counts once), their other ghosts folded under it; and the
  ghosts of the account logged in, with its rank and its ghosts waiting for an admin. The run
  verifying the track is marked. Clicking a rider adds their ghost to the race, and clicking it
  again removes it. A finished race is saved for the account logged in, named after it. The bar
  above the game challenges friends, sharing a message with a link racing the ghosts racing now
  ("Can you beat these ghosts on “First ride”?", `/tracks/<id>/?ghosts=12,15`; the share sheet on
  touch screens, else copied): the page names them and gives the game the ones it can race
  (`data-ghosts`), 10 at most, those waiting for an admin for their account and the admins only. The
  track and each ghost show their thumbs up (see "Thumbs up"). Under the leaderboard, the comments
  of the track (see "Comments");
- `/ghosts/` lists the ghosts of every track out of review, 50 a page, in two tabs: the newest ones,
  and the most liked ones (`?sort=liked`), with their track (opening it racing the ghost), rider,
  rank, time and thumbs up; the header links to it;
- `/ghosts/<id>/` shows a ghost, its time linking to it from every list (see "Reviews"): its inputs,
  the time its rider spent on the track before saving it, the record of the track then, raced
  against it, the rider's other ghosts on the track and level, and the form reporting it to the
  admins (`/ghosts/<id>/report/`); a ghost waiting for an admin only for its account and the admins;
- `/users/` lists the accounts by name, 50 a page, with the number of their tracks and ghosts, and
  searches them by name (`?q=`), whatever its case; the header links to it;
- `/users/<name>/` lists the tracks published by an account, and its ghosts with their rank, each
  with its thumbs up; a ghost links to its track racing it from the start
  (`/tracks/<id>/?ghosts=<ghost>`);
- `/reviews/` lists the ghosts, the verifying runs and the endurance runs waiting for a moderator,
  and the reported ghosts, for the moderators and admins only (see "Reviews");
- `/admin/users/` and `/admin/audit/` give the roles and suspend the accounts, and list what the
  moderators and admins did, for the admins only (see "Roles and suspensions");
- `/register/` and `/login/` create an account (a user name of 3 to 20 letters, digits, `_` or `-`,
  and a password of 8 characters at least) and log in; the account menu of the header links to the
  profile, the drafts, the settings, the reviews (moderators) and the admin pages (admins) of the
  account, and logs out (`/logout/`);
- `/settings/` changes the password of the account, logs its other sessions out, saves its
  preferences and its optional e-mail address, and deletes it (see "Settings");
- `/forum/` is the forum: its categories, their topics and the posts (see "Forum");
- `/create/` runs the game editing a new track, whose upload opens the page of the upload;
- `/uploads/<id>/` asks for the title (60 characters at most, required) and the description (500
  characters at most) of an uploaded track, a description left empty being "<title> is an
  OpenRider track by <author>". A track code also needs a verifier, the account itself
  by default, and opens its verification page. An editor file cannot be raced: it is saved as a
  draft instead;
- `/verify/<id>/` runs the game racing a track waiting for verification, for its author, its
  verifier and the admins only (see "Verification");
- `/drafts/` lists the tracks waiting for verification that the account made or verifies, then
  its drafts, each one opening its editor page;
- `/drafts/<id>/` runs the game editing the draft (`data-track-mode="edit"`). Uploading its
  editor file again saves the changes to the draft, uploading its track code publishes it as a
  new track, keeping the draft. Its editor file also downloads from
  `/uploads/<id>/track-editor.ortrack`.

The uploads and drafts are only seen by their own account, and the tracks waiting for verification
by their author and verifier.

Each page loads `dist/main.js` with a `#game` element configuring it (see "Usage" in the main
README), and the leaderboard drives the game through its page API (`window.OpenRider`). The game
alone stays at `/index.html`.

The game gets the URL of its page as base URL, `/tracks/<id>/`, `/create/`, `/drafts/<id>/`,
`/verify/<id>/` or `/endurance/`, so that its uploads of tracks, ghosts and endurance runs reach the
site instead of the backend endpoints, to know their account and check them. The site keeps the
uploaded tracks in its own `LOCAL_UPLOADS` table, and adds a track code to the tracks of the backend
only once verified and published. On a draft or verification page, it also answers the `trackdata`
endpoint with the draft or the track, and on a verification page the `ghostdata` endpoint with the
verifying run, whose id is the one of the track. On a track page, it answers the `ghostdata`
endpoint itself, leaving out the ghosts waiting for an admin but for their account and the admins.
The endurance page only answers its `enduranceupload` and `ghostdata` endpoints, with the runs of
its leaderboard. Every page answers the `templates` endpoint of the select tool, posted with an
`action`: `list` (the templates of the account, then the public ones of the others, without their
code but with the URL of their thumbnail; with a `section`, `mine` or `public`, only the templates
of the account or every public one, and with a `query`, only those whose name holds it, or for the
public ones their account), `get` with an `id` (the code of a template the account sees) and `save` with a `name`, a
`code`, `public` (`1` or `0`) and optionally a `thumbnail`. The backend shipped with the game has no
such endpoint: without the site, the select tool tells the error instead of the templates. The other
requests reach the backend endpoints and the icons under the page. The `trackupload` and
`ghostupload` endpoints of `backend/db/` are refused, which would bypass the accounts.

The backend stores no account, title nor description: the site keeps them in its own tables
(`LOCAL_USERS`, `LOCAL_TRACK_DETAILS`, `LOCAL_GHOST_OWNERS`, `LOCAL_GHOST_REVIEWS`, `LOCAL_THUMBS`,
`LOCAL_ENDURANCE_RUNS`, `LOCAL_TEMPLATES` and `LOCAL_COMMENTS`), creating the missing ones and their
missing columns in an existing database. The tracks and ghosts uploaded to the backend without the
site have no account: such a track without a title is named after its id, and such a ghost after the
name of its ghost string. The first account created takes over the drafts without an account.

#### Security

- Accounts: the passwords are hashed with `password_hash`, logging in starts a new session id, and
  the session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS (also behind a proxy
  setting `X-Forwarded-Proto`). The forms carry a CSRF token, and the posted requests whose `Origin`
  is another site are refused.
- Ghosts: their string must have the format the game writes, and its time must be the one posted.
  The site then replays the ghost on its track with `dist/verify-ghost.cjs` (the physics of the
  game, see `src/verify/` of the game), and refuses it unless it reaches every target exactly at
  its time: a forged time or ghost string does not. A ghost of a large track takes a few seconds,
  and the verification gives up after 60 seconds or for runs over two hours.
- Endurance runs: checked as the ghosts, and replayed on their track, their seed on their
  version of the generator, which measures their distance: the distance claimed by the game is
  not trusted. Each run is saved with its version (`VERSION`, 1 for the runs saved before the
  versions), an account keeping one run on each seed and version.
- Uploads: a track code or editor file holds 16 MB at most (with `upload_max_filesize` and
  `post_max_size` large enough in the PHP configuration, 2 MB and 8 MB by default), and its
  thumbnail must be a 500x300 PNG.
- Templates: a template holds 5000 objects and 500 KB at most, its code being a track code (read by
  the game with Node, as the ghosts, to count its objects) or, from a page opened before the track
  files, the three sections of an original track code (base 32 numbers, the items starting with
  their letter), and its name 60 characters at most. Its thumbnail, when it has one, is a 500x300 PNG as the track thumbnails. An
  account sees its own templates and the public ones only.
- Rate limits (`LOCAL_RATE_EVENTS`): 30 uploads, 60 ghosts or endurance runs, 30 templates, 20
  reports, 20 comments, 5 forum topics, 30 forum posts, 30 forum edits, 600 forum previews and
  120 thumbs up given or taken back an hour per account, 5 new accounts an
  hour per address, and 20 failed logins per address and 10 per user name over 15 minutes, after
  which even the right password is refused for a while.

- Sessions: each account has a version of its sessions (`SESSIONVERSION` of `LOCAL_USERS`), kept by
  a session when it logs in. Changing the password, or logging the other sessions out from the
  settings, raises it: the other sessions are logged out at their next request, the one changing
  it staying logged in under a new session id. A wrong current password counts as a failed login.

Not covered: captchas, resetting a forgotten password (the site has no e-mail addresses), and the
moderation of the titles and descriptions before they are published.

#### Verification

A track is published once someone finished it, proving it can be finished:

1. Its author sends its track code to verification, naming its verifier: themselves, or another
   account, which finds it in its drafts. Until published, only them and the admins can race it, on
   its verification page.
2. The author can give the verification to another account, and the verifier give it back to the
   author, until verified.
3. The verifier finishes the track and saves their run, checked as any ghost: replayed from the
   start, so that going back to the checkpoints is fine, and analysed (see "Reviews"). Once saved,
   the track is verified, the page reloading by itself (`public/js/verification.js`).
4. Its author publishes it: the verifying run becomes the first ghost of the track, marked in the
   leaderboard, and only the admins can delete it.

A track without a verifying run, e.g. uploaded to the backend without the site, is marked
unverified.

#### Endurance runs

The track of the day ranks the best run of each account, in `LOCAL_ENDURANCE_RUNS`:

1. The endurance page gives the game `data-endurance-save="1"` for the account logged in, with its
   best run of the day (`data-endurance-best`). Each run beating it is uploaded once the rider
   falls: its ghost string, the last tick alive as its time, and the seed.
2. The site refuses the runs on another track than the one of the day (the one of the day before
   being accepted for 10 minutes after midnight UTC, for the runs started before), then replays the
   run (`dist/verify-ghost.cjs` with the seed), which must fall at its time, and keeps the distance
   it measures, in whole meters.
3. The run replaces the one of the account if it goes further, or as far and faster, named after the
   account, and analysed as the ghosts (see "Reviews"). The game shows its rank, and the page its
   new leaderboard.

The ghosts of the runs race on the page as the ghosts of a track: the game follows the same rules
for them as for the player, so they ride as they were ridden, whatever the other runners do.

#### Reviews

Replaying a ghost proves the run is possible, not that a human played it: a program pressing the
keys (tool-assisted runs) gives valid ghosts too. The site analyses the inputs of every ghost,
verifying run and endurance run (`site_analyse_ghost()` in `security.php`), and sends to the admins
the runs with:

- more than 5 key presses of a single tick that are also more than 10% of the presses of the run,
  left and right leans, accelerating and braking only (the game records each turn as a press of a
  single tick): a long run played by hand gathers a few of them among many presses;
- more than 25 key toggles within a second.

Runs played by hand hold a few presses of a single tick and at most 15 toggles a second. The game
writes the ticks it paused at in the ghost strings, after an empty name (`...,BMX,,40 90`), a run
without pauses stopping at the bike as before; the site keeps them after the name it writes. The
pauses are shown with the inputs of the runs, for the players, and are no reason to review a run;
the ghosts saved before have none written. A time far better than the record is not a sign: the
records improve. A ghost waiting for an admin is saved but out of the leaderboard and the best
times, shown to its account only; a verifying run waiting for an admin keeps its track from being
published, and an endurance run waiting for an admin is out of the leaderboard, listed for the
admins on the page of its track to race it. On `/reviews/`, the admins watch them and approve or
reject them: a rejected ghost or endurance run is deleted, and a rejected verifying run dropped, its
verifier saving another one. These signs catch the programs playing fast or precisely, not the ones
imitating a human: the reviews are the safeguard.

To review a run, the admins, and the riders for the ghosts out of review, see (`/ghosts/<id>/`, the
time of a ghost linking to it, and `/reviews/`, a run unfolding its inputs):

- its inputs, drawn from its ghost string (`public/js/ghost-inputs.js`): a timeline of the presses
  of each key, zoomable, the presses of a single tick in red, its pauses as lines across the keys,
  and the durations of the presses,
  spread over many durations when played by hand, on a few when played by a program;
- the time its rider spent on the track before saving it, measured by the server: from the first
  opening of the page of the track in the session of the rider (`site_open_run_clock()`) to the
  saving of the run, never sent by the game. It cannot be made shorter than it was, only longer by
  waiting: a record saved seconds after opening the track stands out, a long time proves nothing.
  For the ghosts, the first opening of the track by the account is shown too
  (`LOCAL_TRACK_VISITS`);
- the record of the track when the ghost was saved, raced against it (`?ghosts=<ghost>,<record>`);
- its rider: how old the account is, its ghosts and records, and its ghosts on the track, the oldest
  first, to see how its time improved. The runs, accounts and times from before these were kept
  show as unknown.

A logged in account reports a ghost of another account with a reason, once (`LOCAL_GHOST_REPORTS`,
20 reports an hour per account): the ghost stays on the leaderboard, and `/reviews/` lists the
reported ghosts, the most reported first, for the admins to dismiss the reports or reject the ghost,
deleting it with them.

The admins are told of what waits for them (`notify.php`): the header of their pages counts the
runs waiting for review and the reported ghosts, on their account menu and in the title of the tab.
With `OPENRIDER_REVIEW_WEBHOOK`, a Discord webhook (Server settings, Integrations, Webhooks) or a
Slack one (`hooks.slack.com`), each run sent to review and each report also posts a message to its
channel, with the link of the page to look at: 10 messages at most in 10 minutes, then a single one
telling that more wait. The message is posted once the request is answered with PHP-FPM, the rider
not waiting for it, and a failure is only logged; the mentions are disabled on Discord.

#### Thumbs up

An account logged in gives a thumb up to the published tracks, the ghosts and the comments of the
others, and takes it back with the same button: `POST /tracks/<id>/thumb/`, `/ghosts/<id>/thumb/` or
`/comments/<id>/thumb/`, with the CSRF token of the session. The button is a form opening its page
again, sent in the background by `public/js/thumbs.js`, which asks for JSON (`{ "THUMBS", "THUMBED"
}`). The accounts see the number of thumbs of their own tracks and ghosts, and everyone the number
of the others, without a button; the ghosts waiting for an admin cannot get any. The thumbs
(`LOCAL_THUMBS`, one per account on each track, ghost or comment) leave with their track, their
ghost, their comment or the account giving them.

#### Comments

An account logged in comments a published track under its leaderboard, or replies to a comment
(`POST /tracks/<id>/comments/`, with `text` and `parent` for a reply, and the CSRF token): 1 to 1000
characters, 20 an hour. The replies stay on one level, a reply to a reply answering its comment.
The track page lists 30 comments a page, the newest first (`?comments=<page>`), each with its
replies, the oldest first, and their thumbs up. Comments are not edited, and only the moderators
and admins delete them, a comment with its replies (`POST /comments/<id>/delete/`, a button under each comment for
them). They leave with their track (`LOCAL_COMMENTS`, `src/db/comments.php`), and an account deleted
leaves its comments without their text, so that the replies to them still read.

#### Moderation

An account deletes its own tracks (with all their ghosts), ghosts (except a verifying run), drafts,
tracks waiting for verification, templates and account (with everything it made), with the buttons
of their pages. The moderators and admins delete those of any account but the templates and the
accounts, and review the suspicious runs; the admins also delete the accounts of the users and
moderators.

#### Settings

`/settings/`, linked from the account menu, changes the password with the current one, logs the
other sessions out (see "Security"), and deletes the account, the button having moved there from
the account page, which only shows it to the admins.

The preferences follow the account from a browser to another (`LOCAL_USER_SETTINGS`,
`src/controllers/settings.php`): the theme of the site (`system`, `light` or `dark`) and the keys
of the game. The game and the theme button keep them in the storage of the browser
(`openrider.controls`, `openrider.theme`) and do not know of the accounts: the layout writes the
preferences of the account to the storage before the page and the game run, and
`public/js/settings-sync.js` sends what changed there (`POST /settings/sync/`), at once for the
theme and for what the account never saved, e.g. the keys bound before registering, and the keys
bound in the game once the page is hidden or left. A value changed in this browser but not yet
saved by the account, e.g. sent with a beacon on leaving a page, is kept by the next page rather
than overwritten (`openrider.synced` keeps what the account is known to have). The site checks
the values: a theme of the three, and key bindings of the format of the game, 8 KB and 64 controls
at most. The settings page also chooses the theme and gives every key its default back. A
suspended account still changes its settings.

An account may also give an e-mail address (`EMAIL` of `LOCAL_USERS`), never shown, with two
choices: receiving digests (`EMAILDIGEST`, stored only: the site sends no e-mail yet, and the
addresses must be confirmed before the first digest), and showing its Gravatar next to its forum
posts (`GRAVATAR`, `site_avatar_url()`): the picture is loaded from gravatar.com, its address
holding the SHA-256 hash of the e-mail address, rated `g`, with a generated pattern for the
addresses without Gravatar. The other accounts show their initial. Nothing is uploaded to the site.

#### Forum

`/forum/` lists the categories, each one its topics, the pinned ones first then by their last
post, 30 a page, and each topic its posts, the oldest first, 20 a page (`?page=` or `last`;
`/forum/posts/<id>/` opens the page of a post). The first post of a topic is its text. The
routes are listed in `site_forum_route()` (`app.php`), the pages in `src/controllers/forum.php`,
the queries in `src/db/forum.php` (`LOCAL_FORUM_*`).

- Everyone reads it. The accounts logged in and not suspended open topics (a title of 3 to 100
  characters), reply, like the posts of the others and report them. An account opens topics 10
  minutes after its creation, a brake on spammers. Only the moderators open topics in a
  category for the staff (Announcements at first), where everyone replies.
- An account edits its own posts, and the title of its topics, without time limit, unless the
  topic is locked. The moderators edit any post, and read the previous versions of the edited
  posts (`LOCAL_FORUM_EDITS`). The authors do not delete their posts: the moderators do, the
  first post of a topic deleting the topic; and they pin, lock (no more replies but theirs) and
  move the topics. The reported posts wait for them on `/reviews/`, counted in the header and
  sent to the webhook, to dismiss or delete. Every action on the content of others is in the
  audit log.
- Posts hold 1 to 10,000 characters of a small part of Markdown (`src/forum-format.php`):
  bold, italic, code and blocks of code, quotes, lists and links (`rel="nofollow ugc"`); no HTML,
  image nor heading. The text is escaped before being formatted, so that no HTML of a post
  reaches the page. A line holding only the address of a track or a ghost of the site shows its
  card, 5 per post. The form previews the post while written, formatted by the site
  (`public/js/forum-editor.js`, `POST /forum/preview/`), and "Quote" fills the reply with a post
  (`?quote=<id>`).
- An account deleted leaves its posts without their text nor previous versions, and its topics
  without account, so that the discussions still read.
- The admins edit, create and delete (once empty) the categories on `/admin/forum/`. The site
  creates Announcements, General, Tracks and Help & Bugs when the forum has no category.

#### Roles and suspensions

Each account has a role (`ROLE` of `LOCAL_USERS`, `site_role()` in `src/auth.php`), each role its
capabilities (`SITE_ROLE_CAPABILITIES`, checked with `site_can()`):

| Role        | Can                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------- |
| `user`      | handle its own content; the default of a new account                                     |
| `moderator` | `moderate`: delete the tracks, ghosts and comments of the others, review the runs        |
| `admin`     | `moderate` and `manage_users`: give the roles, suspend and delete the accounts, read the audit log |

The accounts named in `OPENRIDER_ADMINS` are admins whatever their stored role: they start the
site, and are neither demoted, suspended nor deleted by another admin. On `/admin/users/`, an admin
searches the accounts and gives them a role, or suspends them for 1, 7 or 30 days or for good, with
a reason of 200 characters at most told to the account, and lifts a suspension. No admin changes
its own role or suspends itself, and an admin is demoted before being suspended or deleted.

A suspended account still reads the site, logs in and out and deletes its own account, but posts
nothing: no comment, thumbs up, report, upload, ghost, verification or template; the site answers
403 with the reason (`site_suspended_may_post()` in `app.php` for the pages, and
`site_require_active_api_user()` for the endpoints of the game). A notice above each of its pages
tells until when and why. A suspended moderator or admin loses its capabilities meanwhile.

The roles given, the suspensions, the content of the others deleted and the runs reviewed are
recorded with their account and date in `LOCAL_AUDIT` (`src/db/audit.php`), listed on
`/admin/audit/`, 100 a page, the newest first.

A role is also given from the command line, e.g. to the first moderators, with the database
configured by the environment as for the site (recorded in the audit log by "command line"):

```sh
php backend/local/site/bin/role.php <name> <user|moderator|admin>
php backend/local/site/bin/role.php <name>    # prints its role
```

#### Files

```
site.php                  front controller of the site with Apache, see "Deploying"
local/
├── router.php            router of the built-in server: database, endpoints, then the site
├── sample.sql            sample tracks, ghosts, titles and descriptions
└── site/
    ├── app.php           front controller: routes of the site and static files
    ├── bin/role.php      gives a role to an account from the command line
    ├── src/              accounts, security, database queries, formatting, template rendering
    ├── templates/        layout, pages and partials (track and template cards, game host element, delete button)
    └── public/           static files served under /assets/: css/, js/ and the favicon
```

The sample holds four tracks, each with a ghost finishing it:

| Track | Title              | Bike | Ghost         | Shows                                          |
| ----- | ------------------ | ---- | ------------- | ---------------------------------------------- |
| 1     | First ride         | BMX  | 1, `Rookie`   | A jump, a checkpoint and scenery               |
| 2     | Linked checkpoints | MTB  | 2, `Linker`   | A boost and a pair of linked checkpoints       |
| 3     | Hills              | BMX  | 3, `Climber`  | Hills and a foreground layer                   |
| 4     | Command blocks     | BMX  | 4, `Operator` | Zoom, camera, a door, a bridge, a sliding door |

## Live sessions

Riders racing the same track at the same time, each seeing the others ride, go through the session
server of `server/live`, built with the game as `dist/live-server.cjs`. It keeps the sessions in
memory, without database: the run of each rider, sent whole to the riders joining, and the best run
of each one, verified by replaying it with `dist/verify-ghost.cjs` (built next to it): on the track
downloaded from `db/trackdata/`, or on the endurance track of its seed, the furthest run then
winning, then the fastest at the same distance in whole meters. A session left without rider is
forgotten after 10 minutes. The messages are described in `src/openrider/live/protocol.ts`.

On the site, set up with `OPENRIDER_LIVE_SECRET` (and `OPENRIDER_LIVE_URL` when the server is not at
`/live/` of the site), the "Race live" button of a track page opens a new session, the page
`/tracks/<id>/?live=<session>`: everyone opening its link joins it, as their account or as a guest
of their browser session, the "Live results" tab of the leaderboard listing the best time of each
rider. On the endurance page, the button opens a session on the track ridden, or on a new track:
`/endurance/?seed=<seed>&version=<version>&live=<session>`, its results under the game. The site
gives the game the URL of the server and a token for the rider (`data-live-url` and
`data-live-token`, see `src/live.php` of the site), valid for 12 hours.

The editor pages open editing sessions the same way, for the logged in accounts: "Edit together"
starts one on the track edited, `/create/?collab=<session>` or `/drafts/<id>/?collab=<session>`, and
its link joins it from `/create/?collab=<session>`. The first editor gives the track to the session;
the server keeps it and the edits since, numbered, sends them to the editors joining, and asks an
editor for the whole track again after 1,000 edits. Each editor sees the cursors of the others. The
first editor is the host of the session, the main creator of the track: the only one exporting and
uploading it. The server signs the list of the accounts that edited the track and the host, which
the game sends with its upload (`credits`, see `site_live_credits`), for the site to credit them as
co-authors of the track when the host uploads it (`COLLABORATORS` of `LOCAL_UPLOADS`, then of
`LOCAL_TRACK_DETAILS`), marked as a collab. A draft keeps its co-authors, joined by those of each
session editing it, and the tracks published from it credit them all.

| Variable                   | Setting                                              | Default                  |
| -------------------------- | ---------------------------------------------------- | ------------------------ |
| `OPENRIDER_LIVE_SECRET`    | Secret the site signs the tokens of the riders with  | Required, but `--dev`    |
| `OPENRIDER_LIVE_PORT`      | Port of the server                                   | `8090`                   |
| `OPENRIDER_LIVE_HOST`      | Address of the server                                | `127.0.0.1`              |
| `OPENRIDER_SITE_URL`       | URL of the site the tracks are downloaded from       | `http://localhost:8000/` |
| `OPENRIDER_VERIFY_TIMEOUT` | Time after which a verification gives up, in seconds | `60`                     |

A rider connects over a WebSocket on any path, with the token the site gives them:
`wss://<site>/live/?token=<token>`. The token is `<payload>.<signature>`: the payload is the JSON
`{ "session", "track", "rider", "name", "exp" }` in base64url, the signature its HMAC-SHA256 with
`OPENRIDER_LIVE_SECRET`, in base64url too (see `server/live/token.ts`). `session` is the id of the
session chosen by the site (6 to 64 letters, digits, `-` or `_`), `track` its track: the id of a
published track, or `{ "seed", "version" }` for an endurance track, `rider` the id of the rider in
the session (the account, or a guest; 1 to 40 letters, digits, `-` or `_`), `name` the name shown to
the others (40 characters at most) and `exp` its expiry in seconds since the epoch.

Limits: 8 riders connected at once per session, 500 sessions, messages of 256 KB at most, 30 per
second after a burst of 60, runs of 90,000 inputs and verified runs of 30 minutes at most. The
connections breaking them are closed with the codes of `LIVE_CLOSE_CODES`, and so are those without
a valid token or joining a full session. `GET /health` answers `ok`. An editing session takes no
guest (`rider` not starting with `u`), its token having `"edit"` as track; the whole tracks of its
editors weigh 16 MB at most, and it keeps 20,000 edits at most.

## Deploying

### Sample website

The site is served by Apache with PHP, at the root of a domain (its links start with `/`):

1. Build the game with `npm run build`, which writes `dist/main.js`, `dist/verify-ghost.cjs`,
   `dist/live-server.cjs` and `dist/convert-tracks.cjs` (see "Migrating the tracks").
2. Upload the root of the project, keeping its structure: `.htaccess`, `index.html`,
   `styles.css`, `dist/`, `media/` and `backend/` (without `backend/local/openrider.db`). The
   sources (`src/`, `test/`), `node_modules/` and the other files of the project are not needed.
3. Create the tables of the backend in the database, `db/tables.sql` for PostgreSQL: the site
   adds its own on the first request. Without the local router, no sample data is loaded.
4. Set the environment variables of the configuration: the database, the Node executable when
   `node` is not in the path of the web server, and the first admins (`OPENRIDER_ADMINS`), who
   give the other roles from `/admin/users/`.
5. Serve the site over HTTPS.

`.htaccess`, at the root of the project, sends the pages to `backend/site.php`, the front controller
of the site, and refuses the sources of the site and its local database (`backend/local/`), the
shared helpers of the endpoints, the upload endpoints, the dot files and the other files of the
project (`.md`, `.sql`, `.json`...). The PHP built-in server applies the same rules with
`local/router.php`.

The tables of MySQL are not supported: the queries use `RETURNING` and quoted identifiers.

#### Caching

The pages load the game and their scripts and stylesheets with the time their file changed
(`/dist/main.js?v=<time>`, see `site_asset_url`): each deploy changes their URL, so browsers
download the new files with the next page they open, and keep them until the next deploy
(`Cache-Control: immutable`, by `.htaccess` with `mod_headers` for `dist/`, by the site for
`/assets/`). The pages themselves are never cached, nor are the files without a version, e.g. the
icons the game loads, which browsers check again each time (`no-cache`, answered 304 while they did
not change).

### Live sessions

The session server runs with Node next to the site, e.g. as a systemd service, from the root of the
project uploaded (`dist/live-server.cjs` and `dist/verify-ghost.cjs`):

```ini
[Unit]
Description=OpenRider live sessions
After=network.target

[Service]
WorkingDirectory=/var/www/openrider
ExecStart=/usr/bin/node dist/live-server.cjs
Environment=OPENRIDER_LIVE_SECRET=<a long random secret, the same for the site>
Environment=OPENRIDER_SITE_URL=https://<site>/
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

Apache forwards the WebSockets of `/live/` to it, with `mod_proxy` and `mod_proxy_wstunnel` enabled,
in the configuration of the virtual host of the site (`ProxyPass` is not allowed in `.htaccess`):

```apache
ProxyPass "/live/" "ws://127.0.0.1:8090/"
```

The server only listens on `127.0.0.1`: the riders reach it through Apache, over HTTPS.

Each `npm run build` gives the game and the session server the same version, which the game sends
when it connects (`?version=`): the server refuses the games of another build, e.g. a tab opened
before a deploy, asking the rider to reload the page (close code `4010`). Deploy `dist/` and
restart the server together.

### Migrating the tracks

The tracks saved before the track files are in the original text formats, about five times
larger. `migrate-tracks.php` converts them, from the root of the deployed site, with the
configuration of the site (the database and `OPENRIDER_NODE`) and the converter built with the
game, `dist/convert-tracks.cjs`:

```sh
# 1. Back the database up, e.g. with PostgreSQL:
pg_dump -Fc -f openrider-before-track-files.dump <database>

# 2. Deploy the new build (dist/ and backend/), then from the root of the site, as the user of
#    the web server, with the variables of the configuration:
php backend/migrate-tracks.php --dry-run    # converts and checks every track, writes nothing
php backend/migrate-tracks.php              # converts them

# To go back: pg_restore --clean -d <database> openrider-before-track-files.dump
```

With PostgreSQL, the `CODE` columns of `TRACKS` and `LOCAL_UPLOADS` become `BYTEA` first, which
the new endpoints need: deploy and migrate at once. SQLite stores bytes in its columns as they
are. Each track code becomes a track code and each editor file an editor file, read back and
compared to the original track before it is written, by batches each in a transaction. A track
that cannot be converted keeps its text, which the game and the site still read, and is listed
at the end, the script then exiting with 1. The tracks already converted are skipped: the script
can run again, e.g. for the tracks uploaded during the migration. The ghosts stay valid, the
tracks being the same.

### Game alone

Serve the root of the project (`index.html`, `styles.css`, `dist/`, `media/` and `backend/db/`) with
PHP enabled, with `sample.htaccess` as `.htaccess` instead of the one of the site: it redirects the
`/tracks/<id>/` pages to the game racing the track, and protects the shared helpers of the
endpoints. The upload endpoints then stay open to anyone, without accounts nor checks.
