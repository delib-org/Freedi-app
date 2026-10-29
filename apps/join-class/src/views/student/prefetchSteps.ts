import { afterLoad } from '@/lib/deferWork';

/**
 * Warm the step chunks while the student waits.
 *
 * Table talk, Proposals, Vote, Summary and "all proposals" are separate chunks
 * (IA 9b), downloaded the first time their step opens. On a school network that
 * download started only when the teacher pressed the button, so the class sat on
 * an empty frame for seconds (Trello VJJ5p3UK, XxmmG4ls). The student stage now
 * fetches them one by one, in step order, once the page is idle; by the time the
 * teacher moves, the code is in the HTTP cache and the step paints at once.
 * A failed warm-up is ignored: the step slot still loads its own chunk on demand.
 */

export type ChunkLoader = () => Promise<unknown>;

/** The chunks in the order a lesson reaches them. */
export const STEP_CHUNK_LOADERS: readonly ChunkLoader[] = [
	() => import('./c2/views'),
	() => import('./c3/bodies'),
	() => import('./c3/AllProposalsScreen'),
];

/** Load `loaders` one after the other (so they never fight the live Firestore streams for bandwidth). */
export async function prefetchSequentially(loaders: readonly ChunkLoader[]): Promise<number> {
	let loaded = 0;
	for (const load of loaders) {
		try {
			await load();
			loaded += 1;
		} catch {
			// On-demand loading in the step slot is the fallback.
		}
	}

	return loaded;
}

interface SaveDataNavigator {
	connection?: { saveData?: boolean };
}

let started = false;

/** Once per page, when idle; skipped when the phone asked to save data. */
export function prefetchStepChunks(): void {
	if (started) return;
	started = true;
	const saveData = (navigator as Navigator & SaveDataNavigator).connection?.saveData === true;
	if (saveData) return;
	afterLoad(() => {
		void prefetchSequentially(STEP_CHUNK_LOADERS);
	});
}
