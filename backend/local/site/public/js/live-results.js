/**
 * Live results of the track and endurance pages, in a live session: the best run of each rider
 * of the session (a time, or a distance and a time in endurance), and how the connection goes. The game tells them with the `openrider:live` event on
 * the document, and its page API (`window.OpenRider.live()`) for the state before this script.
 */
(() => {
    const panel = document.querySelector(".live-results");
    if (!panel) {
        return;
    }
    const status = panel.querySelector(".live-results__status");
    const table = panel.querySelector("table");
    const body = table.querySelector("tbody");

    /** Physics ticks per second of the game. */
    const TICKS_PER_SECOND = 50;

    /** A time in ticks as the leaderboard shows them: `4.24 s`, `1:02.30`. */
    function duration(ticks) {
        const hundredths = Math.floor((ticks * 100) / TICKS_PER_SECOND);
        const fraction = String(hundredths % 100).padStart(2, "0");
        const seconds = Math.floor(hundredths / 100) % 60;
        const minutes = Math.floor(hundredths / 6000);
        return minutes > 0
            ? `${minutes}:${String(seconds).padStart(2, "0")}.${fraction}`
            : `${seconds}.${fraction} s`;
    }

    function cell(text, className) {
        const td = document.createElement("td");
        td.textContent = text;
        if (className) {
            td.className = className;
        }
        return td;
    }

    /** Shows the state of the session, see `LiveState` of the game. */
    function show(live) {
        if (!live) {
            return;
        }
        const riding = live.results.filter((result) => result.riding).length;
        status.textContent =
            live.state === "open"
                ? `${riding} ${riding === 1 ? "rider" : "riders"} in the session.`
                : live.message;

        body.replaceChildren(
            ...live.results.map((result, index) => {
                const row = document.createElement("tr");
                const you = result.id === live.you?.id;
                const name = you ? `${result.name} (you)` : result.name;
                const retired = result.retired ? " (retired)" : "";
                const best =
                    result.distance !== null
                        ? `${result.distance} m in ${duration(result.best)}${retired}`
                        : duration(result.best);
                const time = result.best !== null ? best : result.riding ? "Riding" : "Left";
                row.append(
                    cell(result.best !== null ? String(index + 1) : ""),
                    cell(name),
                    cell(time, `leaderboard__time${result.best === null ? " muted" : ""}`),
                );
                if (you) {
                    row.className = "leaderboard__mine";
                }
                return row;
            }),
        );
        table.hidden = live.results.length === 0;
    }

    document.addEventListener("openrider:live", (event) => show(event.detail));
    show(window.OpenRider?.live?.());
})();
