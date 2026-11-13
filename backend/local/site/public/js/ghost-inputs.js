/**
 * Inputs of the runs (`templates/partials/ghost-inputs.php`), drawn from their ghost string: a
 * timeline of the presses of each key, zoomable and scrolled sideways, the durations of the
 * presses, and a summary of what the admins look at (see site_analyse_ghost()).
 *
 * The ghost string is `up,down,left,right,turn,time,bike,name`, each key giving the ticks it was
 * pressed and released at, separated with spaces; a key still held at the end has an odd number
 * of them. The game records each turn as a press of a single tick.
 */
(() => {
    const KEYS = ["Up", "Down", "Left", "Right", "Turn"];
    const TICKS_PER_SECOND = 50;
    // Lanes of the timeline, in CSS pixels
    const LANE_HEIGHT = 18;
    const LANE_GAP = 4;
    // Margin on the left of the timeline, for its first mark; the names of the keys are beside it
    const LABEL_WIDTH = 4;
    const AXIS_HEIGHT = 20;
    // Widest timeline, in CSS pixels: past the canvases browsers draw, e.g. a long run zoomed in
    const MAX_WIDTH = 16000;
    // Durations of the histogram, in ticks: each bin up to its bound, the last one beyond
    const BINS = [1, 2, 3, 4, 5, 10, 25, 50, 100];

    /** Presses of a key as `[start, end]` ticks, a key still held ending with the run. */
    function presses(field, end) {
        const ticks = field === "" ? [] : field.split(" ").map(Number);
        const result = [];
        for (let i = 0; i < ticks.length; i += 2) {
            result.push([ticks[i], i + 1 < ticks.length ? ticks[i + 1] : end]);
        }
        return result;
    }

    /** The run of a ghost string: its time in ticks, and the presses of each key. */
    function parse(ghostString) {
        const fields = ghostString.split(",");
        const time = Number(fields[5]) || 0;
        return { time, keys: KEYS.map((_, index) => presses(fields[index] ?? "", time)) };
    }

    /** Most toggles of all the keys within a second, over a sliding window. */
    function mostTogglesPerSecond(run) {
        const toggles = run.keys.flatMap((key) => key.flat()).sort((a, b) => a - b);
        let most = 0;
        for (let last = 0, first = 0; last < toggles.length; last++) {
            while (toggles[last] - toggles[first] >= TICKS_PER_SECOND) {
                first++;
            }
            most = Math.max(most, last - first + 1);
        }
        return most;
    }

    /** A color of the page, from its custom properties. */
    function color(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    /** Seconds between two marks of the axis, about every 80 pixels. */
    function axisStep(pixelsPerSecond) {
        const steps = [0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
        return steps.find((step) => step * pixelsPerSecond >= 80) ?? 1200;
    }

    /** `m:ss` of a number of seconds. */
    function clock(seconds) {
        const minutes = Math.floor(seconds / 60);
        const rest = seconds - minutes * 60;
        const text = Number.isInteger(rest) ? String(rest) : rest.toFixed(1);
        return `${minutes}:${rest < 10 ? "0" : ""}${text}`;
    }

    /** Draws the timeline at the zoom of the slider, the whole run fitting at zoom 1. */
    function drawTimeline(root, run) {
        const scroll = root.querySelector(".ghost-inputs__scroll");
        const canvas = root.querySelector(".ghost-inputs__timeline");
        const zoom = Number(root.querySelector(".ghost-inputs__zoom input").value) || 1;
        const seconds = Math.max(run.time, 1) / TICKS_PER_SECOND;
        // The whole run fitting the scrolled box at zoom 1
        const visible = Math.max(scroll.clientWidth - LABEL_WIDTH - 8, 100);
        const pixelsPerSecond = Math.min(
            (visible / seconds) * zoom,
            (MAX_WIDTH - LABEL_WIDTH - 8) / seconds,
        );
        const width = LABEL_WIDTH + Math.ceil(seconds * pixelsPerSecond) + 8;
        const height = KEYS.length * (LANE_HEIGHT + LANE_GAP) + AXIS_HEIGHT;

        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext("2d");
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        const muted = color("--color-muted");
        const press = color("--color-toggled");
        const tick = color("--color-error");
        const lane = color("--color-surface");
        ctx.clearRect(0, 0, width, height);
        ctx.font = "12px sans-serif";
        ctx.textBaseline = "middle";

        const x = (ticks) => LABEL_WIDTH + (ticks / TICKS_PER_SECOND) * pixelsPerSecond;
        run.keys.forEach((key, index) => {
            const top = index * (LANE_HEIGHT + LANE_GAP);
            ctx.fillStyle = lane;
            ctx.fillRect(LABEL_WIDTH, top, width - LABEL_WIDTH, LANE_HEIGHT);
            for (const [start, end] of key) {
                // The presses of a single tick in their color, every press at least 2 pixels
                // wide so that it shows when zoomed out
                const single = end - start === 1 && KEYS[index] !== "Turn";
                ctx.fillStyle = single ? tick : press;
                ctx.fillRect(x(start), top + 2, Math.max(x(end) - x(start), 2), LANE_HEIGHT - 4);
            }
        });

        // The axis, in minutes and seconds
        const axisTop = KEYS.length * (LANE_HEIGHT + LANE_GAP);
        const step = axisStep(pixelsPerSecond);
        ctx.fillStyle = muted;
        ctx.strokeStyle = muted;
        ctx.textBaseline = "top";
        for (let second = 0; second <= seconds; second += step) {
            const mark = LABEL_WIDTH + second * pixelsPerSecond;
            ctx.beginPath();
            ctx.moveTo(mark + 0.5, axisTop);
            ctx.lineTo(mark + 0.5, axisTop + 4);
            ctx.stroke();
            ctx.fillText(clock(Math.round(second * 10) / 10), mark + 2, axisTop + 5);
        }
    }

    /** Fills the histogram of the durations of the presses, the turns left out. */
    function fillHistogram(root, run) {
        const durations = run.keys.slice(0, 4).flatMap((key) => key.map(([s, e]) => e - s));
        const counts = new Array(BINS.length + 1).fill(0);
        for (const duration of durations) {
            const bin = BINS.findIndex((bound) => duration <= bound);
            counts[bin === -1 ? BINS.length : bin]++;
        }
        const most = Math.max(...counts, 1);
        const body = root.querySelector(".ghost-inputs__histogram tbody");
        body.replaceChildren(
            ...counts.map((count, bin) => {
                const low = bin === 0 ? 1 : BINS[bin - 1] + 1;
                const high = BINS[bin];
                const label =
                    high === undefined
                        ? `over ${BINS[BINS.length - 1] * 20} ms`
                        : low === high
                          ? `${high * 20} ms`
                          : `${low * 20}–${high * 20} ms`;
                const row = document.createElement("tr");
                if (bin === 0) {
                    row.className = "ghost-inputs__single";
                }
                const name = document.createElement("td");
                name.textContent = label;
                const value = document.createElement("td");
                value.textContent = String(count);
                const share = document.createElement("td");
                const bar = document.createElement("span");
                bar.className = "ghost-inputs__bar";
                bar.style.width = `${(100 * count) / most}%`;
                share.append(bar);
                row.append(name, value, share);
                return row;
            }),
        );
        return { presses: durations.length, single: counts[0] };
    }

    /** Draws the inputs of a run, again when the page or its theme changes. */
    function setUp(root) {
        let run;
        try {
            run = parse(root.dataset.ghostString ?? "");
        } catch {
            root.querySelector(".ghost-inputs__summary").textContent = "These inputs cannot be read.";
            return;
        }

        const { presses: count, single } = fillHistogram(root, run);
        const share = count ? Math.round((100 * single) / count) : 0;
        const turns = run.keys[4].length;
        root.querySelector(".ghost-inputs__summary").textContent =
            `${count} presses, ${single} of a single tick (${share}%), ` +
            `at most ${mostTogglesPerSecond(run)} key toggles within a second, ` +
            `${turns} ${turns === 1 ? "turn" : "turns"}.`;

        const draw = () => drawTimeline(root, run);
        draw();
        root.querySelector(".ghost-inputs__zoom input").addEventListener("input", () => {
            // The middle of the view stays in place
            const scroll = root.querySelector(".ghost-inputs__scroll");
            const middle = (scroll.scrollLeft + scroll.clientWidth / 2) / scroll.scrollWidth;
            draw();
            scroll.scrollLeft = middle * scroll.scrollWidth - scroll.clientWidth / 2;
        });
        // Drawn again when the width of the box changes only, never for the timeline it holds
        const scroll = root.querySelector(".ghost-inputs__scroll");
        let width = scroll.clientWidth;
        new ResizeObserver(() => {
            if (scroll.clientWidth !== width) {
                width = scroll.clientWidth;
                draw();
            }
        }).observe(scroll);
        // The colors follow the theme: picked with the button, or by the system
        new MutationObserver(draw).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"],
        });
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
    }

    /** Draws the inputs once shown, e.g. when a review opens them. */
    function setUpWhenShown(root) {
        const details = root.closest("details");
        if (details && !details.open) {
            details.addEventListener("toggle", () => setUpWhenShown(root), { once: true });
            return;
        }
        setUp(root);
    }

    document.querySelectorAll(".ghost-inputs").forEach(setUpWhenShown);
})();
