<?php

/**
 * Formatting of the forum posts: a small part of Markdown, written to HTML from the escaped text,
 * so that no HTML of a post ever reaches the page as it is.
 *
 * - `**bold**`, `*italic*` and `` `code` ``;
 * - blocks of code between lines of ```` ``` ````, keeping their spaces;
 * - quotes, lines starting with `>` (3 levels at most);
 * - lists, lines starting with `- `, `* ` or `1. `;
 * - links, `[text](https://...)` or bare `http(s)://` addresses, as `rel="nofollow ugc"`;
 * - a line holding only the address of a track or a ghost of the site: its card, 5 per post at
 *   most, the others staying links (see site_forum_embed_ids()).
 *
 * Paragraphs are separated by empty lines, and a line break stays a line break. There is no raw
 * HTML, no image and no heading.
 */

/** Cards of tracks and ghosts shown in a post at most. */
const SITE_FORUM_MAX_EMBEDS = 5;

/** Levels of quotes in quotes at most, the deeper ones shown as text. */
const SITE_FORUM_MAX_QUOTE_DEPTH = 3;

/**
 * Pattern of a line holding only the address of a track or a ghost of the site: the kind
 * (`tracks` or `ghosts`) and the id.
 */
function site_forum_embed_pattern(): string
{
    $host = preg_quote($_SERVER['HTTP_HOST'] ?? 'localhost', '#');
    return "#^https?://$host/(tracks|ghosts)/([0-9]{1,10})/?(?:[?\\#]\\S*)?$#";
}

/**
 * Ids of the tracks and ghosts some posts show as cards, to read them at once (see
 * site_find_forum_embeds()).
 *
 * @param string[] $texts
 * @return array{0: int[], 1: int[]} The track ids, and the ghost ids.
 */
function site_forum_embed_ids(array $texts): array
{
    $ids = ['tracks' => [], 'ghosts' => []];
    $pattern = site_forum_embed_pattern();
    foreach ($texts as $text) {
        foreach (preg_split('/\R/u', $text) ?: [] as $line) {
            if (preg_match($pattern, trim($line), $match)) {
                $ids[$match[1]][(int) $match[2]] = true;
            }
        }
    }
    return [array_keys($ids['tracks']), array_keys($ids['ghosts'])];
}

/**
 * HTML of a post.
 *
 * @param array $embeds Tracks and ghosts linked, see site_find_forum_embeds(); those missing stay
 *                      links, e.g. a ghost waiting for a moderator.
 */
function site_forum_format(string $text, array $embeds = ['tracks' => [], 'ghosts' => []]): string
{
    // Invalid UTF-8 would make the patterns fail: its bytes become replacement characters
    if (!mb_check_encoding($text, 'UTF-8')) {
        $text = mb_convert_encoding($text, 'UTF-8', 'UTF-8');
    }
    $lines = preg_split('/\R/u', $text) ?: [];
    $cards = 0;
    return site_forum_blocks($lines, $embeds, $cards, 0);
}

/**
 * HTML of lines, block by block.
 *
 * @param string[] $lines
 * @param int      $cards Cards shown so far in the post.
 * @param int      $depth Level of quote the lines are in.
 */
