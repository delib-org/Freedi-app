import {
	array,
	boolean,
	number,
	object,
	optional,
	picklist,
	record,
	string,
	InferOutput,
} from 'valibot';

/**
 * The teachers' scenario library.
 *
 * A scenario is an `AgoraTopicPackage`. Publishing one adds OPTIONAL fields to
 * that same document (`visibility`, `library`, `stats`), so the library home
 * reads ONE collection and a deployed client that has never heard of the
 * library keeps parsing every package it already could. Nothing here widens an
 * existing picklist.
 *
 * Who may enter at all is decided on the server (`agoraLibraryAccess`) and
 * mirrored into a marker document the rules can see — see
 * {@link AgoraApprovedTeacherSchema}.
 */

/** The six languages the game ships in; also the languages a tag carries a label for */
export const AGORA_LIBRARY_LANGS = ['he', 'en', 'ar', 'es', 'de', 'nl'] as const;

export type AgoraLibraryLang = (typeof AGORA_LIBRARY_LANGS)[number];

export function isAgoraLibraryLang(value: string): value is AgoraLibraryLang {
	return (AGORA_LIBRARY_LANGS as readonly string[]).includes(value);
}

export const AGORA_LIBRARY = {
	SUMMARY_MIN: 20,
	SUMMARY_MAX: 280,
	REVIEW_MAX: 500,
	SUBJECTS_MIN: 1,
	SUBJECTS_MAX: 4,
	LESSON_TYPES_MIN: 1,
	LESSON_TYPES_MAX: 2,
	TAG_LABEL_MIN: 2,
	TAG_LABEL_MAX: 40,
	/** A teacher may mint this many new tags in a rolling week */
	TAGS_PER_WEEK: 5,
	/** Copies one teacher may take in a calendar day (each can cost a translation) */
	COPIES_PER_DAY: 30,
	/** Bayesian prior weight: a scenario needs about this many ratings to move off the mean */
	BAYES_PRIOR_WEIGHT: 5,
	/** Until anyone has rated anything the mean is this */
	DEFAULT_GLOBAL_MEAN: 3.8,
	/** A scenario enters the "featured" row only with this many ratings */
	FEATURED_MIN_RATINGS: 3,
	FEATURED_COUNT: 6,
	/** The home reads this many cards per sort; filters and search run over them */
	PAGE_SIZE: 120,
	/** Scenarios published this recently wear the "new" badge */
	NEW_BADGE_DAYS: 14,
	/** A pending tag earns its own filter chip once this many teachers and scenarios use it */
	PENDING_TAG_PROMOTE_USES: 2,
	/** Tag docs remember at most this many distinct teachers (enough to count to two) */
	TAG_TEACHER_CAP: 5,
	/** Tags whose key is within this edit distance read as "the same thing" */
	NEAR_DUPLICATE_DISTANCE: 2,
	MAX_COVER_URL_LENGTH: 1000,
	/** AI covers one teacher may ask for in a calendar day (each costs a cent or two) */
	COVERS_PER_DAY: 10,
} as const;

// ─── Tags ──────────────────────────────────────────────────────────────────

export const AgoraLibraryTagKindSchema = picklist(['subject', 'lessonType']);
export type AgoraLibraryTagKind = InferOutput<typeof AgoraLibraryTagKindSchema>;

export const AgoraLibraryTagStatusSchema = picklist(['approved', 'pending']);
export type AgoraLibraryTagStatus = InferOutput<typeof AgoraLibraryTagStatusSchema>;

/**
 * One entry of a controlled vocabulary. Doc id: {@link agoraTagId} of
 * (kind, normalizedKey), so the same words can never become two tags.
 */
