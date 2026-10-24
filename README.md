<a name="readme-top"></a>

<!-- PROJECT LOGO -->
<br />
<div align="center">
<h1 align="center">OpenRider</h1>
  <p align="center">
    OpenRider, built on the canvade engine
    <br />
    <br />
    <a href="https://tomiy.online/openrider/">View Demo</a>
    ·
    <a href="https://github.com/tomiy/canvade/issues">Report Bug</a>
    ·
    <a href="https://github.com/tomiy/canvade/issues">Request Feature</a>
    ·
    <a href="https://github.com/tomiy/canvade">Canvade engine</a>
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

The game runs in the `#game` element of any page loading `dist/main.js`, which configures it with
data attributes (see `src/openrider/config/game-config.ts`):

| Attribute         | Setting                                                                    | Default                |
| ----------------- | -------------------------------------------------------------------------- | ---------------------- |
| `data-track-id`   | Published track to race                                                    | `?track=<id>`, or none |
| `data-track-mode` | `edit` to edit the track of `data-track-id` instead of racing it           | Racing it              |
| `data-base-url`   | URL of the folder holding the backend (`backend/db/`) and icons (`media/`) | The folder of the page |
| `data-track-url`  | Page opened after uploading a track, `{id}` being its id                   | `?track={id}`          |

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

### Controls

| Action                                                                               | Keys                                         |
| ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Ride, brake, lean                                                                    | Arrows                                       |
| Turn around                                                                          | `Z`                                          |
| Pause, restart, last checkpoint                                                      | `Space`, `Enter`, `Backspace`                |
| Switch bike, focus a ghost                                                           | `Ctrl+B`, `Ctrl+G`                           |
| Camera, fullscreen                                                                   | `R`, `F`                                     |
| Undo, redo                                                                           | `M`, `N`                                     |
| Solid / scenery brush                                                                | `A`, `S`                                     |
| Solid / scenery line                                                                 | `Q`, `W`                                     |
| Eraser, grid snapping                                                                | `E`, `G`                                     |
| Items, status effects                                                                | `I`, `J`                                     |
| Target, checkpoint, linked checkpoint, boost, gravity, bomb, slow motion, teleporter | `Shift+T`, `C`, `L`, `B`, `G`, `O`, `S`, `W` |
| Reset, invincibility, slippery, no steer, engine off, zero gravity                   | `Shift+R`, `I`, `H`, `N`, `E`, `Z`           |
| Start position                                                                       | `P`                                          |
| Debug                                                                                | `Ctrl+D`                                     |

Letter shortcuts follow the keyboard layout (the undo key is the M key of an AZERTY keyboard too).

- The mouse wheel zooms, the right mouse button drags the camera whatever the tool.
- Holding a line tool key draws lines connected to the previous one on each click.
- Holding the brush or eraser key while scrolling changes its size.
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
src/
├── main.ts           entry point: creates the canvade game, reads ?track=<id>, exposes window.OpenRider
├── states/           canvade states and layers
│   ├── track-fetcher/    downloads the track to race
│   ├── track-parser/     builds the track from its code, then pushes the editing or racing state
│   ├── track/            editing and racing states, track rendering, HUD and interface layers
│   ├── track-generator/  generates the track code to export or upload
│   └── track-upload/     frames the thumbnail and uploads the track
├── openrider/        game logic, independent from the states
│   ├── bike/             bikes, springs, renderers, player and ghost runners
│   ├── config/           settings given by the page hosting the game
│   ├── entity/           points with verlet physics, ragdoll, explosion
│   ├── grid/             spatial grids: physics cells and cached render cells
│   ├── item/             lines and items of the tracks
│   ├── parser/           track code parser and generator, ghost strings
│   ├── thread/           workers of the fast renderer
│   ├── tool/             editor and race tools
│   └── track/            track, layers and renderer
└── verify/           ghost verifier of the backend, replaying the ghosts in Node (dist/verify-ghost.cjs)
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
