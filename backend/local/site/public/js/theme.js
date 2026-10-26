/**
 * Theme button of the header: switches between the light and dark themes of the site, the theme
 * of the system by default. The theme picked is kept in the storage of the browser, and set on
 * the root (`data-theme`) by the layout before the page is drawn.
 *
 * The button stays hidden without this script, the site then following the theme of the system.
 */
(() => {
    const STORAGE_KEY = "openrider.theme";
    const button = document.querySelector(".theme-toggle");
    if (!button) {
        return;
    }
    const systemDark = matchMedia("(prefers-color-scheme: dark)");

    /** Whether the page shows the dark theme: the one picked, else the one of the system. */
    function isDark() {
        const theme = document.documentElement.dataset.theme;
        return theme ? theme === "dark" : systemDark.matches;
    }

    function sync() {
        button.setAttribute("aria-pressed", String(isDark()));
    }

    button.addEventListener("click", () => {
        const theme = isDark() ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // Storage blocked: the theme lasts until the page is left
        }
        sync();
    });
    // The system theme changing while the page is open, nothing being picked
    systemDark.addEventListener("change", sync);

    button.hidden = false;
    sync();
})();