export const AgoraLibraryTagSchema = object({
	tagId: string(),
	kind: AgoraLibraryTagKindSchema,
	/** The label as its author wrote it, in `labelLang` */
	label: string(),
	labelLang: string(),
	/** The label in every language, AI-translated at creation. Always includes `labelLang`. */
	labels: record(string(), string()),
	normalizedKey: string(),
	status: AgoraLibraryTagStatusSchema,
	/** Set when an admin merges this tag into another (P5): old links still resolve */
	aliasOf: optional(string()),
	/** Public scenarios carrying this tag. Server-maintained. */
	scenarioCount: number(),
	/** Distinct teachers who used it, capped at `AGORA_LIBRARY.TAG_TEACHER_CAP` */
	teacherIds: array(string()),
	/** 'seed' for the starting vocabulary, else the creating teacher's uid */
	createdBy: string(),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraLibraryTag = InferOutput<typeof AgoraLibraryTagSchema>;

/** The label to show a reader: their language, else the author's own words */
export function tagLabelIn(tag: Pick<AgoraLibraryTag, 'label' | 'labels'>, lang: string): string {
	return tag.labels[lang] ?? tag.label;
}

// Hebrew points and cantillation (U+0591–U+05C7) and Arabic harakat (U+064B–U+065F)
const MARKS = /[֑-ׇً-ٟ]/g;
const QUOTES = /["'`׳״‘’“”´]/g;

/**
 * The text two spellings of one idea share: no points, no quotes, no
 * punctuation, collapsed spaces, Latin lower-cased. Search uses it too.
 */
export function normalizeLibraryText(text: string): string {
	return text
		.normalize('NFKC')
		.replace(MARKS, '')
		.replace(QUOTES, '')
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/**
 * A tag's identity: normalized text with a leading Hebrew definite article
 * dropped from the first word ("ההיסטוריה" and "היסטוריה" are one tag). Only
 * words long enough to survive the cut lose the letter.
 */
export function normalizeTagKey(label: string): string {
	const text = normalizeLibraryText(label);
	const [first = '', ...rest] = text.split(' ');
	const bare = /^ה\p{L}{3,}/u.test(first) ? first.slice(1) : first;

	return [bare, ...rest].join(' ').trim();
}

/** Deterministic doc id for a tag: two 32-bit FNV-1a hashes of `kind:key`, base 36 */
export function agoraTagId(kind: AgoraLibraryTagKind, normalizedKey: string): string {
	const input = `${kind}:${normalizedKey}`;
	let a = 0x811c9dc5;
	let b = 0x01000193;
	for (let index = 0; index < input.length; index++) {
		const code = input.charCodeAt(index);
		a = Math.imul(a ^ code, 0x01000193) >>> 0;
		b = Math.imul(b ^ (code + index), 0x85ebca6b) >>> 0;
	}

	return `${kind === 'subject' ? 's' : 'l'}_${a.toString(36)}${b.toString(36)}`;
}

/** Levenshtein distance, bailing out once it must exceed `limit` */
export function editDistance(a: string, b: string, limit = Infinity): number {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > limit) return limit + 1;
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let row = 1; row <= a.length; row++) {
		const current = [row];
		let best = row;
		for (let column = 1; column <= b.length; column++) {
			const cost = a[row - 1] === b[column - 1] ? 0 : 1;
			const value = Math.min(
				previous[column] + 1,
				current[column - 1] + 1,
				previous[column - 1] + cost,
			);
			current.push(value);
			if (value < best) best = value;
		}
		if (best > limit) return limit + 1;
		previous = current;
	}

	return previous[b.length];
}

/** Why a tag looks like the one being typed */
export type NearTagReason = 'same' | 'prefix' | 'contains' | 'close';

export interface NearTag<T> {
	tag: T;
	reason: NearTagReason;
}

/**
 * The existing tags a new label could be a duplicate of — what the picker
 * shows before it will offer "create". Same key first, then prefix / contains,
 * then close spellings; merged-away tags (`aliasOf`) are never offered.
 */
export function findNearDuplicateTags<
	T extends Pick<AgoraLibraryTag, 'kind' | 'normalizedKey' | 'aliasOf'>,
>(label: string, kind: AgoraLibraryTagKind, tags: readonly T[]): Array<NearTag<T>> {
	const key = normalizeTagKey(label);
	if (!key) return [];
	const order: Record<NearTagReason, number> = { same: 0, prefix: 1, contains: 2, close: 3 };
	const found: Array<NearTag<T>> = [];
	for (const tag of tags) {
		if (tag.kind !== kind || tag.aliasOf) continue;
		const other = tag.normalizedKey;
		let reason: NearTagReason | null = null;
		if (other === key) reason = 'same';
		else if (key.length >= 2 && other.startsWith(key)) reason = 'prefix';
		else if (key.length >= 3 && other.includes(key)) reason = 'contains';
		else if (other.length >= 3 && key.includes(other)) reason = 'contains';
		else {
			const limit = Math.min(AGORA_LIBRARY.NEAR_DUPLICATE_DISTANCE, Math.floor(key.length / 3));
			if (limit >= 1 && editDistance(key, other, limit) <= limit) reason = 'close';
		}
		if (reason) found.push({ tag, reason });
	}

	return found.sort((x, y) => order[x.reason] - order[y.reason]);
}

/** Is this tag one that gets its own filter chip? Approved ones, or pending ones the crowd has adopted. */
export function showsAsFilterChip(
	tag: Pick<AgoraLibraryTag, 'status' | 'scenarioCount' | 'teacherIds' | 'aliasOf'>,
): boolean {
	if (tag.aliasOf) return false;
	if (tag.status === 'approved') return tag.scenarioCount > 0;

	return (
		tag.scenarioCount >= AGORA_LIBRARY.PENDING_TAG_PROMOTE_USES &&
		tag.teacherIds.length >= AGORA_LIBRARY.PENDING_TAG_PROMOTE_USES
	);
}

/** The starting vocabulary, with every label already translated (no AI call to seed) */
export interface AgoraLibrarySeedTag {
	kind: AgoraLibraryTagKind;
	labels: Record<AgoraLibraryLang, string>;
}

export const AGORA_LIBRARY_SEED_TAGS: readonly AgoraLibrarySeedTag[] = [
	{
		kind: 'subject',
		labels: {
			he: 'בריונות (אלימות בכיתה)',
			en: 'Bullying (violence in class)',
			ar: 'التنمّر (العنف في الصف)',
			es: 'Acoso escolar (violencia en el aula)',
			de: 'Mobbing (Gewalt in der Klasse)',
			nl: 'Pesten (geweld in de klas)',
		},
	},
	{
		kind: 'subject',
		labels: {
			he: 'עישון',
			en: 'Smoking',
			ar: 'التدخين',
			es: 'Tabaquismo',
			de: 'Rauchen',
			nl: 'Roken',
		},
	},
	{
		kind: 'subject',
		labels: {
			he: 'רוב מול מיעוט בדמוקרטיה',
			en: 'Majority versus minority in a democracy',
			ar: 'الأغلبية مقابل الأقلية في الديمقراطية',
			es: 'Mayoría frente a minoría en la democracia',
			de: 'Mehrheit gegen Minderheit in der Demokratie',
			nl: 'Meerderheid tegenover minderheid in een democratie',
		},
	},
	{
		kind: 'lessonType',
		labels: {
			he: 'חברה',
			en: 'Society',
			ar: 'المجتمع',
			es: 'Sociedad',
			de: 'Gesellschaft',
			nl: 'Maatschappij',
		},
	},
	{
		kind: 'lessonType',
		labels: {
			he: 'אזרחות',
			en: 'Civics',
			ar: 'التربية المدنية',
			es: 'Educación cívica',
			de: 'Staatsbürgerkunde',
			nl: 'Burgerschap',
		},
	},
	{
		kind: 'lessonType',
		labels: {
			he: 'היסטוריה',
			en: 'History',
			ar: 'التاريخ',
			es: 'Historia',
			de: 'Geschichte',
			nl: 'Geschiedenis',
		},
	},
];

/** The seed as tag documents; ids are the same ones a teacher typing the Hebrew would hit */
export function seedTagDocs(now: number): AgoraLibraryTag[] {
	return AGORA_LIBRARY_SEED_TAGS.map((seed) => {
		const normalizedKey = normalizeTagKey(seed.labels.he);

		return {
			tagId: agoraTagId(seed.kind, normalizedKey),
			kind: seed.kind,
			label: seed.labels.he,
			labelLang: 'he',
			labels: { ...seed.labels },
			normalizedKey,
			status: 'approved' as const,
			scenarioCount: 0,
			teacherIds: [],
			createdBy: 'seed',
			createdAt: now,
			lastUpdate: now,
		};
	});
}

// ─── What a published scenario carries ─────────────────────────────────────

export const AgoraLibraryVisibilitySchema = picklist(['private', 'public']);
export type AgoraLibraryVisibility = InferOutput<typeof AgoraLibraryVisibilitySchema>;

/** The denormalized card data, so the library home reads one collection */
export const AgoraLibraryCardSchema = object({
	summary: string(),
	subjectIds: array(string()),
	lessonTypeIds: array(string()),
	coverUrl: optional(string()),
	coverSource: optional(picklist(['upload', 'ai'])),
	publishedAt: number(),
	authorId: string(),
	authorName: string(),
	/** Always written (false) so the home can ask `library.hidden == false` */
	hidden: boolean(),
	hiddenReason: optional(string()),
});

export type AgoraLibraryCard = InferOutput<typeof AgoraLibraryCardSchema>;

/** Server-written aggregates. A client may never write these (rules). */
export const AgoraLibraryStatsSchema = object({
	ratingCount: number(),
	ratingSum: number(),
	/** Bayesian average of the stars — what "rating" sort orders by */
	ratingBayes: number(),
	/** Ratings that came with words */
	reviewCount: number(),
	copyCount: number(),
	/** Visible discussion posts (hidden ones leave the count). Server-maintained; absent until the first post. */
	postCount: optional(number()),
});

export type AgoraLibraryStats = InferOutput<typeof AgoraLibraryStatsSchema>;

export function emptyLibraryStats(globalMean: number): AgoraLibraryStats {
	return { ratingCount: 0, ratingSum: 0, ratingBayes: globalMean, reviewCount: 0, copyCount: 0 };
}

/**
 * `(v·R + m·C) / (v + m)`: one 5-star rating does not outrank 4.7 over forty.
 * R is the scenario's mean, C the library's, m the prior weight.
 */
export function bayesianAverage(
	ratingSum: number,
	ratingCount: number,
	globalMean: number,
	priorWeight: number = AGORA_LIBRARY.BAYES_PRIOR_WEIGHT,
): number {
	if (ratingCount <= 0) return globalMean;
	const mean = ratingSum / ratingCount;

	return (ratingCount * mean + priorWeight * globalMean) / (ratingCount + priorWeight);
}

/** A rating as the aggregates see it */
export interface RatingContribution {
	stars: number;
	hasText: boolean;
}

/**
 * The aggregates after one teacher's rating changes from `previous` (absent =
 * their first) to `next` (absent = it was removed or hidden). Pure: the
 * callable runs it inside a transaction.
 */
export function applyRatingChange(
	stats: AgoraLibraryStats,
	previous: RatingContribution | null,
	next: RatingContribution | null,
	globalMean: number,
): AgoraLibraryStats {
	let ratingCount = stats.ratingCount;
	let ratingSum = stats.ratingSum;
	let reviewCount = stats.reviewCount;
	if (previous) {
		ratingCount -= 1;
		ratingSum -= previous.stars;
		if (previous.hasText) reviewCount -= 1;
	}
	if (next) {
		ratingCount += 1;
		ratingSum += next.stars;
		if (next.hasText) reviewCount += 1;
	}
	ratingCount = Math.max(0, ratingCount);
	ratingSum = Math.max(0, ratingSum);

	return {
		...stats,
		ratingCount,
		ratingSum,
		reviewCount: Math.max(0, reviewCount),
		ratingBayes: bayesianAverage(ratingSum, ratingCount, globalMean),
	};
}

/** One rating per teacher per scenario: the doc id makes "one" true by construction */
export function createAgoraRatingId(scenarioId: string, teacherId: string): string {
	return `${scenarioId}__${teacherId}`;
}

export const AgoraScenarioRatingSchema = object({
	ratingId: string(),
	scenarioId: string(),
	teacherId: string(),
	/** First name only; the teacher's own, never an email */
	authorName: string(),
	stars: number(),
	text: optional(string()),
	/** Always written (false) so the page can ask `hidden == false` */
	hidden: boolean(),
	hiddenReason: optional(string()),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraScenarioRating = InferOutput<typeof AgoraScenarioRatingSchema>;

export function isValidStars(stars: unknown): stars is number {
	return typeof stars === 'number' && Number.isInteger(stars) && stars >= 1 && stars <= 5;
}

/** Has the original changed since this copy was taken? */
export function isNewerVersionAvailable(
	copy: { sourceVersion?: number },
	original: { lastUpdate: number } | null | undefined,
): boolean {
	if (copy.sourceVersion === undefined || !original) return false;

	return original.lastUpdate > copy.sourceVersion;
}

/** Fresh enough for the "new" badge */
export function isNewScenario(publishedAt: number, now: number): boolean {
	return now - publishedAt < AGORA_LIBRARY.NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
}

// ─── Publishing ────────────────────────────────────────────────────────────

export interface PublishInput {
	summary: string;
	subjectIds: readonly string[];
	lessonTypeIds: readonly string[];
	ready: boolean;
	language: string;
}

export type PublishProblem =
	| 'not_ready'
	| 'no_language'
	| 'summary_short'
	| 'summary_long'
	| 'subjects_missing'
	| 'subjects_many'
	| 'lesson_types_missing'
	| 'lesson_types_many';

/** What stops this scenario from going public, named. Empty means it may. */
export function publishProblems(input: PublishInput): PublishProblem[] {
	const problems: PublishProblem[] = [];
	const summary = input.summary.trim();
	if (!input.ready) problems.push('not_ready');
	if (!input.language) problems.push('no_language');
	if (summary.length < AGORA_LIBRARY.SUMMARY_MIN) problems.push('summary_short');
	if (summary.length > AGORA_LIBRARY.SUMMARY_MAX) problems.push('summary_long');
	if (input.subjectIds.length < AGORA_LIBRARY.SUBJECTS_MIN) problems.push('subjects_missing');
	if (input.subjectIds.length > AGORA_LIBRARY.SUBJECTS_MAX) problems.push('subjects_many');
	if (input.lessonTypeIds.length < AGORA_LIBRARY.LESSON_TYPES_MIN)
		problems.push('lesson_types_missing');
	if (input.lessonTypeIds.length > AGORA_LIBRARY.LESSON_TYPES_MAX)
		problems.push('lesson_types_many');

	return problems;
}

// ─── Who may enter ─────────────────────────────────────────────────────────

/** How a teacher came to be approved, today */
export const AgoraApprovalSourceSchema = picklist(['admin', 'school', 'supervisor']);
export type AgoraApprovalSource = InferOutput<typeof AgoraApprovalSourceSchema>;

/**
 * "This account is an approved teacher", as the RULES can see it. Rules cannot
 * search schools, so `agoraLibraryAccess` evaluates the real condition (a
 * sys-admin, or a teacher/supervisor a sys-admin attached to an active school)
 * and writes this marker; the library's read rules ask `exists()` of it. Every
 * callable re-checks the live condition itself, so a teacher removed from their
 * school loses writes at once and reads at their next visit.
 *
 * Doc id: the teacher's uid. Server-written only. The counters double as the
 * rate limits (copies a day, tags a week) without a query.
 */
export const AgoraApprovedTeacherSchema = object({
	teacherId: string(),
	via: AgoraApprovalSourceSchema,
	checkedAt: number(),
	copiesDay: optional(string()),
	copiesToday: optional(number()),
	tagsWeekStart: optional(number()),
	tagsThisWeek: optional(number()),
	coversDay: optional(string()),
	coversToday: optional(number()),
	postsDay: optional(string()),
	postsToday: optional(number()),
	reportsDay: optional(string()),
	reportsToday: optional(number()),
});

export type AgoraApprovedTeacher = InferOutput<typeof AgoraApprovedTeacherSchema>;

// ─── Translations ──────────────────────────────────────────────────────────

/** The few strings a card and the page's lesson preview need */
export const AgoraScenarioCardTextSchema = object({
	title: string(),
	summary: string(),
	challengeQuestion: string(),
	/** "name — role" for each character, in package order */
	characters: array(string()),
	/** Scene titles, in package order */
	scenes: array(string()),
});

export type AgoraScenarioCardText = InferOutput<typeof AgoraScenarioCardTextSchema>;

/**
 * One scenario in one language, cached so no view re-translates. `sourceVersion`
 * is the scenario's `lastUpdate` the translation was made from; a newer
 * scenario ignores it. Doc id: {@link createAgoraTranslationId}. Server-only.
 */
export const AgoraScenarioTranslationSchema = object({
	translationId: string(),
	scenarioId: string(),
	lang: string(),
	sourceVersion: number(),
	/** The library summary `card.summary` was translated from, so an edited summary invalidates it */
	summarySource: optional(string()),
	card: optional(AgoraScenarioCardTextSchema),
	/** Every translatable string of the package in `collectPackageStrings` order, written on the first copy */
	strings: optional(array(string())),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraScenarioTranslation = InferOutput<typeof AgoraScenarioTranslationSchema>;

export function createAgoraTranslationId(scenarioId: string, lang: string): string {
	return `${scenarioId}__${lang}`;
}

// ─── Callables ─────────────────────────────────────────────────────────────

export interface LibraryAccessResponse {
	approved: boolean;
	isAdmin: boolean;
	via?: AgoraApprovalSource;
}

export interface LibraryCreateTagRequest {
	kind: AgoraLibraryTagKind;
	label: string;
	/** The language the label is written in */
	lang: string;
}

export interface LibraryCreateTagResponse {
	tagId: string;
	/** True when the words already named a tag and nothing was minted */
	existed: boolean;
}

export interface LibraryPublishRequest {
	scenarioId: string;
	summary: string;
	subjectIds: string[];
	lessonTypeIds: string[];
	/** A download URL of an image the teacher uploaded under `agora/{scenarioId}/` */
	coverUrl?: string;
}

export interface LibraryPublishResponse {
	scenarioId: string;
}

export interface LibraryUnpublishRequest {
	scenarioId: string;
}

export interface LibraryUseRequest {
	scenarioId: string;
	/** The language the copy should be written in */
	lang: string;
}

export interface LibraryUseResponse {
	copyId: string;
	translated: boolean;
}

export interface LibraryGenerateCoverRequest {
	scenarioId: string;
	/** The summary as typed in the publish sheet, if it is not published yet */
	summary?: string;
}

export interface LibraryGenerateCoverResponse {
	/** A download URL under `agora/{scenarioId}/`, ready for the publish callable */
	coverUrl: string;
	/** True when the scenario is already listed and its card now wears this cover */
	applied: boolean;
	/** Generations left today */
	remainingToday: number;
}

export interface LibraryRateRequest {
	scenarioId: string;
	stars: number;
	text?: string;
}

export interface LibraryRateResponse {
	stats: AgoraLibraryStats;
}

export interface LibraryTranslateRequest {
	scenarioIds: string[];
	lang: string;
}

export interface LibraryTranslateResponse {
	/** Only the scenarios that needed translating; the rest are already in `lang` */
	translations: Record<string, AgoraScenarioCardText>;
}

export interface LibraryModerateRequest {
	action: 'hide' | 'unhide';
	targetKind: 'scenario' | 'review' | 'post';
	targetId: string;
	reason?: string;
}

export interface LibraryModerateResponse {
	targetId: string;
	hidden: boolean;
}
