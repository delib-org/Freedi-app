import m from 'mithril';
import {
	db,
	functions,
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	query,
	where,
	orderBy,
	onSnapshot,
	runTransaction,
	httpsCallable,
	writeBatch,
	Unsubscribe,
} from './firebase';
import { getUserState, ensureUser } from './user';
import { applyStatementLanguage, isLanguageForced, t } from './i18n';
import {
	Access,
	Collections,
	Statement,
	StatementType,
	Creator,
	Role,
	SortType,
	ThemeStyle,
	createStatementObject,
	CutoffBy,
} from '@freedi/shared-types';
import { checkAdminStatus, isAdmin } from './admin';
import {
	mapMainAppPathToJoinTarget,
	joinTargetToRoute,
	FACILITATOR_REDIRECT_DELAY_MS,
} from './facilitator';
import { showFacilitatorToast } from './facilitatorToast';

let question: Statement | null = null;
let allOptions: Statement[] = [];
let messages: Statement[] = [];
let chatUnsubscribe: Unsubscribe | null = null;
let messageCounts: Map<string, number> = new Map();
let messageLatest: Map<string, number> = new Map();
let messagesByOption: Map<string, number[]> = new Map();
let messageCountsUnsubs: Unsubscribe[] = [];
/** Cluster-id → unique-evaluator count. Populated by `subscribeClusterLinks`. */
let clusterEvaluatorCounts: Map<string, number> = new Map();
let clusterLinksUnsubs: Unsubscribe[] = [];

// New-solutions buffer: mirrors main app's useNewSolutionsBuffer logic.
// Phase 1 (3 s stabilize window): every arriving ID is marked "known" so the
// initial snapshot and any Firebase catch-up don't produce false positives.
// Phase 2 (after stabilize): IDs not yet in knownOptionIds go to pendingOptionIds.
// Flush: pending → highlightedOptionIds for HIGHLIGHT_MS, then auto-cleared.
const BUFFER_STABILIZE_MS = 3_000;
const BUFFER_HIGHLIGHT_MS = 10_000;
let bufferKnownIds = new Set<string>();
let bufferPendingIds = new Set<string>();
let bufferHighlightedIds = new Set<string>();
let bufferStabilized = false;
let bufferStabilizeTimer: ReturnType<typeof setTimeout> | null = null;
const bufferHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Confirmed (server-side) evaluations the current user has cast for options
 *  under the active question, keyed by optionId. Populated by
 *  `subscribeUserEvaluations`. The scale is -1..1, matching the main app's
 *  `enhancedEvaluationsThumbs`. */
let userEvaluations: Map<string, number> = new Map();
/** Optimistic overrides from the most recent click. Reading code prefers
 *  these over `userEvaluations` so the picked face stays highlighted even
 *  before Firestore confirms — the listener clears each entry once the
 *  server snapshot agrees with what we wrote. */
let optimisticEvaluations: Map<string, number> = new Map();
let userEvaluationsUnsub: Unsubscribe | null = null;

const LAST_READ_KEY = 'freedi_join_last_read';
let joinFormSubmitted = new Set<string>();
// In-memory cache of the last-known submission role per (questionId, userId).
// Lets handleJoin decide optimistically whether to open the form without a
// Firestore read. Populated on successful saveJoinFormSubmission, and by
// getJoinFormSubmissionRole on its first fetch.
const joinFormSubmittedRole = new Map<string, JoinRole>();
let customDisplayName: string | null = null;

const DISPLAY_NAME_KEY = 'freedi_join_name_v2';
const VISITED_KEY = 'freedi_join_visited';

// Clear stale name from old key
try {
	localStorage.removeItem('freedi_join_display_name');
} catch {
	/* ignore */
}

function getVisitedSet(): Set<string> {
	try {
		const raw = localStorage.getItem(VISITED_KEY);
		if (raw) return new Set(JSON.parse(raw));
	} catch {
		/* ignore */
	}

	return new Set();
}

function saveVisitedSet(visited: Set<string>): void {
	try {
		localStorage.setItem(VISITED_KEY, JSON.stringify([...visited]));
	} catch {
		/* ignore */
	}
}

export function markOptionRead(optionId: string): void {
	const visited = getVisitedSet();
	visited.add(optionId);
	saveVisitedSet(visited);
	markOptionChatRead(optionId);
}

function getLastReadMap(): Record<string, number> {
	try {
		const raw = localStorage.getItem(LAST_READ_KEY);
		if (raw) return JSON.parse(raw);
	} catch {
		/* ignore */
	}

	return {};
}

function markOptionChatRead(optionId: string): void {
	try {
		const map = getLastReadMap();
		map[optionId] = Date.now();
		localStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
	} catch {
		/* ignore */
	}
}

export function getNewMessageCount(optionId: string): number {
	const lastRead = getLastReadMap()[optionId];
	if (!lastRead) return messageCounts.get(optionId) ?? 0;

	const latest = messageLatest.get(optionId);
	if (!latest || latest <= lastRead) return 0;

	const allMsgs = messagesByOption.get(optionId);
	if (!allMsgs) return 0;

	return allMsgs.filter((ts) => ts > lastRead).length;
}

export function getUnreadCount(): number {
	const visible = getVisibleOptions();
	const visited = getVisitedSet();

	return visible.filter((o) => !visited.has(o.statementId)).length;
}

export function getTotalVisibleCount(): number {
	return getVisibleOptions().length;
}

export function setCustomDisplayName(name: string): void {
	customDisplayName = name;
	try {
		localStorage.setItem(DISPLAY_NAME_KEY, name);
	} catch {
		/* ignore */
	}
}

export function getCustomDisplayName(): string | null {
	if (customDisplayName) return customDisplayName;

	try {
		const stored = localStorage.getItem(DISPLAY_NAME_KEY);
		if (stored && stored.trim()) {
			customDisplayName = stored;

			return stored;
		}
	} catch {
		/* ignore */
	}

	return null;
}

export function clearCustomDisplayName(): void {
	customDisplayName = null;
	try {
		localStorage.removeItem(DISPLAY_NAME_KEY);
	} catch {
		/* ignore */
	}
}

export function needsDisplayName(): boolean {
	const user = getUserState().user;
	if (!user) return true;
	if (!user.isAnonymous) return false;

	return !getCustomDisplayName();
}

export function getQuestion(): Statement | null {
	return question;
}

export function getAllOptions(): Statement[] {
	return allOptions;
}

export function getOptionById(optionId: string): Statement | undefined {
	return allOptions.find((o) => o.statementId === optionId);
}

// Per-option cache of paragraph child Statements. Populated lazily by
// `loadOptionParagraphs` the first time a card is expanded — paragraph
// children are not part of the crowd-list options query (which only fetches
// `statementType === option`), so we fetch them on demand and keep them
// around for the rest of the session.
const optionParagraphsCache = new Map<string, Statement[]>();
const loadingOptionParagraphs = new Set<string>();

export function getOptionParagraphs(optionId: string): Statement[] | null {
	return optionParagraphsCache.get(optionId) ?? null;
}

export async function loadOptionParagraphs(optionId: string): Promise<void> {
	if (optionParagraphsCache.has(optionId)) return;
	if (loadingOptionParagraphs.has(optionId)) return;
	loadingOptionParagraphs.add(optionId);
	try {
		const q = query(
			collection(db, Collections.statements),
			where('parentId', '==', optionId),
			where('statementType', '==', StatementType.paragraph),
		);
		const snap = await getDocs(q);
		// Order by `createdAt` so paragraphs render in the order the author
		// wrote them — `sendMessage` staggers child createdAt by index for
		// exactly this reason.
		const paras = snap.docs
			.map((d) => d.data() as Statement)
			.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
		optionParagraphsCache.set(optionId, paras);
		m.redraw();
	} catch (err) {
		console.error('[loadOptionParagraphs] failed:', err);
	} finally {
		loadingOptionParagraphs.delete(optionId);
	}
}

export function getMessages(): Statement[] {
	return messages;
}

