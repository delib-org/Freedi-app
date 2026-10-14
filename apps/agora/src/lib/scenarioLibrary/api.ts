import { parse } from 'valibot';
import {
	AgoraLibraryTag,
	AgoraLibraryTagSchema,
	AgoraScenarioRating,
	AgoraScenarioRatingSchema,
	AgoraTopicPackage,
	AgoraTopicPackageSchema,
	AGORA_LIBRARY,
	Collections,
	createAgoraRatingId,
} from '@freedi/shared-types';
import type {
	LibraryAccessResponse,
	LibraryCreateTagRequest,
	LibraryCreateTagResponse,
	LibraryModerateRequest,
	LibraryModerateResponse,
	LibraryPublishRequest,
	LibraryPublishResponse,
	LibraryRateRequest,
	LibraryRateResponse,
	LibraryTranslateRequest,
	LibraryTranslateResponse,
	LibraryUnpublishRequest,
	LibraryUseRequest,
	LibraryUseResponse,
} from '@freedi/shared-types';
import {
	collection,
	db,
	doc,
	functions,
	getDoc,
	getDocs,
	httpsCallable,
	limit,
	orderBy,
	query,
	where,
} from '../firebase';
import type { QueryConstraint } from '../firebase';

/**
 * Everything the scenario library asks of the backend. Reads that the rules
 * allow go straight to Firestore (the list is one query); everything that
 * writes, copies or translates is a callable.
 */

export type LibrarySort = 'rating' | 'new' | 'used';

const SORT_FIELD: Record<LibrarySort, string> = {
	rating: 'stats.ratingBayes',
	new: 'library.publishedAt',
	used: 'stats.copyCount',
};

function call<Req, Res>(name: string): (request: Req) => Promise<Res> {
	const callable = httpsCallable<Req, Res>(functions, name);

	return async (request: Req): Promise<Res> => (await callable(request)).data;
}

export const checkLibraryAccess = call<Record<string, never>, LibraryAccessResponse>(
	'agoraLibraryAccess',
);
export const createLibraryTag = call<LibraryCreateTagRequest, LibraryCreateTagResponse>(
	'agoraLibraryCreateTag',
);
export const publishScenario = call<LibraryPublishRequest, LibraryPublishResponse>(
	'agoraLibraryPublish',
);
export const unpublishScenario = call<LibraryUnpublishRequest, LibraryPublishResponse>(
	'agoraLibraryUnpublish',
);
export const useScenario = call<LibraryUseRequest, LibraryUseResponse>('agoraLibraryUse');
export const translateScenarios = call<LibraryTranslateRequest, LibraryTranslateResponse>(
	'agoraLibraryTranslate',
);
export const rateScenario = call<LibraryRateRequest, LibraryRateResponse>('agoraLibraryRate');
export const moderateLibrary = call<LibraryModerateRequest, LibraryModerateResponse>(
	'agoraLibraryModerate',
);

/** Every tag, parsed. One small collection; the home filters over it in memory. */
export async function fetchLibraryTags(): Promise<AgoraLibraryTag[]> {
	const snapshot = await getDocs(collection(db, Collections.agoraLibraryTags));
	const tags: AgoraLibraryTag[] = [];
	snapshot.forEach((docSnap) => {
		try {
			tags.push(parse(AgoraLibraryTagSchema, docSnap.data()));
		} catch (error) {
			console.error('[Library] Invalid tag:', error);
		}
	});

	return tags;
}

function parsePackages(snapshot: {
	forEach: (cb: (doc: { data: () => unknown }) => void) => void;
}): AgoraTopicPackage[] {
	const packages: AgoraTopicPackage[] = [];
	snapshot.forEach((docSnap) => {
		try {
			const pkg = parse(AgoraTopicPackageSchema, docSnap.data());
			if (pkg.library && pkg.visibility === 'public') packages.push(pkg);
		} catch (error) {
			console.error('[Library] Invalid scenario:', error);
		}
	});

	return packages;
}

