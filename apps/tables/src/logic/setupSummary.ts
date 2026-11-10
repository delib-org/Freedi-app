import type { TableAssignmentMode } from '@freedi/shared-types';

/** What the host's aside says will happen, before anything is opened. */
export interface SetupSummaryInput {
	mode: TableAssignmentMode;
	/** Null while the host has not said how many people to expect. */
	expected: number | null;
	seats: number;
	/** Free mode: how many tables the topics open. */
	freeTables: number;
}

export type SetupSummary =
	| { kind: 'mix'; tables: number; people: number; seats: number }
	| { kind: 'mixUnknown'; seats: number }
	| { kind: 'free'; tables: number; capacity: number; people: number; missing: number }
	| { kind: 'freeUnknown'; tables: number; capacity: number };

export function setupSummary({
	mode,
	expected,
	seats,
	freeTables,
}: SetupSummaryInput): SetupSummary {
	const safeSeats = Math.max(seats, 1);

	if (mode === 'ranked') {
		return expected === null
			? { kind: 'mixUnknown', seats: safeSeats }
			: {
					kind: 'mix',
					tables: Math.ceil(expected / safeSeats),
					people: expected,
					seats: safeSeats,
				};
	}

	const capacity = freeTables * safeSeats;

	return expected === null
		? { kind: 'freeUnknown', tables: freeTables, capacity }
		: {
				kind: 'free',
				tables: freeTables,
				capacity,
				people: expected,
				missing: Math.max(0, expected - capacity),
			};
}
