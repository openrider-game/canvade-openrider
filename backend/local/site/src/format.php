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

/**
 * Whether an uploaded code is an editor file, keeping the layers of the editor but not raceable,
 * rather than a track code, which never starts with `{` (see TrackFormat of the game).
 */
function site_is_editor_file(string $code): bool
{
    return strpos(ltrim($code), '{') === 0;
}

/** Whether an upload is a draft: an editor file saved with its title and description. */
function site_is_saved_draft(array $upload): bool
{
    return $upload['TITLE'] !== null && site_is_editor_file($upload['CODE']);
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

/**
 * Names a ghost string after an account, so that the game shows the name above the ghost: the
 * game writes the strings without name, up to the bike.
 *
 * @param string $name User name, which never holds a `,`.
 */
function site_name_ghost(string $ghostString, string $name): string
{
    $fields = explode(',', $ghostString);
    if (count($fields) < 7) {
        // Not a ghost string of the game, kept as it is
        return $ghostString;
    }

    return implode(',', array_slice($fields, 0, 7)) . ',' . $name;
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

/**
 * Formats a time in physics ticks as hours, minutes and seconds to the hundredth, the hours and
 * minutes only when the time reaches them: `4.54 s`, `2:48.98`, `1:02:48.98`.
 */
function site_duration(int $ticks): string
{
    // Whole hundredths of a second, so that the rounding never shows `60.00` seconds
    $hundredths = intdiv($ticks * 100, SITE_TICKS_PER_SECOND);
    $seconds = intdiv($hundredths, 100) % 60;
    $minutes = intdiv($hundredths, 100 * 60) % 60;
    $hours = intdiv($hundredths, 100 * 60 * 60);
    $fraction = sprintf('%02d', $hundredths % 100);

    if ($hours > 0) {
        return sprintf('%d:%02d:%02d.%s', $hours, $minutes, $seconds, $fraction);
    }
    if ($minutes > 0) {
        return sprintf('%d:%02d.%s', $minutes, $seconds, $fraction);
    }

    return sprintf('%d.%s s', $seconds, $fraction);
}

/** `1 ghost`, `2 ghosts`. */
function site_ghost_count(int $count): string
{
    return $count . ($count === 1 ? ' ghost' : ' ghosts');
}

/** Number of thumbs up, e.g. `3 thumbs up`. */
function site_thumb_count(int $count): string
{
    return $count . ($count === 1 ? ' thumb up' : ' thumbs up');
}