function site_forum_blocks(array $lines, array $embeds, int &$cards, int $depth): string
{
    $html = [];
    $count = count($lines);
    $embedPattern = site_forum_embed_pattern();

    for ($i = 0; $i < $count;) {
        $line = $lines[$i];
        $trimmed = trim($line);

        if ($trimmed === '') {
            $i++;
        } elseif (strpos($trimmed, '```') === 0) {
            // Code until the closing fence, or the end of the post
            $code = [];
            for ($i++; $i < $count && strpos(trim($lines[$i]), '```') !== 0; $i++) {
                $code[] = $lines[$i];
            }
            $i++;
            $html[] = '<pre><code>' . h(implode("\n", $code)) . '</code></pre>';
        } elseif ($trimmed[0] === '>' && $depth < SITE_FORUM_MAX_QUOTE_DEPTH) {
            $quoted = [];
            for (; $i < $count && preg_match('/^\s*>\s?(.*)$/su', $lines[$i], $match); $i++) {
                $quoted[] = $match[1];
            }
            $html[] = '<blockquote>' . site_forum_blocks($quoted, $embeds, $cards, $depth + 1) . '</blockquote>';
        } elseif (preg_match('/^\s*(?:[-*]|([0-9]{1,3})[.)])\s+/u', $line, $match)) {
            $ordered = isset($match[1]) && $match[1] !== '';
            $pattern = $ordered ? '/^\s*[0-9]{1,3}[.)]\s+(.*)$/su' : '/^\s*[-*]\s+(.*)$/su';
            $items = [];
            for (; $i < $count && preg_match($pattern, $lines[$i], $item); $i++) {
                $items[] = '<li>' . site_forum_inline($item[1]) . '</li>';
            }
            $tag = $ordered ? 'ol' : 'ul';
            $html[] = "<$tag>" . implode('', $items) . "</$tag>";
        } elseif (
            $depth === 0
            && $cards < SITE_FORUM_MAX_EMBEDS
            && preg_match($embedPattern, $trimmed, $match)
            && isset($embeds[$match[1]][(int) $match[2]])
        ) {
            $cards++;
            $html[] = site_forum_card($match[1], $embeds[$match[1]][(int) $match[2]]);
            $i++;
        } else {
            // A paragraph: the lines until an empty one or another block
            $paragraph = [];
            for (; $i < $count; $i++) {
                $next = trim($lines[$i]);
                $startsBlock = $next === '' || strpos($next, '```') === 0
                    || ($next[0] === '>' && $depth < SITE_FORUM_MAX_QUOTE_DEPTH)
                    || preg_match('/^(?:[-*]|[0-9]{1,3}[.)])\s+/u', $next)
                    || ($depth === 0 && preg_match($embedPattern, $next));
                if ($startsBlock && $paragraph) {
                    break;
                }
                $paragraph[] = site_forum_inline($lines[$i]);
                if ($startsBlock) {
                    // A block that cannot be one here, e.g. a card past the limit: a line
                    $i++;
                    break;
                }
            }
            $html[] = '<p>' . implode('<br />', $paragraph) . '</p>';
        }
    }
    return implode("\n", $html);
}

/** HTML of a line: its code, links, bold and italic. */
function site_forum_inline(string $text): string
{
    $pattern = '/(`[^`\n]+`)|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s()<>]{1,2000})\)|(https?:\/\/[^\s<>"]{1,2000})/u';
    if (!preg_match_all($pattern, $text, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
        return site_forum_emphasis(h($text));
    }

    $html = '';
    $offset = 0;
    foreach ($matches as $match) {
        [$whole, $start] = $match[0];
        $html .= site_forum_emphasis(h(substr($text, $offset, $start - $offset)));
        $offset = $start + strlen($whole);

        if (($match[1][0] ?? '') !== '') {
            $html .= '<code>' . h(substr($whole, 1, -1)) . '</code>';
        } elseif (($match[2][0] ?? '') !== '') {
            $html .= site_forum_link($match[3][0], site_forum_emphasis(h($match[2][0])));
        } else {
            // The punctuation ending a sentence is not part of the address
            $url = rtrim($whole, '.,;:!?)\'"');
            $html .= site_forum_link($url, h($url)) . h(substr($whole, strlen($url)));
        }
    }
    return $html . site_forum_emphasis(h(substr($text, $offset)));
}

/** A link of a post, not vouched for by the site. */
function site_forum_link(string $url, string $html): string
{
    return '<a href="' . h($url) . '" rel="nofollow ugc noopener">' . $html . '</a>';
}

/** Bold and italic of escaped text. */
function site_forum_emphasis(string $html): string
{
    $html = preg_replace('/\*\*(?=\S)(.+?)(?<=\S)\*\*/u', '<strong>$1</strong>', $html);
    return preg_replace('/(?<![*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![*\w])/u', '<em>$1</em>', $html);
}

/**
 * Card of a track or a ghost linked by a post.
 *
 * @param string $kind `tracks` or `ghosts`.
 */
function site_forum_card(string $kind, array $subject): string
{
    $id = (int) $subject['ID'];
    if ($kind === 'tracks') {
        return '<a class="forum-embed" href="/tracks/' . $id . '/">'
            . '<span class="forum-embed__kind">Track</span> '
            . '<strong>' . h(site_track_title($subject)) . '</strong>'
            . ($subject['AUTHOR'] === null ? '' : ' <span class="muted">by ' . h($subject['AUTHOR']) . '</span>')
            . '</a>';
    }
    return '<a class="forum-embed" href="/ghosts/' . $id . '/">'
        . '<span class="forum-embed__kind">Ghost</span> '
        . '<strong>' . h($subject['RIDER'] ?? 'Ghost') . '</strong>'
        . ' <span class="muted">on ' . h(site_track_title(['ID' => $subject['TRACKID']] + $subject))
        . ' &middot; ' . site_duration((int) $subject['TIME']) . '</span>'
        . '</a>';
}

/** Words of a search at most. */
const SITE_FORUM_SEARCH_WORDS = 6;

/** Characters of the extract of a post found by a search. */
const SITE_FORUM_SNIPPET_LENGTH = 240;

/**
 * Words of a search, in lowercase: the words separated with spaces, or "phrases" between double
 * quotes, of 2 characters or more, each once, SITE_FORUM_SEARCH_WORDS at most.
 *
 * @return string[]
 */
function site_forum_search_words(string $query): array
{
    preg_match_all('/"([^"]*)"|(\S+)/u', $query, $matches, PREG_SET_ORDER);
    $words = [];
    foreach ($matches as $match) {
        // A word, else a phrase, its spaces made single; a quote left open is no part of a word
        $word = ($match[2] ?? '') !== '' ? trim($match[2], '"') : $match[1];
        $word = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $word)), 'UTF-8');
        if (mb_strlen($word, 'UTF-8') >= 2) {
            $words[$word] = true;
        }
    }
    return array_slice(array_keys($words), 0, SITE_FORUM_SEARCH_WORDS);
}

