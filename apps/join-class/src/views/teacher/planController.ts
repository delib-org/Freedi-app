import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { ensureUser, getUserState } from '@/lib/user';
import {
	loadMainStatement,
	getMainStatement,
	getSubQuestions,
	subscribeMainStatement,
	subscribeSubQuestions,
} from '@/lib/store';
import { checkAdminStatus, isAdmin } from '@/lib/admin';
import { markOpenedInClass } from '@/lib/joinSubscriptions';
import { createDragReorder } from '@/lib/dragReorder';
import type { Unsubscribe } from '@/lib/firebase';
import {
	MAX_HINT_LENGTH,
	applyIdOrder,
	moveId,
	nextOrder,
	normalizeQuestionText,
	orderConverged,
	splitPlan,
	type ClassRole,
	type PlanSplit,
} from './planHelpers';
import {
	createPlanQuestion,
	deletePlanQuestion,
	persistQuestionOrder,
	saveQuestionHint,
	saveQuestionText,
} from './planApi';

/** State and actions of the "plan the questions" screen. The view only reads
 *  from here and calls the actions; every write is tracked so "Save" can wait
 *  for all of them and report honestly. */

export type PlanLoad = 'loading' | 'ready' | 'error' | 'denied';

export interface NewCard {
	key: string;
	text: string;
	creating: boolean;
	failed: boolean;
	startedAt: number;
}

export const CHALLENGE_NEW_KEY = 'challenge:new';

let mainId = '';
let load: PlanLoad = 'loading';
let subUnsub: Unsubscribe | null = null;
let mainUnsub: Unsubscribe | null = null;
let newCardCounter = 0;

const drafts = new Map<string, string>();
const fieldErrors = new Map<string, () => void>();
const savingKeys = new Set<string>();
const roleOverrides = new Map<string, ClassRole>();
const deletedIds = new Set<string>();
const inflight = new Set<Promise<unknown>>();

let newCards: NewCard[] = [];
let creatingChallenge: { text: string; startedAt: number } | null = null;
let localOrder: string[] | null = null;
let focusKey: string | null = null;
let announcement = '';
let savedFlag = false;
let flushing = false;

export const reorder = createDragReorder({
	onCommit: (orderedIds) => commitOrder(orderedIds),
	enabled: () => isAdmin(),
});

// --- reads ------------------------------------------------------------------

export const getLoad = (): PlanLoad => load;
export const getMainId = (): string => mainId;
export const getAnnouncement = (): string => announcement;
export const isFlushing = (): boolean => flushing;
export const isSavedFlag = (): boolean => savedFlag;
export const getNewCards = (): NewCard[] => newCards;
export const getFieldError = (key: string): (() => void) | undefined => fieldErrors.get(key);
export const hasAnyError = (): boolean => fieldErrors.size > 0;
export const isSaving = (key: string): boolean => savingKeys.has(key);
export const getCreatingChallenge = (): { text: string; startedAt: number } | null =>
	creatingChallenge;
export const getTitle = (): string => getMainStatement()?.statement ?? '';

/** The text to show in a field: what the teacher is typing, else what is saved.
 *  A draft that the snapshot has caught up with is dropped here. */
export function fieldValue(key: string, saved: string): string {
	const draft = drafts.get(key);
	if (draft === undefined) return saved;
	if (draft === saved && !savingKeys.has(key)) {
		drafts.delete(key);

		return saved;
	}

	return draft;
}

/** Challenge and ordered guiding questions, hiding the optimistic duplicates
 *  that exist for a moment while a create round-trips. */
export function getPlan(): PlanSplit {
	const all = getSubQuestions().filter((s) => !deletedIds.has(s.statementId));
	const split = splitPlan(all, roleOverrides);
	let guiding = split.guiding;
	if (creatingChallenge) {
		const pending = creatingChallenge;
		guiding = guiding.filter(
			(g) => !(g.statement === pending.text && (g.createdAt ?? 0) >= pending.startedAt),
		);
	}
	const rawIds = guiding.map((g) => g.statementId);
	if (localOrder && orderConverged(rawIds, localOrder)) localOrder = null;

	return {
		challenge: split.challenge,
		guiding: applyIdOrder(guiding, localOrder, (g: Statement) => g.statementId),
	};
}

/** New-card rows to render: not the ones whose real question already arrived. */
export function getVisibleNewCards(guiding: Statement[]): NewCard[] {
	return newCards.filter(
		(c) =>
			!(
				c.creating &&
				guiding.some(
					(g) => g.statement === normalizeQuestionText(c.text) && (g.createdAt ?? 0) >= c.startedAt,
				)
			),
	);
}

