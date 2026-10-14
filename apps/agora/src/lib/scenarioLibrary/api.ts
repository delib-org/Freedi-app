import { parse } from 'valibot';
import {
	AgoraLibraryTag,
	AgoraLibraryTagSchema,
	AgoraLibraryReport,
	AgoraLibraryReportSchema,
	AgoraReportTargetKind,
	AgoraScenarioPost,
	AgoraScenarioPostSchema,
	AgoraScenarioRating,
	AgoraScenarioRatingSchema,
	AGORA_LIBRARY_COMMUNITY,
	AgoraTopicPackage,
	AgoraTopicPackageSchema,
	AGORA_LIBRARY,
	Collections,
	createAgoraRatingId,
} from '@freedi/shared-types';
import type {
	LibraryAccessResponse,
	LibraryCreateTagRequest,
	LibraryGenerateCoverRequest,
	LibraryHidePostRequest,
	LibraryMergeTagsRequest,
	LibraryMergeTagsResponse,
	LibraryReportRequest,
	LibraryReportResponse,
	LibraryResolveReportRequest,
	LibraryResolveReportResponse,
	LibraryHidePostResponse,
	LibraryPostRequest,
	LibraryPostResponse,
	LibraryGenerateCoverResponse,
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
export const generateCover = call<LibraryGenerateCoverRequest, LibraryGenerateCoverResponse>(
	'agoraLibraryGenerateCover',
);
export const postToThread = call<LibraryPostRequest, LibraryPostResponse>('agoraLibraryPost');
export const hidePost = call<LibraryHidePostRequest, LibraryHidePostResponse>(
	'agoraLibraryHidePost',
);
export const reportItem = call<LibraryReportRequest, LibraryReportResponse>('agoraLibraryReport');
export const resolveReports = call<LibraryResolveReportRequest, LibraryResolveReportResponse>(
	'agoraLibraryResolveReport',
);
export const mergeLibraryTags = call<LibraryMergeTagsRequest, LibraryMergeTagsResponse>(
	'agoraLibraryMergeTags',
);
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

/**
 * The posts of a scenario's discussion. Everyone reads the visible ones; the
 * scenario's author also reads the hidden posts of their own thread (the
 * query names them as the owner, which is what the rule checks) and a
 * sys-admin reads every hidden post.
 */
export async function fetchPosts(
	scenarioId: string,
	viewer: { uid: string | null; isOwner: boolean; isAdmin: boolean },
): Promise<AgoraScenarioPost[]> {
	const posts = collection(db, Collections.agoraScenarioPosts);
	const queries = [
		query(
			posts,
			where('scenarioId', '==', scenarioId),
			where('hidden', '==', false),
			orderBy('createdAt', 'desc'),
			limit(AGORA_LIBRARY_COMMUNITY.THREAD_PAGE_SIZE),
		),
	];
	if (viewer.isAdmin) {
		queries.push(
			query(
				posts,
				where('scenarioId', '==', scenarioId),
				where('hidden', '==', true),
				limit(AGORA_LIBRARY_COMMUNITY.THREAD_PAGE_SIZE),
			),
		);
	} else if (viewer.isOwner && viewer.uid) {
		queries.push(
			query(
				posts,
				where('scenarioId', '==', scenarioId),
				where('scenarioOwnerId', '==', viewer.uid),
				where('hidden', '==', true),
				limit(AGORA_LIBRARY_COMMUNITY.THREAD_PAGE_SIZE),
			),
		);
	}
	const found: AgoraScenarioPost[] = [];
	for (const snapshot of await Promise.all(queries.map((entry) => getDocs(entry)))) {
		snapshot.forEach((docSnap) => {
			try {
				found.push(parse(AgoraScenarioPostSchema, docSnap.data()));
			} catch (error) {
				console.error('[Library] Invalid post:', error);
			}
		});
	}

	return found;
}

// ─── The admin page's reads (the rules let a sys-admin read all of these) ───

function parseAll<T>(
	snapshot: { forEach: (cb: (doc: { data: () => unknown }) => void) => void },
	schema: Parameters<typeof parse>[0],
	label: string,
): T[] {
	const found: T[] = [];
	snapshot.forEach((docSnap) => {
		try {
			found.push(parse(schema, docSnap.data()) as T);
		} catch (error) {
			console.error(`[Library] Invalid ${label}:`, error);
		}
	});

	return found;
}

/** Every open report (the queue), unsorted: the page groups and orders them */
export async function fetchOpenReports(): Promise<AgoraLibraryReport[]> {
	return parseAll<AgoraLibraryReport>(
		await getDocs(
			query(
				collection(db, Collections.agoraLibraryReports),
				where('status', '==', 'open'),
				limit(AGORA_LIBRARY_COMMUNITY.QUEUE_PAGE_SIZE),
			),
		),
		AgoraLibraryReportSchema,
		'report',
	);
}

export async function fetchHiddenReviews(): Promise<AgoraScenarioRating[]> {
	return parseAll<AgoraScenarioRating>(
		await getDocs(
			query(
				collection(db, Collections.agoraScenarioRatings),
				where('hidden', '==', true),
				limit(AGORA_LIBRARY_COMMUNITY.QUEUE_PAGE_SIZE),
			),
		),
		AgoraScenarioRatingSchema,
		'review',
	);
}

export async function fetchHiddenPosts(): Promise<AgoraScenarioPost[]> {
	return parseAll<AgoraScenarioPost>(
		await getDocs(
			query(
				collection(db, Collections.agoraScenarioPosts),
				where('hidden', '==', true),
				limit(AGORA_LIBRARY_COMMUNITY.QUEUE_PAGE_SIZE),
			),
		),
		AgoraScenarioPostSchema,
		'post',
	);
}

/** What a report points at, in words an admin can judge it by */
export interface ReportTarget {
	title: string;
	text: string;
	stars?: number;
	hidden: boolean;
}

export async function fetchReportTarget(
	kind: AgoraReportTargetKind,
	targetId: string,
): Promise<ReportTarget | null> {
	if (kind === 'scenario') {
		const pkg = await fetchLibraryScenario(targetId);
		if (!pkg) return null;

		return {
			title: pkg.title,
			text: pkg.library?.summary ?? '',
			hidden: pkg.library?.hidden === true,
		};
	}
	if (kind === 'review') {
		const snapshot = await getDoc(doc(db, Collections.agoraScenarioRatings, targetId));
		if (!snapshot.exists()) return null;
		const rating = parse(AgoraScenarioRatingSchema, snapshot.data());

		return {
			title: rating.authorName,
			text: rating.text ?? '',
			stars: rating.stars,
			hidden: rating.hidden,
		};
	}
	const snapshot = await getDoc(doc(db, Collections.agoraScenarioPosts, targetId));
	if (!snapshot.exists()) return null;
	const post = parse(AgoraScenarioPostSchema, snapshot.data());

	return { title: post.authorName, text: post.text, hidden: post.hidden };
}
