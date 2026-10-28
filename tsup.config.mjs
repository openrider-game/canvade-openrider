import { defineConfig } from "tsup";

// Both builds run at once: neither cleans dist/, which would delete the files of the other
export default defineConfig([
    // The game, for the browser
    {
        entry: ["src/main.ts"],
        // Resolves the browser builds of the dependencies, e.g. fflate without its Node workers
        platform: "browser",
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
        platform: "node",
        format: "cjs",
        outExtension: () => ({ js: ".cjs" }),
        splitting: false,
        // Bundles ws too, without its optional native addons
        noExternal: [/.*/],
        external: ["bufferutil", "utf-8-validate"],
    },
]);
