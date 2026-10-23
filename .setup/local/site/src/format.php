<?php

/** Formatting of the data of the backend for the pages of the sample website. */

/** Physics ticks per second, the unit of the ghost times. */
const SITE_TICKS_PER_SECOND = 50;

/** Escapes a text for HTML. */
function h(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}

/** Title of a track, or `Track <id>` when it has none. */
function site_track_title(array $track): string
{
    return $track['TITLE'] ?? 'Track ' . $track['ID'];
}

/** Bike of a track, from the next to last `#` section of its track code. */
function site_track_bike(string $trackCode): string
{
    $sections = explode('#', $trackCode);
    return count($sections) >= 7 && $sections[5] !== '' ? $sections[5] : 'BMX';
}

/** Name of the rider of a ghost, the last field of its ghost string. */
function site_ghost_name(string $ghostString): string
{
    return site_ghost_field($ghostString, 7, 'Ghost');
}

/** Bike of a ghost, from its ghost string. */
function site_ghost_bike(string $ghostString): string
{
    return site_ghost_field($ghostString, 6, 'BMX');
}

/** Field of a ghost string, `,` separated, or the default value of the game when empty. */
function site_ghost_field(string $ghostString, int $index, string $default): string
{
    $value = trim(explode(',', $ghostString)[$index] ?? '');
    return $value !== '' ? $value : $default;
}

/** Formats a time in physics ticks as seconds, e.g. `4.54 s`. */
function site_seconds(int $ticks): string
{
    return number_format($ticks / SITE_TICKS_PER_SECOND, 2) . ' s';
}

/** `1 ghost`, `2 ghosts`. */
function site_ghost_count(int $count): string
{
    return $count . ($count === 1 ? ' ghost' : ' ghosts');
}