export function takeFocus(key: string): boolean {
	if (focusKey !== key) return false;
	focusKey = null;

	return true;
}

// --- writes -----------------------------------------------------------------

function track(task: Promise<unknown>): void {
	inflight.add(task);
	void task.finally(() => {
		inflight.delete(task);
		m.redraw();
	});
}

function markEdited(): void {
	savedFlag = false;
}

function markSavedIfClean(): void {
	if (fieldErrors.size === 0 && !isDirtyIgnoringDrafts()) savedFlag = true;
}

function isDirtyIgnoringDrafts(): boolean {
	return (
		savingKeys.size > 0 ||
		newCards.some((c) => c.creating || c.text.trim() !== '') ||
		creatingChallenge !== null
	);
}

export function runSave(key: string, label: string, task: () => Promise<void>): void {
	fieldErrors.delete(key);
	savingKeys.add(key);
	const promise = task()
		.then(() => {
			savingKeys.delete(key);
			markSavedIfClean();
		})
		.catch((err: unknown) => {
			console.error(`[PlanScreen] ${label} failed:`, err);
			savingKeys.delete(key);
			fieldErrors.set(key, () => runSave(key, label, task));
		})
		.finally(() => m.redraw());
	track(promise);
	m.redraw();
}

/** Draft access for the "lesson details" fields (planDetails.ts). */
export const getDraft = (key: string): string | undefined => drafts.get(key);
export const setDraft = (key: string, value: string): void => {
	drafts.set(key, value);
};
export const dropDraft = (key: string): void => {
	drafts.delete(key);
};

export function onInput(key: string, value: string, max: number): void {
	drafts.set(key, value.slice(0, max));
	markEdited();
}

export function commitQuestionText(statementId: string, saved: string): void {
	const key = `${statementId}:text`;
	const draft = drafts.get(key);
	if (draft === undefined) return;
	const text = normalizeQuestionText(draft);
	if (!text || text === saved) {
		drafts.delete(key);

		return;
	}
	drafts.set(key, text);
	runSave(key, 'save question', () => saveQuestionText(statementId, text));
}

export function commitQuestionHint(statementId: string, saved: string): void {
	const key = `${statementId}:hint`;
	const draft = drafts.get(key);
	if (draft === undefined) return;
	const hint = normalizeQuestionText(draft, MAX_HINT_LENGTH);
	if (hint === saved) {
		drafts.delete(key);

		return;
	}
	drafts.set(key, hint);
	runSave(key, 'save hint', () => saveQuestionHint(statementId, hint));
}

/** Create the challenge question the first time the teacher writes it. */
export function commitNewChallenge(): void {
	const draft = drafts.get(CHALLENGE_NEW_KEY);
	const text = normalizeQuestionText(draft ?? '');
	if (!text || creatingChallenge) {
		if (!text) drafts.delete(CHALLENGE_NEW_KEY);

		return;
	}
	const pending = { text, startedAt: Date.now() };
	creatingChallenge = pending;
	fieldErrors.delete(CHALLENGE_NEW_KEY);
	const promise = createPlanQuestion(mainId, text, 'challenge', undefined, (id) =>
		roleOverrides.set(id, 'challenge'),
	)
		.then(() => {
			drafts.delete(CHALLENGE_NEW_KEY);
			creatingChallenge = null;
			markSavedIfClean();
		})
		.catch((err: unknown) => {
			console.error('[PlanScreen] create challenge failed:', err);
			creatingChallenge = null;
			fieldErrors.set(CHALLENGE_NEW_KEY, commitNewChallenge);
		})
		.finally(() => m.redraw());
	track(promise);
	m.redraw();
}

export function addNewCard(): void {
	const empty = newCards.find((c) => !c.creating && c.text.trim() === '');
	if (empty) {
		focusKey = empty.key;

		return;
	}
	newCardCounter += 1;
	const card: NewCard = {
		key: `new:${newCardCounter}`,
		text: '',
		creating: false,
		failed: false,
		startedAt: 0,
	};
	newCards = [...newCards, card];
	focusKey = card.key;
	markEdited();
}

export function setNewCardText(card: NewCard, value: string, max: number): void {
	card.text = value.slice(0, max);
	markEdited();
}

