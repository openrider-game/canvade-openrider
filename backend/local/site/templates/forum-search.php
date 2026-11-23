<?php
/**
 * Search of the forum: the form, then a page of the posts holding every word searched, the newest
 * first, each with its topic, account, time and an extract with the words marked.
 *
 * @var string   $query      Text searched, empty before searching.
 * @var string[] $words      Words searched, see site_forum_search_words().
 * @var ?array   $category   Category searched, null for the whole forum.
 * @var array[]  $categories The categories, to search one.
 * @var array[]  $results    Page of the posts found, see site_search_forum().
 * @var int      $count      Number of posts found.
 * @var int      $page       Page shown, from 1.
 * @var int      $pages      Number of pages.
 * @var ?string  $error      Why nothing was searched.
 */

$params = ['q' => $query] + ($category === null ? [] : ['category' => $category['SLUG']]);
?>
<p class="forum-breadcrumb"><a href="/forum/">Forum</a></p>
<h1>Search the forum</h1>

<?php site_render('partials/forum-search-form', [
    'query' => $query,
    'category' => $category,
    'categories' => $categories,
]); ?>

<?php if ($error !== null): ?>
    <p class="field__error" role="alert"><?= h($error) ?></p>
<?php elseif ($words): ?>
    <p class="muted" role="status">
        <?= $count ?> <?= $count === 1 ? 'post' : 'posts' ?> holding
        <?= implode(' and ', array_map(fn (string $word) => '<mark>' . h($word) . '</mark>', $words)) ?>
        <?= $category === null ? '' : 'in ' . h($category['NAME']) ?>
    </p>

    <ol class="forum-results">
        <?php foreach ($results as $result): ?>
            <li class="forum-results__item">
                <a class="forum-results__title" href="/forum/posts/<?= (int) $result['ID'] ?>/">
                    <?= site_forum_mark($result['TITLE'], $words) ?>
                </a>
                <span class="muted">
                    in <a href="/forum/<?= rawurlencode($result['SLUG']) ?>/"><?= h($result['CATEGORY']) ?></a>,
                    by <?= h($result['AUTHOR'] ?? 'a deleted account') ?>,
                    <?php site_render('partials/forum-time', ['time' => (int) $result['CREATED']]); ?>
                </span>
                <p class="forum-results__extract"><?= site_forum_snippet($result['TEXT'], $words) ?></p>
            </li>
        <?php endforeach; ?>
    </ol>

    <?php if ($pages > 1): ?>
        <nav class="pagination" aria-label="Pages of the results">
            <?php if ($page > 1): ?>
                <a class="button" href="?<?= h(http_build_query($params + ['page' => $page - 1])) ?>">Previous</a>
            <?php endif; ?>
            <span class="muted">Page <?= $page ?> of <?= $pages ?></span>
            <?php if ($page < $pages): ?>
                <a class="button" href="?<?= h(http_build_query($params + ['page' => $page + 1])) ?>">Next</a>
            <?php endif; ?>
        </nav>
    <?php endif; ?>
<?php else: ?>
    <p class="muted">
        Every word has to be in the post, or in the title of its topic for its first post. Put
        "a phrase" between double quotes to search it whole.
    </p>
<?php endif; ?>
