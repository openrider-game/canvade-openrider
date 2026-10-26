/**
 * Share buttons of the pages of the game, sending a message challenging to race ghosts with its
 * link: with the share sheet of the touch screens, e.g. phones, else copied to the clipboard, or
 * shown next to the button when the browser refuses.
 *
 * - `[data-share]` links share their own URL, e.g. the run of the account on the endurance page;
 * - `[data-share-race]` links share their URL with the ghosts racing now (`ghosts` parameter,
 *   read from the page API of the game, `window.OpenRider`), e.g. on the track pages.
 *
 * The message is the `data-share-text` of the button, or its `data-share-text-alone` when no
 * ghost races.
 */
(() => {
    /** URL a share button shares, absolute, and whether it races ghosts. */
    function shareUrl(button) {
        const url = new URL(button.getAttribute("href"), location.href);
        let racing = button.hasAttribute("data-share");
        if (button.hasAttribute("data-share-race")) {
            const ghosts = window.OpenRider?.racingGhosts() ?? [];
            racing = ghosts.length > 0;
            if (racing) {
                url.searchParams.set("ghosts", ghosts.join(","));
            }
        }
        // Commas stay readable in the shared link
        return { url: url.href.replace(/%2C/g, ","), racing };
    }

    /** Shares the message and the link of a share button, telling how it went next to it. */
    async function share(button) {
        const { url, racing } = shareUrl(button);
        const { shareText, shareTextAlone } = button.dataset;
        const text = (racing ? shareText : (shareTextAlone ?? shareText)) ?? "";
        const status = button.parentElement?.querySelector(".share__status");
        const tell = (message) => {
            if (status) {
                status.textContent = message;
            }
        };

        // The share sheet on touch screens, as computers paste the message where they want
        if (navigator.share && matchMedia("(pointer: coarse)").matches) {
            try {
                await navigator.share({ title: document.title, text, url });
            } catch {
                // Closed without sharing
            }
            return;
        }
        const message = text ? `${text} ${url}` : url;
        try {
            await navigator.clipboard.writeText(message);
            tell("Copied, paste it to your friends!");
        } catch {
            tell(message);
        }
    }

    // Delegated: the share bar of the endurance page is replaced once a run is saved
    document.addEventListener("click", (event) => {
        const button = event.target.closest?.("[data-share], [data-share-race]");
        if (button) {
            event.preventDefault();
            void share(button);
        }
    });
})();