export function getVisibleOptions(): Statement[] {
	// Organizer suggestions (admin-created with `creatorRole === Role.admin`)
	// render in their own dedicated section — keep them out of the crowd list
	// here so the two lists stay separate. The "organizer" per-option role
	// users take via the activist/organizer join buttons is a different
	// concept tracked via `option.organizers[]`.
	// Admin-controlled sort: read `defaultSortType` off the question so every
	// participant subscribed to it sees the same order as the admin. The field
	// is shared with the main app's sort menu, so flipping it from either
	// surface stays in sync. The Join facilitator panel exposes four modes —
	// consensus (accepted), average evaluation, random, and newest — and any
	// other stale value falls through to the consensus default.
	// Manual sort: when admin enables manual ordering, read `manualOptionOrder`
	// (array of option IDs) and sort by that order instead.
	const sortType = question?.statementSettings?.defaultSortType;
	const randomSeed = question?.statementSettings?.randomSortSeed ?? 0;
	const manualOrder = (question?.statementSettings as any)?.manualOptionOrder as string[] | undefined;
	const isManualSort = manualOrder && manualOrder.length > 0;

	let opts = allOptions
		// organizer suggestions render in their own section above/below the regular list
		.filter((o) => o.creatorRole !== Role.admin)
		// admin-hidden options never render for anyone
		.filter((o) => o.hide !== true)
		.filter((o) => o.joinStatus !== 'failed')
		// buffer: hide options the user hasn't acknowledged yet (pending pill)
		.filter((o) => !bufferPendingIds.has(o.statementId));

	// Apply sort: manual order takes precedence, otherwise use the sort function
	if (isManualSort) {
		const manualOrderMap = new Map(manualOrder.map((id, idx) => [id, idx]));
		opts = opts.sort((a, b) => {
			const aIdx = manualOrderMap.get(a.statementId) ?? Infinity;
			const bIdx = manualOrderMap.get(b.statementId) ?? Infinity;
			return aIdx - bIdx;
		});
	} else {
		const sortFn = getSortFn(sortType, randomSeed);
		opts = opts.sort(sortFn);
	}

	// Condensation: in "clusters-only" mode for the join surface, hide any
	// original that is represented by a cluster (identified via
	// `integratedOptions`). Originals remain live in Firestore — this is a
	// display filter only.
	const condensation = question?.statementSettings?.condensation;
	const visibility =
		condensation?.enabled === true ? (condensation.visibility?.join ?? 'clusters-only') : 'both';
	if (visibility === 'clusters-only') {
		const memberOf = new Set<string>();
		for (const o of allOptions) {
			if (o.isCluster === true && Array.isArray(o.integratedOptions)) {
				o.integratedOptions.forEach((id) => memberOf.add(id));
			}
		}
		opts = opts.filter((o) => o.isCluster === true || !memberOf.has(o.statementId));
	}

	// Consensus-threshold filter: applies ONLY when admin explicitly chose
	// "Above specific value" in the selection-criteria settings (either via
	// the main-app settings page or via Join's facilitator panel — both
	// write `cutoffBy === aboveThreshold`). The default `topOptions` mode is
	// for results/winners and never filters the live engagement list — that
	// would clip options before participants get a chance to vote/join.
	// `cutoffNumber` is the canonical value; `minConsensus` is a legacy
	// field older FacilitatorPanel builds wrote to, kept as a read fallback
	// so existing question docs keep working without manual migration.
	const rs = question?.resultsSettings;
	if (rs?.cutoffBy === CutoffBy.aboveThreshold) {
		const cutoff = rs.cutoffNumber ?? rs.minConsensus;
		if (cutoff != null) {
			opts = opts.filter((o) => (o.consensus ?? 0) >= cutoff);
		}
	}

	// Re-inject admin-promoted options that the threshold would otherwise
	// drop, so admins can keep an option visible regardless of its score.
	// Organizer suggestions are excluded — they live in their own section and
	// never participate in the crowd list, even when forceShow is set.
	const forced = allOptions.filter(
		(o) =>
			o.forceShow === true &&
			o.hide !== true &&
			o.joinStatus !== 'failed' &&
			o.creatorRole !== Role.admin &&
			!bufferPendingIds.has(o.statementId),
	);
	if (forced.length > 0) {
		const seen = new Set(opts.map((o) => o.statementId));
		for (const f of forced) if (!seen.has(f.statementId)) opts.push(f);
	}

	// When sorted by anything other than "newest", newly-flushed options are
	// pinned to the top so participants evaluate them before they sink into the
	// stack. Once evaluated (or after the highlight timer expires) they animate
	// to their natural sorted position via the existing FLIP animation.
	if (sortType !== SortType.newest) {
		const pinned = opts.filter((o) => bufferHighlightedIds.has(o.statementId));
		const rest = opts.filter((o) => !bufferHighlightedIds.has(o.statementId));
		opts = [...pinned, ...rest];
	}

	return opts;
}

/** Options created by an admin from the Join app (or marked with
 *  `creatorRole: Role.admin` server-side). Rendered in a dedicated section
 *  separate from the participant crowd list, sorted newest first.
 *
 *  Distinct from the per-option "organizer" role users take via the
 *  activist/organizer join buttons (tracked via `option.organizers[]`).
 *  Admins can also seed the crowd list "as a regular participant" — those
 *  options have no `creatorRole` and appear via `getVisibleOptions()`. */
export function getOrganizerSuggestions(): Statement[] {
	return allOptions
		.filter((o) => o.creatorRole === Role.admin && o.hide !== true && o.joinStatus !== 'failed')
		.filter((o) => !bufferPendingIds.has(o.statementId))
		.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** Admin curation: set `hide` or `forceShow` on a specific option. Uses
 *  `setDoc` with merge to stay consistent with the rest of the module. */
export async function setOptionFlag(
	optionId: string,
	field: 'hide' | 'forceShow',
	value: boolean,
): Promise<void> {
	const ref = doc(db, Collections.statements, optionId);
	await setDoc(ref, { [field]: value, lastUpdate: Date.now() }, { merge: true });
}

/** Permission gate for editing an option's text. Mirrors the firestore.rules
 *  `isCreator()` and parent-admin checks: the original creator can always
 *  edit their own option, and admins of the question (the option's direct
 *  parent — its "top" from the option's perspective in this app) can edit
 *  any option under it. */
export function canEditSuggestion(option: Statement): boolean {
	const user = getUserState().user;
	if (!user) return false;
	if (option.creatorId === user.uid) return true;

	return isAdmin();
}

/** Update an option's body, writing it as the canonical "title + paragraph
 *  children" shape. The first non-empty line of the textarea becomes the
 *  option's `statement` (title); remaining non-empty lines become child
 *  Statements with `statementType === paragraph`. Any pre-existing paragraph
 *  children are deleted so the post-edit state is the single source of truth.
 *  Inline-shape options (whole multi-line body in `statement`) are migrated
 *  to canonical on first edit. The Firestore rule allows this write for the
 *  option's creator, the question admins, and the workspace admins. */
export async function updateSuggestion(optionId: string, text: string): Promise<void> {
	const trimmed = text.trim();
	if (!trimmed) return;

	const option = getOptionById(optionId);
	if (!option) return;
	if (!canEditSuggestion(option)) {
		throw new Error('Not authorized to edit this option');
	}

	const lines = trimmed
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	if (lines.length === 0) return;

	const title = lines[0];
	const bodyLines = lines.slice(1);

	// Make sure we know which paragraph children currently exist so the batch
	// can delete them. `loadOptionParagraphs` is a no-op when already cached.
	await loadOptionParagraphs(optionId);
	const existingParas = getOptionParagraphs(optionId) ?? [];

	// Pre-compute the description preview using the server-canonical "\n\n"
	// separator (see `functions/src/fn_syncParagraphChildrenToDescription.ts`)
	// so the optimistic client write matches the format the trigger will
	// eventually overwrite — no UI flicker between save and server flush.
	const DESCRIPTION_MAX_LENGTH = 200;
	let description = '';
	for (const line of bodyLines) {
		const next = description.length === 0 ? line : description + '\n\n' + line;
		if (next.length >= DESCRIPTION_MAX_LENGTH) {
			description =
				next.length > DESCRIPTION_MAX_LENGTH
					? next.slice(0, DESCRIPTION_MAX_LENGTH - 3) + '...'
					: next;
			break;
		}
		description = next;
	}

	const now = Date.now();
	const batch = writeBatch(db);

	batch.set(
		doc(db, Collections.statements, optionId),
		{ statement: title, description, lastUpdate: now },
		{ merge: true },
	);

	for (const para of existingParas) {
		batch.delete(doc(db, Collections.statements, para.statementId));
	}

	if (bodyLines.length > 0) {
		const creator = getCreator();
		if (creator) {
			const topParentId = option.topParentId || optionId;
			for (let i = 0; i < bodyLines.length; i++) {
				const child = createStatementObject({
					statement: bodyLines[i],
					statementType: StatementType.paragraph,
					parentId: optionId,
					topParentId,
					creatorId: creator.uid,
					creator,
				});
				if (!child) continue;
				// Stagger createdAt by index so paragraphs render in author order
				// regardless of write fan-out timing — same trick `sendMessage` uses.
				batch.set(doc(db, Collections.statements, child.statementId), {
					...child,
					createdAt: now + i + 1,
					lastUpdate: now + i + 1,
				});
			}
		}
	}

	await batch.commit();
	// Drop the local paragraph cache so SolutionCard re-fetches fresh children
	// the next time the card expands — otherwise it would render the deleted
	// children alongside the new ones.
	optionParagraphsCache.delete(optionId);
}

/** Facilitator live-control: turn the 5-face evaluation row on/off for all
 *  participants. Writes `statementSettings.showEvaluation` (the same flag
 *  the main app uses to gate its evaluation surfaces) so the join card and
 *  any main-app view stay in sync about whether evaluation is open. */
export async function setEvaluationEnabled(questionId: string, value: boolean): Promise<void> {
	const ref = doc(db, Collections.statements, questionId);
	await setDoc(
		ref,
		{
			statementSettings: { showEvaluation: value },
			lastUpdate: Date.now(),
		},
		{ merge: true },
	);
}

/** Facilitator live-control: change the sort order all participants see by
 *  writing `statementSettings.defaultSortType` on the question doc. The
 *  options listener re-renders every subscriber on the next snapshot, so
 *  participants drop into the new order without a refresh. When admin chooses
 *  `random`, also (re)write a fresh `randomSortSeed` so every participant
 *  computes the same shuffle, and pressing Random again gives a new order. */
export async function setSortType(questionId: string, value: SortType): Promise<void> {
	const ref = doc(db, Collections.statements, questionId);
	const patch: { statementSettings: { defaultSortType: SortType; randomSortSeed?: number; manualOptionOrder?: string[] } } = {
		statementSettings: { defaultSortType: value },
	};
	if (value === SortType.random) {
		patch.statementSettings.randomSortSeed = Date.now();
	}
	// Clear manual order when switching away from manual mode
	if (value !== SortType.random && (question?.statementSettings as any)?.manualOptionOrder) {
		(patch.statementSettings as any).manualOptionOrder = null;
	}
	await setDoc(ref, { ...patch, lastUpdate: Date.now() }, { merge: true });
}

/** Admin manual reordering: save the manually ordered list of option IDs.
 *  Participants will see options sorted in this exact order. Only admins can
 *  call this function. */
export async function setManualOptionOrder(questionId: string, optionIds: string[]): Promise<void> {
	const ref = doc(db, Collections.statements, questionId);
	await setDoc(
		ref,
		{
			statementSettings: { manualOptionOrder: optionIds },
			lastUpdate: Date.now(),
		},
		{ merge: true },
	);
}

/** Deterministic 32-bit hash of a string — used to derive a stable per-option
 *  random key from `(seed + statementId)` so every participant produces the
 *  same shuffle without storing per-option ordering. */
function hashStr(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}

	return h >>> 0;
}

