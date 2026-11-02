import { defineConfig } from "tsup";

// Version of this build, the same for the game and the session server, which refuses the games of
// another build (see src/openrider/live/build-version.ts)
const define = { __OPENRIDER_BUILD__: JSON.stringify(Date.now().toString(36)) };

// Both builds run at once: neither cleans dist/, which would delete the files of the other
export default defineConfig([
    // The game, for the browser
    {
        entry: ["src/main.ts"],
        define,
        splitting: false,
        sourcemap: true,
        dts: true,
    },
    // The ghost verifier of the backend, for Node: dist/verify-ghost.cjs
    {
        entry: { "verify-ghost": "server/verify/verify-ghost.ts" },
        platform: "node",
        format: "cjs",
        outExtension: () => ({ js: ".cjs" }),
        splitting: false,
        // Bundles canvade too, so that the backend only needs the dist folder
        noExternal: [/.*/],
    },
    // The session server of the live races, for Node: dist/live-server.cjs
    {
        entry: { "live-server": "server/live/main.ts" },
        define,
        platform: "node",
        format: "cjs",
        outExtension: () => ({ js: ".cjs" }),
        splitting: false,
        // Bundles ws too, without its optional native addons
        noExternal: [/.*/],
        external: ["bufferutil", "utf-8-validate"],
    },
]);
