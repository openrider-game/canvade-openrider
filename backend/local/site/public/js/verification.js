/**
 * Verification page: reloads the page once the verification of the track changes, e.g. when the
 * verifier saves their run in the game, which does not tell the page itself.
 */
(() => {
    // Delay between two checks of the verification, in milliseconds
    const POLL_INTERVAL = 3000;

    const section = document.querySelector('[data-verification-id]');
    if (!section) {
        return;
    }
    const { verificationId, verificationState } = section.dataset;

    async function checkState() {
        try {
            const response = await fetch(`/verify/${verificationId}/status/`);
            // Gone: published or deleted meanwhile, the page tells which
            const state = response.ok ? (await response.json()).state : null;
            if (state !== verificationState) {
                location.reload();
                return;
            }
        } catch {
            // Offline for a moment: tries again later
        }
        setTimeout(checkState, POLL_INTERVAL);
    }

    // Only the runs waiting for an admin or the verifier change by themselves
    if (verificationState !== 'verified') {
        setTimeout(checkState, POLL_INTERVAL);
    }
})();