function getSortFn(
	sortType: SortType | undefined,
	randomSeed: number,
): (a: Statement, b: Statement) => number {
	switch (sortType) {
		case SortType.newest:
			return (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0);
		case SortType.averageEvaluation:
			return (a, b) =>
				(b.evaluation?.averageEvaluation ?? 0) - (a.evaluation?.averageEvaluation ?? 0);
		case SortType.random: {
			const seed = String(randomSeed);

			return (a, b) => hashStr(seed + a.statementId) - hashStr(seed + b.statementId);
		}
		case SortType.accepted:
		default:
			return (a, b) => (b.consensus ?? 0) - (a.consensus ?? 0);
	}
}

/** Facilitator live-control: write a partial patch to a question doc. Callers
 *  pass shaped patches like `{ statementSettings: { hasChat: false } }` —
 *  Firestore deep-merges nested fields. The local `subscribeQuestion`
 *  listener then propagates the change to all participants on the next
 *  snapshot, so flips feel instant. */
export async function setQuestionSetting(
	questionId: string,
	patch: Partial<Statement>,
): Promise<void> {
	const ref = doc(db, Collections.statements, questionId);
	await setDoc(ref, { ...patch, lastUpdate: Date.now() }, { merge: true });
}

/** Hub-scoped settings live on the main statement, not on a question doc.
 *  Currently used for the QR sharing toggle (`statementSettings.showQR`),
 *  which any participant can act on but only an admin can flip. The local
 *  `subscribeMainStatement` listener propagates the change to every
 *  participant on the next snapshot, so the QR appears/disappears for the
 *  room without a refresh. */
export async function setMainStatementSetting(
	mainId: string,
	patch: Partial<Statement>,
): Promise<void> {
	const ref = doc(db, Collections.statements, mainId);
	await setDoc(ref, { ...patch, lastUpdate: Date.now() }, { merge: true });
}

/** Facilitator live-control: pick the visual style family applied to the
 *  whole join experience. Writes `statementSettings.themeStyle` on whichever
 *  doc the panel is acting on (main statement when invoked from the hub,
 *  question doc when invoked from a sub-question). The view layer reads the
 *  resolved value and sets `<html data-theme="...">` so participants get the
 *  matching palette without a refresh. */
export async function setThemeStyle(statementId: string, value: ThemeStyle): Promise<void> {
	const ref = doc(db, Collections.statements, statementId);
	await setDoc(
		ref,
		{
			statementSettings: { themeStyle: value },
			lastUpdate: Date.now(),
		},
		{ merge: true },
	);
}

/** Read the active theme style — prefers the question's setting, falls back
 *  to the hub's main-statement setting, then to `serious`. View code calls
 *  this on every render so a snapshot from either subscription propagates
 *  to `<html data-theme="...">` immediately. */
export function getActiveThemeStyle(): ThemeStyle {
	const fromQuestion = question?.statementSettings?.themeStyle;
	if (fromQuestion) return fromQuestion;

	const fromMain = mainStatement?.statementSettings?.themeStyle;
	if (fromMain) return fromMain;

	return ThemeStyle.serious;
}

/** Sync `<html data-theme="...">` to the active theme style. Called from every
 *  place that mutates `question` or `mainStatement` so the matching palette
 *  swaps in on the next paint without a refresh. The serious style omits the
 *  attribute so the default :root tokens apply (cheaper selector match). */
export function applyThemeStyleToDOM(): void {
	if (typeof document === 'undefined') return;
	const style = getActiveThemeStyle();
	const root = document.documentElement;
	if (style === ThemeStyle.playfulKids) {
		root.setAttribute('data-theme', 'playful-kids');
	} else if (style === ThemeStyle.playfulTeen) {
		root.setAttribute('data-theme', 'playful-teen');
	} else {
		root.removeAttribute('data-theme');
	}
}

/** Admin "lead the session" from inside the Join app: writes
 *  `joinFollowMe` on the main statement so participants get auto-redirected
 *  to wherever the admin points them. Pass an empty string to stop.
 *
 *  The path format follows the main app's routing (e.g.
 *  `/statement/{questionId}`); the join app translates it via
 *  `mapMainAppPathToJoinTarget` before redirecting.
 *
 *  We deliberately use a separate field from the main app's
 *  `powerFollowMe`. Main app sessions with power-follow active continually
 *  rewrite `powerFollowMe` to the admin's current main-app path (see
 *  `FollowMeToast.tsx`), which would clobber every write the join admin
 *  makes — pulling participants back to wherever the main-app admin is.
 *  `joinFollowMe` is owned by the Join app alone. */
export async function setPowerFollowMe(mainId: string, path: string): Promise<void> {
	const ref = doc(db, Collections.statements, mainId);
	await setDoc(ref, { joinFollowMe: path, lastUpdate: Date.now() }, { merge: true });
}

/** Current `joinFollowMe` path on the subscribed main statement, or ''
 *  when nobody is leading from inside the Join app. */
export function getPowerFollowMePath(): string {
	return mainStatement?.joinFollowMe ?? '';
}

