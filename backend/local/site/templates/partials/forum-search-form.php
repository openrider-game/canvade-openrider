<?php
/**
 * Form searching the posts of the forum (see site_forum_search_page()), in a category or the
 * whole forum.
 *
 * @var string  $query    Text searched, empty for none.
 * @var ?array  $category Category searched, null for the whole forum.
 * @var array[] $categories The categories to choose from, none to keep `$category`.
 */

$categories = $categories ?? [];
?>
<form class="forum-search" method="get" action="/forum/search/" role="search">
    <label class="visually-hidden" for="forum-search-q">Search the forum</label>
    <input class="field__input" id="forum-search-q" type="search" name="q" value="<?= h($query ?? '') ?>"
        maxlength="<?= SITE_FORUM_SEARCH_MAX ?>"
        placeholder="<?= $category === null ? 'Search the forum' : 'Search ' . h($category['NAME']) ?>" />
    <?php if ($categories): ?>
        <label class="visually-hidden" for="forum-search-category">Category</label>
        <select class="field__input" id="forum-search-category" name="category">
            <option value="">Whole forum</option>
            <?php foreach ($categories as $option): ?>
                <option value="<?= h($option['SLUG']) ?>"
                    <?= $category !== null && $option['SLUG'] === $category['SLUG'] ? 'selected' : '' ?>>
                    <?= h($option['NAME']) ?>
                </option>
            <?php endforeach; ?>
        </select>
    <?php elseif ($category !== null): ?>
        <input type="hidden" name="category" value="<?= h($category['SLUG']) ?>" />
    <?php endif; ?>
    <button class="button" type="submit">Search</button>
</form>
