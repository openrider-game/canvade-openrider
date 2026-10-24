<?php
/**
 * Account page: the form creating an account, or logging in. Both keep the `next` page of the
 * URL, opened once done.
 *
 * @var string   $form   `register` or `login`.
 * @var string   $name   Posted user name, empty before posting.
 * @var string[] $errors Error messages by field (`name`, `password`), or of the whole `form`.
 */

$register = $form === 'register';
$query = isset($_GET['next']) ? '?next=' . rawurlencode(site_next_page()) : '';
?>
<h1><?= $register ? 'Register' : 'Log in' ?></h1>

<div class="account">
    <?php if (isset($errors['form'])): ?>
        <p class="field__error" role="alert"><?= h($errors['form']) ?></p>
    <?php endif; ?>

    <form method="post" action="/<?= $form ?>/<?= h($query) ?>">
        <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />

        <div class="field">
            <label class="field__label" for="account-name">User name</label>
            <input class="field__input" id="account-name" name="name" type="text" required
                autocomplete="username" value="<?= h($name) ?>"
                <?php if ($register): ?>
                    pattern="[A-Za-z0-9_\-]{3,20}" maxlength="20"
                    aria-describedby="account-name-help"
                <?php endif; ?>
                <?php if (isset($errors['name'])): ?>aria-invalid="true"<?php endif; ?> />
            <?php if ($register): ?>
                <p class="field__help muted" id="account-name-help">
                    3 to 20 letters, digits, "_" or "-": shown on your tracks and ghosts.
                </p>
            <?php endif; ?>
            <?php if (isset($errors['name'])): ?>
                <p class="field__error"><?= h($errors['name']) ?></p>
            <?php endif; ?>
        </div>

        <div class="field">
            <label class="field__label" for="account-password">Password</label>
            <input class="field__input" id="account-password" name="password" type="password"
                required autocomplete="<?= $register ? 'new-password' : 'current-password' ?>"
                <?php if ($register): ?>minlength="<?= SITE_PASSWORD_MIN_LENGTH ?>"<?php endif; ?>
                <?php if (isset($errors['password'])): ?>aria-invalid="true"<?php endif; ?> />
            <?php if (isset($errors['password'])): ?>
                <p class="field__error"><?= h($errors['password']) ?></p>
            <?php endif; ?>
        </div>

        <?php if ($register): ?>
            <div class="field">
                <label class="field__label" for="account-confirmation">Password again</label>
                <input class="field__input" id="account-confirmation" name="confirmation"
                    type="password" required autocomplete="new-password" />
            </div>
        <?php endif; ?>

        <button class="button" type="submit"><?= $register ? 'Register' : 'Log in' ?></button>
    </form>

    <p class="muted">
        <?php if ($register): ?>
            Already registered? <a href="/login/<?= h($query) ?>">Log in</a>.
        <?php else: ?>
            No account yet? <a href="/register/<?= h($query) ?>">Register</a>.
        <?php endif; ?>
    </p>
</div>
