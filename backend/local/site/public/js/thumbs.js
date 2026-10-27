/**
 * Thumbs up buttons (see `templates/partials/thumbs.php`): their form is sent in the background,
 * the button then showing the number of thumbs and whether the account gives one. Without this
 * script, the form opens the page again.
 */
(() => {
    async function send(form) {
        const button = form.querySelector(".thumbs__button");
        button.disabled = true;
        try {
            const response = await fetch(form.action, {
                method: "POST",
                body: new FormData(form),
                headers: { Accept: "application/json" },
                credentials: "same-origin",
            });
            if (response.status === 401 || response.status === 403) {
                // Logged out or expired form, nothing given: the page asks to log in or tells why
                form.submit();
                return;
            }
            const body = await response.json();
            if (!response.ok) {
                button.title = body.error ?? "Try again later";
                return;
            }

            form.querySelector(".thumbs__count").textContent = String(body.THUMBS);
            button.setAttribute("aria-pressed", String(body.THUMBED));
            button.title = body.THUMBED ? "Take back your like" : "Like";
        } catch {
            button.title = "Try again later";
        } finally {
            button.disabled = false;
        }
    }

    document.addEventListener("submit", (event) => {
        const form = event.target.closest?.("form.thumbs");
        if (form) {
            event.preventDefault();
            send(form);
        }
    });
})();
