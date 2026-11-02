/** Set by the build (see `tsup.config.mjs`), the same for the game and the session server. */
declare const __OPENRIDER_BUILD__: string | undefined;

/**
 * Version of the build of the game, changing with each `npm run build`: the session server
 * refuses the games of another build (see `LIVE_CLOSE_CODES.OUTDATED`), whose messages or
 * physics could differ from its own. `dev` out of a build, e.g. in the tests.
 */
export const BUILD_VERSION: string =
    typeof __OPENRIDER_BUILD__ === 'string' ? __OPENRIDER_BUILD__ : 'dev';
