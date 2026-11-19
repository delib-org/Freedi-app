import { SIDE_MAX, SIDE_MIN, SUPPORT_MAX, SUPPORT_MIN } from '@freedi/shared-types';
import type { Camp, ClassSide, ClassSideValues } from '@freedi/shared-types';

/**
 * What backfillClassSidesPrivate does to one subscription (pure, so it is
 * tested without Firestore). See that script for the whole procedure.
 */

const CAMPS: readonly Camp[] = ['a', 'center', 'b'];
const ID_SEPARATOR = '--';

/** The parts of a subscription the move reads. Timestamps may be ms or a Firestore Timestamp. */
export interface LegacySubscription extends Partial<ClassSideValues> {
	userId?: string;
	statementId?: string;
	sidePickedAt?: number;
	lastUpdate?: unknown;
}

export interface SideMovePlan {
	/** Merged into classSides/{id}; null when the private doc already holds everything. */
	privateWrite: ClassSide | null;
	/** Set on the subscription; null when it has one already or there was no camp. */
	sidePickedAt: number | null;
	/** Legacy values not copied because they were out of range. */
	dropped: number;
}

function toMillis(value: unknown): number | undefined {
	if (typeof value === 'number') return value;
	const timestamp = value as { toMillis?: () => number } | null | undefined;

	return typeof timestamp?.toMillis === 'function' ? timestamp.toMillis() : undefined;
}

function inRange(value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** The legacy values that are valid, and how many were not. */
function validLegacy(sub: LegacySubscription): { values: ClassSideValues; dropped: number } {
	const values: ClassSideValues = {};
	let dropped = 0;
	if (sub.side !== undefined) {
		if (inRange(sub.side, SIDE_MIN, SIDE_MAX)) values.side = sub.side;
		else dropped += 1;
	}
	if (sub.camp !== undefined) {
		if (CAMPS.includes(sub.camp)) values.camp = sub.camp;
		else dropped += 1;
	}
	if (sub.decisionSupport !== undefined) {
		if (inRange(sub.decisionSupport, SUPPORT_MIN, SUPPORT_MAX))
			values.decisionSupport = sub.decisionSupport;
		else dropped += 1;
	}

	return { values, dropped };
}

/** uid and mainId from the doc's own fields, else from its id `{uid}--{mainId}`. */
function identityOf(
	id: string,
	sub: LegacySubscription,
): { userId: string; mainId: string } | null {
	const at = id.indexOf(ID_SEPARATOR);
	const userId = sub.userId ?? (at > 0 ? id.slice(0, at) : undefined);
	const mainId = sub.statementId ?? (at > 0 ? id.slice(at + ID_SEPARATOR.length) : undefined);
	if (!userId || !mainId || id !== `${userId}${ID_SEPARATOR}${mainId}`) return null;

	return { userId, mainId };
}

/**
 * The plan for subscription `id`, or null when its identity is unclear (it is
 * then left alone and counted). `existing` is the student's private doc, if any.
 */
export function planSideMove(
	id: string,
	sub: LegacySubscription,
	existing: Partial<ClassSide> | undefined,
	now: number,
): SideMovePlan | null {
	const identity = identityOf(id, sub);
	if (!identity) return null;
	const { values, dropped } = validLegacy(sub);
	const missing: ClassSideValues = {};
	if (values.side !== undefined && existing?.side === undefined) missing.side = values.side;
	if (values.camp !== undefined && existing?.camp === undefined) missing.camp = values.camp;
	if (values.decisionSupport !== undefined && existing?.decisionSupport === undefined) {
		missing.decisionSupport = values.decisionSupport;
	}
	const privateWrite: ClassSide | null =
		Object.keys(missing).length > 0
			? { ...identity, ...missing, lastUpdate: toMillis(existing?.lastUpdate) ?? now }
			: null;
	const hasCamp = (existing?.camp ?? values.camp) !== undefined;
	const sidePickedAt =
		hasCamp && typeof sub.sidePickedAt !== 'number' ? (toMillis(sub.lastUpdate) ?? now) : null;

	return { privateWrite, sidePickedAt, dropped };
}