/** Create a new option under the active question.
 *
 *  Two paths exist; `asOrganizer` chooses between them. When unset, the
 *  default is "organizer for admins, participant for everyone else" — which
 *  matches the original single-button UX.
 *    • Organizer path: calls the `createOrganizerSuggestion` Cloud Function.
 *      It writes with `creatorRole: Role.admin` via the admin SDK (direct
 *      client writes that set `creatorRole` are rejected by firestore.rules
 *      to prevent badge spoofing — the callable is the only path that
 *      produces the organizer badge). Admin-only.
 *    • Participant path: when the question's `enableAddEvaluationOption`
 *      setting is on, write the option directly. No `creatorRole`, so it
 *      joins the regular crowd list. Admins may also use this path when
 *      they want to seed the crowd list without the organizer badge.
 *
 *  The shared helper means UI callers and translation copy can stay
 *  neutral, and the admin gets both buttons when additions are enabled. */
export async function createSuggestion(text: string, asOrganizer?: boolean): Promise<void> {
	if (!question) return;

	const creator = getCreator();
	if (!creator) return;

	const trimmed = text.trim();
	if (!trimmed) return;

	// Default: admins post as organizer, participants post as themselves.
	const useOrganizerPath = asOrganizer ?? isAdmin();

	if (useOrganizerPath) {
		if (!isAdmin()) {
			throw new Error('Only admins can post organizer suggestions');
		}
		const call = httpsCallable<
			{ questionId: string; text: string; displayName?: string },
			{ statementId: string }
		>(functions, 'createOrganizerSuggestion');
		await call({
			questionId: question.statementId,
			text: trimmed,
			displayName: creator.displayName,
		});

		return;
	}

	// Participant path: gate on the admin-controlled toggle so a stale UI
	// can't push writes after the admin closes additions. Admins are exempt —
	// they own the toggle and can seed the crowd list at any time.
	if (!isAdmin() && question.statementSettings?.enableAddEvaluationOption !== true) {
		throw new Error('Adding options is not enabled for this question');
	}

	const newOption = createStatementObject({
		statement: trimmed,
		statementType: StatementType.option,
		parentId: question.statementId,
		topParentId: question.topParentId || question.statementId,
		creatorId: creator.uid,
		creator,
	});

	if (!newOption) return;

	await setDoc(doc(db, Collections.statements, newOption.statementId), newOption);
}

function buildCreator(): Creator | null {
	const user = getUserState().user;
	if (!user) return null;

	let displayName = user.displayName || 'Anonymous';
	if (user.isAnonymous) {
		const custom = getCustomDisplayName();
		if (custom) displayName = custom;
	}

	return {
		uid: user.uid,
		displayName,
		photoURL: user.photoURL,
		isAnonymous: user.isAnonymous,
		email: user.email,
	};
}

export function getCreator(): Creator | null {
	return buildCreator();
}

/** Create a brand-new top-parent question Statement directly from the join
 *  app. The Statement is written to Firestore with `parentId === 'top'` and
 *  the current user as creator; the `onStatementCreated` Cloud Function then
 *  fans out the admin subscription doc, so subsequent visits resolve the
 *  user as admin via `checkAdminStatus`.
 *
 *  Returns the new statementId on success, or null if there's no signed-in
 *  user or the schema validation fails. */
export async function createSimpleQuestion(title: string): Promise<string | null> {
	const trimmed = title.trim();
	if (!trimmed) return null;

	await ensureUser();
	const creator = buildCreator();
	if (!creator) return null;

	const newQuestion = createStatementObject({
		statement: trimmed,
		statementType: StatementType.question,
		parentId: 'top',
		creatorId: creator.uid,
		creator,
		statementSettings: {
			// Match join-app participant expectations: people propose options and
			// discuss them. Evaluation stays on so the 5-face row appears.
			showEvaluation: true,
			enableAddEvaluationOption: true,
			enableAddVotingOption: true,
			enableSimilaritiesSearch: true,
			enableNavigationalElements: true,
		},
	});

	if (!newQuestion) return null;

	// `topParentId` defaults to `parentId` when omitted, which yields `'top'`
	// for a root statement — but we want it to point at the statement itself
	// so it lands as its own top-parent (matching how main-app top-level
	// questions are stored, and how join queries find facilitator descendants).
	//
	// `membership.access` is required: Firestore rules for `statementsSubscribe`
	// look up the parent's `membership.access` to decide whether a self-create
	// of a subscription doc is allowed (e.g. when the join app marks the
	// creator's "opened in join" subscription before the cloud function fans
	// out the admin sub). `openToAll` matches the join app's anonymous-friendly
	// flow — anyone with the link can participate.
	const finalQuestion: Statement = {
		...newQuestion,
		topParentId: newQuestion.statementId,
		membership: {
			...(newQuestion.membership ?? {}),
			access: Access.openToAll,
		},
	};

	await setDoc(doc(db, Collections.statements, finalQuestion.statementId), finalQuestion);

	return finalQuestion.statementId;
}

function syncQuestionLanguage(): void {
	if (!question) return;
	const wasForced = isLanguageForced();
	applyStatementLanguage(question.defaultLanguage, question.forceLanguage);
	applyThemeStyleToDOM();
	maybeShowForcedLanguageToast(isLanguageForced(), wasForced);
}

/** Optimistic priming: if the requested question is already in the
 *  module-level cache (typically the hub's `subQuestions[]`, which has been
 *  streaming since the user landed on `/m/:mid`), copy it into the active
 *  `question` slot so views can render immediately without waiting for a
 *  Firestore round-trip. Returns true when the cache hit, so callers can skip
 *  the loading screen. The full `loadQuestion` still runs after this to
 *  fetch fresh data and warm `allOptions`. */
export function primeQuestionFromCache(questionId: string): boolean {
	const cached = subQuestions.find((s) => s.statementId === questionId);
	if (!cached) return false;
	question = cached;
	syncQuestionLanguage();

	return true;
}

export async function loadQuestion(questionId: string): Promise<void> {
	const qDoc = await getDoc(doc(db, Collections.statements, questionId));
	if (!qDoc.exists()) {
		question = null;
		allOptions = [];
		m.redraw();

		return;
	}

	question = qDoc.data() as Statement;
	syncQuestionLanguage();

	// Resolve admin status (creator or subscribed admin) before options render,
	// so the first paint already knows whether to show admin-only UI.
	await checkAdminStatus(questionId, question.creatorId);

	const optionsQuery = query(
		collection(db, Collections.statements),
		where('parentId', '==', questionId),
		where('statementType', '==', StatementType.option),
	);
	const optionsSnap = await getDocs(optionsQuery);
	allOptions = optionsSnap.docs.map((d) => d.data() as Statement);

	// Warm the join-form submission cache in the background so the modal opens
	// with the user's previous name/phone/email on their first click. Gated by
	// joinForm.enabled to avoid unnecessary reads.
	if (question.statementSettings?.joinForm?.enabled) {
		void prefetchJoinFormSubmission(questionId);
	}

	m.redraw();
}

async function prefetchJoinFormSubmission(questionId: string): Promise<void> {
	try {
		await ensureUser();
		const creator = getCreator();
		if (!creator) return;
		await getJoinFormSubmissionData(questionId, creator.uid);
		m.redraw();
	} catch {
		/* ignore — modal will still work, just without prefill */
	}
}

export function subscribeQuestion(questionId: string): Unsubscribe {
	return onSnapshot(doc(db, Collections.statements, questionId), (snap) => {
		if (snap.exists()) {
			question = snap.data() as Statement;
			syncQuestionLanguage();
		} else {
			question = null;
			applyThemeStyleToDOM();
		}
		m.redraw();
	});
}

// --- Facilitated-mode state (Main Hub + sub-questions + cross-app follow) ---

let mainStatement: Statement | null = null;
let subQuestions: Statement[] = [];
let lastFollowedPath = '';
let activeFacilitatedMainId: string | null = null;
let pendingRedirectTimer: number | null = null;

export function getMainStatement(): Statement | null {
	return mainStatement;
}

export function getSubQuestions(): Statement[] {
	// Admin-controlled order via the `Statement.order` field. Statements without
	// an explicit order fall back to creation time so brand-new sub-questions
	// land at the end of the list until an admin reorders. Hidden sub-questions
	// are filtered out for participants but stay in the list for admins so they
	// can unhide them — same pattern used for hidden options under a question.
	const isAdminUser = isAdmin();

	return [...subQuestions]
		.filter((s) => isAdminUser || s.hide !== true)
		.sort((a, b) => {
			const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
			const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
			if (ao !== bo) return ao - bo;

			return (a.createdAt ?? 0) - (b.createdAt ?? 0);
		});
}