/** The newest page of public, un-hidden scenarios under one ordering */
export async function fetchLibraryScenarios(sort: LibrarySort): Promise<AgoraTopicPackage[]> {
	const constraints: QueryConstraint[] = [
		where('visibility', '==', 'public'),
		where('library.hidden', '==', false),
		orderBy(SORT_FIELD[sort], 'desc'),
		limit(AGORA_LIBRARY.PAGE_SIZE),
	];

	return parsePackages(
		await getDocs(query(collection(db, Collections.agoraTopicPackages), ...constraints)),
	);
}

/** For a sys-admin: the scenarios hidden from everyone else, to lift a hide */
export async function fetchHiddenScenarios(): Promise<AgoraTopicPackage[]> {
	return parsePackages(
		await getDocs(
			query(
				collection(db, Collections.agoraTopicPackages),
				where('visibility', '==', 'public'),
				where('library.hidden', '==', true),
				limit(AGORA_LIBRARY.PAGE_SIZE),
			),
		),
	);
}

/** One scenario by id, or null when it is gone, malformed or not the library's */
export async function fetchLibraryScenario(id: string): Promise<AgoraTopicPackage | null> {
	const snapshot = await getDoc(doc(db, Collections.agoraTopicPackages, id));
	if (!snapshot.exists()) return null;

	return parse(AgoraTopicPackageSchema, snapshot.data());
}

/**
 * The reviews of a scenario, newest first. Teachers get the visible ones; a
 * sys-admin asks for every one, hidden included, to be able to lift a hide.
 */
export async function fetchScenarioRatings(
	scenarioId: string,
	includeHidden = false,
): Promise<AgoraScenarioRating[]> {
	const constraints: QueryConstraint[] = includeHidden
		? [where('scenarioId', '==', scenarioId), limit(AGORA_LIBRARY.PAGE_SIZE)]
		: [
				where('scenarioId', '==', scenarioId),
				where('hidden', '==', false),
				orderBy('lastUpdate', 'desc'),
				limit(AGORA_LIBRARY.PAGE_SIZE),
			];
	const snapshot = await getDocs(
		query(collection(db, Collections.agoraScenarioRatings), ...constraints),
	);
	const ratings: AgoraScenarioRating[] = [];
	snapshot.forEach((docSnap) => {
		try {
			ratings.push(parse(AgoraScenarioRatingSchema, docSnap.data()));
		} catch (error) {
			console.error('[Library] Invalid rating:', error);
		}
	});

	return ratings.sort((a, b) => b.lastUpdate - a.lastUpdate);
}

/** My own rating of a scenario, whether or not it is hidden; null when I have none */
export async function fetchMyRating(
	scenarioId: string,
	teacherId: string,
): Promise<AgoraScenarioRating | null> {
	const snapshot = await getDoc(
		doc(db, Collections.agoraScenarioRatings, createAgoraRatingId(scenarioId, teacherId)),
	);
	if (!snapshot.exists()) return null;

	return parse(AgoraScenarioRatingSchema, snapshot.data());
}

/** The originals of the copies in `copies`, as far as the library still lists them */
export async function fetchSourceVersions(
	copies: readonly AgoraTopicPackage[],
): Promise<Map<string, { lastUpdate: number; title: string }>> {
	const ids = [...new Set(copies.map((copy) => copy.sourceScenarioId).filter(Boolean))] as string[];
	const found = new Map<string, { lastUpdate: number; title: string }>();
	await Promise.all(
		ids.map(async (id) => {
			try {
				const original = await fetchLibraryScenario(id);
				if (original && original.visibility === 'public' && !original.library?.hidden) {
					found.set(id, { lastUpdate: original.lastUpdate, title: original.title });
				}
			} catch (error) {
				console.error('[Library] Reading a copy source failed:', error);
			}
		}),
	);

	return found;
}
