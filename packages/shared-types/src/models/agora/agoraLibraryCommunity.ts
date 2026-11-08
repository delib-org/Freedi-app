import { boolean, number, object, optional, picklist, string, InferOutput } from 'valibot';

/**
 * The library's conversation and its moderation: a thread of posts under each
 * scenario, and the reports teachers file about a scenario, a review or a post.
 * Kept apart from `agoraLibrary.ts` (the scenario, tags and ratings) so each
 * stays readable. Every field a deployed client might not know is optional.
 */

export const AGORA_LIBRARY_COMMUNITY = {
	POST_MAX: 1000,
	/** Posts one teacher may write in a calendar day (a thread is a place to talk, not to flood) */
	POSTS_PER_DAY: 30,
	REPORT_REASON_MAX: 300,
	/** Reports one teacher may file in a calendar day */
	REPORTS_PER_DAY: 20,
	/** The thread reads this many posts at a time */
	THREAD_PAGE_SIZE: 200,
	/** The admin queue reads this many of each kind */
	QUEUE_PAGE_SIZE: 100,
} as const;

// ─── Discussion ────────────────────────────────────────────────────────────

/** Who hid a post: the scenario's author, or a system admin. Only an admin lifts an admin's hide. */
export const AgoraPostHiddenBySchema = picklist(['owner', 'admin']);
export type AgoraPostHiddenBy = InferOutput<typeof AgoraPostHiddenBySchema>;

/**
 * One post under a scenario. Replies point at a top-level post by `parentId`
 * and never nest further: a thread is one level deep. Written by
 * `agoraLibraryPost` only (the language check and the first-name author live
 * there); a client reads, never writes.
 */