export async function loadMainStatement(mainId: string): Promise<void> {
	const snap = await getDoc(doc(db, Collections.statements, mainId));
	if (!snap.exists()) {
		mainStatement = null;
		subQuestions = [];
		m.redraw();

		return;
	}
	mainStatement = snap.data() as Statement;
	syncMainStatementLanguage();

	const subQ = query(
		collection(db, Collections.statements),
		where('parentId', '==', mainId),
		where('statementType', '==', StatementType.question),
	);
	const subSnap = await getDocs(subQ);
	subQuestions = subSnap.docs.map((d) => d.data() as Statement);
	m.redraw();
}

function syncMainStatementLanguage(): void {
	if (!mainStatement) return;
	const wasForced = isLanguageForced();
	applyStatementLanguage(mainStatement.defaultLanguage, mainStatement.forceLanguage);
	applyThemeStyleToDOM();
	maybeShowForcedLanguageToast(isLanguageForced(), wasForced);
}

/** Toast once per session when forceLanguage transitions from not-forced to
 *  forced. Without this, a participant would silently watch their own
 *  language selector disable when the admin flips the toggle remotely.
 *  We deliberately fire this only once per session — any re-arrival (route
 *  change, snapshot replay) shouldn't re-toast, since the participant has
 *  already been informed. The "forced" reading comes from the i18n module
 *  (read after applyStatementLanguage runs) so it stays the single source
 *  of truth for what the participant's UI is actually seeing. */
let forcedLanguageToastShownForSession = false;

function maybeShowForcedLanguageToast(nowForced: boolean, wasForced: boolean): void {
	if (!nowForced || wasForced) return;
	if (forcedLanguageToastShownForSession) return;
	forcedLanguageToastShownForSession = true;
	showFacilitatorToast(t('facilitator.toast.languageForced'));
}

/** Admin write: set the room's default language and (optionally) the
 *  forceLanguage flag on the main statement. Mirrors the Theme picker's
 *  hub-scoped pattern — falls back to writing the question doc on legacy
 *  non-facilitated routes (`/q/:qid`) where there's no main statement.
 *  Both fields are top-level on Statement, not under `statementSettings`. */
export async function setStatementLanguage(
	statementId: string,
	defaultLanguage: string,
	forceLanguage: boolean,
): Promise<void> {
	const ref = doc(db, Collections.statements, statementId);
	await setDoc(ref, { defaultLanguage, forceLanguage, lastUpdate: Date.now() }, { merge: true });
}

/** Read the active language scope: prefers the main statement when present
 *  (hub-scoped, like the theme), falls back to the question doc. Returns the
 *  configured `defaultLanguage` (may be undefined) and the `forceLanguage`
 *  flag (defaults to false) so the FacilitatorPanel can render its select +
 *  toggle from a single source of truth. */
export function getActiveLanguageScope(): {
	target: Statement | null;
	defaultLanguage: string | undefined;
	forceLanguage: boolean;
} {
	const target = mainStatement ?? question;
	if (!target) {
		return { target: null, defaultLanguage: undefined, forceLanguage: false };
	}

	return {
		target,
		defaultLanguage: target.defaultLanguage,
		forceLanguage: target.forceLanguage === true,
	};
}

/** Admin-only: append a new sub-question under the current main statement. The
 *  new statement is intentionally created without an explicit `order` field so
 *  it sorts to the end of the list via the `createdAt` tiebreaker — until the
 *  admin reorders, at which point `setSubQuestionsOrder` writes explicit
 *  indices for every sibling. Setting an explicit small index here would
 *  otherwise jump the new card past existing unordered siblings (which fall
 *  back to MAX_SAFE_INTEGER in the sort).
 *
 *  Returns the new statementId on success, or null if the user isn't admin or
 *  the schema validation fails. Mirrors `createSimpleQuestion` but parents the
 *  result under the main statement instead of `'top'`, and uses the main's
 *  topParent so descendants stay reachable from the workspace root. */
export async function createSubQuestion(mainId: string, title: string): Promise<string | null> {
	if (!isAdmin()) return null;
	const trimmed = title.trim();
	if (!trimmed) return null;

	await ensureUser();
	const creator = buildCreator();
	if (!creator) return null;

	const main = mainStatement;
	const topParentId = main?.topParentId || mainId;
	const parents = [...(main?.parents ?? []), mainId];

	const newQuestion = createStatementObject({
		statement: trimmed,
		statementType: StatementType.question,
		parentId: mainId,
		topParentId,
		parents,
		creatorId: creator.uid,
		creator,
		statementSettings: {
			showEvaluation: true,
			enableAddEvaluationOption: true,
			enableAddVotingOption: true,
			enableSimilaritiesSearch: true,
			enableNavigationalElements: true,
		},
	});

	if (!newQuestion) return null;

	await setDoc(doc(db, Collections.statements, newQuestion.statementId), newQuestion);

	return newQuestion.statementId;
}

/** Admin-only: persist a new sibling order for sub-questions. Writes the
 *  index of each id as the `order` field via parallel `setDoc` merges — the
 *  list will rarely exceed a handful, so a Firestore batch is overkill. */
export async function setSubQuestionsOrder(orderedIds: string[]): Promise<void> {
	if (!isAdmin()) return;
	const now = Date.now();
	await Promise.all(
		orderedIds.map((id, index) =>
			setDoc(
				doc(db, Collections.statements, id),
				{ order: index, lastUpdate: now },
				{ merge: true },
			),
		),
	);
}

/** Admin-only: hide or unhide a sub-question. Hidden sub-questions are
 *  filtered out of `getSubQuestions()` for non-admins (admins still see them
 *  greyed out so they can unhide). Reuses `Statement.hide`, the same field
 *  the options list already respects via `setOptionFlag`. */
export async function setSubQuestionHidden(subQuestionId: string, hidden: boolean): Promise<void> {
	if (!isAdmin()) return;
	await setDoc(
		doc(db, Collections.statements, subQuestionId),
		{ hide: hidden, lastUpdate: Date.now() },
		{ merge: true },
	);
}

/** Admin-only: rename a question (main statement, sub-question, or top-level
 *  question). Touches only `statement` and `lastUpdate`, so it stays clear of
 *  the protected `statementSettings` field that requires a stricter rule
 *  check. The Firestore `update` rule still requires admin/creator/system-admin
 *  for any non-trivial write — the `isAdmin()` guard here is the client-side
 *  mirror so we don't fire a write that the rule will reject. */
export async function updateQuestionTitle(statementId: string, text: string): Promise<void> {
	if (!isAdmin()) return;
	const trimmed = text.trim();
	if (!trimmed) return;
	await setDoc(
		doc(db, Collections.statements, statementId),
		{ statement: trimmed, lastUpdate: Date.now() },
		{ merge: true },
	);
}

export function subscribeMainStatement(mainId: string): Unsubscribe {
	// When swapping to a different main, reset the dedupe so the first snapshot
	// for the new mid is allowed to fire a redirect.
	if (activeFacilitatedMainId !== mainId) {
		activeFacilitatedMainId = mainId;
		lastFollowedPath = '';
	}

	return onSnapshot(doc(db, Collections.statements, mainId), (snap) => {
		if (!snap.exists()) {
			mainStatement = null;
			applyThemeStyleToDOM();
			m.redraw();

			return;
		}
		const data = snap.data() as Statement;
		mainStatement = data;
		syncMainStatementLanguage();

		// Participants auto-redirect to wherever the facilitator is. Admins are
		// skipped — they're the source of truth for `joinFollowMe`, so being
		// pulled around by their own broadcast would prevent them from
		// navigating freely while leading.
		//
		// We use the join-specific `joinFollowMe` field rather than the
		// main app's `powerFollowMe` / `followMe`. Main-app sessions with
		// power-follow active continually rewrite `powerFollowMe` to the
		// admin's current main-app path (FollowMeToast.tsx), which would yank
		// join participants away every time the join admin tried to lead.
		// `joinFollowMe` is owned by the Join app alone, so a stray main-app
		// session can't fight us.
		const activePath = data.joinFollowMe ?? '';
		if (activePath !== lastFollowedPath) {
			lastFollowedPath = activePath;
			if (!isAdmin()) {
				void applyFacilitatorRedirect(activePath, mainId);
			}
		}
		m.redraw();
	});
}

export function subscribeSubQuestions(mainId: string): Unsubscribe {
	const subQ = query(
		collection(db, Collections.statements),
		where('parentId', '==', mainId),
		where('statementType', '==', StatementType.question),
	);

	return onSnapshot(subQ, (snap) => {
		subQuestions = snap.docs.map((d) => d.data() as Statement);
		m.redraw();
	});
}

