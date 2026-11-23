import type { StatementSubscription } from '@freedi/shared-types';

/**
 * The roster as the views get it (Trello btMVQMM5): a subscription without the
 * student's side. The teacher may see THAT a student chose a side, never WHICH.
 * The side itself lives on `classSides/{uid}--{mainId}`, owner-only; the
 * subscription keeps `sidePickedAt`.
 */
export type RosterSubscription = Omit<StatementSubscription, 'side' | 'camp' | 'decisionSupport'>;

/**
 * Drop side / camp / decisionSupport from a subscription. A doc written by an
 * app version from before the change (until the backfill strips it) still has
 * them: its pick turns into `sidePickedAt` (its lastUpdate) so "chose" stays right.
 */
export function toRosterSubscription(sub: StatementSubscription): RosterSubscription {
	const { side, camp, decisionSupport, ...rest } = sub;
	void decisionSupport;
	const pickedLegacy = camp != null || typeof side === 'number';
	if (typeof rest.sidePickedAt === 'number' || !pickedLegacy) return rest;

	return { ...rest, sidePickedAt: rest.lastUpdate };
}

/** Did this student choose a side? (the ✓ "Chose a side" / ○ "No side yet" marks). */
export function sideChosen(sub: Pick<StatementSubscription, 'sidePickedAt'> | undefined): boolean {
	return typeof sub?.sidePickedAt === 'number';
}
