import { collection, doc, orderBy, query, where } from 'firebase/firestore';
import {
	Collections,
	type AgoraClass,
	type AgoraClassAggregate,
	type AgoraSchool,
} from '@freedi/shared-types';
import { db } from '@/firebase';
import { useCollection, useDoc, type SnapshotState } from './hooks';

/**
 * Sys-admin reads over the Agora classroom hierarchy. Direct Firestore
 * subscriptions, exactly as AdminOrgs reads organizations: the rules grant
 * every one of these to `usersV2.{uid}.systemAdmin`, the aggregate docs make
 * each query O(rows shown), and onSnapshot keeps the dashboard live for free.
 *
 * Guarded queries: pass `enabled=false` until the admin flag has arrived, so
 * a non-admin (or a not-yet-loaded admin) never fires a denied listen.
 */

export function useAgoraSchools(enabled: boolean): SnapshotState<AgoraSchool[]> {
	return useCollection<AgoraSchool>(
		enabled ? query(collection(db, Collections.agoraSchools), orderBy('name')) : null,
		'agoraSchools:all',
	);
}

export function useAgoraSchool(
	schoolId: string | undefined,
	enabled: boolean,
): SnapshotState<AgoraSchool | null> {
	return useDoc<AgoraSchool>(
		enabled && schoolId ? doc(db, Collections.agoraSchools, schoolId) : null,
		`agoraSchool:${schoolId ?? 'none'}`,
	);
}

export function useAgoraClasses(
	schoolId: string | undefined,
	enabled: boolean,
): SnapshotState<AgoraClass[]> {
	return useCollection<AgoraClass>(
		enabled && schoolId
			? query(collection(db, Collections.agoraClasses), where('schoolId', '==', schoolId))
			: null,
		`agoraClasses:${schoolId ?? 'none'}`,
	);
}

export function useAgoraClassAggregates(
	schoolId: string | undefined,
	enabled: boolean,
): SnapshotState<AgoraClassAggregate[]> {
	return useCollection<AgoraClassAggregate>(
		enabled && schoolId
			? query(collection(db, Collections.agoraClassAggregates), where('schoolId', '==', schoolId))
			: null,
		`agoraClassAggregates:${schoolId ?? 'none'}`,
	);
}

/**
 * One period counter doc from `agoraStats` (doc id = the period key, e.g.
 * `2026-09-01` / `2026-09` / `2026`). Written by the finished-session
 * trigger; missing simply means nothing finished in that period yet.
 */
export interface AgoraStatsDoc {
	periodType?: string;
	periodKey?: string;
	gamesFinished?: number;
	studentsReached?: number;
	classesPlayed?: number;
	byOutcome?: Record<string, number>;
	lastUpdate?: number;
}

export function useAgoraStats(
	periodKey: string,
	enabled: boolean,
): SnapshotState<AgoraStatsDoc | null> {
	return useDoc<AgoraStatsDoc>(
		enabled ? doc(db, Collections.agoraStats, periodKey) : null,
		`agoraStats:${periodKey}`,
	);
}

/** The UTC period keys the trigger writes, for "today / this month / this year". */
export function currentPeriodKeys(): { day: string; month: string; year: string } {
	const now = new Date();
	const yyyy = now.getUTCFullYear().toString();
	const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(now.getUTCDate()).padStart(2, '0');

	return { day: `${yyyy}-${mm}-${dd}`, month: `${yyyy}-${mm}`, year: yyyy };
}
