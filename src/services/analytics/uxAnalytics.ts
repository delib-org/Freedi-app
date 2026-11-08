import { analyticsService, AnalyticsEvents } from './analytics';
import type { AddAnswerStep, UxVersion } from './analytics';

/**
 * UX-overhaul funnel events. Each event is stamped with `uxVersion` so the
 * v1 (legacy shell) and v2 (new shell) cohorts can be compared after rollout:
 * time-to-first-evaluation, add-answer completion, host-hub task completion.
 *
 * Timing state is per page load and deliberately not persisted.
 */

export function getUxVersion(): UxVersion {
	return 'v2';
}

const openedAt = new Map<string, number>();
const evaluated = new Set<string>();
const addStartedAt = new Map<string, { at: number; origin: string; step: AddAnswerStep }>();

function elapsed(from: number | undefined): number | null {
	return from === undefined ? null : Math.max(0, Date.now() - from);
}

function base(statementId: string) {
	return { uxVersion: getUxVersion(), statementId };
}

/** A question screen was mounted for `statementId`; starts the time-to-first-evaluation clock. */
function questionOpened(statementId: string, view: string, source: 'link' | 'app'): void {
	if (!openedAt.has(statementId)) openedAt.set(statementId, Date.now());
	analyticsService.logEvent(AnalyticsEvents.UX_QUESTION_OPENED, {
		...base(statementId),
		view,
		source,
	});
}

/** First rating/vote on any answer under `questionId` in this page load. No-op afterwards. */
function firstEvaluation(questionId: string): void {
	if (evaluated.has(questionId)) return;
	evaluated.add(questionId);
	analyticsService.logEvent(AnalyticsEvents.UX_FIRST_EVALUATION, {
		...base(questionId),
		msSinceOpen: elapsed(openedAt.get(questionId)),
	});
}

function addAnswerStarted(questionId: string, origin: string): void {
	addStartedAt.set(questionId, { at: Date.now(), origin, step: 'draft' });
	analyticsService.logEvent(AnalyticsEvents.UX_ADD_ANSWER_STARTED, {
		...base(questionId),
		origin,
	});
}

/** Records how far the add-answer flow got, so an abandon event can report `stepReached`. */
function addAnswerStep(questionId: string, step: AddAnswerStep): void {
	const started = addStartedAt.get(questionId);
	if (started) started.step = step;
}

function addAnswerCompleted(questionId: string): void {
	const started = addStartedAt.get(questionId);
	addStartedAt.delete(questionId);
	analyticsService.logEvent(AnalyticsEvents.UX_ADD_ANSWER_COMPLETED, {
		...base(questionId),
		origin: started?.origin ?? 'unknown',
		msSinceStart: elapsed(started?.at),
	});
}

/** Only fires if a start was recorded and not completed, so closing an untouched sheet is silent. */
function addAnswerAbandoned(questionId: string): void {
	const started = addStartedAt.get(questionId);
	if (!started) return;
	addStartedAt.delete(questionId);
	analyticsService.logEvent(AnalyticsEvents.UX_ADD_ANSWER_ABANDONED, {
		...base(questionId),
		origin: started.origin,
		stepReached: started.step,
		msSinceStart: elapsed(started.at),
	});
}

function hostHubOpened(statementId: string, section?: string): void {
	analyticsService.logEvent(AnalyticsEvents.UX_HOST_HUB_OPENED, {
		...base(statementId),
		section,
	});
}

/** Logs the setting name and the type of the new value, never the value itself. */
function settingChanged(statementId: string, setting: string, newValue: unknown): void {
	analyticsService.logEvent(AnalyticsEvents.UX_SETTING_CHANGED, {
		...base(statementId),
		setting,
		valueType: typeof newValue,
	});
}

function viewSwitched(statementId: string, from: string | null, to: string): void {
	if (from === to) return;
	analyticsService.logEvent(AnalyticsEvents.UX_VIEW_SWITCHED, {
		...base(statementId),
		from,
		to,
	});
}

/** Test-only: forget per-page-load timing state. */
function resetForTests(): void {
	openedAt.clear();
	evaluated.clear();
	addStartedAt.clear();
}

export const uxAnalytics = {
	questionOpened,
	firstEvaluation,
	addAnswerStarted,
	addAnswerStep,
	addAnswerCompleted,
	addAnswerAbandoned,
	hostHubOpened,
	settingChanged,
	viewSwitched,
	resetForTests,
};
