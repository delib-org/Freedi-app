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
	Unsubscribe,
} from './firebase';
import { getUserState, ensureUser } from './user';
import { applyStatementLanguage, t } from './i18n';
import {
	Collections,
	Statement,
	StatementType,
	Creator,
	SortType,
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

export function getMessages(): Statement[] {
	return messages;
}

export function getVisibleOptions(): Statement[] {
	// Admin-added options ("admin suggestions") belong in the main people's
	// list — users vote on them like any other option, and they can become
	// people's suggestions through evaluation. They are NOT the same as
	// "organizer suggestions" (which is a separate per-option role concept,
	// tracked via the `organizers[]` array on each option).
	// Admin-controlled sort: read `defaultSortType` off the question so every
	// participant subscribed to it sees the same order as the admin. The field
	// is shared with the main app's sort menu, so flipping it from either
	// surface stays in sync. The Join facilitator panel exposes four modes —
	// consensus (accepted), average evaluation, random, and newest — and any
	// other stale value falls through to the consensus default.
	const sortType = question?.statementSettings?.defaultSortType;
	const randomSeed = question?.statementSettings?.randomSortSeed ?? 0;
	const sortFn = getSortFn(sortType, randomSeed);
	let opts = allOptions
		// admin-hidden options never render for anyone
		.filter((o) => o.hide !== true)
		.filter((o) => o.joinStatus !== 'failed')
		.sort(sortFn);

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
	const forced = allOptions.filter(
		(o) => o.forceShow === true && o.hide !== true && o.joinStatus !== 'failed',
	);
	if (forced.length > 0) {
		const seen = new Set(opts.map((o) => o.statementId));
		for (const f of forced) if (!seen.has(f.statementId)) opts.push(f);
	}

	return opts;
}

/** Deprecated: kept as a no-op for callers that still reference it. Admin-
 *  added options (whether created in the main app or via the join app's
 *  "Add suggestion" flow) are now part of the main people's list returned
 *  by `getVisibleOptions()`. The "organizer" concept is now reserved for
 *  the per-option role users can take via the activist/organizer join
 *  buttons. */
export function getOrganizerSuggestions(): Statement[] {
	return [];
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
	const patch: { statementSettings: { defaultSortType: SortType; randomSortSeed?: number } } = {
		statementSettings: { defaultSortType: value },
	};
	if (value === SortType.random) {
		patch.statementSettings.randomSortSeed = Date.now();
	}
	await setDoc(ref, { ...patch, lastUpdate: Date.now() }, { merge: true });
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

			return (a, b) =>
				hashStr(seed + a.statementId) - hashStr(seed + b.statementId);
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
	// can't push writes after the admin closes additions. Applies to admins
	// posting as participants too.
	if (question.statementSettings?.enableAddEvaluationOption !== true) {
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
	const finalQuestion: Statement = {
		...newQuestion,
		topParentId: newQuestion.statementId,
	};

	await setDoc(doc(db, Collections.statements, finalQuestion.statementId), finalQuestion);

	return finalQuestion.statementId;
}

function syncQuestionLanguage(): void {
	if (!question) return;
	applyStatementLanguage(question.defaultLanguage, question.forceLanguage);
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
	applyStatementLanguage(mainStatement.defaultLanguage, mainStatement.forceLanguage);
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
	const optionsQuery = query(
		collection(db, Collections.statements),
		where('parentId', '==', questionId),
		where('statementType', '==', StatementType.option),
	);

	return onSnapshot(optionsQuery, (snap) => {
		allOptions = snap.docs.map((d) => d.data() as Statement);
		subscribeMessageCounts(questionId);
		subscribeClusterLinks();
		m.redraw();
	});
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

	const newStatement = createStatementObject({
		statement: text.trim(),
		statementType: StatementType.statement,
		parentId: optionId,
		topParentId,
		creatorId: creator.uid,
		creator,
	});

	if (!newStatement) return;

	await setDoc(doc(db, Collections.statements, newStatement.statementId), newStatement);
}

export type JoinRole = 'activist' | 'organizer';

export interface ToggleJoiningResult {
	success: boolean;
	leftStatementId?: string;
	leftStatementTitle?: string;
	error?: string;
}

export async function toggleJoining(
	statementId: string,
	parentStatementId: string,
	role: JoinRole = 'activist',
): Promise<ToggleJoiningResult> {
	const field: 'joined' | 'organizers' = role === 'organizer' ? 'organizers' : 'joined';

	try {
		const creator = buildCreator();
		if (!creator) throw new Error('User not authenticated');

		const statementRef = doc(db, Collections.statements, statementId);
		let leftStatementId: string | undefined;
		let leftStatementTitle: string | undefined;

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

				return;
			}

			const updatePayload: Record<string, Creator[]> = {};
			const isUserInOther = currentOthers.some((u) => u.uid === creator.uid);
			if (isUserInOther) {
				updatePayload[otherField] = currentOthers.filter((u) => u.uid !== creator.uid);
			}

			if (role === 'activist' && singleJoinOnly && parentStatementId) {
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
