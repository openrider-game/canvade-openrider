/**
 * Leaderboard of the endurance page: shown again once the game saved a run, with the new rank
 * of the account, along with the bar sharing the run above the game. The game dispatches the
 * `openrider:endurance-saved` event on the document (see EnduranceService of the game); the page
 * is downloaded again for them. The share button is handled by `share.js`.
 */
(() => {
    /** Parts of the page shown again, by selector. */
    const PARTS = ['.leaderboard', '.share-slot'];

    document.addEventListener('openrider:endurance-saved', async () => {
        try {
            const response = await fetch(location.href, { credentials: 'same-origin' });
            if (!response.ok) {
                return;
            }
            const page = new DOMParser().parseFromString(await response.text(), 'text/html');
            for (const selector of PARTS) {
                const current = document.querySelector(selector);
                const part = page.querySelector(selector);
                if (current && part) {
                    current.replaceWith(part);
                }
            }
        } catch {
            // Kept as they are, until the page is loaded again
        }
    });
})();
