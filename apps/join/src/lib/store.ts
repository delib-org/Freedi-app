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
	JoinDelegate,
	JoinDelegateInvitation,
	Statement,
	StatementType,
	Creator,
	Role,
	SortType,
	ThemeStyle,
	createStatementObject,
	createParagraphChildStatement,
	CutoffBy,
	getJoinDelegateId,
} from '@freedi/shared-types';
import {
	canEditOption,
	canEditOrganizerOptions,
	canEditParticipantOptions,
	checkAdminStatus,
	isAdmin,
	setCurrentDelegate,
} from './admin';
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

// Delegate-system state + subscriptions live in ./delegates/. Callable
// wrappers (create/accept/revoke) live in ./delegates/delegateActions.ts.
// Re-exported below so call sites that import from `@/lib/store` keep working.
import {
	subscribeMyDelegate,
	subscribeQuestionDelegates as _subscribeQuestionDelegates,
	unsubscribeQuestionDelegates as _unsubscribeQuestionDelegates,
	getDelegatesForQuestion as _getDelegatesForQuestion,
	getDelegateInvitationsForQuestion as _getDelegateInvitationsForQuestion,
} from './delegates/delegateSubscriptions';
import {
	createJoinDelegateInvite as _createJoinDelegateInvite,
	revokeJoinDelegate as _revokeJoinDelegate,
	acceptJoinDelegateInvite as _acceptJoinDelegateInvite,
} from './delegates/delegateActions';

export const subscribeQuestionDelegates = _subscribeQuestionDelegates;
export const unsubscribeQuestionDelegates = _unsubscribeQuestionDelegates;
export const getDelegatesForQuestion = _getDelegatesForQuestion;
export const getDelegateInvitationsForQuestion = _getDelegateInvitationsForQuestion;
export const createJoinDelegateInvite = _createJoinDelegateInvite;
export const revokeJoinDelegate = _revokeJoinDelegate;
export const acceptJoinDelegateInvite = _acceptJoinDelegateInvite;

// Chat message counts live in ./chat/messageCounts.ts. Re-exported below.
import {
	getMessageCount as _getMessageCount,
	getNewMessageCount as _getNewMessageCount,
	markOptionChatRead,
	subscribeMessageCounts,
} from './chat/messageCounts';

export const getMessageCount = _getMessageCount;
export const getNewMessageCount = _getNewMessageCount;
/** Cluster-id → unique-evaluator count. Populated by `subscribeClusterLinks`. */
let clusterEvaluatorCounts: Map<string, number> = new Map();
let clusterLinksUnsubs: Unsubscribe[] = [];

// New-solutions buffer lives in ./newSolutionsBuffer.ts. The buffer-driven
// helpers are re-exported below so call sites that import from `@/lib/store`
// keep working.
import {
	resetNewSolutionsBuffer,
	ingestOptionForBuffer,
	isOptionPending,
	isOptionHighlighted,
	unhighlightOption,
	getNewOptionsPendingCount as _getNewOptionsPendingCount,
	isOptionNewlyArrived as _isOptionNewlyArrived,
	flushNewOptions as _flushNewOptions,
} from './newSolutionsBuffer';

export const getNewOptionsPendingCount = _getNewOptionsPendingCount;
export const isOptionNewlyArrived = _isOptionNewlyArrived;
export const flushNewOptions = _flushNewOptions;

// User evaluations (confirmed + optimistic) + the snapshot listener live in
// ./userEvaluations.ts. The public API is re-exported below.
import {
	getEffectiveEvaluation as _getEffectiveEvaluation,
	setEvaluation as _setEvaluation,
	subscribeUserEvaluations as _subscribeUserEvaluations,
} from './userEvaluations';

export const getEffectiveEvaluation = _getEffectiveEvaluation;
export const setEvaluation = _setEvaluation;
export const subscribeUserEvaluations = _subscribeUserEvaluations;

let customDisplayName: string | null = null;

// Join-form submission cache + API moved to ./join/joinFormCache.ts. The
// public API is re-exported below so call sites that import from `@/lib/store`
// keep working.
import {
	type JoinRole,
	type JoinFormSubmissionData,
	hasJoinFormSubmission as _hasJoinFormSubmission,
	getCachedJoinFormSubmissionRole as _getCachedJoinFormSubmissionRole,
	getCachedJoinFormSubmissionData as _getCachedJoinFormSubmissionData,
	getJoinFormSubmissionData as _getJoinFormSubmissionData,
	getJoinFormSubmissionRole as _getJoinFormSubmissionRole,
	saveJoinFormSubmission as _saveJoinFormSubmission,
	subscribeUserJoinFormSubmission as _subscribeUserJoinFormSubmission,
	clearJoinFormCacheForUsers,
} from './join/joinFormCache';

