/**
 * Leaderboards of the track and endurance pages: clicking a rider toggles their ghost in the
 * game, through the page API of the game (`window.OpenRider`, set up by `/dist/main.js`, loaded
 * before).
 *
 * The riders are looked up on each click and update: the endurance page replaces its leaderboard
 * once the game saved a run (see `endurance-leaderboard.js`).
 */
(() => {
    // Delay between two updates of the racing riders, in milliseconds
    const SYNC_INTERVAL = 300;

    if (!document.querySelector('.leaderboard')) {
        return;
    }

    /** Shows which ghosts are racing, the game being the source of truth. */
    function syncRiders() {
        const racing = new Set(window.OpenRider?.racingGhosts() ?? []);
        for (const rider of document.querySelectorAll('.leaderboard__rider')) {
            const isRacing = racing.has(Number(rider.dataset.ghostId));
            rider.setAttribute('aria-pressed', String(isRacing));
        }
    }

    function toggleGhost(rider) {
        const status = document.querySelector('.leaderboard__status');
        if (!window.OpenRider?.toggleGhost(Number(rider.dataset.ghostId))) {
            status.textContent = 'The track is still loading, try again in a moment.';
            return;
        }

        status.textContent = '';
        // The game reads the keyboard while its canvas has the focus: give it back to ride
        document.querySelector('#game canvas')?.focus();
    }

    document.addEventListener('click', (event) => {
        const rider = event.target.closest?.('.leaderboard__rider');
        if (rider) {
            toggleGhost(rider);
        }
    });

    // Ghosts are downloaded before they race, and the game itself can remove them
    setInterval(syncRiders, SYNC_INTERVAL);
})();
