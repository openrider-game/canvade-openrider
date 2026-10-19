<a name="readme-top"></a>

<!-- PROJECT LOGO -->
<br />
<div align="center">
<h1 align="center">Canvade OpenRider</h1>
  <p align="center">
    OpenRider, ported on the canvade engine
    <br />
    <br />
    <a href="https://github.com/tomiy/openrider">Original game</a>
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
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

OpenRider is a bike riding game where players draw tracks and race on them, the last link in a long
chain of reboots of FreeRider. This project is a TypeScript rewrite of the
[JavaScript game](https://github.com/tomiy/openrider) on top of the
[canvade](https://github.com/tomiy/canvade) engine, following the structure of the partial
openrider-ts rewrite.

The physics reproduce the original game bit for bit, so that the tracks and the ghosts recorded with
it remain compatible.

A few bugs of the original game were fixed along the way:

- the status items (reset, invincibility, slippery, no steer, engine off) are read from the track code,
  they used to disappear when importing a track (ghosts recorded on such tracks without them may desync)
- the status effects survive restarting from a checkpoint
- exporting a track twice no longer loses its items
- undoing removes a whole brush stroke or eraser drag, and the history is properly truncated
- erasing and restoring teleporters no longer duplicates them
- the fast renderer is always enabled when the browser supports it, and no longer blinks: cells
  keep their previous image while the workers render them
- the Slippery tool shortcut is `Shift+H` (it was shared with the Reset tool)
- clicking with a line tool without moving the mouse no longer adds an empty line to the track

It also adds a few features:

- a zero gravity status item (`Z` in the track codes), cancelling the gravity until a reset item:
  tracks using it cannot be played by the original game
- the interface keeps its size on high density screens
- the PHP backend is shipped with the game, see [.setup/README.md](.setup/README.md)

This repository is **not endorsed nor approved** by FreeRiderHD, the official successor to the
FreeRider series of games.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->

## Getting Started

### Prerequisites

- NPM
- The canvade repository, cloned next to this one
- VS Code Live Server extension, or any static file server (optional)
- PHP and a PostgreSQL or SQLite database (optional, to publish and race tracks and save ghosts,
  see [.setup/README.md](.setup/README.md))

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

- the physics, with snapshots of rides checked tick by tick against the original game: a failing
  physics snapshot means that the recorded ghosts would desync
- the track and ghost codes, the items, the tools and the undo history
- the fast renderer, with doubles of the workers
- the states flow, from loading a track to editing, racing, exporting and uploading it, with a
  mocked backend

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->

## Usage

Opening `index.html` edits the default track. Opening `index.html?track=<id>` races the published
track `<id>`, fetched from the backend (see `src/openrider/constants/request.constants.ts`).

The page hosting the game can make the player race against published ghosts:

```js
window.OpenRider.toggleGhost(ghostId);
```

### Controls

| Action                                                             | Keys                                    |
| ------------------------------------------------------------------ | --------------------------------------- |
| Ride, brake, lean                                                  | Arrows                                  |
| Turn around                                                        | `Z`                                     |
| Pause, restart, last checkpoint                                    | `Space`, `Enter`, `Backspace`           |
| Switch bike, focus a ghost                                         | `Ctrl+B`, `Ctrl+G`                      |
| Camera, fullscreen                                                 | `R`, `F`                                |
| Undo, redo                                                         | `M`, `N`                                |
| Solid / scenery brush                                              | `A`, `S`                                |
| Solid / scenery line                                               | `Q`, `W`                                |
| Eraser, grid snapping                                              | `E`, `G`                                |
| Items, status effects                                              | `I`, `J`                                |
| Target, checkpoint, boost, gravity, bomb, slow motion, teleporter  | `Shift+T`, `C`, `B`, `G`, `O`, `S`, `W` |
| Reset, invincibility, slippery, no steer, engine off, zero gravity | `Shift+R`, `I`, `H`, `N`, `E`, `Z`      |
| Start position                                                     | `P`                                     |
| Debug                                                              | `Ctrl+D`                                |

Letter shortcuts follow the keyboard layout (the undo key is the M key of an AZERTY keyboard too).

- The mouse wheel zooms, the right mouse button drags the camera whatever the tool.
- Holding a line tool key draws lines connected to the previous one on each click.
- Holding the brush or eraser key while scrolling changes its size.
- The options of the current tool are in the drawer at the top of the screen, opened and closed with
  its button: the layer to draw on (the foreground layer is drawn over the bike and has no physics),
  what the eraser removes...
- The editor imports and exports track codes as text files, and uploads them with a thumbnail.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Project Structure

```
.setup/               PHP backend: endpoints, database tables and Apache rules
src/
├── main.ts           entry point: creates the canvade game, reads ?track=<id>, exposes window.OpenRider
├── states/           canvade states and layers
│   ├── track-fetcher/    downloads the track to race
│   ├── track-parser/     builds the track from its code, then pushes the editing or racing state
│   ├── track/            editing and racing states, track rendering, HUD and interface layers
│   ├── track-generator/  generates the track code to export or upload
│   └── track-upload/     frames the thumbnail and uploads the track
└── openrider/        game logic, independent from the states
    ├── bike/             bikes, springs, renderers, player and ghost runners
    ├── entity/           points with verlet physics, ragdoll, explosion
    ├── grid/             spatial grids: physics cells and cached render cells
    ├── item/             lines and items of the tracks
    ├── parser/           track code parser and generator, ghost strings
    ├── thread/           workers of the fast renderer
    ├── tool/             editor and race tools
    └── track/            track, layers and renderer
```

The states share data (track id and code, parsed track) through the canvade `manager.shared` map,
accessed with the typed `Session` wrapper.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->

## Roadmap

- Render the track at the device pixel ratio, so that the track keeps its size on high density
  screens like the interface

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
- comments about the order of the physics computations or the compatibility with the original game
  must be kept: changing that order would desync the recorded ghosts

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->

## License

Distributed under the GPL-3.0 License, like the original game. See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

- [Polygon](https://github.com/Plygon) for the HUGE initial help and interpolation math
- [Joel Huff](https://github.com/joelwhuff) for fixing physics (thanks!)
- [Calculus](https://github.com/Calculamatrise) for bug fixes

<p align="right">(<a href="#readme-top">back to top</a>)</p>