export type { JoinRole, JoinFormSubmissionData } from './join/joinFormCache';
export const hasJoinFormSubmission = _hasJoinFormSubmission;
export const getCachedJoinFormSubmissionRole = _getCachedJoinFormSubmissionRole;
export const getCachedJoinFormSubmissionData = _getCachedJoinFormSubmissionData;
export const getJoinFormSubmissionData = _getJoinFormSubmissionData;
export const getJoinFormSubmissionRole = _getJoinFormSubmissionRole;
export const saveJoinFormSubmission = _saveJoinFormSubmission;
export const subscribeUserJoinFormSubmission = _subscribeUserJoinFormSubmission;

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

// `getLastReadMap` / `markOptionChatRead` / `getNewMessageCount` live in
// ./chat/messageCounts.ts (re-exported above).

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
		// Sort by the canonical `order` field, falling back to `doc.order` then
		// `createdAt` for legacy paragraphs (mirrors the shared
		// `sortParagraphChildren` used by the other apps). `createStatementObject`
		// → `createParagraphChildStatement` writes `order`; older paragraphs only
		// carry the staggered `createdAt`.
		const orderKey = (p: Statement): number =>
			p.order ?? p.doc?.order ?? p.createdAt ?? 0;
		const paras = snap.docs
			.map((d) => d.data() as Statement)
			.sort((a, b) => orderKey(a) - orderKey(b));
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
	const manualOrder = (question?.statementSettings as any)?.manualOptionOrder as
		| string[]
		| undefined;
	const isManualSort = manualOrder && manualOrder.length > 0;

	let opts = allOptions
		// organizer suggestions render in their own section above/below the regular list
		.filter((o) => o.creatorRole !== Role.admin)
		// admin-hidden options never render for anyone
		.filter((o) => o.hide !== true)
		.filter((o) => o.joinStatus !== 'failed')
		// buffer: hide options the user hasn't acknowledged yet (pending pill)
		.filter((o) => !isOptionPending(o.statementId));

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
			!isOptionPending(o.statementId),
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
		const pinned = opts.filter((o) => isOptionHighlighted(o.statementId));
		const rest = opts.filter((o) => !isOptionHighlighted(o.statementId));
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
 *  options have no `creatorRole` and appear via `getVisibleOptions()`.
 *
 *  Manual order: when admin saves a custom order via the FacilitatorPanel,
 *  `manualOrganizerOrder` (array of organizer-option IDs) is read here and
 *  applied instead of the default newest-first sort, mirroring how
 *  `manualOptionOrder` works for the crowd list. Items missing from the
 *  manual order list fall to the bottom (preserving newest-first among them)
 *  so freshly added organizer options stay visible until reordered. */