async function applyFacilitatorRedirect(path: string, mainId: string): Promise<void> {
	// Empty path = admin deactivated power-follow; per UX decision, participants
	// stay where they are (no redirect, no toast).
	if (!path) {
		if (pendingRedirectTimer !== null) {
			window.clearTimeout(pendingRedirectTimer);
			pendingRedirectTimer = null;
		}

		return;
	}

	const target = await mapMainAppPathToJoinTarget(path, mainId);
	if (!target) return;

	const route = joinTargetToRoute(target, mainId);
	if (route === m.route.get()) return;

	showFacilitatorToast(t('facilitator.following'));

	if (pendingRedirectTimer !== null) {
		window.clearTimeout(pendingRedirectTimer);
	}
	pendingRedirectTimer = window.setTimeout(() => {
		pendingRedirectTimer = null;
		if (m.route.get() !== route) m.route.set(route);
	}, FACILITATOR_REDIRECT_DELAY_MS);
}

export function getMessageCount(optionId: string): number {
	return messageCounts.get(optionId) ?? 0;
}

export function subscribeOptions(questionId: string): Unsubscribe {
	// Reset buffer for this question session
	bufferKnownIds = new Set<string>();
	bufferPendingIds = new Set<string>();
	bufferHighlightedIds = new Set<string>();
	bufferStabilized = false;
	if (bufferStabilizeTimer !== null) clearTimeout(bufferStabilizeTimer);
	for (const t of bufferHighlightTimers.values()) clearTimeout(t);
	bufferHighlightTimers.clear();

	bufferStabilizeTimer = setTimeout(() => {
		bufferStabilized = true;
		bufferStabilizeTimer = null;
	}, BUFFER_STABILIZE_MS);

	const optionsQuery = query(
		collection(db, Collections.statements),
		where('parentId', '==', questionId),
		where('statementType', '==', StatementType.option),
	);

	return onSnapshot(optionsQuery, (snap) => {
		const incoming = snap.docs.map((d) => d.data() as Statement);
		const currentUid = getUserState().user?.uid;

		for (const opt of incoming) {
			const id = opt.statementId;
			if (!bufferStabilized || opt.creatorId === currentUid) {
				// Warm-up OR own submission: appear immediately, highlight own ones
				if (bufferStabilized && opt.creatorId === currentUid && !bufferKnownIds.has(id)) {
					// Own newly-submitted option: skip the pill, highlight directly
					bufferHighlightedIds.add(id);
					if (bufferHighlightTimers.has(id)) clearTimeout(bufferHighlightTimers.get(id)!);
					const timer = setTimeout(() => {
						bufferHighlightedIds.delete(id);
						bufferHighlightTimers.delete(id);
						m.redraw();
					}, BUFFER_HIGHLIGHT_MS);
					bufferHighlightTimers.set(id, timer);
				}
				bufferKnownIds.add(id);
			} else if (!bufferKnownIds.has(id) && !bufferPendingIds.has(id)) {
				// Post-stabilize: genuinely new option from another user — queue it
				bufferPendingIds.add(id);
			} else {
				bufferKnownIds.add(id);
			}
		}

		allOptions = incoming;
		subscribeMessageCounts(questionId);
		subscribeClusterLinks();
		m.redraw();
	});
}

export function getNewOptionsPendingCount(): number {
	return bufferPendingIds.size;
}

export function flushNewOptions(): void {
	for (const id of bufferPendingIds) {
		bufferKnownIds.add(id);
		bufferHighlightedIds.add(id);
		if (bufferHighlightTimers.has(id)) clearTimeout(bufferHighlightTimers.get(id)!);
		const timer = setTimeout(() => {
			bufferHighlightedIds.delete(id);
			bufferHighlightTimers.delete(id);
			m.redraw();
		}, BUFFER_HIGHLIGHT_MS);
		bufferHighlightTimers.set(id, timer);
	}
	bufferPendingIds = new Set<string>();
	m.redraw();
}

export function isOptionNewlyArrived(optionId: string): boolean {
	return bufferHighlightedIds.has(optionId);
}

/**
 * Subscribe to `clusterEvaluationLinks` for every currently-visible cluster,
 * so the card can show a counts-only breakdown ("Combined votes from N
 * evaluators"). Tears down prior subscriptions when the cluster set changes.
 */
function subscribeClusterLinks(): void {
	for (const unsub of clusterLinksUnsubs) unsub();
	clusterLinksUnsubs = [];
	clusterEvaluatorCounts = new Map();

	const clusterIds = allOptions.filter((o) => o.isCluster === true).map((o) => o.statementId);
	if (clusterIds.length === 0) return;

	const BATCH = 30;
	for (let i = 0; i < clusterIds.length; i += BATCH) {
		const batch = clusterIds.slice(i, i + BATCH);
		const q = query(
			collection(db, Collections.clusterEvaluationLinks),
			where('clusterId', 'in', batch),
		);
		const unsub = onSnapshot(q, (snap) => {
			const counts = new Map<string, number>();
			snap.forEach((d) => {
				const link = d.data() as { clusterId?: string };
				if (link?.clusterId) {
					counts.set(link.clusterId, (counts.get(link.clusterId) ?? 0) + 1);
				}
			});
			// Merge into the outer map — other batches may own different clusters.
			for (const id of batch) {
				if (counts.has(id)) {
					clusterEvaluatorCounts.set(id, counts.get(id)!);
				} else {
					clusterEvaluatorCounts.delete(id);
				}
			}
			m.redraw();
		});
		clusterLinksUnsubs.push(unsub);
	}
}

export function getClusterEvaluatorCount(clusterId: string): number {
	return clusterEvaluatorCounts.get(clusterId) ?? 0;
}

/** What face should be highlighted on the option's evaluation row? Returns
 *  the optimistic value if a click is still in flight, otherwise the
 *  server-confirmed value. `undefined` means the user hasn't evaluated yet. */
export function getEffectiveEvaluation(optionId: string): number | undefined {
	if (optimisticEvaluations.has(optionId)) {
		return optimisticEvaluations.get(optionId);
	}

	return userEvaluations.get(optionId);
}

/** Optimistic evaluation write — mirrors the main app's
 *  `setEvaluationToDB` shape so the same Cloud Function aggregates the
 *  result. Highlights the face immediately, then writes through; the
 *  evaluations listener clears the optimistic entry as soon as the server
 *  snapshot matches. */
export async function setEvaluation(option: Statement, score: number): Promise<void> {
	if (score < -1 || score > 1) return;
	if (!option.parentId) return;

	const creator = getCreator();
	if (!creator) return;

	// Optimistic: paint the chosen face immediately and trigger a redraw so
	// there's no perceptible lag between click and selected-state.
	optimisticEvaluations.set(option.statementId, score);

	// Un-pin from the top-of-list highlight so the option falls to its natural
	// sorted position — the FLIP animation in Solutions.ts handles the move.
	if (bufferHighlightedIds.has(option.statementId)) {
		bufferHighlightedIds.delete(option.statementId);
		const t = bufferHighlightTimers.get(option.statementId);
		if (t !== undefined) {
			clearTimeout(t);
			bufferHighlightTimers.delete(option.statementId);
		}
	}

	m.redraw();

	const evaluationId = `${creator.uid}--${option.statementId}`;
	const data = {
		parentId: option.parentId,
		evaluationId,
		statementId: option.statementId,
		evaluatorId: creator.uid,
		updatedAt: Date.now(),
		evaluation: score,
		evaluator: creator,
	};

	try {
		await setDoc(doc(db, Collections.evaluations, evaluationId), data);
	} catch (err) {
		// Roll the optimistic entry back so the UI reflects what's actually
		// saved on the server side.
		optimisticEvaluations.delete(option.statementId);
		m.redraw();
		console.error('[setEvaluation] failed:', err);
		throw err;
	}
}

/** Subscribe to the current user's evaluations under this question, so the
 *  card UI re-renders into the correct selected face when other clients (or
 *  another tab) update the value. Tears down any prior subscription. */
