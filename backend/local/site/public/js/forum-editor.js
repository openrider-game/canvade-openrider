/**
 * Preview of a forum post while it is written: the site formats the text as the post will show
 * (`POST /forum/preview/`, see forum-format.php), a moment after the last key, under the text.
 * Without this script, the post is only seen once posted.
 */
(() => {
    /** Delay after the last change before asking for the preview, in milliseconds. */
    const DELAY = 400;

    for (const editor of document.querySelectorAll(".forum-editor")) {
        const text = editor.querySelector(".forum-editor__text");
        const preview = editor.querySelector(".forum-editor__preview");
        const body = preview.querySelector(".forum-post__body");
        const csrf = text.form?.querySelector('input[name="csrf"]')?.value;
        if (!csrf) {
            continue;
        }

        let timer = 0;
        /** Number of the last request, so that a late answer never replaces a newer one. */
        let latest = 0;

        async function refresh() {
            const request = ++latest;
            if (text.value.trim() === "") {
                preview.hidden = true;
                return;
            }
            try {
                const response = await fetch("/forum/preview/", {
                    method: "POST",
                    body: new URLSearchParams({ csrf, text: text.value }),
                });
                const answer = await response.json();
                if (request !== latest || !response.ok) {
                    return;
                }
                // Formatted by the site from the escaped text, see site_forum_format()
                body.innerHTML = answer.html;
                preview.hidden = false;
            } catch {
                // Offline or refused: the preview stays as it was
            }
        }

        text.addEventListener("input", () => {
            clearTimeout(timer);
            timer = setTimeout(refresh, DELAY);
        });
        // A quote or a draft sent back already in the field
        refresh();
    }
})();
