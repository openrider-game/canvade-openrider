<a name="readme-top"></a>

<!-- PROJECT LOGO -->
<br />
<div align="center">
<h1 align="center">OpenRider</h1>
  <p align="center">
    OpenRider, built on the canvade engine
    <br />
    <br />
    <a href="https://openrider.tomiy.online/">View Demo</a>
    ·
    <a href="https://github.com/tomiy/canvade-openrider/issues">Report Bug</a>
    ·
    <a href="https://github.com/tomiy/canvade-openrider/issues">Request Feature</a>
    ·
    <a href="https://github.com/tomiy/canvade-openrider">Canvade engine</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#project-structure">Project Structure</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

OpenRider is a bike riding game where players draw tracks and race on them. This project is a TypeScript rewrite of the [JavaScript game](https://github.com/tomiy/openrider) on top of the [canvade](https://github.com/tomiy/canvade) engine.

- **Physics**: verlet physics at 50 ticks per second, deterministic, so that a recorded ghost
  replays exactly on its track.
- **Items**: targets, checkpoints, linked checkpoints (reaching one also reaches the other, which
  cannot be taken anymore), boosts, gravity changes, bombs, slow motion, teleporters, and status
  effects (reset, invincibility, slippery wheels, no steer, engine off, zero gravity) saved in the
  checkpoints.
- **Editor**: brushes, lines, eraser, items and start position on any number of layers (see
  [Layers](#layers)), with an undo history where a brush stroke or an eraser drag is a single step.
- **Racing**: published tracks raced against published ghosts, the player run being uploaded as a
  ghost at the end of the race.
- **Rendering**: the lines are cached in images per zoom level; the densest areas are rendered in
  Web Workers when the browser supports them, each area keeping its previous image until the new one
  is ready.
- **Display**: the track and the interface keep their size on every screen density, the track
  being drawn at the resolution of the screen; a debug mode shows the physics, the cache and live
  stats.
- **Backend**: PHP endpoints storing the tracks and the ghosts, see
  [backend/README.md](backend/README.md).

This repository is **not endorsed nor approved** by FreeRiderHD, the official successor to the
FreeRider series of games.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->

## Getting Started

### Prerequisites

- NPM
- The canvade repository, cloned next to this one
- VS Code Live Server extension, or any static file server (optional)
- PHP and a PostgreSQL or SQLite database (optional, to publish and race tracks and save ghosts;
  a local server with a sample website and tracks runs with
  `php -S localhost:8000 backend/local/router.php`,
  see [backend/README.md](backend/README.md))

### Installation

1. Build canvade

    ```sh
    cd ../canvade
    npm install
    npm run build
    ```

2. Install the NPM packages, canvade being linked from `../canvade`

    ```sh
    cd ../canvade-openrider
    npm install
    ```

3. Build the game, the output is written to `dist/main.js`

    ```sh
    npm run build
    ```

4. Serve the folder and open `index.html`

Check the types with `npm run typecheck`, and format the code with `npm run format`.

### Tests

Run the tests with `npm test`, and the coverage with `npm run coverage`. The suite covers:

- the physics, with snapshots of recorded rides: a failing physics snapshot means that the
  recorded ghosts would desync
- the track and ghost codes, the items, the tools and the undo history
- the fast renderer, with doubles of the workers
- the states flow, from loading a track to editing, racing, exporting and uploading it, with a
  mocked backend

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->

## Usage

Opening `index.html` edits the default track. Opening `index.html?track=<id>` races the published
track `<id>`, fetched from the backend (see `src/openrider/constants/request.constants.ts`).
Opening `index.html?mode=endurance` starts the endurance mode (see below).

The game runs in the `#game` element of any page loading `dist/main.js`, which configures it with
data attributes (see `src/openrider/config/game-config.ts`):

| Attribute             | Setting                                                                    | Default                |
| --------------------- | -------------------------------------------------------------------------- | ---------------------- |
| `data-track-id`       | Published track to race                                                    | `?track=<id>`, or none |
| `data-track-mode`     | `edit` to edit the track of `data-track-id` instead of racing it           | Racing it              |
| `data-base-url`       | URL of the folder holding the backend (`backend/db/`) and icons (`media/`) | The folder of the page |
| `data-track-url`      | Page opened after uploading a track, `{id}` being its id                   | `?track={id}`          |
| `data-game-mode`      | `endurance` for the endurance mode                                         | `?mode=`, or tracks    |
| `data-seed`           | Seed of the endurance track, to ride a given one again                     | `?seed=`, or a new one |
| `data-version`        | Version of the generator of that track (see below)                         | `?version=`, or latest |
| `data-endurance-save` | `1` to upload the endurance runs on the track of `data-seed` (see below)   | Not uploaded           |
| `data-endurance-best` | Best run uploaded on that track, `<meters>,<ticks>`                        | None                   |
| `data-ghosts`         | Ghosts racing from the start, their ids separated with commas              | `?ghosts=`, or none    |
| `data-live-url`       | Session server of the live races, with `data-live-token` (see below)       | No live race           |
| `data-live-token`     | Token of the player for a session racing the track of `data-track-id`      | No live race           |

```html
<div id="game" data-track-id="3" data-base-url="/" data-track-url="/tracks/{id}/"></div>
<script src="/dist/main.js" defer></script>
```

The page hosting the game can make the player race against published ghosts:

```js
// Adds or removes a ghost, returns false while the track is not parsed yet
window.OpenRider.toggleGhost(ghostId);
// Ids of the ghosts racing, fastest first
window.OpenRider.racingGhosts();
```

With `data-live-url` and `data-live-token`, the player races the track, or rides the endurance
track of `data-seed`, at the same time as the other riders of a live session, each seeing the
others ride; in the editor, the player edits the track with the other editors of the session,
each seeing the edits and the cursors of the others (see `src/openrider/live/`,
`src/openrider/edit/` and the "Live sessions" part of `backend/README.md`). The page follows
the session:

```js
// Connection, riders and best times of the session, null outside of one
window.OpenRider.live();
// Told again whenever they change
document.addEventListener("openrider:live", (event) => console.log(event.detail.results));
```

### Endurance mode

`index.html?mode=endurance` rides an infinite track generated as the bike goes, harder and
harder: the goal is to go as far as possible, then as fast as possible for the same distance.

- The track is generated from a seed, shown at the top right: `?mode=endurance&seed=<seed>` rides
  the same track again, restarting (`Enter`) too, while a page without seed rides a new one.
- It starts flat, then hills and dips, descents and valleys come, then kickers and gaps to jump,
  climbs with boosts, stairs, mud, drops behind a slow motion, platforms, launchers over wide gaps,
  tunnels whose ceiling the rider must not touch, and bombs over the ground. They grow over the
  first 750 m or so, then keep growing slowly until staying alive takes luck as much as skill.
- From about 150 m, zones put the bike under a status effect, written under the run: low gravity
  over wider jumps, turbo, ice, heavy climbs, coasting down with the engine off, floating over a
  gap without gravity, invincibility over brutal obstacles, then no steering and mirrored
  controls. A column of reset items ends each zone.
- There are no checkpoints: the run ends when the rider crashes, explodes on a bomb or falls into
  a gap, even invincible, or rides back more than 40 m from the furthest point reached. The
  distance counts the furthest point reached, 1 m being about the length of a bike.
- A rider stuck, e.g. in a zone without gravity, retires the run with Backspace: it ends as a
  crash, its distance and time saved. Restarting while riding retires the run first. A ghost still
  alive at the end of its run retires there, as the backend replays it, and the riders of a live
  session see the others retire.
- The best run of every track and of each track are kept in the browser (`localStorage`), a run
  beating another by going further in whole meters, or as far and faster.

The generation (`src/openrider/endurance/terrain-generator.ts`) only depends on the seed and the
version of the generator, and a run on a track always plays the same for the same inputs,
whatever the ghosts racing it do: the sections are added in order, long before a bike reaches
them, and taken off only behind every bike riding; a restart starts over from an empty track (see
`src/openrider/endurance/endurance-course.ts`). The ghosts follow the same rules as the player,
so they ride and end their runs as they were ridden, and the backend replays a run from its seed
and version (`dist/verify-ghost.cjs`).

#### Obstacles, zones and versions

Each obstacle and each zone is a small object in its own file of
`src/openrider/endurance/terrain/obstacles/` or `zones/`: its name, its weight at a difficulty,
and its drawing. A version of the generator (`terrain/versions.ts`) lists the obstacles and zones
it picks from, in order. A track is a seed on a version: the same seed gives another track in
another version, and the runs saved on a track replay on its version only. So a released version
never changes, which the test `generator-versions.test.ts` checks with fingerprints of its
tracks. To add or change obstacles or zones:

1. Write the new obstacle or zone in its own file. A changed one is a new object, under a new
   name, the old one staying for the versions using it.
2. Add a version to `terrain/versions.ts` listing every obstacle and zone it keeps plus the new
   ones, as `DRAFT_GENERATOR_VERSION` while trying it: it is ridden with `?version=<version>`,
   and can still change. Its tracks are fingerprinted once it is released.
3. Release it by setting `LATEST_GENERATOR_VERSION` to it (and `DRAFT_GENERATOR_VERSION` to
   `null`): new tracks (a page without seed) use it. Add its fingerprints to the test.
4. Deploy the game, then add the version to `SITE_ENDURANCE_VERSIONS` of the sample website with
   the first day of the tracks of the day generated with it.

The HUD writes the version next to the seed for the tracks of other versions, e.g. `Track 42 (v1)`.

#### Biomes

From version 2, a track goes through biomes: long stretches of 5 to 10 sections
of a same character, e.g. canyons full of gaps or caves full of tunnels, one per file of
`terrain/biomes/`. A biome draws nothing itself: it multiplies the weights of the obstacles and
zones of its version, by name, changes how often zones come, and the size of the obstacles
outside the zones. Every track starts with the first biome of its version (the meadow), then
biomes are picked by weight at the difficulty they start at, never the same twice in a row. Their
order is drawn from the seed apart from the terrain (see `BiomePlan` in `terrain/biome.ts`), and
the first section of a biome is halfway between it and the previous one, its decoration telling
the rider where they are.

Each biome is decorated with scenery lines (`src/openrider/endurance/decoration/`): trees, flowers
and fences in meadows, pines and boulders in mountains, cacti in canyons, crystals and stalactites
in caves, snowy pines and snowmen in the arctic. Each decor is a small class in its own file of
`decoration/decors/` (where it goes, the room it takes, and its drawing), created by name by the
`DecorFactory`; each biome names its decors with their weights, and their spacing, in its own file
of `decoration/biomes/`. The decors stand on ground flat enough, clear of the gaps, items and
distance posts, and fit under the ceilings. Scenery touches no bike, so the
decoration is no part of a version: it is drawn when a section is added to the track, from its
own numbers of the seed, and can change from one release of the game to the next.

A page can rank the runs on a track: with `data-endurance-save="1"`, the game uploads each run on
the track of `data-seed` beating `data-endurance-best` to the `enduranceupload` endpoint of its
base URL (`seed`, `version`, `ghostString`, `time` and `distance`), which answers its `ID` and
`RANK`, shown by the game. It then dispatches the `openrider:endurance-saved` event on the
document, for the page to show its leaderboard again. The ghosts of the runs race with `toggleGhost`, downloaded
from the `ghostdata` endpoint with the `seed` and `version` of the track. The sample website does
it for the track of the day.

### Controls

| Action                                                                               | Keys                                         |
| ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Ride, brake, lean                                                                    | Arrows                                       |
| Turn around                                                                          | `Z`                                          |
| Pause, restart, last checkpoint                                                      | `Space`, `Enter`, `Backspace`                |
| Switch bike, focus a live rider or a ghost in turn                                   | `Ctrl+B`, `Ctrl+G`                           |
| Camera, fullscreen                                                                   | `R`, `F`                                     |
| Controls panel                                                                       | `Ctrl+K`                                     |
| Undo, redo                                                                           | `M`, `N`                                     |
| Lines: brush, line                                                                   | `D`: `A`, `Q`                                |
| Shapes: curve, circle                                                                | `O`: `V`, `C`                                |
| Eraser, grid snapping                                                                | `E`, `G`                                     |
| Items, status effects                                                                | `I`, `J`                                     |
| Target, checkpoint, linked checkpoint, boost, gravity, bomb, slow motion, teleporter | `Shift+T`, `C`, `L`, `B`, `G`, `O`, `S`, `W` |
| Launcher, mud, command block                                                         | `Shift+X`, `D`, `Shift+A`                    |
| Reset, invincibility, slippery, no steer, engine off, zero gravity                   | `Shift+R`, `I`, `H`, `N`, `E`, `Z`           |
| Heavy, low gravity, mirror, turbo                                                    | `Shift+K`, `F`, `M`, `U`                     |
| Start position                                                                       | `P`                                          |
| Debug                                                                                | `Ctrl+D`                                     |

Letter shortcuts follow the keyboard layout (the undo key is the M key of an AZERTY keyboard too).

These are the default keys: the controls panel (the keyboard button, or `Ctrl+K`) binds every
control to another key, riding included, the game being paused while it is open. Clicking the key
of a control waits for the next key pressed, with its modifiers, `Escape` cancelling; a key also
running another control of the same screen is shown in red, as `N` may run Redo in the editor
and New Track in endurance mode but not two tools of the editor. Each control, or all of them, get
their default keys back. The keys are kept in the browser (`localStorage`), the tooltips showing
the current ones (see `src/openrider/controls/`).

On touch screens (phones and tablets), the game switches to a touch mode: from the start when the
main pointer is coarse, and with the last pointer pressed, a finger or a mouse. It enlarges the
interface (buttons and rows of 40 to 44 pixels, wider scrollbars, see `uiMetrics`), hides the
keyboard tools (Controls, Toggle Debug), leaves the toolbar tools that do not fit the canvas height to a `⋯`
button, gathers the buttons of the editor (Import, Export, Upload) in an Actions menu, and starts
with the layers panel closed. Holding a tool shows its name instead of running it, and a finger
dragging a scrolling list scrolls it. It also shows riding buttons at the bottom corners, styled
like the toolbar: lean back and forward at the left, brake and accelerate at the right, and turn
around above them. They are buttons of the interface, each one holding down its player control
while pressed (`Keyboard.press` of canvade), a finger sliding from a button to the next one, so the
runs and ghosts are the same as with a keyboard. Canvade handles the touches: one finger elsewhere
acts as the mouse (the toolbars, drawing, dragging the view with the camera tool), and two fingers
pinch, the game dragging the view and zooming with them. In the editor, the riding buttons show
with the camera tool only, to draw anywhere with the other tools. Where the browser cannot make an
element fullscreen (the iPhone), the fullscreen button makes the game fill the page. Without a
touch, nothing changes: the computers keep the mouse and the keyboard alone (see
`src/openrider/touch/`).

Besides the targets, checkpoints and teleporters, the items act on the bikes touching them:

- **Boost** pushes the bike in its direction on every tick it touches it; **launcher** kicks it
  once, harder, on each pass; **gravity** sets the direction of its gravity; **slow motion** slows
  it until both wheels touch the ground; **mud** slows the wheels going through it; **bomb** makes
  it explode.
- The **status effects** last until a reset item: **invincibility** (no crash nor explosion),
  **slippery** (no grip), **no steer**, **engine off**, **turbo** (a higher top speed), **mirror**
  (left and right leans swapped), and the gravity factors **zero gravity**, **low gravity** (0.4)
  and **heavy** (1.6). The effects on the same factor replace each other: the gravity ones, engine
  off and turbo, no steer and mirror.
- A **command block** runs a command, once per run, when a bike touches it: easing the view to a
  zoom, showing a point of the track for a while, or opening (hiding), showing or moving the lines
  and items fully inside an area of its layer, as doors, bridges or elevators. Placed in steps told
  by its options: the block, then the area to drag, then where the area moves, or the point to show.
  The area depends on the bikes: a door opens for the bikes that touched its block only, so ghosts
  replay their runs whatever the player does, and the checkpoints keep the commands triggered. The
  editor shows what each block acts on, and the hidden objects faded.

- The mouse wheel zooms, the right mouse button drags the camera whatever the tool.
- The drawing tools (brush, line and shapes) draw solid or scenery lines, as chosen in the options
  of any of them, the kind being shared by them all and shown by their icons.
- Holding the line key draws lines connected to the previous one on each click.
- The sizes of the brush and of the eraser are set in their options, with their `−` and `+`
  buttons; the mouse wheel only zooms, with every tool.
- The shape tools draw a shape of connected lines: the curve is dragged from its start to its end,
  then bent through the point clicked; the circle is dragged from its center to its radius. A
  shape is undone at once.
- The options of the current tool are in the drawer at the top of the screen, opened and closed with
  its button: what the eraser removes, the start position reset...
- The editor imports track codes and editor files, exports either of them, and uploads either of
  them with a thumbnail.
- The debug mode (`Ctrl+D`) opens a panel choosing its overlays: the grids, the collision checks,
  the item ids, the bike physics (points, springs and velocities), the state of the cached cell
  images, and stats (frame rate, time, view, track content, workers, player inputs and status
  effects). Its last button pauses the game and runs a single physics tick.

### Layers

The editor draws on any number of layers, listed from the top one in the layers panel at the bottom
right of the editor, like in an image editor:

- **Main** layers collide with the bikes and are drawn under them; **foreground** layers have no
  physics and are drawn over the bikes, half transparent. A track has at least one main layer.
- The lines are drawn on the active layer, highlighted in the panel, and the eraser erases the active
  layer, or every visible layer with its option. Items need physics: they go on the active layer, or
  on the closest main layer under it when the active layer is a foreground layer.
- The panel adds layers above the active one, shows or hides them, moves them up and down, removes
  them, and renames the active layer (type the name, then Enter). Everything but showing or hiding
  can be undone. Past six layers, the list scrolls with the mouse wheel or its scrollbar, and the
  title of the panel slides it down to the title, and back up.
- Hidden layers are only hidden in the editor: they still collide, are still exported, and are
  displayed when racing. Drawing on a hidden layer shows it again.

Two file formats hold the tracks, both read by the editor, the racing mode and the backend:

| Format      | Content                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Track code  | compact text with one main and one foreground layer, the layers of each type being merged into it |
| Editor file | JSON keeping every layer with its name, type and visibility                                       |

Importing a track code gives a "Main" and a "Foreground" layer, which can be exported as an editor
file. An editor file is
`{"format":"openrider-editor","version":1,"bike":"BMX","origin":"0 0","layers":[...]}`, each layer
holding its `name`, `type` (`main` or `foreground`), `visible` flag, and its `solid`, `scenery` and
`items` in the section format of the track codes.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Project Structure

```
.htaccess             Apache rules of the deployed sample website (see backend/README.md)
backend/              PHP backend: endpoints, database tables, local server and sample website
server/               Node command lines of the backend, built in dist/
├── convert/          converter of the tracks to the track files, for the migration (dist/convert-tracks.cjs)
├── live/             session server of the live races (dist/live-server.cjs)
└── verify/           ghost verifier, replaying the ghosts and endurance runs (dist/verify-ghost.cjs)
src/
├── main.ts           entry point: creates the canvade game, reads ?track=<id>, exposes window.OpenRider
├── states/           canvade states and layers
│   ├── track-fetcher/    downloads the track to race
│   ├── track-parser/     builds the track from its code, then pushes the editing or racing state
│   ├── track/            editing and racing states, track rendering, HUD and interface layers
│   ├── track-generator/  generates the track code to export or upload
│   ├── track-upload/     frames the thumbnail and uploads the track
│   └── endurance/        endurance mode: creating its track, riding it, its HUD
├── openrider/        game logic, independent from the states
│   ├── bike/             bikes, springs, renderers, player, ghost and remote runners
│   ├── config/           settings given by the page hosting the game
│   ├── controls/         keys of the controls: default and bound ones, listed by screen
│   ├── endurance/        endurance mode: track generation from a seed, course, runs and records
│   ├── entity/           points with verlet physics, ragdoll, explosion
│   ├── grid/             spatial grids: physics cells and cached render cells
│   ├── edit/             edits of the tracks: data, undone by the history, shared by the editors
│   ├── item/             lines and items of the tracks
│   ├── live/             live races: runs sent and replayed, messages of the session server
│   ├── parser/           track code parser and generator, ghost strings
│   ├── thread/           workers of the fast renderer
│   ├── tool/             editor and race tools
│   ├── touch/            touch screens: the riding buttons of the interface
│   └── track/            track, layers and renderer
└── verify/           replay of the ghosts and endurance runs, for the verifier of server/verify
```

The states share data (track id and code, parsed track) through the canvade `manager.shared` map,
accessed with the typed `Session` wrapper.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->

## Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code documentation

The code follows the documentation conventions of canvade, with [TSDoc](https://tsdoc.org/) comments:

- every exported class, interface, type, enum, function and constant has a `/** ... */` doc comment,
  as well as the members whose behavior is not obvious from their name and types
- a doc comment starts with a summary sentence; tags use the TSDoc form, without types:
  `@param name - Description.`, `@returns Description.`, `@throws Description.`
- inline `//` comments only explain why the code does something, and start with a capital letter
- comments about the order of the physics computations must be kept: changing that order would
  desync the recorded ghosts

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->

## License

Distributed under the GPL-3.0 License. See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

- [Polygon](https://github.com/Plygon) for the HUGE initial help and interpolation math
- [Joel Huff](https://github.com/joelwhuff) for fixing physics (thanks!)
- [Calculus](https://github.com/Calculamatrise) for bug fixes

<p align="right">(<a href="#readme-top">back to top</a>)</p>