export function subscribeUserEvaluations(questionId: string): Unsubscribe {
	if (userEvaluationsUnsub) {
		userEvaluationsUnsub();
		userEvaluationsUnsub = null;
	}
	userEvaluations = new Map();
	optimisticEvaluations = new Map();

	const creator = getCreator();
	if (!creator) {
		return () => undefined;
	}

	const q = query(
		collection(db, Collections.evaluations),
		where('parentId', '==', questionId),
		where('evaluatorId', '==', creator.uid),
	);

	userEvaluationsUnsub = onSnapshot(q, (snap) => {
		const next = new Map<string, number>();
		for (const d of snap.docs) {
			const data = d.data() as { statementId?: string; evaluation?: number };
			if (typeof data.statementId === 'string' && typeof data.evaluation === 'number') {
				next.set(data.statementId, data.evaluation);
			}
		}
		userEvaluations = next;

		// Clear optimistic entries that the server has now confirmed (or that
		// the server resolved to the same value). Keeping a stale optimistic
		// override would mask a server-rejected write.
		for (const [optionId, optimisticScore] of optimisticEvaluations) {
			const confirmed = next.get(optionId);
			if (confirmed === optimisticScore) {
				optimisticEvaluations.delete(optionId);
			}
		}
		m.redraw();
	});

	return userEvaluationsUnsub;
}

function subscribeMessageCounts(_questionId: string): void {
	for (const unsub of messageCountsUnsubs) unsub();
	messageCountsUnsubs = [];

	const optionIds = allOptions.map((o) => o.statementId);
	if (optionIds.length === 0) return;

	const batchSize = 30;
	for (let i = 0; i < optionIds.length; i += batchSize) {
		const batch = optionIds.slice(i, i + batchSize);

		const chatQuery = query(
			collection(db, Collections.statements),
			where('parentId', 'in', batch),
			where('statementType', '==', StatementType.statement),
		);

		const unsub = onSnapshot(chatQuery, (snap) => {
			for (const id of batch) {
				messageCounts.delete(id);
				messageLatest.delete(id);
				messagesByOption.delete(id);
			}

			for (const d of snap.docs) {
				const data = d.data() as Statement;
				const pid = data.parentId;
				messageCounts.set(pid, (messageCounts.get(pid) ?? 0) + 1);

				const ts = data.createdAt ?? 0;
				const existing = messageLatest.get(pid) ?? 0;
				if (ts > existing) messageLatest.set(pid, ts);

				const arr = messagesByOption.get(pid) ?? [];
				arr.push(ts);
				messagesByOption.set(pid, arr);
			}
			m.redraw();
		});

		messageCountsUnsubs.push(unsub);
	}
}

export function subscribeChat(optionId: string): void {
	unsubscribeChat();

	const chatQuery = query(
		collection(db, Collections.statements),
		where('parentId', '==', optionId),
		where('statementType', '==', StatementType.statement),
		orderBy('createdAt'),
	);

	chatUnsubscribe = onSnapshot(chatQuery, (snap) => {
		messages = snap.docs.map((d) => d.data() as Statement);
		m.redraw();
	});
}

export function unsubscribeChat(): void {
	if (chatUnsubscribe) {
		chatUnsubscribe();
		chatUnsubscribe = null;
	}
	messages = [];
}

export async function sendMessage(optionId: string, text: string): Promise<void> {
	const creator = buildCreator();
	if (!creator || !text.trim()) return;

	const topParentId = question?.statementId || optionId;

	// Split the user's input on newlines so multi-paragraph messages are stored
	// in the canonical "parent statement + paragraph child statements" shape.
	// First non-empty line becomes the parent's title; remaining non-empty lines
	// become child Statements with `statementType === paragraph`. Single-line
	// messages skip the batch and write a single doc, same as before.
	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	if (lines.length === 0) return;

	const title = lines[0];
	const bodyLines = lines.slice(1);

	const parentStatement = createStatementObject({
		statement: title,
		statementType: StatementType.statement,
		parentId: optionId,
		topParentId,
		creatorId: creator.uid,
		creator,
	});

	if (!parentStatement) return;

	if (bodyLines.length === 0) {
		// Single-line: keep the original single-doc write path.
		await setDoc(doc(db, Collections.statements, parentStatement.statementId), parentStatement);

		return;
	}

	// Pre-compute the description preview so the chat can render the full
	// body immediately, without waiting for the server-side description-regen
	// trigger to fire after the paragraph children land.
	const DESCRIPTION_MAX_LENGTH = 200;
	let description = '';
	for (const line of bodyLines) {
		const next = description.length === 0 ? line : description + ' | ' + line;
		if (next.length >= DESCRIPTION_MAX_LENGTH) {
			description =
				next.length > DESCRIPTION_MAX_LENGTH
					? next.slice(0, DESCRIPTION_MAX_LENGTH - 3) + '...'
					: next;
			break;
		}
		description = next;
	}

	const batch = writeBatch(db);
	batch.set(doc(db, Collections.statements, parentStatement.statementId), {
		...parentStatement,
		description,
	});

	for (let i = 0; i < bodyLines.length; i++) {
		const child = createStatementObject({
			statement: bodyLines[i],
			statementType: StatementType.paragraph,
			parentId: parentStatement.statementId,
			topParentId,
			creatorId: creator.uid,
			creator,
		});
		if (!child) continue;
		// Preserve order: stagger createdAt by index so paragraphs render in
		// the order the user wrote them, regardless of write fan-out timing.
		batch.set(doc(db, Collections.statements, child.statementId), {
			...child,
			createdAt: parentStatement.createdAt + i + 1,
			lastUpdate: parentStatement.createdAt + i + 1,
		});
	}

	await batch.commit();
}

export type JoinRole = 'activist' | 'organizer';

export interface ToggleJoiningResult {
	success: boolean;
	leftStatementId?: string;
	leftStatementTitle?: string;
	error?: string;
}

/** All visible options under the current question where the user is a
 *  member in either role (joined or organizers). Distinct — a user who's
 *  both activist and organizer on the same option counts once. Used by the
 *  per-user cap: the cap is "how many activities you're committed to" and
 *  is role-agnostic, so a role swap on the same option (activist ↔
 *  organizer) doesn't bump the count and shouldn't trigger the swap modal.
 *  Hidden / failed options are filtered out so they don't inflate the count
 *  toward an admin-imposed cap participants can no longer act on. */
export function getUserCommittedOptions(): Statement[] {
	const creator = buildCreator();
	if (!creator) return [];
	const uid = creator.uid;

	return allOptions.filter((option) => {
		if (option.hide === true) return false;
		if (option.joinStatus === 'failed') return false;
		const inJoined = Array.isArray(option.joined) && option.joined.some((c: Creator) => c.uid === uid);
		const inOrgs =
			Array.isArray(option.organizers) && option.organizers.some((c: Creator) => c.uid === uid);

		return inJoined || inOrgs;
	});
}

export interface ToggleJoiningOptions {
	/** When set, atomically remove the user from this sibling option's
	 *  `joined`/`organizers` list before adding them to the new one. Used by
	 *  the LimitReachedModal swap flow so a cap is preserved across the swap. */
	releaseFromOptionId?: string;
}

