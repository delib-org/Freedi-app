/**
 * One indicator for all four winds of the compass: how far a wind is from
 * being answered, and when it is.
 *
 * Three slots and a count say the target from the very first glance — a
 * player who has picked nothing sees "0/3" and knows what the wind wants
 * before touching a chip. Filling slots show the way there; the ✓ and the
 * words the screen has always used, "אפשר להמשיך", say when it is done.
 *
 * Two truths share it. The question winds ask for at least three chips and
 * may be given more; the values wind ranks exactly three. Both count up to the
 * same target, so the track reads the same; past the target the question
 * winds simply stay full and ticked — "5/3" would look like a mistake, and the
 * chips themselves already show what was picked.
 *
 * Words are a whole answer to a question wind at any length, so a wind can be
 * done with no chips at all. Then the track is dropped: a ✓ beside three empty
 * slots reads as an unfinished checklist, and the slots measure chips, which
 * is not what answered the wind. The screen reader is told which it was.
 */
export default function WindProgress({
	count,
	target,
	done,
}: {
	/** Chips picked, or values ranked. */
	count: number;
	/** Chips that make the wind count as answered; values it ranks. */
	target: number;
	/** The wind's own verdict — may be true on words alone, with count below target. */
	done: boolean;
}) {
	const filled = Math.min(count, target);
	const byWords = done && count < target;

	const label = done
		? byWords
			? 'עניתם במילים — אפשר להמשיך'
			: 'אפשר להמשיך'
		: `נבחרו ${count} מתוך ${target}`;

	return (
		<span className={`wind-progress ${done ? 'done' : ''}`} role="status" aria-label={label}>
			{byWords ? null : (
				<span className="wind-progress__track" aria-hidden="true">
					{Array.from({ length: target }, (_, slot) => (
						<span key={slot} className={`wind-progress__slot ${slot < filled ? 'on' : ''}`} />
					))}
				</span>
			)}
			{done ? (
				<span aria-hidden="true">✓ אפשר להמשיך</span>
			) : (
				<strong aria-hidden="true">
					{count}/{target}
				</strong>
			)}
		</span>
	);
}
