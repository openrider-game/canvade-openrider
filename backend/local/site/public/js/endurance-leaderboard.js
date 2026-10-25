/**
 * Leaderboard of the endurance page: shown again once the game saved a run, with the new rank
 * of the account. The game dispatches the `openrider:endurance-saved` event on the document (see
 * EnduranceService of the game); the page is downloaded again for its new leaderboard.
 */
(() => {
    document.addEventListener('openrider:endurance-saved', async () => {
        const current = document.querySelector('.leaderboard');
        if (!current) {
            return;
        }

        try {
            const response = await fetch(location.href, { credentials: 'same-origin' });
            const page = new DOMParser().parseFromString(await response.text(), 'text/html');
            const leaderboard = page.querySelector('.leaderboard');
            if (response.ok && leaderboard) {
                current.replaceWith(leaderboard);
            }
        } catch {
            // Kept as it is, until the page is loaded again
        }
    });
})();
