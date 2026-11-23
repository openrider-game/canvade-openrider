/**
 * Burger menu of the header on narrow screens: the sections of the site in a panel sliding from
 * the left, over a darkened page (see the `.js` rules of site.css, under 820 pixels).
 *
 * The panel behaves as a modal: the focus moves into it and stays there, Escape, the close button
 * or a tap on the page close it, and the page under it does not scroll. Without this script, the
 * sections stay on their own row under the header.
 */
(() => {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.getElementById("site-nav");
    if (!toggle || !nav) {
        return;
    }
    const close = nav.querySelector(".nav-close");
    // Same width as the breakpoint of site.css
    const narrow = matchMedia("(max-width: 820px)");
    const backdrop = document.createElement("div");
    backdrop.className = "nav-backdrop";
    backdrop.hidden = true;
    document.body.append(backdrop);

    function isOpen() {
        return nav.classList.contains("is-open");
    }

    /** Opens or closes the panel, the focus going back to the burger when it closes. */
    function setOpen(open, restoreFocus = true) {
        if (open === isOpen()) {
            return;
        }
        nav.classList.toggle("is-open", open);
        document.documentElement.classList.toggle("nav-open", open);
        backdrop.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        if (open) {
            // After the panel is made visible, its links being unreachable while hidden
            (close ?? nav.querySelector("a"))?.focus();
        } else if (restoreFocus) {
            toggle.focus();
        }
    }

    /** What the focus can reach in the panel, in order. */
    function focusables() {
        return [...nav.querySelectorAll("a[href], button:not([disabled])")].filter(
            (element) => element.offsetParent !== null
        );
    }

    toggle.addEventListener("click", () => setOpen(!isOpen()));
    close?.addEventListener("click", () => setOpen(false));
    backdrop.addEventListener("click", () => setOpen(false));

    document.addEventListener("keydown", (event) => {
        if (!isOpen()) {
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
        } else if (event.key === "Tab") {
            // The focus kept in the panel, from its last element to its first and back
            const elements = focusables();
            if (elements.length === 0) {
                return;
            }
            const first = elements[0];
            const last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            } else if (!nav.contains(document.activeElement)) {
                event.preventDefault();
                first.focus();
            }
        }
    });

    // Widened past the breakpoint, e.g. a phone turned: the sections back in the header
    narrow.addEventListener("change", () => {
        if (!narrow.matches) {
            setOpen(false, false);
        }
    });
    // Back to a page kept by the browser (back button): closed, as left
    window.addEventListener("pageshow", () => setOpen(false, false));
})();
