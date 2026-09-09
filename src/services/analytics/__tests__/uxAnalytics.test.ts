jest.mock('../analytics', () => ({
	analyticsService: { logEvent: jest.fn() },
	AnalyticsEvents: {
		UX_QUESTION_OPENED: 'ux_question_opened',
		UX_FIRST_EVALUATION: 'ux_first_evaluation',
		UX_ADD_ANSWER_STARTED: 'ux_add_answer_started',
		UX_ADD_ANSWER_COMPLETED: 'ux_add_answer_completed',
		UX_ADD_ANSWER_ABANDONED: 'ux_add_answer_abandoned',
		UX_HOST_HUB_OPENED: 'ux_host_hub_opened',
		UX_SETTING_CHANGED: 'ux_setting_changed',
		UX_VIEW_SWITCHED: 'ux_view_switched',
	},
}));

import { analyticsService } from '../analytics';
import { getUxVersion, uxAnalytics } from '../uxAnalytics';

const logEvent = analyticsService.logEvent as jest.Mock;

function setSearch(search: string) {
	window.history.replaceState({}, '', `/statement/q1${search}`);
}

describe('uxAnalytics', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers().setSystemTime(new Date('2026-09-08T10:00:00Z'));
		window.localStorage.clear();
		setSearch('');
		uxAnalytics.resetForTests();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('uses the current UX version', () => expect(getUxVersion()).toBe('v2'));

	describe('question open → first evaluation', () => {
		it('stamps uxVersion and measures msSinceOpen once per question', () => {
			uxAnalytics.questionOpened('q1', 'options', 'link');
			expect(logEvent).toHaveBeenCalledWith('ux_question_opened', {
				uxVersion: 'v2',
				statementId: 'q1',
				view: 'options',
				source: 'link',
			});

			jest.advanceTimersByTime(4200);
			uxAnalytics.firstEvaluation('q1');
			uxAnalytics.firstEvaluation('q1');

			const first = logEvent.mock.calls.filter(([name]) => name === 'ux_first_evaluation');
			expect(first).toHaveLength(1);
			expect(first[0][1]).toEqual({ uxVersion: 'v2', statementId: 'q1', msSinceOpen: 4200 });
		});

		it('keeps the first open time when the screen re-mounts', () => {
			uxAnalytics.questionOpened('q1', 'chat', 'app');
			jest.advanceTimersByTime(1000);
			uxAnalytics.questionOpened('q1', 'options', 'app');
			jest.advanceTimersByTime(1000);
			uxAnalytics.firstEvaluation('q1');
			expect(logEvent).toHaveBeenLastCalledWith(
				'ux_first_evaluation',
				expect.objectContaining({ msSinceOpen: 2000 }),
			);
		});

		it('reports null when the question was never opened in this page load', () => {
			uxAnalytics.firstEvaluation('q-deep');
			expect(logEvent).toHaveBeenCalledWith(
				'ux_first_evaluation',
				expect.objectContaining({ statementId: 'q-deep', msSinceOpen: null }),
			);
		});
	});

	describe('add answer funnel', () => {
		it('completion reports origin and elapsed time', () => {
			uxAnalytics.addAnswerStarted('q1', 'fab');
			jest.advanceTimersByTime(30000);
			uxAnalytics.addAnswerCompleted('q1');
			expect(logEvent).toHaveBeenLastCalledWith('ux_add_answer_completed', {
				uxVersion: 'v2',
				statementId: 'q1',
				origin: 'fab',
				msSinceStart: 30000,
			});
		});

		it('abandon reports the furthest step and is silent without a start', () => {
			uxAnalytics.addAnswerAbandoned('q1');
			expect(logEvent).not.toHaveBeenCalled();

			uxAnalytics.addAnswerStarted('q1', 'chat');
			uxAnalytics.addAnswerStep('q1', 'similarity');
			uxAnalytics.addAnswerAbandoned('q1');
			expect(logEvent).toHaveBeenLastCalledWith(
				'ux_add_answer_abandoned',
				expect.objectContaining({ origin: 'chat', stepReached: 'similarity' }),
			);

			uxAnalytics.addAnswerAbandoned('q1');
			expect(logEvent).toHaveBeenCalledTimes(2);
		});

		it('completion after an abandon does not reuse stale timing', () => {
			uxAnalytics.addAnswerStarted('q1', 'fab');
			uxAnalytics.addAnswerAbandoned('q1');
			uxAnalytics.addAnswerCompleted('q1');
			expect(logEvent).toHaveBeenLastCalledWith(
				'ux_add_answer_completed',
				expect.objectContaining({ origin: 'unknown', msSinceStart: null }),
			);
		});
	});

	describe('host and view events', () => {
		it('settingChanged never logs the value, only its type', () => {
			uxAnalytics.settingChanged('q1', 'enableAddEvaluationOption', true);
			expect(logEvent).toHaveBeenCalledWith('ux_setting_changed', {
				uxVersion: 'v2',
				statementId: 'q1',
				setting: 'enableAddEvaluationOption',
				valueType: 'boolean',
			});
		});

		it('viewSwitched ignores no-op switches', () => {
			uxAnalytics.viewSwitched('q1', 'chat', 'chat');
			expect(logEvent).not.toHaveBeenCalled();
			uxAnalytics.viewSwitched('q1', null, 'options');
			expect(logEvent).toHaveBeenCalledWith('ux_view_switched', {
				uxVersion: 'v2',
				statementId: 'q1',
				from: null,
				to: 'options',
			});
		});

		it('hostHubOpened carries the optional section', () => {
			uxAnalytics.hostHubOpened('q1', 'people');
			expect(logEvent).toHaveBeenCalledWith(
				'ux_host_hub_opened',
				expect.objectContaining({ section: 'people' }),
			);
		});
	});
});
