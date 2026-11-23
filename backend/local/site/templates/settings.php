<?php
/**
 * Settings page of the account logged in: its password and sessions, its preferences following
 * it from a browser to another, and its deletion (see controllers/settings.php).
 *
 * @var array    $user           The account logged in.
 * @var string   $theme          Theme saved, one of SITE_THEMES.
 * @var int      $boundControls  Number of controls of the game bound to another key.
 * @var bool     $controlsSaved  Whether the account saved its keys yet.
 * @var string   $saved          What was just saved: `password`, `sessions` or `preferences`.
 * @var string[] $errors         Errors of the password form, by field (`current`, `password`).
 */

$messages = [
    'password' => 'Password changed. Your other sessions are logged out.',
    'sessions' => 'Your other sessions are logged out.',
    'preferences' => 'Preferences saved.',
];
$csrf = h(site_csrf_token());
?>
<h1>Settings</h1>

<?php if (isset($messages[$saved]) && !$errors): ?>
    <p class="settings__saved" role="status"><?= h($messages[$saved]) ?></p>
<?php endif; ?>

<section class="settings__section" aria-labelledby="settings-password">
    <h2 id="settings-password">Password</h2>
    <form class="account" method="post" action="/settings/password/">
        <input type="hidden" name="csrf" value="<?= $csrf ?>" />
        <!-- For the password managers, which save the new password under this name -->
        <input type="hidden" name="name" autocomplete="username" value="<?= h($user['NAME']) ?>" />

        <div class="field">
            <label class="field__label" for="settings-current">Current password</label>
            <input class="field__input" id="settings-current" name="current" type="password"
                required autocomplete="current-password"
                <?php if (isset($errors['current'])): ?>aria-invalid="true"<?php endif; ?> />
            <?php if (isset($errors['current'])): ?>
                <p class="field__error" role="alert"><?= h($errors['current']) ?></p>
            <?php endif; ?>
        </div>
        <div class="field">
            <label class="field__label" for="settings-new">New password</label>
            <input class="field__input" id="settings-new" name="password" type="password" required
                autocomplete="new-password" minlength="<?= SITE_PASSWORD_MIN_LENGTH ?>"
                <?php if (isset($errors['password'])): ?>aria-invalid="true"<?php endif; ?> />
            <?php if (isset($errors['password'])): ?>
                <p class="field__error" role="alert"><?= h($errors['password']) ?></p>
            <?php endif; ?>
        </div>
        <div class="field">
            <label class="field__label" for="settings-confirmation">New password again</label>
            <input class="field__input" id="settings-confirmation" name="confirmation"
                type="password" required autocomplete="new-password" />
        </div>
        <button class="button" type="submit">Change the password</button>
    </form>

    <form class="settings__inline" method="post" action="/settings/sessions/">
        <input type="hidden" name="csrf" value="<?= $csrf ?>" />
        <button class="button" type="submit">Log out my other sessions</button>
        <span class="muted">e.g. on a computer you left logged in. Changing the password does it too.</span>
    </form>
</section>

<section class="settings__section" aria-labelledby="settings-preferences">
    <h2 id="settings-preferences">Preferences</h2>
    <p class="muted">Saved to your account: they follow you on every browser you log in from.</p>
    <form method="post" action="/settings/preferences/">
        <input type="hidden" name="csrf" value="<?= $csrf ?>" />
        <fieldset class="settings__choices">
            <legend class="field__label">Theme</legend>
            <?php foreach (['system' => 'Same as the system', 'light' => 'Light', 'dark' => 'Dark'] as $value => $label): ?>
                <label>
                    <input type="radio" name="theme" value="<?= $value ?>" <?= $theme === $value ? 'checked' : '' ?> />
                    <?= $label ?>
                </label>
            <?php endforeach; ?>
        </fieldset>
        <button class="button" type="submit">Save</button>
    </form>

    <h3 class="settings__subhead">Keys of the game</h3>
    <p class="muted">
        Changed from the controls panel of the game.
        <?php if (!$controlsSaved): ?>
            Not saved to your account yet: they are once you play or edit a track.
        <?php elseif ($boundControls === 0): ?>
            Every control has its default key.
        <?php else: ?>
            <?= $boundControls ?> <?= $boundControls === 1 ? 'control has' : 'controls have' ?>
            another key than the default.
        <?php endif; ?>
    </p>
    <?php if ($boundControls > 0): ?>
        <form method="post" action="/settings/preferences/"
            onsubmit="return confirm('Give every control of the game its default key back?')">
            <input type="hidden" name="csrf" value="<?= $csrf ?>" />
            <input type="hidden" name="controls" value="reset" />
            <button class="button" type="submit">Default keys</button>
        </form>
    <?php endif; ?>
</section>

<section class="settings__section" aria-labelledby="settings-delete">
    <h2 id="settings-delete">Delete the account</h2>
    <p class="muted">
        Deletes your tracks, ghosts, drafts and templates for good. Your comments stay without their
        text, so that the replies to them still read.
    </p>
    <?php site_render('partials/delete-form', [
        'action' => '/users/' . rawurlencode($user['NAME']) . '/delete/',
        'label' => 'Delete my account',
        'confirm' => 'Delete your account ' . $user['NAME'] . ', with all its tracks, ghosts and drafts?',
    ]); ?>
</section>
