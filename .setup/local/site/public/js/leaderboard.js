/**
 * Leaderboard of the track page: clicking a rider toggles their ghost in the game, through the
 * page API of the game (`window.OpenRider`, set up by `/dist/main.js`, loaded before).
 */
(() => {
    // Delay between two updates of the racing riders, in milliseconds
    const SYNC_INTERVAL = 300;

    const riders = [...document.querySelectorAll('.leaderboard__rider')];
    const status = document.querySelector('.leaderboard__status');
    if (riders.length === 0) {
        return;
    }

    /** Shows which ghosts are racing, the game being the source of truth. */
    function syncRiders() {
        const racing = new Set(window.OpenRider?.racingGhosts() ?? []);
        for (const rider of riders) {
            const isRacing = racing.has(Number(rider.dataset.ghostId));
            rider.setAttribute('aria-pressed', String(isRacing));
        }
    }

    function toggleGhost(rider) {
        if (!window.OpenRider?.toggleGhost(Number(rider.dataset.ghostId))) {
            status.textContent = 'The track is still loading, try again in a moment.';
            return;
        }

        status.textContent = '';
        // The game reads the keyboard while its canvas has the focus: give it back to ride
        document.querySelector('#game canvas')?.focus();
    }

    for (const rider of riders) {
        rider.addEventListener('click', () => toggleGhost(rider));
    }

    // Ghosts are downloaded before they race, and the game itself can remove them
    setInterval(syncRiders, SYNC_INTERVAL);
})();
