import type { DocumentReference } from 'firebase-admin/firestore';
import { db } from '../db';
import { AGORA_LIBRARY, Collections } from '@freedi/shared-types';
import { libraryGlobalMean } from './libraryStrings';

/**
 * The library-wide rating totals, one document (`agoraStats/library`, admin
 * read only): the running sum and count of every visible star, from which the
 * Bayesian prior `C` is derived. Maintained by the rating and moderation
 * callables inside their transactions — never by counting documents on read.
 */
export interface LibraryTotals {
	ratingTotal: number;
	ratingCount: number;
}

export const libraryTotalsRef = (): DocumentReference =>
	db.collection(Collections.agoraStats).doc('library');

export function readTotals(data: Partial<LibraryTotals> | undefined): LibraryTotals {
	return { ratingTotal: data?.ratingTotal ?? 0, ratingCount: data?.ratingCount ?? 0 };
}

/** The prior mean: the library's own average, held near the default until there are enough ratings */
export function globalMeanOf(totals: LibraryTotals): number {
	return libraryGlobalMean(
		totals.ratingTotal,
		totals.ratingCount,
		AGORA_LIBRARY.DEFAULT_GLOBAL_MEAN,
		AGORA_LIBRARY.BAYES_PRIOR_WEIGHT,
	);
}

export async function currentGlobalMean(): Promise<number> {
	const snap = await libraryTotalsRef().get();

	return globalMeanOf(readTotals(snap.data() as Partial<LibraryTotals> | undefined));
}
