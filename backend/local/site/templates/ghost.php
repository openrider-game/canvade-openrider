<?php
/**
 * Page of a ghost, to tell a cheated run from a played one: its inputs, the time its rider spent
 * on the track before saving it, the record of the track then, its rider's other runs and level,
 * and the form reporting it to the admins.
 *
 * @var array      $ghost       Ghost, see site_find_ghost_details().
 * @var array|null $record      Record of the track when it was saved, see
 *                              site_find_previous_record(); null for the first ghost.
 * @var string|null $compare    Page racing it against that record, null without one.
 * @var array[]    $history     Ghosts of its rider on the track, oldest first, see
 *                              site_find_rider_track_ghosts().
 * @var array|null $level       Level of its rider, see site_find_rider_level(); null without
 *                              account.
 * @var int|null   $firstOpened When its rider first opened the track, null when unknown.
 * @var array|null $viewer      Logged in account.
 * @var bool       $canReport   Whether the account may report it.
 * @var bool       $reported    Whether the account reported it.
 */

$ghostId = (int) $ghost['ID'];
$trackId = (int) $ghost['TRACKID'];
$rider = $ghost['RIDER'] ?? site_ghost_name($ghost['GHOSTSTRING']);
$created = $ghost['CREATED'] === null ? null : (int) $ghost['CREATED'];
$date = fn (int $time): string => gmdate('Y-m-d', $time);
?>
<h1>
    Ghost of <?= h($rider) ?> on
    <a href="/tracks/<?= $trackId ?>/"><?= h(site_track_title(['ID' => $trackId] + $ghost)) ?></a>
</h1>
<?php if ($ghost['REVIEW'] !== null): ?>
    <p><span class="badge badge--review">checked by an admin</span> <?= h($ghost['REVIEW']) ?></p>
<?php endif; ?>
<?php if (isset($_GET['reported'])): ?>
    <p role="status">Thanks: the admins will look at this ghost.</p>
<?php endif; ?>

<p>
    <a class="button button--accent" href="/tracks/<?= $trackId ?>/?ghosts=<?= $ghostId ?>">
        Race it
    </a>
    <?php if ($compare !== null): ?>
        <a class="button" href="<?= h($compare) ?>">Race it against that record</a>
    <?php endif; ?>
</p>

<dl class="facts">
    <dt>Time</dt>
    <dd><?= site_duration((int) $ghost['TIME']) ?></dd>
    <dt>Saved</dt>
    <dd><?= $created === null ? '<span class="muted">unknown</span>' : h($date($created)) ?></dd>
    <dt>Time on the track before saving it</dt>
    <dd>
        <?php if ($ghost['TRACKSECONDS'] === null): ?>
            <span class="muted">unknown</span>
        <?php else: ?>
            <?= h(site_elapsed((int) $ghost['TRACKSECONDS'])) ?>
            <span class="muted">since the page was first opened in this session, measured by the
                server</span>
        <?php endif; ?>
    </dd>
    <?php if ($firstOpened !== null && $created !== null && $firstOpened <= $created): ?>
        <dt>First opened the track</dt>
        <dd><?= h(site_elapsed($created - $firstOpened)) ?> before saving it</dd>
    <?php endif; ?>
    <dt>Record when it was saved</dt>
    <dd>
        <?php if ($record === null): ?>
            <span class="muted">none: the first ghost of the track</span>
        <?php else: ?>
            <?= site_duration((int) $record['TIME']) ?> by <?= h($record['RIDER'] ?? 'a ghost') ?>
            <?php
            $gain = (int) $record['TIME'] - (int) $ghost['TIME'];
            $percent = round(100 * abs($gain) / max(1, (int) $record['TIME']), 1);
            ?>
            <span class="muted">
                (this ghost is <?= $gain >= 0 ? "$percent% faster" : "$percent% slower" ?>)
            </span>
        <?php endif; ?>
    </dd>
</dl>

<h2>Inputs</h2>
<?php site_render('partials/ghost-inputs', ['ghostString' => $ghost['GHOSTSTRING']]); ?>

<?php if ($level !== null): ?>
    <h2>Rider</h2>
    <dl class="facts">
        <dt>Account</dt>
        <dd>
            <a href="/users/<?= rawurlencode($ghost['RIDER']) ?>/"><?= h($ghost['RIDER']) ?></a>,
            <?php if ($level['CREATED'] === null): ?>
                <span class="muted">created before it was kept</span>
            <?php else: ?>
                created <?= h(site_elapsed(time() - (int) $level['CREATED'])) ?> ago
            <?php endif; ?>
        </dd>
        <dt>Ghosts</dt>
        <dd>
            <?= (int) $level['GHOSTS'] ?> on <?= (int) $level['TRACKS'] ?>
            <?= (int) $level['TRACKS'] === 1 ? 'track' : 'tracks' ?>,
            holding <?= (int) $level['RECORDS'] ?>
            <?= (int) $level['RECORDS'] === 1 ? 'record' : 'records' ?>
        </dd>
    </dl>

    <h3>Ghosts of <?= h($ghost['RIDER']) ?> on this track</h3>
    <div class="table-scroll">
        <table class="leaderboard__table">
            <thead>
                <tr>
                    <th scope="col">Saved</th>
                    <th scope="col" class="leaderboard__time">Time</th>
                    <th scope="col"><span class="visually-hidden">Status</span></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($history as $previous): ?>
                    <?php $current = (int) $previous['ID'] === $ghostId; ?>
                    <tr<?= $current ? ' aria-current="true" class="facts__current"' : '' ?>>
                        <td>
                            <?= $previous['CREATED'] === null
                                ? '<span class="muted">unknown</span>'
                                : h($date((int) $previous['CREATED'])) ?>
                        </td>
                        <td class="leaderboard__time">
                            <a href="/ghosts/<?= (int) $previous['ID'] ?>/">
                                <?= site_duration((int) $previous['TIME']) ?>
                            </a>
                        </td>
                        <td>
                            <?= $current ? 'this ghost' : '' ?>
                            <?php if ($previous['REVIEW'] !== null): ?>
                                <span class="badge badge--review">checked by an admin</span>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>

<?php if ($canReport): ?>
    <h2>Report</h2>
    <form class="report-form" method="post" action="/ghosts/<?= $ghostId ?>/report/">
        <input type="hidden" name="csrf" value="<?= h(site_csrf_token()) ?>" />
        <div class="field">
            <label class="field__label" for="report-reason">What looks wrong with this run?</label>
            <textarea class="field__input" id="report-reason" name="reason" rows="3" required
                maxlength="<?= SITE_REPORT_REASON_MAX ?>"></textarea>
            <p class="field__help muted">
                <?= $reported
                    ? 'You reported it: sending again replaces your reason.'
                    : 'The admins look at the reported ghosts; a report does not hide it.' ?>
            </p>
        </div>
        <button class="button" type="submit">Report to the admins</button>
    </form>
<?php elseif ($viewer === null && $ghost['REVIEW'] === null): ?>
    <p class="muted">
        <a href="/login/?next=<?= rawurlencode("/ghosts/$ghostId/") ?>">Log in</a> to report this
        ghost to the admins.
    </p>
<?php endif; ?>