/**
 * HTML of the extract of a post found by a search: its text on one line around the first word
 * found, the words searched marked (`<mark>`), escaped as the rest.
 *
 * @param string[] $words See site_forum_search_words().
 */
function site_forum_snippet(string $text, array $words): string
{
    // The text read, without the marks of the formatting: the quote marks, the fences of the code
    // blocks, the bold and code marks, and the addresses of the links named
    $plain = preg_replace(
        ['/^[ \t]*(?:>[ \t]?)+/mu', '/^[ \t]*```.*$/mu', '/\*\*|`/u', '/\[([^\]\n]+)\]\(https?:[^)\s]+\)/u'],
        ['', '', '', '$1'],
        $text
    );
    $plain = trim(preg_replace('/\s+/u', ' ', $plain));
    $first = null;
    foreach ($words as $word) {
        $position = mb_stripos($plain, $word, 0, 'UTF-8');
        if ($position !== false && ($first === null || $position < $first)) {
            $first = $position;
        }
    }
    // Some text before the first word, else the start of the post, e.g. found by its title
    $start = max(0, ($first ?? 0) - 60);
    $length = mb_strlen($plain, 'UTF-8');
    $extract = mb_substr($plain, $start, SITE_FORUM_SNIPPET_LENGTH, 'UTF-8');

    return ($start > 0 ? '&hellip;' : '') . site_forum_mark($extract, $words)
        . ($start + SITE_FORUM_SNIPPET_LENGTH < $length ? '&hellip;' : '');
}

/**
 * HTML of a text, escaped, with the words searched marked (`<mark>`), whatever their case.
 *
 * @param string[] $words See site_forum_search_words().
 */
function site_forum_mark(string $text, array $words): string
{
    if (!$words) {
        return h($text);
    }
    // The longest first, so that a word holding another is marked whole
    usort($words, fn (string $a, string $b) => mb_strlen($b, 'UTF-8') <=> mb_strlen($a, 'UTF-8'));
    $pattern = '/(' . implode('|', array_map(fn (string $word) => preg_quote($word, '/'), $words)) . ')/iu';
    $parts = preg_split($pattern, $text, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$text];
    $html = '';
    foreach ($parts as $index => $part) {
        // The words found are at the odd indexes, between the rest
        $html .= $index % 2 === 1 ? '<mark>' . h($part) . '</mark>' : h($part);
    }
    return $html;
}
