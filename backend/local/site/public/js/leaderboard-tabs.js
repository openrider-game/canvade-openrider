/**
 * Leaderboard of the track page: its tabs, the top riders and the ghosts of the account, and the
 * other ghosts of each top rider, folded under their best one.
 *
 * Without this script, both lists show in full: it shows the tabs, hides the panel not selected
 * and folds the other ghosts.
 */
(() => {
    const tabs = [...document.querySelectorAll('.leaderboard [role="tab"]')];
    const tablist = document.querySelector('.leaderboard [role="tablist"]');

    /** Selects a tab, showing its panel only. */
    function select(selected, focus) {
        for (const tab of tabs) {
            const isSelected = tab === selected;
            tab.setAttribute("aria-selected", String(isSelected));
            // Only the selected tab is reached with Tab, the arrows moving between them
            tab.tabIndex = isSelected ? 0 : -1;
            document.getElementById(tab.getAttribute("aria-controls")).hidden = !isSelected;
        }
        if (focus) {
            selected.focus();
        }
    }

    if (tablist && tabs.length > 0) {
        tablist.hidden = false;
        // The headings repeat the tabs, needed without the script only
        for (const heading of document.querySelectorAll(".leaderboard .tabs__heading")) {
            heading.hidden = true;
        }

        for (const [index, tab] of tabs.entries()) {
            tab.addEventListener("click", () => select(tab, false));
            tab.addEventListener("keydown", (event) => {
                const last = tabs.length - 1;
                const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -index, End: last - index };
                const move = moves[event.key];
                if (move !== undefined) {
                    event.preventDefault();
                    select(tabs[(index + move + tabs.length) % tabs.length], true);
                }
            });
        }
        select(tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0], false);
    }

    /** Shows or hides the other ghosts of a top rider. */
    function fold(button, expanded) {
        button.setAttribute("aria-expanded", String(expanded));
        const rows = document.querySelectorAll(
            `.leaderboard__other[data-group="${button.dataset.group}"]`,
        );
        for (const row of rows) {
            row.hidden = !expanded;
        }
    }

    for (const button of document.querySelectorAll(".leaderboard__more")) {
        button.hidden = false;
        fold(button, false);
        button.addEventListener("click", () =>
            fold(button, button.getAttribute("aria-expanded") !== "true"),
        );
    }
})();
