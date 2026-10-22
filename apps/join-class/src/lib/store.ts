import m from 'mithril';
import {
	db,
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	query,
	where,
	writeBatch,
	Unsubscribe,
} from './firebase';
import { resilientOnSnapshot } from './resilientListeners';
import { getUserState, ensureUser } from './user';
import { applyStatementLanguage } from './i18n';
import {
	Access,
	Collections,
	Statement,
	StatementType,
	Creator,
	ThemeStyle,
	createStatementObject,
} from '@freedi/shared-types';
import { checkAdminStatus, isAdmin } from './admin';
import {
	getEffectiveEvaluation as _getEffectiveEvaluation,
	setEvaluation as _setEvaluation,
} from './userEvaluations';

let question: Statement | null = null;

export const getEffectiveEvaluation = _getEffectiveEvaluation;
export const setEvaluation = _setEvaluation;

let customDisplayName: string | null = null;

const DISPLAY_NAME_KEY = 'freedi_joinclass_name_v2';

// Clear stale name from old key
try {
	localStorage.removeItem('freedi_joinclass_display_name');
} catch {
	/* ignore */
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

export function needsDisplayName(): boolean {
	const user = getUserState().user;
	if (!user) return true;
	if (!user.isAnonymous) return false;

	return !getCustomDisplayName();
}

export function getQuestion(): Statement | null {
	return question;
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

/** Firestore caps a single batch at 500 writes. Workspace-wide setting changes
 *  fan out one write per sub-question, so they chunk on this boundary. */
const SETTINGS_BATCH_LIMIT = 500;

/** Fan a settings patch out to several question docs at once. Used by the
 *  facilitator panel's workspace-wide mode: a setting flipped on the hub is
 *  applied to every sub-question in one go.
 *
 *  Patches must be *minimal* — pass `{ statementSettings: { hasChat: false } }`,
 *  never a spread of some reference question's settings. Firestore deep-merges
 *  nested maps, so a minimal patch touches only the named key and leaves each
 *  question's own join form, sort order and thresholds untouched. */
export async function setSettingOnQuestions(
	questionIds: string[],
	patch: Partial<Statement>,
): Promise<void> {
	if (questionIds.length === 0) return;
	const now = Date.now();
	for (let i = 0; i < questionIds.length; i += SETTINGS_BATCH_LIMIT) {
		const batch = writeBatch(db);
		for (const id of questionIds.slice(i, i + SETTINGS_BATCH_LIMIT)) {
			batch.set(
				doc(db, Collections.statements, id),
				{ ...patch, lastUpdate: now },
				{ merge: true },
			);
		}
		await batch.commit();
	}
}

/** Hub-scoped settings live on the main statement, not on a question doc.
 *  Used for room-wide flags such as free participant navigation, and for the
 *  hub's own QR toggle (`statementSettings.showQR` — sub-questions carry the
 *  same field for their own QR). Any participant can act on them but only an
 *  admin can flip them. The local `subscribeMainStatement` listener propagates
 *  the change to every participant on the next snapshot, so the change lands
 *  for the room without a refresh. */
export async function setMainStatementSetting(
	mainId: string,
	patch: Partial<Statement>,
): Promise<void> {
	const ref = doc(db, Collections.statements, mainId);
	await setDoc(ref, { ...patch, lastUpdate: Date.now() }, { merge: true });
}

/** Sync `<html data-theme="...">` to the active theme style. Called from every
 *  place that mutates `question` or `mainStatement` so the matching palette
 *  swaps in on the next paint without a refresh. The serious style omits the
 *  attribute so the default :root tokens apply (cheaper selector match). */
export function applyThemeStyleToDOM(): void {
	if (typeof document === 'undefined') return;
	const style =
		question?.statementSettings?.themeStyle ??
		mainStatement?.statementSettings?.themeStyle ??
		ThemeStyle.serious;
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
export interface NewQuestionExtras {
	/** Merged into the statement's settings in the one create (e.g. the lesson plan). */
	statementSettings?: Statement['statementSettings'];
	defaultLanguage?: string;
	forceLanguage?: boolean;
}

export async function createSimpleQuestion(
	title: string,
	extras?: NewQuestionExtras,
): Promise<string | null> {
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
			...(extras?.statementSettings ?? {}),
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
		...(extras?.defaultLanguage
			? { defaultLanguage: extras.defaultLanguage, forceLanguage: extras.forceLanguage === true }
			: {}),
	};

	await setDoc(doc(db, Collections.statements, finalQuestion.statementId), finalQuestion);

	return finalQuestion.statementId;
}

function syncQuestionLanguage(): void {
	if (!question) return;
	applyStatementLanguage(question.defaultLanguage, question.forceLanguage);
	applyThemeStyleToDOM();
}

export async function loadQuestion(questionId: string): Promise<void> {
	const qDoc = await getDoc(doc(db, Collections.statements, questionId));
	if (!qDoc.exists()) {
		question = null;
		m.redraw();

		return;
	}

	question = qDoc.data() as Statement;
	syncQuestionLanguage();
	await checkAdminStatus(questionId, question.creatorId);
	m.redraw();
}

// --- The lesson's main statement and its sub-questions ---

let mainStatement: Statement | null = null;
let subQuestions: Statement[] = [];

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
	applyThemeStyleToDOM();
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
export async function createSubQuestion(
	mainId: string,
	title: string,
	/** Written WITH the statement, in the one create, so no later patch can race a reorder. */
	initial?: { classRole?: 'guiding' | 'challenge'; order?: number },
): Promise<string | null> {
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
			...(initial?.classRole ? { classRole: initial.classRole } : {}),
		},
	});

	if (!newQuestion) return null;

	await setDoc(doc(db, Collections.statements, newQuestion.statementId), {
		...newQuestion,
		...(initial?.order !== undefined ? { order: initial.order } : {}),
	});

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
	return resilientOnSnapshot('mainStatement', doc(db, Collections.statements, mainId), (snap) => {
		if (!snap.exists()) {
			mainStatement = null;
			applyThemeStyleToDOM();
			m.redraw();

			return;
		}
		mainStatement = snap.data() as Statement;
		syncMainStatementLanguage();
		m.redraw();
	});
}

export function subscribeSubQuestions(mainId: string): Unsubscribe {
	const subQ = query(
		collection(db, Collections.statements),
		where('parentId', '==', mainId),
		where('statementType', '==', StatementType.question),
	);

	return resilientOnSnapshot('subQuestions', subQ, (snap) => {
		subQuestions = snap.docs.map((d) => d.data() as Statement);
		m.redraw();
	});
}