export const AgoraScenarioPostSchema = object({
	postId: string(),
	scenarioId: string(),
	/** The scenario's author at the time of posting, so the rules can let them see a hidden post */
	scenarioOwnerId: string(),
	authorId: string(),
	/** First name only, never an e-mail */
	authorName: string(),
	text: string(),
	parentId: optional(string()),
	/** Always written (false) so a list can ask `hidden == false` */
	hidden: boolean(),
	hiddenBy: optional(AgoraPostHiddenBySchema),
	hiddenReason: optional(string()),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraScenarioPost = InferOutput<typeof AgoraScenarioPostSchema>;

export interface PostThreadEntry {
	post: AgoraScenarioPost;
	replies: AgoraScenarioPost[];
}

/**
 * Posts as a thread: top-level posts newest first, each with its replies
 * oldest first. A reply whose parent is missing, hidden or itself a reply is
 * dropped; with `showHidden` (the author of the scenario, an admin) hidden
 * posts stay in, marked by their own `hidden` flag.
 */
export function buildPostThread(
	posts: readonly AgoraScenarioPost[],
	showHidden: boolean,
): PostThreadEntry[] {
	const shown = (post: AgoraScenarioPost): boolean => showHidden || !post.hidden;
	const tops = posts.filter((post) => !post.parentId && shown(post));
	const topIds = new Set(tops.map((post) => post.postId));
	const byParent = new Map<string, AgoraScenarioPost[]>();
	for (const post of posts) {
		if (!post.parentId || !topIds.has(post.parentId) || !shown(post)) continue;
		byParent.set(post.parentId, [...(byParent.get(post.parentId) ?? []), post]);
	}

	return tops
		.sort((a, b) => b.createdAt - a.createdAt)
		.map((post) => ({
			post,
			replies: (byParent.get(post.postId) ?? []).sort((a, b) => a.createdAt - b.createdAt),
		}));
}

/** Can this person lift the hide that is on `post`? An admin always; the author of the scenario only their own hide. */
export function canUnhidePost(
	post: Pick<AgoraScenarioPost, 'hiddenBy'>,
	who: { isAdmin: boolean; isOwner: boolean },
): boolean {
	if (who.isAdmin) return true;

	return who.isOwner && post.hiddenBy === 'owner';
}

export interface LibraryPostRequest {
	scenarioId: string;
	text: string;
	/** A top-level post of the same scenario, for a reply */
	parentId?: string;
}

export interface LibraryPostResponse {
	postId: string;
}

export interface LibraryHidePostRequest {
	postId: string;
	action: 'hide' | 'unhide';
	reason?: string;
}

export interface LibraryHidePostResponse {
	postId: string;
	hidden: boolean;
}

// ─── Reports ───────────────────────────────────────────────────────────────

export const AgoraReportTargetKindSchema = picklist(['scenario', 'review', 'post']);
export type AgoraReportTargetKind = InferOutput<typeof AgoraReportTargetKindSchema>;

export const AgoraReportStatusSchema = picklist(['open', 'resolved']);
export type AgoraReportStatus = InferOutput<typeof AgoraReportStatusSchema>;

export const AgoraReportResolutionSchema = picklist(['hidden', 'dismissed']);
export type AgoraReportResolution = InferOutput<typeof AgoraReportResolutionSchema>;

/** One report per reporter per target: the doc id makes "one" true by construction */
export function createAgoraReportId(
	kind: AgoraReportTargetKind,
	targetId: string,
	reporterId: string,
): string {
	return `${kind}__${targetId}__${reporterId}`;
}

/** A teacher's report; read by system admins only, written by `agoraLibraryReport` and its resolution */
export const AgoraLibraryReportSchema = object({
	reportId: string(),
	targetKind: AgoraReportTargetKindSchema,
	targetId: string(),
	/** The scenario the target belongs to (the scenario itself for a scenario report) */
	scenarioId: string(),
	reporterId: string(),
	reporterName: string(),
	reason: string(),
	status: AgoraReportStatusSchema,
	resolution: optional(AgoraReportResolutionSchema),
	resolvedBy: optional(string()),
	resolvedAt: optional(number()),
	createdAt: number(),
});

export type AgoraLibraryReport = InferOutput<typeof AgoraLibraryReportSchema>;

export interface LibraryReportRequest {
	targetKind: AgoraReportTargetKind;
	targetId: string;
	reason?: string;
}

export interface LibraryReportResponse {
	reportId: string;
	/** True when this teacher had already reported it (nothing new was filed) */
	existed: boolean;
}

export interface LibraryResolveReportRequest {
	/** Every open report on this target is resolved together */
	targetKind: AgoraReportTargetKind;
	targetId: string;
	resolution: AgoraReportResolution;
}

export interface LibraryResolveReportResponse {
	resolved: number;
}

// ─── Merging tags ──────────────────────────────────────────────────────────

export interface LibraryMergeTagsRequest {
	/** The duplicate, which stops being a tag and points at `intoId` */
	fromId: string;
	/** The canonical tag that takes over its scenarios */
	intoId: string;
}

export interface LibraryMergeTagsResponse {
	/** Scenarios re-pointed from `fromId` to `intoId` */
	scenarios: number;
}

/**
 * A scenario's tag list after `fromId` is merged into `intoId`: the duplicate
 * is swapped for the canonical tag in place, and a scenario that already
 * carried both keeps one.
 */
export function repointTagIds(
	ids: readonly string[],
	fromId: string,
	intoId: string,
): { ids: string[]; changed: boolean } {
	if (!ids.includes(fromId)) return { ids: [...ids], changed: false };
	const next: string[] = [];
	for (const id of ids) {
		const mapped = id === fromId ? intoId : id;
		if (!next.includes(mapped)) next.push(mapped);
	}

	return { ids: next, changed: true };
}

/**
 * Follow `aliasOf` pointers to the tag that is really in use, so an old link
 * or a stale client still lands somewhere. Stops on a cycle or a dead end.
 */
export function resolveTagAlias(
	tagId: string,
	tags: ReadonlyMap<string, { aliasOf?: string }>,
): string {
	const seen = new Set<string>();
	let current = tagId;
	while (!seen.has(current)) {
		seen.add(current);
		const next = tags.get(current)?.aliasOf;
		if (!next || !tags.has(next)) return current;
		current = next;
	}

	return tagId;
}
