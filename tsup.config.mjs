import { defineConfig } from "tsup";

// Both builds run at once: neither cleans dist/, which would delete the files of the other
export default defineConfig([
    // The game, for the browser
    {
        entry: ["src/main.ts"],
        splitting: false,
        sourcemap: true,
        dts: true,
    },
    // The ghost verifier of the backend, for Node: dist/verify-ghost.cjs
    {
        entry: { "verify-ghost": "src/verify/verify-ghost.ts" },
        platform: "node",
        format: "cjs",
        outExtension: () => ({ js: ".cjs" }),
        splitting: false,
        // Bundles canvade too, so that the backend only needs the dist folder
        noExternal: [/.*/],
    },
]);