export function commitNewCard(card: NewCard): void {
	if (card.creating) return;
	const text = normalizeQuestionText(card.text);
	if (!text) {
		newCards = newCards.filter((c) => c !== card);

		return;
	}
	const pendingBefore = newCards.filter((c) => c.creating).length;
	const order = nextOrder(getPlan().guiding) + pendingBefore;
	card.text = text;
	card.creating = true;
	card.failed = false;
	card.startedAt = Date.now();
	const promise = createPlanQuestion(mainId, text, 'guiding', order)
		.then(() => {
			newCards = newCards.filter((c) => c !== card);
			markSavedIfClean();
		})
		.catch((err: unknown) => {
			console.error('[PlanScreen] add question failed:', err);
			card.creating = false;
			card.failed = true;
		})
		.finally(() => m.redraw());
	track(promise);
	m.redraw();
}

export function removeNewCard(card: NewCard): void {
	newCards = newCards.filter((c) => c !== card);
}

export function deleteQuestion(statementId: string): void {
	const key = `${statementId}:del`;
	fieldErrors.delete(key);
	deletedIds.add(statementId);
	const promise = deletePlanQuestion(statementId)
		.then(() => {
			announcement = '';
		})
		.catch((err: unknown) => {
			console.error('[PlanScreen] delete question failed:', err);
			deletedIds.delete(statementId);
			fieldErrors.set(key, () => deleteQuestion(statementId));
		})
		.finally(() => m.redraw());
	track(promise);
	m.redraw();
}

function commitOrder(orderedIds: string[]): void {
	localOrder = orderedIds;
	markEdited();
	fieldErrors.delete('order');
	const promise = persistQuestionOrder(orderedIds)
		.then(() => markSavedIfClean())
		.catch((err: unknown) => {
			console.error('[PlanScreen] reorder failed:', err);
			localOrder = null;
			fieldErrors.set('order', () => commitOrder(orderedIds));
		})
		.finally(() => m.redraw());
	track(promise);
	m.redraw();
}

/** Keyboard reorder from the handle; announces the new 1-based position. */
export function moveQuestion(
	statementId: string,
	delta: number,
	announceTemplate: (n: number, total: number) => string,
): void {
	const ids = getPlan().guiding.map((g) => g.statementId);
	const next = moveId(ids, statementId, delta);
	if (next === ids) return;
	commitOrder(next);
	announcement = announceTemplate(next.indexOf(statementId) + 1, next.length);
}

/** "Save": wait for everything in flight, then say so. A confirmation, never a
 *  gate: every field has already saved itself on blur. */
export async function flushAll(): Promise<void> {
	if (flushing) return;
	flushing = true;
	m.redraw();
	try {
		const active = document.activeElement;
		if (active instanceof HTMLElement) active.blur();
		while (inflight.size > 0) {
			await Promise.allSettled([...inflight]);
		}
		if (fieldErrors.size === 0 && !isDirtyIgnoringDrafts()) savedFlag = true;
	} finally {
		flushing = false;
		m.redraw();
	}
}

// --- lifecycle --------------------------------------------------------------

function resetState(): void {
	drafts.clear();
	fieldErrors.clear();
	savingKeys.clear();
	roleOverrides.clear();
	deletedIds.clear();
	newCards = [];
	creatingChallenge = null;
	localOrder = null;
	focusKey = null;
	announcement = '';
	savedFlag = false;
	flushing = false;
	reorder.reset();
}

/** Open the screen for a workspace. Non-admins get the "not your lesson" state, never a redirect. */
export async function openPlan(id: string): Promise<void> {
	teardownPlan();
	resetState();
	mainId = id;
	load = 'loading';
	m.redraw();
	try {
		await ensureUser();
		if (getMainStatement()?.statementId !== id) await loadMainStatement(id);
		const main = getMainStatement();
		if (!main || main.statementId !== id) {
			load = 'error';

			return;
		}
		await checkAdminStatus(id, main.creatorId);
		if (!isAdmin()) {
			load = 'denied';

			return;
		}
		const user = getUserState().user;
		if (user) {
			void markOpenedInClass(main, user.uid, user.displayName ?? '').catch((err: unknown) => {
				console.error('[PlanScreen] markOpenedInClass failed:', err);
			});
		}
		// Live main statement too: the details fields (video, names, language) compare
		// against what is saved, and what is saved changes under a second tab or a callable.
		mainUnsub = subscribeMainStatement(id);
		subUnsub = subscribeSubQuestions(id);
		load = 'ready';
	} catch (err) {
		console.error('[PlanScreen] load failed:', err);
		load = 'error';
	} finally {
		m.redraw();
	}
}

export function teardownPlan(): void {
	if (mainUnsub) {
		mainUnsub();
		mainUnsub = null;
	}
	if (subUnsub) {
		subUnsub();
		subUnsub = null;
	}
}
