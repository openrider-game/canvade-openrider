/**
 * Preferences of the account logged in, kept in the storage of the browser by the theme button
 * and the game: sends what changed there to the account (`POST /settings/sync/`), so that they
 * follow it to its other browsers.
 *
 * The layout wrote the preferences of the account to the storage before the page ran, but those
 * changed in this browser since last sent, and gives them in `window.openriderAccount` (`user`,
 * `theme`, `controls`, null when never saved, and `csrf`). What differs from the account is sent
 * at once: the keys bound before registering, or bound on a page left before they were sent.
 * The later changes are sent once the page is hidden or left, e.g. the keys bound again in the
 * controls panel of the game, and the theme at once. `openrider.synced` keeps the values the
 * account is known to have, for the layout to tell the changes of this browser apart: those
 * saved once answered, not those sent with a beacon, which may come after the next page.
 */
(() => {
    const account = window.openriderAccount;
    if (!account) {
        return;
    }
    const KEYS = { theme: "openrider.theme", controls: "openrider.controls" };

    /** A preference as stored by the browser, undefined when unknown or unreadable. */
    function read(name) {
        try {
            const value = localStorage.getItem(KEYS[name]);
            if (name === "theme") {
                // No theme picked: the one of the system
                return value === "light" || value === "dark" ? value : "system";
            }
            return value ?? undefined;
        } catch {
            return undefined;
        }
    }

    /** Last values the account has, to send only what changed. */
    const synced = { theme: account.theme, controls: account.controls };

    /** Keeps a value the account saved, see the layout. */
    function remember(name, value) {
        try {
            const stored = JSON.parse(localStorage.getItem("openrider.synced") ?? "null");
            const values = stored?.user === account.user ? stored : { user: account.user };
            values[name] = value;
            localStorage.setItem("openrider.synced", JSON.stringify(values));
        } catch {
            // Storage blocked: nothing to tell apart
        }
    }

    /** Sends the preferences changed since, with a beacon when the page is left. */
    function flush(leaving) {
        const body = new FormData();
        body.append("csrf", account.csrf);
        let changed = false;
        for (const name of Object.keys(KEYS)) {
            const value = read(name);
            if (value !== undefined && value !== synced[name]) {
                body.append(name, value);
                synced[name] = value;
                changed = true;
            }
        }
        if (!changed) {
            return;
        }
        if (leaving && navigator.sendBeacon) {
            navigator.sendBeacon("/settings/sync/", body);
        } else {
            fetch("/settings/sync/", { method: "POST", body, keepalive: true })
                .then((response) => {
                    if (response.ok) {
                        for (const [name, value] of body) {
                            if (name in KEYS) {
                                // As stored: no theme stored for the one of the system
                                remember(name, name === "theme" && value === "system" ? null : value);
                            }
                        }
                    }
                })
                .catch(() => {
                    // Offline: sent again from the next page
                });
        }
    }

    flush(false);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            flush(true);
        }
    });
    addEventListener("pagehide", () => flush(true));
    // After theme.js stored the theme picked
    document.querySelector(".theme-toggle")?.addEventListener("click", () => setTimeout(() => flush(false)));
})();