export async function toggleJoining(
	statementId: string,
	parentStatementId: string,
	role: JoinRole = 'activist',
	options: ToggleJoiningOptions = {},
): Promise<ToggleJoiningResult> {
	const field: 'joined' | 'organizers' = role === 'organizer' ? 'organizers' : 'joined';

	try {
		const creator = buildCreator();
		if (!creator) throw new Error('User not authenticated');

		const statementRef = doc(db, Collections.statements, statementId);
		const releaseRef = options.releaseFromOptionId
			? doc(db, Collections.statements, options.releaseFromOptionId)
			: null;
		let leftStatementId: string | undefined;
		let leftStatementTitle: string | undefined;
		let userWasUnjoinedFromStatement = false;

		let singleJoinOnly = false;
		if (role === 'activist' && parentStatementId) {
			const parentDoc = await getDoc(doc(db, Collections.statements, parentStatementId));
			if (parentDoc.exists()) {
				const parent = parentDoc.data() as Statement;
				singleJoinOnly = parent?.statementSettings?.singleJoinOnly ?? false;
			}
		}

		await runTransaction(db, async (transaction) => {
			const statementDB = await transaction.get(statementRef);
			if (!statementDB.exists()) throw new Error('Statement does not exist');

			// Read the explicit release target inside the transaction too, so the
			// remove-and-add pair is atomic from the participant's perspective.
			const releaseSnap = releaseRef ? await transaction.get(releaseRef) : null;

			const statement = statementDB.data() as Statement;
			const otherField: 'joined' | 'organizers' = field === 'joined' ? 'organizers' : 'joined';
			const currentMembers: Creator[] =
				(field === 'organizers' ? statement.organizers : statement.joined) ?? [];
			const currentOthers: Creator[] =
				(otherField === 'organizers' ? statement.organizers : statement.joined) ?? [];

			const isUserMember = currentMembers.some((u) => u.uid === creator.uid);

			if (isUserMember) {
				const updated = currentMembers.filter((u) => u.uid !== creator.uid);
				transaction.update(statementRef, { [field]: updated });
				userWasUnjoinedFromStatement = true;

				return;
			}

			const updatePayload: Record<string, Creator[]> = {};
			const isUserInOther = currentOthers.some((u) => u.uid === creator.uid);
			if (isUserInOther) {
				updatePayload[otherField] = currentOthers.filter((u) => u.uid !== creator.uid);
			}

			// Explicit swap (LimitReachedModal): remove the user from the option
			// they picked to leave, then add them to the new one. Cap is role-
			// agnostic, so the user's commitment on the released option could be
			// in either `joined` or `organizers` (or both — admins seeded that
			// way in the past). Strip from whichever lists contain them.
			if (releaseSnap && releaseSnap.exists() && releaseRef && releaseRef.path !== statementRef.path) {
				const releaseData = releaseSnap.data() as Statement;
				const releaseJoined: Creator[] = Array.isArray(releaseData.joined)
					? releaseData.joined
					: [];
				const releaseOrgs: Creator[] = Array.isArray(releaseData.organizers)
					? releaseData.organizers
					: [];
				const releaseUpdate: Record<string, Creator[]> = {};
				if (releaseJoined.some((u) => u.uid === creator.uid)) {
					releaseUpdate.joined = releaseJoined.filter((u) => u.uid !== creator.uid);
				}
				if (releaseOrgs.some((u) => u.uid === creator.uid)) {
					releaseUpdate.organizers = releaseOrgs.filter((u) => u.uid !== creator.uid);
				}
				if (Object.keys(releaseUpdate).length > 0) {
					transaction.update(releaseRef, releaseUpdate);
				}
				leftStatementId = releaseData.statementId;
				leftStatementTitle = releaseData.statement;
			} else if (role === 'activist' && singleJoinOnly && parentStatementId) {
				const siblingsQuery = query(
					collection(db, Collections.statements),
					where('parentId', '==', parentStatementId),
					where('statementType', '==', StatementType.option),
				);
				const siblingsSnapshot = await getDocs(siblingsQuery);

				for (const siblingDoc of siblingsSnapshot.docs) {
					const sibling = siblingDoc.data() as Statement;
					if (sibling.statementId === statementId) continue;

					const isJoinedToSibling = sibling.joined?.find((u: Creator) => u.uid === creator.uid);
					if (isJoinedToSibling) {
						const siblingRef = doc(db, Collections.statements, sibling.statementId);
						const updatedSiblingJoined =
							sibling.joined?.filter((u: Creator) => u.uid !== creator.uid) ?? [];
						transaction.update(siblingRef, { joined: updatedSiblingJoined });

						leftStatementId = sibling.statementId;
						leftStatementTitle = sibling.statement;
					}
				}
			}

			updatePayload[field] = [...currentMembers, creator];
			transaction.update(statementRef, updatePayload);
		});

		// If user un-joined, remove them from the sheet
		if (userWasUnjoinedFromStatement) {
			void removeUserFromSheet(parentStatementId, creator.uid).catch((err) => {
				console.error('[toggleJoining] Failed to remove from sheet:', err);
			});
		}

		return { success: true, leftStatementId, leftStatementTitle };
	} catch (error) {
		console.error('[Join] toggleJoining failed:', error);

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to toggle joining',
		};
	}
}

export async function hasJoinFormSubmission(questionId: string, userId: string): Promise<boolean> {
	const key = `${questionId}_${userId}`;
	if (joinFormSubmitted.has(key)) return true;

	const submissionRef = doc(db, Collections.statements, questionId, 'joinFormSubmissions', userId);
	const snap = await getDoc(submissionRef);
	if (snap.exists()) {
		joinFormSubmitted.add(key);

		return true;
	}

	return false;
}

/** Synchronous peek at the cached submission role — null if unknown locally. */
export function getCachedJoinFormSubmissionRole(
	questionId: string,
	userId: string,
): JoinRole | null {
	return joinFormSubmittedRole.get(`${questionId}_${userId}`) ?? null;
}

export interface JoinFormSubmissionData {
	role: JoinRole | null;
	displayName: string;
	values: Record<string, string>;
}

// In-memory cache of the full submission so repeated modal opens don't re-hit
// Firestore. Populated on every save and on getJoinFormSubmissionData fetch.
const joinFormSubmissionCache = new Map<string, JoinFormSubmissionData>();

export function getCachedJoinFormSubmissionData(
	questionId: string,
	userId: string,
): JoinFormSubmissionData | null {
	return joinFormSubmissionCache.get(`${questionId}_${userId}`) ?? null;
}

export async function getJoinFormSubmissionData(
	questionId: string,
	userId: string,
): Promise<JoinFormSubmissionData | null> {
	const key = `${questionId}_${userId}`;
	const submissionRef = doc(db, Collections.statements, questionId, 'joinFormSubmissions', userId);
	const snap = await getDoc(submissionRef);
	if (!snap.exists()) {
		joinFormSubmittedRole.delete(key);
		joinFormSubmissionCache.delete(key);

		return null;
	}
	const data = snap.data() as
		| {
				role?: JoinRole;
				displayName?: string;
				values?: Record<string, string>;
		  }
		| undefined;

	const submission: JoinFormSubmissionData = {
		role: data?.role ?? null,
		displayName: data?.displayName ?? '',
		values: data?.values ?? {},
	};
	if (submission.role) joinFormSubmittedRole.set(key, submission.role);
	joinFormSubmissionCache.set(key, submission);

	return submission;
}

/** Back-compat: legacy role-only lookup. Delegates to the full fetcher. */
export async function getJoinFormSubmissionRole(
	questionId: string,
	userId: string,
): Promise<JoinRole | null> {
	const submission = await getJoinFormSubmissionData(questionId, userId);

	return submission?.role ?? null;
}

export interface TestSheetAccessResult {
	ok: boolean;
	serviceAccountEmail: string;
	error?: string;
}

/** Calls the `testSheetAccess` Cloud Function to verify that the service
 *  account can read/write the given spreadsheet. Used by the facilitator
 *  panel "Test connection" button to give immediate feedback before the first
 *  real submission — catches the "sheet not shared" mistake at setup time. */
export async function testSheetAccess(sheetUrl: string): Promise<TestSheetAccessResult> {
	const call = httpsCallable<{ sheetUrl: string }, TestSheetAccessResult>(
		functions,
		'testSheetAccess',
	);
	const result = await call({ sheetUrl });

	return result.data;
}

export async function saveJoinFormSubmission(
	questionId: string,
	userId: string,
	displayName: string,
	values: Record<string, string>,
	role: JoinRole = 'activist',
	optionId?: string,
	optionTitle?: string,
): Promise<void> {
	const now = Date.now();
	const submissionRef = doc(db, Collections.statements, questionId, 'joinFormSubmissions', userId);
	// Reset syncedToSheet so the onDocumentWritten trigger appends a fresh row
	// for this (possibly role-changed) submission.
	await setDoc(
		submissionRef,
		{
			userId,
			questionId,
			displayName,
			values,
			role,
			optionId: optionId ?? '',
			optionTitle: optionTitle ?? '',
			createdAt: now,
			lastUpdate: now,
			syncedToSheet: false,
		},
		{ merge: true },
	);

	const key = `${questionId}_${userId}`;
	joinFormSubmitted.add(key);
	joinFormSubmittedRole.set(key, role);
	joinFormSubmissionCache.set(key, { role, displayName, values });
}

/** Remove a user from the Google Sheet when they un-join an option.
 *  Calls the Cloud Function with the user's ID to find and delete their row.
 *  Surfaces the result via console so failures show up in DevTools. */
async function removeUserFromSheet(questionId: string, userId: string): Promise<void> {
	if (!questionId || !userId) return;

	try {
		const call = httpsCallable<
			{ questionId: string; userId: string },
			{ success: boolean; message?: string; deletedRow?: number }
		>(functions, 'fn_removeUserFromSheet');

		const result = await call({ questionId, userId });

		if (result.data.success) {
			console.info(
				'[removeUserFromSheet] OK:',
				result.data.message,
				result.data.deletedRow ? `(row ${result.data.deletedRow})` : '',
			);
		} else {
			console.error('[removeUserFromSheet] Failed:', result.data.message);
		}
	} catch (error) {
		console.error('[removeUserFromSheet] Error calling function:', error);
		throw error;
	}
}