export function getOrganizerSuggestions(): Statement[] {
	const manualOrder = (question?.statementSettings as any)?.manualOrganizerOrder as
		| string[]
		| undefined;
	const isManualSort = Array.isArray(manualOrder) && manualOrder.length > 0;

	const filtered = allOptions
		.filter((o) => o.creatorRole === Role.admin && o.hide !== true && o.joinStatus !== 'failed')
		.filter((o) => !isOptionPending(o.statementId));

	if (isManualSort) {
		const manualOrderMap = new Map(manualOrder!.map((id, idx) => [id, idx]));

		return filtered.sort((a, b) => {
			const aIdx = manualOrderMap.get(a.statementId) ?? Infinity;
			const bIdx = manualOrderMap.get(b.statementId) ?? Infinity;
			if (aIdx !== bIdx) return aIdx - bIdx;
			// Tiebreak by newest-first for items not in the manual order.
			return (b.createdAt ?? 0) - (a.createdAt ?? 0);
		});
	}

	return filtered.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
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

/** Permission gate for editing/deleting an option. The option's creator can
 *  always edit their own; admins of the question can edit any option; and
 *  per-question delegates can edit options matching the scope they were
 *  granted (organizer vs participant solutions). The branch logic lives in
 *  `canEditOption` so callers don't have to know about the delegate model. */
export function canEditSuggestion(option: Statement): boolean {
	return canEditOption(option);
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
				const child = createParagraphChildStatement({
					content: bodyLines[i],
					host: { statementId: optionId, topParentId },
					creator,
					creatorId: creator.uid,
					order: i,
				});
				if (!child) continue;
				// Stagger createdAt by index as well, so legacy readers that still
				// sort by createdAt keep author order; `order` is the canonical key.
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
	const patch: {
		statementSettings: {
			defaultSortType: SortType;
			randomSortSeed?: number;
			manualOptionOrder?: string[];
		};
	} = {
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

/** Admin manual reordering for organizer suggestions. Same shape as
 *  `setManualOptionOrder` but writes a separate field so the two lists keep
 *  independent orders. Stored on the question doc so every subscribing
 *  participant renders the organizer section in the admin's chosen order
 *  on the next snapshot. */
export async function setManualOrganizerOrder(
	questionId: string,
	optionIds: string[],
): Promise<void> {
	const ref = doc(db, Collections.statements, questionId);
	await setDoc(
		ref,
		{
			statementSettings: { manualOrganizerOrder: optionIds },
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

	// Default: anyone with organizer-scope rights (admin or delegate with the
	// organizer toggle) posts as organizer; everyone else posts as themselves.
	const useOrganizerPath = asOrganizer ?? canEditOrganizerOptions();

	if (useOrganizerPath) {
		if (!canEditOrganizerOptions()) {
			throw new Error('Only admins or organizer-scope delegates can post organizer suggestions');
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
	// can't push writes after the admin closes additions. Admins and
	// participant-scope delegates are exempt — they own the question's
	// solution set and can seed the crowd list at any time.
	if (
		!canEditParticipantOptions() &&
		question.statementSettings?.enableAddEvaluationOption !== true
	) {
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
	// so the first paint already knows whether to show admin-only UI. The
	// same call also resolves any delegate record for the current user, so
	// delegates see edit affordances on the first paint too.
	await checkAdminStatus(questionId, question.creatorId);

	// Live-watch the user's own delegate record so a freshly accepted invite
	// (or a revocation) takes effect without a refresh. Tear down any prior
	// listener so we don't leak across question swaps.
	subscribeMyDelegate(questionId);

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
// The route the pending timer above is heading to. Lets `applyFacilitatorRedirect`
// skip re-arming the 700ms timeout when it's already heading to the same target —
// otherwise rapid back-to-back snapshots (e.g. the admin flips a theme while a
// follow-me write is in flight) would keep clearing and re-arming the timer,
// and the redirect would never actually fire.
let pendingRedirectRoute: string | null = null;

export function getMainStatement(): Statement | null {
	return mainStatement;
}

/** Hub-scoped permission: has the admin allowed participants to move between
 *  sub-questions on their own? When false (the default) participants only move
 *  where `powerFollowMe` sends them — hub cards are inert and no Back button is
 *  rendered inside a question. Admins always navigate freely regardless. */
export function isParticipantNavigationAllowed(): boolean {
	return mainStatement?.statementSettings?.allowParticipantNavigation === true;
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

	// Install the visibility/online resync hooks once — they fire a forced
	// re-read of the main statement when the tab returns to the foreground or
	// the network comes back online, which rescues participants whose
	// Firestore websocket went zombie during a long background suspension
	// (the symptom: "after ~20 minutes some participants stop following").
	ensureFacilitatorResyncListeners();

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
		//
		// No outer dedupe on `activePath !== lastFollowedPath` in the default
		// facilitator-led mode: if a participant drifted off the followed route
		// (browser back, share-link, refresh), we want any subsequent snapshot —
		// even one carrying the same path — to pull them back.
		// `applyFacilitatorRedirect` is a no-op when the resolved route already
		// matches `m.route.get()`, so calling it on every snapshot is cheap.
		// When the facilitator has allowed free navigation, `shouldFollow`
		// narrows this to genuine broadcast changes only.
		const activePath = data.joinFollowMe ?? '';
		const pathChanged = activePath !== lastFollowedPath;
		lastFollowedPath = activePath;
		if (!isAdmin() && shouldFollow(pathChanged)) {
			void applyFacilitatorRedirect(activePath, mainId);
		}
		m.redraw();
	});
}

/** Should this snapshot pull the participant back to the facilitator's path?
 *
 *  Facilitator-led mode (the default): always — see the "no outer dedupe"
 *  note above; drifting participants get re-gathered on the next snapshot.
 *
 *  Free-navigation mode (`allowParticipantNavigation`): only when the
 *  facilitator actually moved the broadcast. Otherwise every unrelated
 *  main-statement write (theme, QR, a resync after the tab wakes up) would
 *  yank a participant out of the question they deliberately opened, which
 *  would make the Back button and hub cards feel broken. A fresh "follow me"
 *  press still gathers everyone. */
function shouldFollow(pathChanged: boolean): boolean {
	return pathChanged || !isParticipantNavigationAllowed();
}

/** Re-read the active main statement and re-apply its `joinFollowMe`. Used by
 *  the visibility/online listeners below to recover from a zombie Firestore
 *  websocket (mobile tabs suspended for ~20 min often lose the listener
 *  silently — no error, no fresh snapshots). Forcing a `getDoc` round-trip
 *  bypasses the cache and yanks participants back to the facilitator's
 *  current path if they missed updates while in the background — subject to
 *  `shouldFollow`, so a free-navigation room doesn't drag people out of the
 *  question they chose just because their tab woke up. */
async function resyncFacilitatorState(): Promise<void> {
	const mainId = activeFacilitatedMainId;
	if (!mainId) return;
	try {
		const snap = await getDoc(doc(db, Collections.statements, mainId));
		if (!snap.exists()) return;
		const data = snap.data() as Statement;
		mainStatement = data;
		syncMainStatementLanguage();
		const activePath = data.joinFollowMe ?? '';
		const pathChanged = activePath !== lastFollowedPath;
		lastFollowedPath = activePath;
		if (!isAdmin() && shouldFollow(pathChanged)) {
			void applyFacilitatorRedirect(activePath, mainId);
		}
		m.redraw();
	} catch (err) {
		console.error('[facilitator] resync after visibility/online failed:', err);
	}
}

let facilitatorResyncListenersAttached = false;
function ensureFacilitatorResyncListeners(): void {
	if (facilitatorResyncListenersAttached) return;
	if (typeof document === 'undefined') return;
	facilitatorResyncListenersAttached = true;
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			void resyncFacilitatorState();
		}
	});
	if (typeof window !== 'undefined') {
		window.addEventListener('online', () => {
			void resyncFacilitatorState();
		});
		// `pageshow` fires when the page is restored from the bfcache (browser
		// back-forward cache). Firestore listeners do NOT survive bfcache restore
		// reliably, so treat it like a visibility return.
		window.addEventListener('pageshow', (e: PageTransitionEvent) => {
			if (e.persisted) void resyncFacilitatorState();
		});
	}
}

/** Given a (possibly directly-deep-linked) question, return the workspace main
 *  statement id to subscribe to for follow-me, or null if this question has no
 *  workspace ancestor. Lets Solutions/Chat keep tracking the facilitator even
 *  when the participant arrived via `/q/:qid` or `/q/:qid/s/:sid` (no `/m/:mid`
 *  prefix in the URL). The workspace root is identified by the question's
 *  `topParentId` — sub-questions inherit it from their parent main statement;
 *  workspace-root statements themselves have `topParentId === statementId` and
 *  so are skipped here (they're their own main, but the panel can't lead from
 *  outside the `/m/:mid` route anyway). */
export function getMainIdForQuestion(q: Statement | null): string | null {
	if (!q) return null;
	const top = q.topParentId;
	if (!top) return null;
	// Legacy workspace roots can carry `topParentId === 'top'` (the sentinel
	// used for `parentId` before the join-app's create flows started writing
	// the self-id). Subscribing to a `'top'` doc would throw — skip.
	if (top === 'top') return null;
	if (top === q.statementId) return null;

	return top;
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
		pendingRedirectRoute = null;

		return;
	}

	const target = await mapMainAppPathToJoinTarget(path, mainId);
	if (!target) return;

	const route = joinTargetToRoute(target, mainId);
	if (route === m.route.get()) {
		// Already on the followed route — clear any stale pending redirect that
		// was queued before the participant arrived here on their own.
		if (pendingRedirectTimer !== null) {
			window.clearTimeout(pendingRedirectTimer);
			pendingRedirectTimer = null;
		}
		pendingRedirectRoute = null;

		return;
	}

	// Coalesce: if a timer is already heading to the same route, don't reset it.
	// Without this guard, every snapshot from the main statement (theme write,
	// language change, etc.) would re-call this function and keep pushing the
	// redirect out by 700ms — the participant would never actually be moved.
	if (pendingRedirectRoute === route && pendingRedirectTimer !== null) return;

	showFacilitatorToast(t('facilitator.following'));

	if (pendingRedirectTimer !== null) {
		window.clearTimeout(pendingRedirectTimer);
	}
	pendingRedirectRoute = route;
	pendingRedirectTimer = window.setTimeout(() => {
		pendingRedirectTimer = null;
		pendingRedirectRoute = null;
		if (m.route.get() !== route) m.route.set(route);
	}, FACILITATOR_REDIRECT_DELAY_MS);
}

// `getMessageCount` lives in ./chat/messageCounts.ts (re-exported above).

export function subscribeOptions(questionId: string): Unsubscribe {
	resetNewSolutionsBuffer();

	const optionsQuery = query(
		collection(db, Collections.statements),
		where('parentId', '==', questionId),
		where('statementType', '==', StatementType.option),
	);

	return onSnapshot(optionsQuery, (snap) => {
		const incoming = snap.docs.map((d) => d.data() as Statement);
		const currentUid = getUserState().user?.uid;

		for (const opt of incoming) {
			ingestOptionForBuffer(opt.statementId, opt.creatorId, currentUid);
		}

		allOptions = incoming;
		subscribeMessageCounts(allOptions.map((o) => o.statementId));
		subscribeClusterLinks();
		m.redraw();
	});
}

// `getNewOptionsPendingCount`, `flushNewOptions`, `isOptionNewlyArrived` live
// in ./newSolutionsBuffer.ts and are re-exported at the top of this file.

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

// User evaluations (getEffectiveEvaluation, setEvaluation, subscribeUserEvaluations)
// live in ./userEvaluations.ts — re-exported at the top of this file.
// `subscribeUserJoinFormSubmission` lives in ./join/joinFormCache.ts (re-exported above).

// `subscribeMessageCounts` lives in ./chat/messageCounts.ts (imported above).

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
		const child = createParagraphChildStatement({
			content: bodyLines[i],
			host: { statementId: parentStatement.statementId, topParentId },
			creator,
			creatorId: creator.uid,
			order: i,
		});
		if (!child) continue;
		// Canonical order is the `order` field; also stagger createdAt by index so
		// legacy readers that still sort by createdAt keep author order.
		batch.set(doc(db, Collections.statements, child.statementId), {
			...child,
			createdAt: parentStatement.createdAt + i + 1,
			lastUpdate: parentStatement.createdAt + i + 1,
		});
	}

	await batch.commit();
}

// `JoinRole` lives in ./join/joinFormCache.ts (re-exported as a type above).

// Cloud-function wrappers (toggleJoining, resetOptionJoining,
// resetQuestionJoining, testSheetAccess) live in ./join/joinCallables.ts.
import {
	type ToggleJoiningResult as _ToggleJoiningResult,
	type ToggleJoiningOptions as _ToggleJoiningOptions,
	type TestSheetAccessResult as _TestSheetAccessResult,
	type ResetQuestionJoiningResult as _ResetQuestionJoiningResult,
	type ReconcileJoinSheetResult as _ReconcileJoinSheetResult,
	toggleJoining as _toggleJoining,
	testSheetAccess as _testSheetAccess,
	resetOptionJoining as _resetOptionJoining,
	resetQuestionJoining as _resetQuestionJoining,
	reconcileJoinSheet as _reconcileJoinSheet,
	getUserCommittedOptionsFrom,
} from './join/joinCallables';

export type ToggleJoiningResult = _ToggleJoiningResult;
export type ToggleJoiningOptions = _ToggleJoiningOptions;
export type TestSheetAccessResult = _TestSheetAccessResult;
export type ResetQuestionJoiningResult = _ResetQuestionJoiningResult;
export type ReconcileJoinSheetResult = _ReconcileJoinSheetResult;
export const toggleJoining = _toggleJoining;
export const testSheetAccess = _testSheetAccess;
export const resetOptionJoining = _resetOptionJoining;
export const resetQuestionJoining = _resetQuestionJoining;
export const reconcileJoinSheet = _reconcileJoinSheet;

/** All visible options under the current question where the user is a
 *  member in either role (joined or organizers). Wraps the pure helper
 *  in ./join/joinCallables.ts with the active-question state. */
export function getUserCommittedOptions(): Statement[] {
	const uid = getUserState().user?.uid;
	if (!uid) return [];

	return getUserCommittedOptionsFrom(allOptions, uid);
}

// Delegate subscriptions + callable wrappers live in ./delegates/
// (re-exported at the top of this file).
